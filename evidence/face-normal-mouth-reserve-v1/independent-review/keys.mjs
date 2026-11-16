import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
const root=path.resolve('experiments/m1-face-normal-reserve-candidate');
const load=p=>import(pathToFileURL(path.join(root,p)));
const THREE=await load('prototype/node_modules/three/build/three.module.js');
const {GLTFLoader}=await load('prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
const {VRMLoaderPlugin,VRMUtils}=await load('prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js');
const {reserveFaceNormalLayout,reservedNormalCacheKey}=await load('prototype/src/face-normal-reservation.js');
const active=JSON.parse(fs.readFileSync('evidence/face-normal-mouth-reserve-v1/active-records/report.json'));
const rows=[];
for(const sex of ['female','male']){
 const bytes=fs.readFileSync(path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`));
 const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));loader.register(()=>({name:'CPUTexturePlaceholder',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
 const vrm=(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'/assets/foundation/')).userData.vrm;
 const meshes=[];vrm.scene.traverse(m=>{if(m.isMesh&&m.geometry.morphAttributes.position)meshes.push(m);});
 const oldKeys=new Set(meshes.map(m=>m.geometry.getAttribute('normal')));
 reserveFaceNormalLayout(vrm,crypto.createHash('sha256').update(bytes).digest('hex'));
 const keys=new Map();let next=0;
 const body=active.bodies.find(b=>b.sex===sex);
 const cases=body.cases.filter(c=>['mouth-12','eye5','combined'].includes(c.name)).map(c=>({name:c.name,groups:c.active.map(p=>{
  const m=meshes.find(m=>(Array.isArray(m.material)?m.material:[m.material]).some(mat=>mat.name===p.material));
  if(!m)throw Error(p.material);
  const g=m.geometry,k=reservedNormalCacheKey(g)||(g.morphAttributes.normal?g:g.getAttribute('normal'));
  if(!keys.has(k))keys.set(k,++next);
  return{primitive:p.primitive,key:keys.get(k),reserved:!!reservedNormalCacheKey(g)};
 })}));
 rows.push({sex,originalDistinctNormalAttributes:oldKeys.size,cases});VRMUtils.deepDispose(vrm.scene);
}
fs.writeFileSync(new URL('./keys.json',import.meta.url),JSON.stringify({scope:'Actual GLTFLoader/VRM normal attribute identity; texture stub; reads existing active-record report, no solver rerun or GPU.',rows},null,2));console.log(JSON.stringify(rows));
