import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {bindTrainingDocument,resolveTrainingBinding} from './source/scripts/company-platform/package-template/training-room.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
try{
  const args=process.argv.slice(2);
  const roomOption=args.indexOf('--room');
  let selectedRoom;
  if(roomOption>=0){
    if(roomOption!==args.length-2||!/^(@default|[a-z][a-z0-9-]{0,62})$/.test(args.at(-1)))throw Error('Append --room KEY using a packaged room key or @default');
    selectedRoom=args.splice(roomOption)[1];
  }
  const [command,input,operations,output]=args,manifest=JSON.parse(await fs.readFile(path.join(root,'transfer-manifest.json'),'utf8'));
  if(args.length!==(command==='apply'?4:2))throw Error('Use validate INPUT or apply INPUT OPS NEW_RESULT_DIRECTORY, optionally followed by --room KEY');
  for(const name of [manifest.runtimeInputs?.catalog,manifest.runtimeInputs?.templates])if(typeof name!=='string'||!name.startsWith('src/company/')||!name.endsWith('.json')||name.includes('\\')||name.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Unsafe runtime catalog path in package manifest');
  const catalog=JSON.parse(await fs.readFile(path.join(root,'source/prototype',manifest.runtimeInputs.catalog),'utf8'));
  const templates=JSON.parse(await fs.readFile(path.join(root,'source/prototype',manifest.runtimeInputs.templates),'utf8'));
  const load=name=>import(pathToFileURL(path.join(root,'source/prototype/src/company',name)).href);
  const persistence=await load('persistence.js'),documentTools=await load('document.js');
  const bytes=await fs.readFile(input,'utf8'),raw=JSON.parse(bytes);
  let document=raw.schema==='company-save'?await persistence.decodeCompanySave(bytes,catalog,templates):documentTools.restoreCompany(bytes,catalog,templates);
  const [space,scale,placement]=await Promise.all([load('space.js'),load('scale-v2.js'),load('placement.js')]);
  const context={catalog,templates,createScaledCompany:space.createScaledCompany,
    createCompanyScaleV2:scale.createCompanyScaleV2,prepareCompanyChange:documentTools.prepareCompanyChange};
  const binding=await resolveTrainingBinding(root,manifest,input,document,bytes,selectedRoom,context);
  bindTrainingDocument(document,binding,input,context);
  space.inspectCompanyConnections(document,catalog,templates);placement.inspectCompanyPlacement(document,catalog,templates);
  if(command==='apply'){
    if(!operations||!output)throw Error('Use apply INPUT_SAVE OPS_JSON NEW_RESULT_DIRECTORY');
    const previous=document;
    document=documentTools.prepareCompanyChange(document,JSON.parse(await fs.readFile(operations,'utf8')),{catalog,templates}).document;
    placement.inspectCompanyMotionSweep(previous,document,catalog,templates);
    space.inspectCompanyConnections(document,catalog,templates);placement.inspectCompanyPlacement(document,catalog,templates);
  }else if(command!=='validate')throw Error('Use validate INPUT_SAVE or apply INPUT_SAVE OPS_JSON NEW_RESULT_DIRECTORY');
  const constraint=bindTrainingDocument(document,binding,input,context);
  const derived=documentTools.deriveCompany(document,catalog,templates);
  if (Object.hasOwn(document,'teaStations') || derived.facilities.some(item=>item.resource.mountRole==='tea-counter')) {
    const {checkTeaStations}=await import('./source/scripts/company-platform/check-tea-station.mjs');
    await checkTeaStations(document,{catalog,templates,derived});
  }
  const {preflightDesktopAreas}=await import('./source/scripts/company-platform/preflight-library-assets.mjs');
  if (preflightDesktopAreas) await preflightDesktopAreas(path.join(root,'source'),derived);
  else if (derived.facilities.some(f=>f.resource.mounting?.reserveDesktopArea || f.resource.garmentRail || f.resource.mount==='garment-rail'))
    throw Error('missing-installation-preflight: this room requires installation geometry checks');
  if (Object.hasOwn(document,'productShowcases')) {
    const {checkProductShowcases} = await import('./source/scripts/company-platform/check-showcase-room.mjs');
    await checkProductShowcases(document,{catalog,templates});
  }
  if (Object.hasOwn(document,'interviewRooms')) {
    const {checkInterviewRooms} = await import('./source/scripts/company-platform/check-interview-room.mjs');
    await checkInterviewRooms(document,{catalog,templates});
  }
  if (Object.hasOwn(document,'singingRooms')) {
    const {checkSingingRooms} = await import('./source/scripts/company-platform/check-singing-room.mjs');
    await checkSingingRooms(document,{catalog,templates});
  }
  if(constraint){
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
      if(constraint){
        const handoff={schema:'training-room-edit@1', companyId:document.id, saveSha256:createHash('sha256').update(saved).digest('hex'), trainingClearance:constraint};
        await fs.writeFile(path.join(stage,'training-edit.json'),JSON.stringify(handoff,null,2)+'\n',{flag:'wx'});
      }
      try{await fs.lstat(target);throw Error('Output appeared during preparation');}catch(error){if(error.code!=='ENOENT')throw error;}
      await fs.rename(stage,target);stage=null;
    }finally{if(stage&&path.dirname(path.resolve(stage))===parent)await fs.rm(stage,{recursive:true,force:true});}
  }
  console.log(JSON.stringify({ok:true,id:document.id,revision:document.revision,floors:document.nodes.filter(node=>node.kind==='floor').map(node=>node.id),output},null,2));
}catch(error){
  const missingThree=error.code==='ERR_MODULE_NOT_FOUND' && /Cannot find package 'three'/.test(error.message);
  const code=missingThree?'edit-requires-dependencies':error.code||'edit-error';
  const message=missingThree?'Install the locked editing dependencies in a working copy with npm ci --prefix source/prototype':error.message;
  console.error(JSON.stringify({ok:false,code,path:error.path,message,details:error.details},null,2));process.exitCode=1;
}
