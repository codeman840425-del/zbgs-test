import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {RoundedBoxGeometry} from '../../prototype/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {PNG} from '../../prototype/node_modules/pngjs/lib/png.js';
import {checkManagedOutput} from './package-company.mjs';
import {validateWallAbsorberGeometry,validateWallAbsorberResource} from '../../prototype/src/company/wall-absorber.js';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';

const root=await fs.realpath(fileURLToPath(new URL('../../',import.meta.url)));
const sourceDir='assets-source/company-wall-absorber-v1',generator='scripts/company-platform/build-wall-absorber.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),json=o=>Buffer.from(JSON.stringify(o,null,2)+'\n');
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),rounded=n=>Number(n.toFixed(6))||0;
const range=(n,lo,hi)=>Number.isFinite(n)&&n>=lo&&n<=hi,integer=(n,lo,hi)=>Number.isInteger(n)&&range(n,lo,hi);
const safeText=s=>typeof s==='string'&&s.trim()===s&&s.length>0&&s.length<=180&&!/[\x00-\x1f]/.test(s);
const reason=(code,p,message)=>{throw Error(code+' at '+p+': '+message);};
installNodeImageDecodeShim();
globalThis.FileReader??=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(b=>{this.result=b;this.onloadend?.();},e=>this.onerror?.(e));}};
const decoder=new GLTFLoader();
async function load(bytes){
 const {scene}=await decoder.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 scene.updateMatrixWorld(true);return scene;
}
function inspectContainer(bytes){
 assert(bytes.length>=28&&bytes.length<=16*1024*1024&&bytes.readUInt32LE(0)===0x46546c67&&bytes.readUInt32LE(4)===2&&bytes.readUInt32LE(8)===bytes.length,'Use one complete static GLB2 file under 16 MiB');
 const end=20+bytes.readUInt32LE(12);
 assert(bytes.readUInt32LE(16)===0x4e4f534a&&end+8<=bytes.length&&bytes.readUInt32LE(end+4)===0x004e4942&&end+8+bytes.readUInt32LE(end)===bytes.length);
 const doc=JSON.parse(bytes.subarray(20,end)),bin=bytes.subarray(end+8);
 assert(doc.buffers.length===1&&!Object.hasOwn(doc.buffers[0],'uri'),'Use embedded geometry buffers');
 assert((doc.images??[]).every(im=>!Object.hasOwn(im,'uri')&&Number.isInteger(im.bufferView)&&['image/png','image/jpeg'].includes(im.mimeType)),'Use embedded PNG/JPEG textures');
 assert(!doc.animations?.length&&!doc.skins?.length&&!doc.cameras?.length&&!doc.extensions?.KHR_lights_punctual,'Only static acoustic panels');
 assert(doc.scenes.length===1&&(doc.scene??0)===0&&doc.meshes.every(m=>m.primitives.every(p=>(p.mode??4)===4&&!p.targets?.length)),'One scene with static triangles required');
 assert((doc.materials??[]).every(m=>(m.alphaMode??'OPAQUE')==='OPAQUE'&&!m.extensions?.KHR_materials_unlit),'Use opaque, lit PBR surfaces');
 return {doc,bin};
}
function packed(document,binary){
 const align=(bytes,pad)=>Buffer.concat([bytes,Buffer.alloc((4-bytes.length%4)%4,pad)]);
 const j=align(Buffer.from(JSON.stringify(document)),32),b=align(binary,0),out=Buffer.alloc(28+j.length+b.length);
 out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
 out.writeUInt32LE(j.length,12);out.writeUInt32LE(0x4e4f534a,16);j.copy(out,20);
 out.writeUInt32LE(b.length,20+j.length);out.writeUInt32LE(0x004e4942,24+j.length);b.copy(out,28+j.length);return out;
}
// Neutral microtexture modulates the material factor. Geometry and normals carry the large relief.
function grain(kind){
 const image=new PNG({width:96,height:96,colorType:2});let seed=0x2f831b;
 for(let y=0;y<96;y++)for(let x=0;x<96;x++){
  seed=(Math.imul(1664525,seed)+1013904223)>>>0;
  const n=seed/0xffffffff-.5,theta=Math.PI*2/96;
  let tone=226+n*28;
  if(kind==='wood')tone=222+13*Math.sin(x*theta*7+1.4*Math.sin(y*theta))+8*Math.sin(x*theta*22+.7*Math.sin(y*theta*2))+n*9;
  if(kind==='weave')tone=224+6*Math.cos(x*theta*24)+8*Math.cos(y*theta*32)+n*14;
  if(kind==='foam')tone=232+n*25-(seed%19===0?56:0);
  const index=4*(96*y+x);image.data[index]=image.data[index+1]=image.data[index+2]=Math.round(tone);image.data[index+3]=255;
 }return PNG.sync.write(image,{colorType:2});
}
function bindGrain(bytes,kind){
 const {doc,bin}=inspectContainer(bytes),texture=grain(kind),start=(bin.length+3)&~3;
 const binary=Buffer.concat([bin,Buffer.alloc(start-bin.length),texture]);doc.buffers[0].byteLength=binary.length;
 const view=doc.bufferViews.push({buffer:0,byteOffset:start,byteLength:texture.length})-1;
 doc.images=[{name:kind+'-grain',bufferView:view,mimeType:'image/png'}];doc.samplers=[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}];
 doc.textures=[{source:0,sampler:0}];for(const m of doc.materials)m.pbrMetallicRoughness.baseColorTexture={index:0};
 return packed(doc,binary);
}
function finish(name,color,roughness){const m=new T.MeshStandardMaterial({color,roughness,metalness:0});m.name=name;return m;}
function add(group,name,geo,mat){
 const p=geo.attributes.position,n=geo.attributes.normal,uv=[];
 for(let i=0;i<p.count;i++){
  const xy=Math.abs(n.getZ(i))>.55;
  uv.push((xy||Math.abs(n.getY(i))>.55?p.getX(i):p.getZ(i))/.115,(xy||Math.abs(n.getX(i))>.55?p.getY(i):p.getZ(i))/.115);
 }
 geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 const mesh=new T.Mesh(geo,mat);mesh.name=name;group.add(mesh);return mesh;
}
function box(group,name,w,h,back,front,x,y,mat,edge=0){
 const geo=edge?new RoundedBoxGeometry(w,h,front-back,2,edge):new T.BoxGeometry(w,h,front-back);
 return add(group,name,geo.translate(x,y,(back+front)/2),mat);
}
function loft(group,name,layers,mat){
 const pts=[],sides=layers[0].length;
 const tri=(a,b,c)=>pts.push(...a,...b,...c);
 const base=layers[0],top=layers.at(-1);
 for(let i=1;i<sides-1;i++){tri(base[0],base[i+1],base[i]);tri(top[0],top[i],top[i+1]);}
 for(let ring=1;ring<layers.length;ring++)for(let i=0;i<sides;i++){
  const a=layers[ring-1],b=layers[ring],j=(i+1)%sides;
  tri(a[i],a[j],b[j]);tri(a[i],b[j],b[i]);
 }
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pts,3));geo.computeVertexNormals();return add(group,name,geo,mat);
}
function honey(group,d,mats){
 const nx=d.columns,ny=d.rows,wx=.6/(nx*Math.sqrt(3)),hy=1.2/(2+(ny-1)*1.5);
 for(let r=0;r<ny;r++)for(let c=0;c<nx-(r%2);c++){
  const cx=-.30+(c+.5+(r%2)*.5)*wx*Math.sqrt(3),cy=-.6+(1+1.5*r)*hy,cut=d.gap/2;
  const top=.08-((r+2*c)%3)*.004;
  const rings=[[0,0],[0,top-.007],[.005,top]].map(([bevel,z])=>Array.from({length:6},(_,i)=>{
   const angle=Math.PI*(1/2+i/3);
   const x=(cx+(wx-cut-bevel)*Math.cos(angle))*.60/(.60-Math.sqrt(3)*cut);
   const y=(cy+(hy-cut-bevel)*Math.sin(angle))*1.20/(1.20-2*cut);return [x,y,z];
  }));
  loft(group,'felt-'+(r+1)+'-'+(c+1),rings,mats[(r*2+c*3+Math.floor((c+r)/2))%mats.length]);
 }
}
function foam(group,d,mats){
 box(group,'continuous-bonded-base',.6,1.2,0,.015,0,0,mats[2]);
 const w=.594/d.columns,h=1.194/d.rows;
 for(let r=0;r<d.rows;r++)for(let c=0;c<d.columns;c++){
  const x=(c-(d.columns-1)/2)*w,y=(r-(d.rows-1)/2)*h,rotate=(r+c)%2===1;
  const ring=(wx,hy,z)=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[x+a*wx/2,y+b*hy/2,z]);
  loft(group,'wedge-'+r+'-'+c,[ring(w-.0015,h-.0015,.014),ring((rotate?.77:d.ridgeFraction)*w,(rotate?d.ridgeFraction:.77)*h,.08)],mats[(c+r)%2]);
 }
}
function cushion(group,d,mats){
 box(group,'seam-backing',.6,1.2,0,.018,0,0,mats[2]);
 const w=.6/d.columns-d.seam,h=1.2/d.rows-d.seam,n=14;
 for(let r=0;r<d.rows;r++)for(let c=0;c<d.columns;c++){
  const verts=[],indices=[],cx=(c+.5)*.6/d.columns-.3,cy=(r+.5)*1.2/d.rows-.6;
  for(let surface=0;surface<2;surface++)for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
   const u=i/n,v=j/n,a=2*u-1,b=2*v-1,shoulder=Math.sin(Math.PI*u)*Math.sin(Math.PI*v);
   verts.push(cx+a*(w/2-.009*Math.abs(b)**6*Math.abs(a)**4),cy+b*(h/2-.009*Math.abs(a)**6*Math.abs(b)**4),surface===0?.017:.031+.049*Math.sqrt(shoulder));
  }
  const layer=(n+1)**2;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
   const a=j*(n+1)+i,b=a+1,d=a+n+1,e=d+1;indices.push(a,e,b,a,d,e,layer+a,layer+b,layer+e,layer+a,layer+e,layer+d);
  }
  const border=[];for(let i=0;i<n;i++)border.push(i);for(let i=0;i<n;i++)border.push(i*(n+1)+n);
  for(let i=n;i>0;i--)border.push(n*(n+1)+i);for(let i=n;i>0;i--)border.push(i*(n+1));
  for(let k=0;k<border.length;k++){const a=border[k],b=border[(k+1)%border.length];indices.push(a,b,b+layer,a,b+layer,a+layer);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(verts,3));geo.setIndex(indices);geo.computeVertexNormals();
  add(group,'padded-cell-'+r+'-'+c,geo,mats[(r+c)%2]);
 }
}
async function timber(group,d,mats,sourceBytes){
 box(group,'bonded-timber-back',.60,1.20,0,.012,0,0,mats[2]);
 const wood=await load(sourceBytes);const bounds=new T.Box3().setFromObject(wood,true),size=bounds.getSize(v());
 const matrix=new T.Matrix4().makeTranslation(-.30,-.60,.009).multiply(new T.Matrix4().makeScale(.60/size.x,1.20/size.y,.033/size.z))
  .multiply(new T.Matrix4().makeTranslation(-bounds.min.x,-bounds.min.y,-bounds.min.z));
 wood.traverse(o=>{if(o.isMesh){const geo=o.geometry.clone().applyMatrix4(matrix.clone().multiply(o.matrixWorld));add(group,'kenney-moulded-backing',geo,o.material.clone());}});
 const span=.464,pitch=span/d.slats;
 for(let i=0;i<d.slats;i++)box(group,'timber-batten-'+(i+1),pitch*(1-d.gapFraction),.848,.009,.08,(i+.5)*pitch-span/2,-.029,mats[i%2],.003);
}
function dimensions(d,lo,hi,rowMin,rowMax){
 assert(integer(d.columns,lo,hi)&&integer(d.rows,rowMin,rowMax),'Pattern count out of range');
}
function checkDesign(d){
 const fields={honeyfelt:['columns','rows','gap','colors'],timber:['slats','gapFraction','colors','source'],upholstered:['columns','rows','seam','colors'],foam:['columns','rows','ridgeFraction','colors'],dcc:['source']};
 assert(Object.hasOwn(fields,d.kind));assert.deepEqual(Object.keys(d).sort(),['id','version','displayName','kind',...fields[d.kind]].sort());
 assert(/^wall-absorber-[a-z][a-z0-9-]{0,47}$/.test(d.id)&&integer(d.version,1,999)&&safeText(d.displayName),'Invalid panel identity');
 if(d.kind!=='dcc')assert(Array.isArray(d.colors)&&d.colors.length===3&&d.colors.every(c=>/^#[a-f0-9]{6}$/i.test(c)),'Use three sRGB colour swatches');
 if(d.kind==='honeyfelt'){dimensions(d,2,5,3,11);assert(range(d.gap,.001,.008));}
 if(d.kind==='upholstered'){dimensions(d,1,4,2,7);assert(range(d.seam,.004,.025));}
 if(d.kind==='foam'){dimensions(d,3,9,5,16);assert(range(d.ridgeFraction,.08,.35));}
 if(d.kind==='timber')assert(integer(d.slats,4,14)&&range(d.gapFraction,.16,.50));
 if(d.source){
  const s=d.source;assert.deepEqual(Object.keys(s).sort(),['path','sha256','author','license','licenseFile',...(s.editable?['editable']:[])].sort());
  assert(s.path.startsWith(sourceDir+'/')&&s.path.endsWith('.glb')&&safeText(s.author)&&safeText(s.license));
  for(const p of [s,s.licenseFile,...(s.editable?[s.editable]:[])])assert(p.path.startsWith(sourceDir+'/')&&/^[a-f0-9]{64}$/.test(p.sha256),'Pin the project-relative source');
 }
}
function measure(scene,resource){
 validateWallAbsorberResource(resource,reason);const physical=validateWallAbsorberGeometry(scene,resource,reason);
 const meshes=[],hasher=createHash('sha256'),zLevels=new Set(),mats=new Set(),vec=v();let triangles=0;
 scene.traverseVisible(m=>{
  if(!m.isMesh)return;meshes.push(m);const g=m.geometry,p=g.attributes.position,idx=g.index,num=idx?.count??p.count;
  assert(num%3===0&&num>0);triangles+=num/3;assert(triangles<=120000,'Panel triangle budget exceeded');
  for(let j=0;j<num;j++){
   vec.fromBufferAttribute(p,idx?idx.getX(j):j).applyMatrix4(m.matrixWorld);const values=vec.toArray().map(n=>Math.round(n*1e6));assert(values.every(Number.isFinite));
   const bytes=Buffer.allocUnsafe(12);for(let k=0;k<3;k++)bytes.writeInt32LE(values[k],k*4);hasher.update(bytes);zLevels.add(values[2]/1e6);
  }
  for(const mat of [m.material].flat()){assert(!mat.isMeshBasicMaterial&&!mat.transparent&&mat.opacity===1);mats.add(mat);}
 });
 // Trace the actual solid intervals through the face. A finish can bear on another part,
 // while a front floating clear of its back has no contact path to the wall.
 const links=new Map(meshes.map(m=>[m,new Set()])),anchored=new Set(),sampled=new Set(),frontHits=[],contacts=[];
 const sides=[...mats].map(m=>m.side);for(const m of mats)m.side=T.DoubleSide;
 const probes=[];for(let j=0;j<21;j++)for(let i=0;i<13;i++)probes.push([-.3+(i+.47)*.6/13,-.6+(j+.43)*1.2/21]);
 // Include a sample on each part; a narrow rail need not intersect a regular grid point.
 for(const m of meshes){const center=new T.Box3().setFromObject(m,true).getCenter(v());probes.push([center.x,center.y]);}
 const ray=new T.Raycaster(v(),v(0,0,1),0,.121);
 for(const [x,y] of probes){
  ray.ray.origin.set(x,y,-.02);
  const hits=ray.intersectObjects(meshes,false),span=new Map();
  for(const h of hits){const z=h.point.z,part=h.object,extent=span.get(part)??[z,z];extent[1]=z;span.set(part,extent);sampled.add(part);}
  if(!span.size)continue;
  const intervals=[...span].sort((a,b)=>a[1][0]-b[1][0]);frontHits.push(rounded(hits.at(-1).point.z));
  if(intervals[0][1][0]<=.001)contacts.push([rounded(x),rounded(y)]);
  for(let i=0;i<intervals.length;i++){
   const [a,aa]=intervals[i];if(aa[0]<=.001)anchored.add(a);
   for(let j=i+1;j<intervals.length&&intervals[j][1][0]<=aa[1]+.001;j++){const b=intervals[j][0];links.get(a).add(b);links.get(b).add(a);}
  }
 }
 [...mats].forEach((m,i)=>m.side=sides[i]);
 for(const m of anchored)for(const next of links.get(m))anchored.add(next);
 assert(contacts.length>0&&frontHits.length>0&&anchored.size===meshes.length,'Panel parts need actual contact with wall or connected backing: '+meshes.filter(m=>!anchored.has(m)).map(m=>m.name).join(','));
 const bounds=new T.Box3().setFromObject(scene,true);
 return {geometrySha256:hasher.digest('hex'),triangles,meshes:meshes.length,materialNames:[...mats].map(m=>m.name),backAreaM2:rounded(physical.contactArea),
  frontAreaM2:rounded(physical.frontArea),sideAreaM2:rounded(physical.sideArea),depthM:rounded(physical.depth),observedFrontRange:[Math.min(...frontHits),Math.max(...frontHits)],
  zLevels:[...zLevels].sort((a,b)=>a-b),sampledParts:sampled.size,connectedParts:anchored.size,contactProbes:contacts.length,frontProbes:frontHits.length,
  bounds:[bounds.min.toArray().map(rounded),bounds.max.toArray().map(rounded)]};
}

async function safe(owner,relative) {
  const parts=relative.split('/');
  assert(parts.every(p=>/^[\w-][\w.-]*$/.test(p) && !p.endsWith('.') &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)),'Invalid project path: '+relative);
  let dest=owner;
  for(const part of parts) {
    dest=path.join(dest,part);
    const stat=await fs.lstat(dest).catch(e=>{if(e.code!=='ENOENT')throw e;});
    if(stat)assert(!stat.isSymbolicLink() && await fs.realpath(dest)===dest,'Linked path: '+dest);
  }
  return dest;
}
const read=async relative=>fs.readFile(await safe(root,relative));
const pin=async relative=>({path:relative,sha256:sha(await read(relative))});

const args = parseArgs({options:{check:{type:'boolean'}, write:{type:'boolean'}, output:{type:'string'},
  parameters:{type:'string'}, help:{type:'boolean'}}}).values;
if (args.help) {
  console.log('build-wall-absorber.mjs --check | --write | --output PROJECT_TRIAL_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
  process.exit(0);
}
assert.equal([args.write,args.check,Boolean(args.output)].filter(Boolean).length, 1, 'Choose one output mode');
assert(!args.parameters || args.output, 'Trial recipes require --output');
let project = root;
for(let current=root; current!==path.dirname(current); current=path.dirname(current)) {
  if(['company-workspace','output'].includes(path.basename(current).toLowerCase())) {
    const candidate = path.dirname(current);
    const marker = await fs.stat(path.join(candidate,'scripts/company-platform/local-workspace.ps1')).catch(e=>{if(e.code!=='ENOENT')throw e;});
    if(marker?.isFile()) project = candidate;
  }
}
const scratch = 'output/wall-absorber-v1/production';
const stage = await safe(project, scratch);
await checkManagedOutput(stage,root,{allowDelivery:false});
let dest;
if(args.output) {
  assert(!args.output.split(/[\\/]/).includes('..'), 'Path traversal in trial destination');
  const absolute = path.resolve(project,args.output), trial = path.relative(project,absolute).split(path.sep).join('/');
  assert(/^(output|company-workspace\/production-trials)\//.test(trial), 'Trial must stay inside project outputs');
  assert(trial!==scratch && !trial.startsWith(scratch+'/publication.lock') && !trial.startsWith(scratch+'/stage-'), 'Reserved producer directory');
  dest = await safe(project,trial);
  await checkManagedOutput(dest,root,{allowDelivery:false});
}
const input=args.parameters??sourceDir+'/parameters.json',defaults=sourceDir+'/parameters.json',contractPath=sourceDir+'/contract.json',recordPath=sourceDir+'/original/sources.json';
assert(input.endsWith('.json'));
const [recipeBytes,signed,contract,record]=await Promise.all([input,defaults,contractPath,recordPath].map(read));
const recipe=JSON.parse(recipeBytes),original=JSON.parse(signed),stamp=JSON.parse(contract).resource,sources=JSON.parse(record);
assert.deepEqual(Object.keys(recipe).sort(),['schema','version','designs'].sort());assert(recipe.schema==='company-wall-absorber-collection'&&recipe.version===1&&Array.isArray(recipe.designs)&&recipe.designs.length&&recipe.designs.length<=48);
const deps={generator:await pin(generator),contract:await pin(contractPath),sourceRecord:await pin(recordPath),license:await pin(sources.licensePath)};
const collection={schemaVersion:1,id:'company-wall-absorber-v1',sourceParameters:input,sourceParametersSha256:sha(recipeBytes),generator,generatorSha256:deps.generator.sha256,contract:contractPath,contractSha256:deps.contract.sha256,resources:[]};
const seen=new Set(),files=new Map();
for(const d of recipe.designs){
 checkDesign(d);const key=d.id+'@'+d.version;assert(!seen.has(key),'Duplicate panel '+key);seen.add(key);
 const stock=original.designs.find(s=>s.id===d.id&&s.version===d.version);if(args.parameters&&stock)assert.deepEqual(d,stock,'Edit signed panel under a new identity or version');
 const depsForDesign={...deps};let donor,model;
 if(d.source){
  const s=d.source;
  if(d.kind==='timber')for(const key of ['author','license','path','sha256','licenseFile'])assert.deepEqual(s[key],sources.woodDonor[key],'Use the signed Kenney moulding or import an independently authored DCC mesh');
  donor=await read(s.path);assert.equal(sha(donor),s.sha256,'Source GLB hash differs');
  depsForDesign.originalModel={path:s.path,sha256:s.sha256};depsForDesign.originalLicense=await pin(s.licenseFile.path);
  assert.equal(depsForDesign.originalLicense.sha256,s.licenseFile.sha256,'Source license differs');assert((await read(s.licenseFile.path)).toString('utf8').trim().length>0);
  if(s.editable){depsForDesign.editableSource=await pin(s.editable.path);assert.equal(depsForDesign.editableSource.sha256,s.editable.sha256);}
  inspectContainer(donor);
 }
 if(d.kind==='dcc')model=donor;
 else{
  const group=new T.Group();group.name=d.id;
  const grainKind={honeyfelt:'felt',timber:'wood',upholstered:'weave',foam:'foam'}[d.kind];
  const mats=d.colors.map((color,i)=>finish(grainKind+'-'+(i+1),color,d.kind==='timber'?.72:.95));
  if(d.kind==='honeyfelt')honey(group,d,mats);
  if(d.kind==='foam')foam(group,d,mats);
  if(d.kind==='upholstered')cushion(group,d,mats);
  if(d.kind==='timber')await timber(group,d,mats,donor);
  model=bindGrain(Buffer.from(await new GLTFExporter().parseAsync(group,{binary:true,onlyVisible:true})),grainKind);
 }
 const dir='prototype/public/company-assets/wall-absorber-v1/'+d.id+'/v'+d.version,modelPath=dir+'/model.glb',resourcePath=dir+'/resource.json';
 const asset={format:'glb',url:modelPath.slice('prototype/public'.length),sha256:sha(model),bytes:model.length};
 const p={sourceParameters:input,sourceParametersSha256:collection.sourceParametersSha256,generator,generatorSha256:deps.generator.sha256,
  functionalContractSource:contractPath,functionalContractSourceSha256:deps.contract.sha256,dependencies:depsForDesign,sourceDesign:d.kind,
  sourceAuthor:d.source?.author??sources.author,sourceLicense:d.source?.license??'Project-authored',license:d.source?.license??'Project-authored',
  method:d.kind==='dcc'?'Install the original signed static DCC GLB unchanged.':'Extruded and solid panel components with embedded project-authored surface grain.',
  ...(d.source?{sourceArtifactPath:d.source.path,sourceArtifactSha256:d.source.sha256}:{}),...(d.kind==='timber'?{adapterAuthor:sources.author}:{})};
 const resource={id:d.id,version:d.version,displayName:d.displayName,...stamp,provenance:p,asset};
 const {doc}=inspectContainer(model);const inspection=measure(await load(model),resource);
 inspection.embeddedTextures=(doc.images??[]).map(im=>im.mimeType);
 files.set(modelPath,model);files.set(resourcePath,json(resource));
 collection.resources.push({id:d.id,version:d.version,resourcePath,modelPath,sha256:asset.sha256,geometrySha256:inspection.geometrySha256,inspection});
}
files.set(sourceDir+'/collection.json',json(collection));

const manifestTargets = await Promise.all([...files].map(async ([rel,bytes])=>({rel,bytes,target:await safe(dest??root,rel)})));
const missing = file => fs.lstat(file).then(()=>false).catch(e=>{if(e.code!=='ENOENT')throw e; return true;});
async function publish() {
  if(args.check) {
    for(const {bytes,target} of manifestTargets) assert(bytes.equals(await fs.readFile(target)),'Signed output differs: '+target);
    return;
  }
  await fs.mkdir(stage,{recursive:true});
  const lock = path.join(stage,'publication.lock');
  await fs.mkdir(lock);
  let spool;
  const own = [], dirs = [];
  try {
    if(dest) assert(await missing(dest),'Trial output already exists: '+dest);
    const pending = [];
    for(const item of manifestTargets) {
      if(await missing(item.target)) pending.push(item);
      else assert(item.bytes.equals(await fs.readFile(item.target)),'Refusing to replace signed output: '+item.target);
    }
    if(!pending.length) return;
    spool = await fs.mkdtemp(path.join(stage,'stage-'));
    const batch = path.join(spool,'batch');
    for(const {rel,bytes} of pending) {
      const target = await safe(batch,rel);
      await fs.mkdir(path.dirname(target),{recursive:true}); await fs.writeFile(target,bytes,{flag:'wx'});
    }
    async function mkdirs(parent, directory) {
      let cursor = parent;
      for(const part of path.relative(parent,directory).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor,part);
        try { await fs.mkdir(cursor); dirs.push(cursor); }
        catch(error) {
          if(error.code!=='EEXIST') throw error;
          assert((await fs.lstat(cursor)).isDirectory() && await fs.realpath(cursor)===cursor);
        }
      }
    }
    if(dest) {
      await mkdirs(project,path.dirname(dest)); await fs.rename(batch,dest);
    } else {
      for(const {rel,target} of pending) {
        await mkdirs(root,path.dirname(target));
        const source = path.join(batch,rel);
        await fs.link(source,target); own.push({source,target});
      }
    }
  } catch(error) {
    for(const {source,target} of own.reverse()) {
      const a = await fs.stat(source,{bigint:true}), b = await fs.lstat(target,{bigint:true});
      if(a.dev===b.dev && a.ino===b.ino) await fs.unlink(target);
    }
    for(const dir of dirs.reverse()) await fs.rmdir(dir).catch(e=>{if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))throw e;});
    throw error;
  } finally {
    try {
      if(spool) {
        assert.equal(path.dirname(await fs.realpath(spool)),stage);
        await fs.rm(spool,{recursive:true});
      }
    } finally { await fs.rmdir(lock); }
  }
}
await publish();
console.log(JSON.stringify({status:'passed',resources:collection.resources.map(({id,version,sha256,inspection})=>({id,version,sha256,triangles:inspection.triangles,depth:inspection.depthM}))}));
