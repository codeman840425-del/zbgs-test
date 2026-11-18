import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
try{
  const [command,input,operations,output]=process.argv.slice(2),manifest=JSON.parse(await fs.readFile(path.join(root,'transfer-manifest.json'),'utf8'));
  for(const name of [manifest.runtimeInputs?.catalog,manifest.runtimeInputs?.templates])if(typeof name!=='string'||!name.startsWith('src/company/')||!name.endsWith('.json')||name.includes('\\')||name.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Unsafe runtime catalog path in package manifest');
  const catalog=JSON.parse(await fs.readFile(path.join(root,'source/prototype',manifest.runtimeInputs.catalog),'utf8'));
  const templates=JSON.parse(await fs.readFile(path.join(root,'source/prototype',manifest.runtimeInputs.templates),'utf8'));
  const load=name=>import(pathToFileURL(path.join(root,'source/prototype/src/company',name)).href);
  const persistence=await load('persistence.js'),documentTools=await load('document.js');
  const bytes=await fs.readFile(input,'utf8'),raw=JSON.parse(bytes);
  let document=raw.schema==='company-save'?await persistence.decodeCompanySave(bytes,catalog,templates):documentTools.restoreCompany(bytes,catalog,templates);
  const space=await load('space.js'),placement=await load('placement.js');
  space.inspectCompanyConnections(document,catalog,templates);placement.inspectCompanyPlacement(document,catalog,templates);
  if(command==='apply'){
    if(!operations||!output)throw Error('Use apply INPUT_SAVE OPS_JSON NEW_RESULT_DIRECTORY');
    const previous=document;
    document=documentTools.prepareCompanyChange(document,JSON.parse(await fs.readFile(operations,'utf8')),{catalog,templates}).document;
    placement.inspectCompanyMotionSweep(previous,document,catalog,templates);
    space.inspectCompanyConnections(document,catalog,templates);placement.inspectCompanyPlacement(document,catalog,templates);
  }else if(command!=='validate')throw Error('Use validate INPUT_SAVE or apply INPUT_SAVE OPS_JSON NEW_RESULT_DIRECTORY');
  const derived=documentTools.deriveCompany(document,catalog,templates);
  if(derived.facilities.some(f=>f.resource.mounting?.reserveDesktopArea===true)){
    const {preflightDesktopAreas}=await import('./source/scripts/company-platform/preflight-library-assets.mjs');
    try{await preflightDesktopAreas(path.join(root,'source'),derived);}
    catch(error){
      if(error.code==='ERR_MODULE_NOT_FOUND' && /three/.test(error.message))
        throw Object.assign(Error('Run npm ci in source/prototype of a working copy to check physical desktop clearance'),{code:'desktop-check-requires-dependencies'});
      throw error;
    }
  }
  const constraint=manifest.savedCompany?.trainingClearance;
  if(document.id===manifest.savedCompany?.id && constraint){
    const {checkTrainingClearance}=await import('./source/scripts/company-platform/check-training-clearance.mjs');
    await checkTrainingClearance(document,constraint,{catalog,templates});
  }
  if(command==='apply'){
    const target=path.resolve(output),parent=path.dirname(target);let stage;
    try{await fs.lstat(target);throw Error('Output exists; select a new directory');}catch(error){if(error.code!=='ENOENT')throw error;}
    try{
      stage=await fs.mkdtemp(path.join(parent,`.${path.basename(target)}.edit-`));
      await fs.writeFile(path.join(stage,'layout.json'),documentTools.serializeCompany(document,catalog,templates),{flag:'wx'});
      const saved=await persistence.encodeCompanySave(document,catalog,templates);
      await fs.writeFile(path.join(stage,'save.json'),saved,{flag:'wx'});
      if(constraint && document.id===manifest.savedCompany.id){
        const handoff={schema:'training-room-edit@1', companyId:document.id, saveSha256:createHash('sha256').update(saved).digest('hex'), trainingClearance:constraint};
        await fs.writeFile(path.join(stage,'training-edit.json'),JSON.stringify(handoff,null,2)+'\n',{flag:'wx'});
      }
      try{await fs.lstat(target);throw Error('Output appeared during preparation');}catch(error){if(error.code!=='ENOENT')throw error;}
      await fs.rename(stage,target);stage=null;
    }finally{if(stage&&path.dirname(path.resolve(stage))===parent)await fs.rm(stage,{recursive:true,force:true});}
  }
  console.log(JSON.stringify({ok:true,id:document.id,revision:document.revision,floors:document.nodes.filter(node=>node.kind==='floor').map(node=>node.id),output},null,2));
}catch(error){console.error(JSON.stringify({ok:false,code:error.code||'edit-error',path:error.path,message:error.message},null,2));process.exitCode=1;}
