import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {applyBackdropState,validateBackdropResource} from '../../prototype/src/company/backdrop-roll.js';
import {createCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};

const project = fileURLToPath(new URL('../../', import.meta.url));
const out = path.resolve(process.argv[2] || path.join(project,'output/backdrop-rail/runtime'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {status:'running', assets:[], rejections:[]};
const fixture = {
  id:'backdrop-test', version:1, displayName:'Runtime fixture', category:'dynamic', mountRole:'background-fabric',
  productionBranch:'background-fabric', mount:'floor-surface', parent:'room.floor', coordinates:{units:'metres',up:'+Y',forward:'+Z'},
  mounting:{width:2.1,height:1.93,depth:.30,origin:'bottom'}, footprint:{center:[0,0],halfSize:[1.05,.15],blocking:true},
  usePoints:[], stateDefaults:{deployment:1}, stateSchema:{deployment:{type:'number',min:0,max:1}},
  stateSemantics:{deployment:'backdrop-deployment-fraction'}, backdropRoll:{slotY:.11,travel:1.78}
};
installNodeImageDecodeShim();
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(buffer => {this.result=buffer;this.onloadend?.();}); }
};

function model() {
  const group = new THREE.Group();
  function mesh(name,geometry) {
    const child = new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());
    child.name=name; group.add(child); return child;
  }
  mesh('fabric-sheet',new THREE.PlaneGeometry(1.86,1.78,4,32).translate(0,1,.024));
  mesh('lift-mast',new THREE.BoxGeometry(.03,1.78,.03).translate(0,1,-.06));
  mesh('lift-rail',new THREE.BoxGeometry(1.94,.034,.11).translate(0,1.89,-.012));
  mesh('fixed-case',new THREE.BoxGeometry(2,.11,.21).translate(0,.055,0));
  return group;
}
async function encode(group) {
  const bytes = Buffer.from(await new GLTFExporter().parseAsync(group,{binary:true}));
  return {bytes,resource:{...fixture,asset:{format:'glb',url:'/fixture.glb',sha256:sha(bytes),bytes:bytes.length}}};
}
function libraryFor(bytes) {
  return createCompanyAssetLibrary({fetchImpl:async()=>new Response(bytes)});
}
const close = (a,b,reason) => assert(Math.abs(a-b)<2e-5,reason+' ('+a+' vs '+b+')');
function ray(sheet,x,y) {
  return new THREE.Raycaster(new THREE.Vector3(x,y,.5),new THREE.Vector3(0,0,-1)).intersectObject(sheet)[0];
}
function inspectPose(instance,reference,resource,value) {
  applyBackdropState(instance,resource,{deployment:value});
  const sheet=instance.getObjectByName('fabric-sheet'), mast=instance.getObjectByName('lift-mast'), rail=instance.getObjectByName('lift-rail');
  const refSheet=reference.getObjectByName('fabric-sheet'), refRail=reference.getObjectByName('lift-rail');
  const top=.11+1.78*value, offset=1.78*(1-value);
  const box=obj=>new THREE.Box3().setFromObject(obj,true);
  close(box(rail).max.y,box(refRail).max.y-offset,'rail');
  close(box(mast).min.y,.11,'anchored mast');close(box(mast).max.y,top,'mast head');
  assert.equal(sheet.visible,value>0);
  assert(!ray(sheet,.18,top+.055),'Retracted triangles should not intercept a ray');
  const p=sheet.geometry.attributes.position;
  if(!value){assert.equal(p.count,0);assert(box(sheet).isEmpty());return {deployment:value,triangles:0};}
  const bounds=box(sheet);
  close(bounds.min.y,.11,'cloth at slot');close(bounds.max.y,top,'cloth at rail');
  for(const part of [.24,.67]){
    const y=.11+value*1.78*part;
    const hit=ray(sheet,.17,y),original=ray(refSheet,.17,y+offset);
    assert(hit?.face&&original?.face,'Retained portion should have a real front-facing triangle');
    close(hit.point.z,original.point.z,'same pleat depth');close(hit.uv.x,original.uv.x,'same horizontal UV');
    close(hit.uv.y,original.uv.y,'same longitudinal UV at this physical point on the roll');
  }
  const index=sheet.geometry.index, count=index?.count??p.count;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  let area=0;
  for(let i=0;i<count;i+=3){
    [a,b,c].forEach((v,j)=>v.fromBufferAttribute(p,index?index.getX(i+j):i+j));
    const twice=b.sub(a).cross(c.sub(a)).length();assert(twice>0,'Clipped sheet has a collapsed face');area+=twice/2;
  }
  sheet.geometry.computeBoundingSphere();assert(Number.isFinite(sheet.geometry.boundingSphere.radius));
  return {deployment:value,triangles:count/3,bottom:bounds.min.y,top:bounds.max.y,area};
}
async function checkAsset(resource,bytes) {
  const library=libraryFor(bytes);
  try{
    await library.preload([resource]);
    const a=library.instantiate(resource).root,b=library.instantiate(resource).root;
    const refSheet=b.getObjectByName('fabric-sheet'), original=refSheet.geometry.clone();
    assert.notEqual(a.getObjectByName('fabric-sheet').geometry,refSheet.geometry);
    assert.notEqual(a.getObjectByName('fabric-sheet').material,refSheet.material);
    const poses=[1,.5,.413,0,1].map(value=>inspectPose(a,b,resource,value));assert.deepEqual(poses[0],poses.at(-1));
    assert.deepEqual(refSheet.geometry.attributes.position.array,original.attributes.position.array);
    assert.deepEqual(refSheet.geometry.attributes.uv.array,original.attributes.uv.array);
    assert.equal(b.getObjectByName('lift-mast').scale.y,1);assert.equal(b.getObjectByName('lift-rail').position.y,0);
    for(const value of [-.1,1.1,NaN,'0.5'])assert.throws(()=>applyBackdropState(a,resource,{deployment:value}),e=>e.code==='invalid-backdrop-state');
    report.assets.push({id:resource.id,sha256:sha(bytes),poses});original.dispose();
  }finally{library.dispose();}
}
const valid=await encode(model());await checkAsset(valid.resource,valid.bytes);
async function reject(name,code,mutateModel,mutateResource) {
  const group=model();mutateModel?.(group);
  const {resource,bytes}=await encode(group);mutateResource?.(resource);const library=libraryFor(bytes);
  try{await assert.rejects(library.preload([resource]),e=>{assert.equal(e.code,code,name+': '+e.message);assert(e.path);report.rejections.push({name,code,path:e.path});return true;});}
  finally{library.dispose();}
}
await reject('missing top rail','missing-backdrop-part',g=>g.remove(g.getObjectByName('lift-rail')));
await reject('duplicate authored sheet','invalid-backdrop-part',g=>g.add(g.getObjectByName('fabric-sheet').clone()));
await reject('unbaked local pose','invalid-backdrop-transform',g=>{g.getObjectByName('lift-mast').position.x=.02;});
await reject('wrong mast extent','invalid-backdrop-travel',g=>g.getObjectByName('lift-mast').geometry.translate(0,.012,0));
await reject('fixed housing lifted off floor','invalid-backdrop-base',g=>g.getObjectByName('fixed-case').geometry.translate(0,.02,0));
await reject('detached top rail','invalid-backdrop-rail',g=>g.getObjectByName('lift-rail').geometry.translate(0,0,.12));
await reject('no fabric UVs','invalid-backdrop-sheet',g=>g.getObjectByName('fabric-sheet').geometry.deleteAttribute('uv'));
await reject('two-level card','invalid-backdrop-sheet',g=>{g.getObjectByName('fabric-sheet').geometry=new THREE.PlaneGeometry(1.86,1.78).translate(0,1,.024);});
await reject('token strip in place of full-width fabric','invalid-backdrop-sheet',g=>g.getObjectByName('fabric-sheet').geometry.scale(.04,1,1));
await reject('housing balances on a single point-like pad','invalid-backdrop-feet',g=>g.getObjectByName('fixed-case').geometry.scale(.03,1,.2));
await reject('fixed board remains after retraction','invalid-backdrop-base',g=>{
  const panel=new THREE.Mesh(new THREE.BoxGeometry(1.8,1.7,.02).translate(0,.9,-.1));panel.name='decoy-backing';g.add(panel);
});
await reject('narrow head no longer catches outer fabric','invalid-backdrop-rail',g=>g.getObjectByName('lift-rail').geometry.scale(.2,1,1));
await reject('bounding box touches but mast has no top bridge','invalid-backdrop-rail',g=>{
  const geo=g.getObjectByName('lift-rail').geometry;
  const p=geo.attributes.position;
  for(let i=0;i<p.count;i++)if(p.getX(i)>0)p.setZ(i,p.getZ(i)+.08);
});
await reject('split mast with a gap in its middle','invalid-backdrop-travel',g=>{
  const p1=new THREE.BoxGeometry(.03,.40,.03).translate(0,.31,-.06).toNonIndexed().attributes.position;
  const p2=new THREE.BoxGeometry(.03,.40,.03).translate(0,1.69,-.06).toNonIndexed().attributes.position;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([...p1.array,...p2.array],3));
  geometry.computeVertexNormals();g.getObjectByName('lift-mast').geometry=geometry;
});
await reject('injected seat use point','invalid-backdrop-contract',null,r=>{r.usePoints=[{id:'invented-seat'}];});
await reject('outside envelope','backdrop-envelope',g=>g.getObjectByName('fixed-case').geometry.translate(.2,0,0));
await reject('wrong role','invalid-backdrop-contract',null,r=>{r.mountRole='screen-partition';});
await reject('nonblocking floor strip','invalid-backdrop-mount',null,r=>{r.footprint={...r.footprint,blocking:false};});
await reject('wrong deployment range','invalid-backdrop-state',null,r=>{r.stateSchema={deployment:{type:'number',min:0,max:2}};});
validateBackdropResource({mountRole:'screen-partition'},()=>assert.fail('Legacy partition changed'));

const localCatalog={...catalog,resources:[...catalog.resources,valid.resource]};
const doc=createCompany({id:'backdrop-test-room'},localCatalog),room=doc.nodes.find(n=>n.kind==='room');
const ref={id:valid.resource.id,version:1};
const placed=prepareCompanyChange(doc,[{type:'add-facility',id:'test-roll',parentId:room.id,resource:ref,transform:{position:[0,0,-2.7],yaw:0}}],{catalog:localCatalog,templates}).document;
const setState=value=>prepareCompanyChange(placed,[{type:'set-state',id:'test-roll',state:{deployment:value}}],{catalog:localCatalog,templates}).document;
const saved=await encodeCompanySave(setState(.413),localCatalog,templates);
assert.deepEqual(await decodeCompanySave(saved,localCatalog,templates),setState(.413));
const old=JSON.stringify(placed);
for(const value of [-.1,1.1,'0.5'])assert.throws(()=>setState(value),e=>e.code==='invalid-device-state');
assert.equal(JSON.stringify(placed),old);report.savedSha256=sha(saved);
if (process.argv[3]) {
  const family=path.resolve(process.argv[3]);
  const dirs=(await fs.readdir(family,{withFileTypes:true})).filter(d=>d.isDirectory());
  assert(dirs.length,'Candidate directory has no backdrop resource directories');
  for (const dir of dirs) {
    const versions=await fs.readdir(path.join(family,dir.name),{withFileTypes:true});
    for (const version of versions.filter(v=>v.isDirectory())) {
      const base=path.join(family,dir.name,version.name);
      const resource=JSON.parse(await fs.readFile(path.join(base,'resource.json'),'utf8'));
      await checkAsset(resource,await fs.readFile(path.join(base,'model.glb')));
    }
  }
} else {
  for(const resource of catalog.resources.filter(r=>r.productionBranch==='background-fabric'))
    await checkAsset(resource,await fs.readFile(path.join(project,'prototype/public',resource.asset.url)));
}
report.status='passed';await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,assets:report.assets.map(a=>a.id),rejections:report.rejections.length,savedSha256:report.savedSha256}));
