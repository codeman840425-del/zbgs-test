// Additive source publication. Original garment manifests/GLBs remain intact.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),base='assets-source/m2-vest-layer-fit-v1';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const pinned=[];
async function read(file,expected){const bytes=await fs.readFile(path.join(root,file));const actual={path:file,sha256:hash(bytes),bytes:bytes.length};if(expected&&(expected.sha256!==actual.sha256||expected.bytes!==undefined&&expected.bytes!==actual.bytes))throw Error('Source integrity mismatch: '+file);pinned.push(actual);return bytes;}
const batch=JSON.parse(await read(base+'/generated/manifest.json'));
const spec=JSON.parse(await read(base+'/spec.json'));
const coverage=JSON.parse(await read('assets-source/m2-vest-body-coverage-v1/generated/manifest.json'));
if(batch.schema!=='vest-layer-fit-batch-v1'||coverage.schema!=='vest-body-coverage-batch-v1'||batch.cases.length!==3||coverage.cases.length!==3)throw Error('Unexpected fixed source batch');
const runtimeIndex=JSON.parse(await read('prototype/public/assets/m2-representative-batch-v2/runtime-index.json'));
const output=new Map(),profiles={};
for(const row of batch.cases){
  const source=spec.cases.find(c=>c.id===row.id),mask=coverage.cases.find(c=>c.id===row.id);
  if(!source||!mask||mask.status!=='source-safe-candidate')throw Error('Missing safe source selection '+row.id);
  const files=row.files,topBytes=await read(files['top.glb'].path,files['top.glb']);
  const fitBytes=await read(files['fit.json'].path,files['fit.json']),fit=JSON.parse(fitBytes);
  const entry=JSON.parse(await read(files['equipment-entry.json'].path,files['equipment-entry.json']));
  const maskBytes=await read(mask.files.fit.path,mask.files.fit),fitMask=JSON.parse(maskBytes);
  if(mask.bodySha256!==source.body.sha256||mask.topId!==entry.id||mask.topSha256!==entry.sha256||
    fitMask.avatarSha256!==source.body.sha256||fitMask.topId!==entry.id||fitMask.topSha256!==entry.sha256||
    mask.descriptor.sha256!==hash(maskBytes))throw Error('Coverage dependencies differ: '+row.id);
  const sourceUrl=row.id==='female'?'/assets/m1/equipment.json':runtimeIndex.presets.find(p=>p.id===row.id)?.profile.manifestUrl;
  if(!sourceUrl?.startsWith('/assets/'))throw Error('Unknown source manifest '+row.id);
  const original=JSON.parse(await read('prototype/public'+sourceUrl));
  const body=source.body.sha256,bottom=original.items.find(i=>i.id===fit.bottom.id);
  if(!bottom||bottom.slot!=='bottom'||bottom.sha256!==fit.bottom.sha256||bottom.bytes!==fit.bottom.bytes||bottom.compatibleAvatarSha256!==body)throw Error('Bottom identity mismatch '+row.id);
  const prefix='/assets/m2-vest-layer-fit-v1/'+row.id+'/';
  entry.layerFitResource={schema:'vest-layer-fit-v1',url:prefix+'fit.json',sha256:hash(fitBytes),bottom:{id:bottom.id,sha256:bottom.sha256,bytes:bottom.bytes}};
  // An extension carries only the new entry. The old catalog URL, entries,
  // relative resource paths and saved recipes keep their exact semantics.
  if(original.items.some(item=>item.id===entry.id))throw Error('New top ID already exists');
  const catalogBytes=encode({schema:'zbgs-equipment-v1',items:[entry]});
  output.set('prototype/public'+prefix+'equipment.json',catalogBytes);
  output.set('prototype/public'+entry.url,topBytes);output.set('prototype/public'+prefix+'fit.json',fitBytes);
  output.set('prototype/public'+mask.descriptor.url,maskBytes);
  profiles[row.id]={bodySha256:body,sourceManifestUrl:sourceUrl,manifest:{url:prefix+'equipment.json',sha256:hash(catalogBytes)},topId:entry.id,bottomId:bottom.id,
    bodyCoverage:mask.descriptor,outfit:{index:4,role:'pants-layer-fit',bottomRole:'pants',equipmentRoles:['fitTop','shoes','pants'],label:'裤装·腰部修订对照',description:'同一身体与动作；独立上衣层间适配及重新生成的覆盖规则，连续动作待验'}};
}
output.set('prototype/public/assets/m2-vest-layer-fit-v1/profiles.json',encode({schema:'vest-layer-outfits-v1',profiles}));
// Verify all existing destinations before writing any file; no silent revision.
for(const [file,bytes]of output){let old;try{old=await fs.readFile(path.join(root,file));}catch(e){if(e.code!=='ENOENT')throw e;}if(old&&!old.equals(bytes))throw Error('Existing output differs; preserve candidate: '+file);}
for(const [file,bytes]of output){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),bytes);}
const receipt={schema:'vest-layer-publication-v1',status:'published-for-runtime-validation',inputs:pinned,outputs:[...output].map(([file,bytes])=>({path:file,sha256:hash(bytes),bytes:bytes.length})),limits:['Source and load identity only; continuous motion/visual acceptance pending.','Original bodies/garments, frozen skirt and original looks preserved.']};
await fs.writeFile(path.join(root,base,'publication.json'),encode(receipt));console.log(JSON.stringify({status:receipt.status,files:output.size,profiles:Object.keys(profiles)}));
