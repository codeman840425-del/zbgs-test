import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {validateMakeupWallMirrorGeometry} from '../../prototype/src/company/makeup-wall-mirror-geometry.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';

const output=path.resolve(process.argv[2]||'evidence/company-makeup-wall-mirror-geometry-v1');
const runDirectory=path.join(output,`run-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await fs.mkdir(runDirectory,{recursive:true});
const checks=[],realAssets=[],sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code,location,message,details)=>{throw Object.assign(new Error(message),{code,path:location,details});};
const invoke=(scene,resource)=>validateMakeupWallMirrorGeometry(scene,resource,fail);

function independent(root,name) {
  const mesh=root.getObjectByName(name);assert(mesh?.isMesh,`Missing fixture ${name}`);
  mesh.geometry=mesh.geometry.clone();return mesh;
}

function box(name,min,max,material) {
  const geometry=new THREE.BoxGeometry(...max.map((value,i)=>value-min[i]));
  geometry.translate(...max.map((value,i)=>(value+min[i])/2));
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;return mesh;
}

function add(root,name,min,max) {
  const mesh=box(name,min,max,root.getObjectByName('makeup-wall-mount').material);root.add(mesh);return mesh;
}

function reject(name,scene,resource,codes,inspect) {
  let error;try{invoke(scene,resource);}catch(caught){error=caught;}
  assert(error,`${name} unexpectedly passed`);
  assert((Array.isArray(codes)?codes:[codes]).includes(error.code),`${name} expected ${codes}, got ${error.code}: ${error.message}`);
  inspect?.(error);
  checks.push({name,passed:true,rejection:{code:error.code,path:error.path,message:error.message,details:error.details}});
}

function mutate(name,fixture,change,codes,inspect) {
  const root=fixture.scene.clone(true),resource=structuredClone(fixture.resource);change(root,resource);
  reject(name,root,resource,codes,inspect);
}

function removeTriangle(root,name) {
  const mesh=independent(root,name),geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry;
  const positions=geometry.getAttribute('position');
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(Array.from(positions.array).slice(9),3));mesh.geometry=geometry;
}

async function load(directory,design,initial=false) {
  const modelPath=initial?`${directory}/${design}.glb`:`${directory}/${design}/v1/model.glb`;
  const resourcePath=initial?`${directory}/${design}-resource.json`:`${directory}/${design}/v1/resource.json`;
  const bytes=await fs.readFile(modelPath),resource=JSON.parse(await fs.readFile(resourcePath,'utf8'));
  assert.equal(sha(bytes),resource.asset.sha256);assert.equal(bytes.length,resource.asset.bytes);
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  return {scene,resource,bytes,modelPath,resourcePath};
}

let failure;
try{
  assert.deepEqual(validateMakeupWallMirrorGeometry(null,{mountRole:'makeup-mirror'},fail),{checked:false});
  checks.push({name:'Pinned tabletop and other legacy geometry stay on their own admission path',passed:true});
  const fixtures=new Map();
  for(const design of ['round','lit-frame','arch','tri-fold']) {
    const fixture=await load('prototype/public/company-assets/makeup-wall-mirror-v1',design),actual=invoke(fixture.scene,fixture.resource);
    assert(actual.checked&&actual.wallMounted);assert.equal(actual.panels.length,design==='tri-fold'?3:1);
    assert(Math.abs(actual.wallArea-.0384)<1e-7);assert(Math.abs(actual.mountingContact.volume-.0002688)<1e-8);
    fixtures.set(design,fixture);realAssets.push({design,modelPath:fixture.modelPath,resourcePath:fixture.resourcePath,sha256:sha(fixture.bytes),actual});
    checks.push({name:`${design} actual GLB has real wall contact, supported head and complete mirror planes`,passed:true});
  }
  const round=fixtures.get('round'),tri=fixtures.get('tri-fold');
  const alternate=structuredClone(round.resource);alternate.id='independent-wall-mirror';alternate.version=2;
  assert(invoke(round.scene,alternate).checked);checks.push({name:'A same-function new ID and explicit version 2 are supported',passed:true});
  for(const name of ['makeup-wall-mount','makeup-back-center','makeup-face-center','makeup-frame-center','makeup-lamp'])
    mutate(`Missing actual ${name}`,round,root=>root.getObjectByName(name).removeFromParent(),'makeup-wall-node');
  mutate('Flat mount cannot stand in for a closed wall plate',round,root=>independent(root,'makeup-wall-mount').geometry.scale(1,1,0),['makeup-wall-degenerate-face','makeup-wall-open-or-inconsistent','makeup-wall-nonpositive-volume']);
  mutate('Plate floating off wall is rejected',round,root=>independent(root,'makeup-wall-mount').geometry.translate(0,0,.005),'makeup-wall-support-box');
  mutate('Partial plate cannot fake the full wall contact rectangle',round,root=>independent(root,'makeup-wall-mount').geometry.scale(.8,1,1),'makeup-wall-support-box');
  mutate('Actual rear geometry cannot penetrate the wall',round,root=>independent(root,'makeup-wall-mount').geometry.translate(0,0,-.002),'makeup-wall-envelope');
  mutate('Actual backing cannot float away from its declared plane',round,root=>independent(root,'makeup-back-center').geometry.translate(0,0,.003),'makeup-wall-back-geometry');
  mutate('Thin open back cannot fake the curved thick backing',round,root=>independent(root,'makeup-back-center').geometry.scale(1,1,0),['makeup-wall-degenerate-face','makeup-wall-open-or-inconsistent','makeup-wall-nonpositive-volume']);
  mutate('Back missing a triangle is rejected',round,root=>removeTriangle(root,'makeup-back-center'),'makeup-wall-open-or-inconsistent');
  mutate('Frame missing a triangle is rejected',round,root=>removeTriangle(root,'makeup-frame-center'),'makeup-wall-open-or-inconsistent');
  mutate('Actual lamp housing must contain the fixed light source',round,root=>independent(root,'makeup-lamp').geometry.translate(.12,0,0),'makeup-wall-lamp-geometry');
  mutate('Lamp cannot float after removal of its actual riser',round,root=>root.getObjectByName('makeup-lamp-riser').removeFromParent(),'makeup-wall-detached-component');
  mutate('Unbaked node offset cannot conceal incompatible mesh coordinates',round,root=>{root.getObjectByName('makeup-wall-mount').position.x=.001;},'makeup-wall-transform');
  mutate('Hidden supporting solid is rejected',round,root=>{root.getObjectByName('makeup-back-center').visible=false;},'makeup-wall-transform');
  mutate('Transparent mirror material cannot fake an opaque real face',round,root=>{
    const mesh=independent(root,'makeup-face-center');mesh.material=mesh.material.clone();mesh.material.transparent=true;mesh.material.opacity=.2;
  },'makeup-wall-material');
  mutate('A front plate cannot cover the declared mirror interior',round,root=>add(root,'mirror-blocker',[-.03,-.03,.039],[.03,.03,.05]),'makeup-wall-surface-occluded');
  mutate('A narrow front fin cannot cross the mirror interior',round,root=>add(root,'front-fin',[-.00002,-.05,.03],[.00002,.05,.07]),'makeup-wall-surface-occluded');
  mutate('Identical closed lamp exterior cannot be duplicated under another name',round,root=>{
    const extra=root.getObjectByName('makeup-lamp').clone();extra.name='duplicate-lamp';root.add(extra);
  },'makeup-wall-duplicate-outer-face');
  for(const name of ['makeup-base','makeup-post'])mutate(`Forbidden tabletop remnant ${name}`,round,root=>add(root,name,[.25,-.26,.01],[.26,-.25,.02]),'makeup-wall-tabletop-remnant');
  mutate('Full wall envelope applies to every actual mesh',round,root=>add(root,'too-tall',[.25,.29,.01],[.26,.31,.02]),'makeup-wall-envelope');
  mutate('Curved back AABB intersection cannot support a detached solid',round,root=>{
    const geometry=new THREE.CylinderGeometry(.015,.015,.01,16).rotateX(Math.PI/2).translate(.19,-.19,.018);
    const extra=new THREE.Mesh(geometry,root.getObjectByName('makeup-wall-mount').material);extra.name='false-curve-contact';root.add(extra);
    geometry.computeBoundingBox();const backing=root.getObjectByName('makeup-back-center').geometry;backing.computeBoundingBox();
    assert(geometry.boundingBox.intersectsBox(backing.boundingBox),'Adversary must overlap the real curved backing AABB');
  },'makeup-wall-detached-component');
  mutate('Actual central face must remain on the true reflection plane',round,root=>independent(root,'makeup-face-center').geometry.translate(0,0,.002),'makeup-wall-face-geometry');
  mutate('Missing actual face triangles cannot be replaced by metadata area',round,root=>removeTriangle(root,'makeup-face-center'),'makeup-wall-face-coverage');
  mutate('Declared outline change cannot silently select another shape',round,(root,r)=>{r.mirrorPanels[0].polygons[0][0][0]+=.001;},'makeup-wall-panel-contract');
  mutate('Source shape cannot be inferred from the loaded bounds',round,(root,r)=>{r.provenance.sourceDesign='unknown';},'makeup-wall-shape-profile');
  mutate('Actual arch backing must preserve its finite curved profile',fixtures.get('arch'),root=>{
    const mesh=independent(root,'makeup-back-center');mesh.geometry=box('rectangular-fake',[-.17,-.185,.013],[.17,.185,.029],mesh.material).geometry;
  },'makeup-wall-back-geometry');
  mutate('Tri-fold requires every real side face',tri,root=>root.getObjectByName('makeup-face-left').removeFromParent(),'makeup-wall-node');
  mutate('Actual wing cannot be flattened onto the central plane',tri,root=>{
    const positions=independent(root,'makeup-face-left').geometry.getAttribute('position');for(let i=0;i<positions.count;i++)positions.setZ(i,.038);
  },'makeup-wall-face-geometry');
  mutate('Actual wing triangle winding must face its own plane normal',tri,root=>{
    const mesh=independent(root,'makeup-face-right'),geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry,p=geometry.getAttribute('position');
    for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1);p.setXYZ(i,b.x,b.y,b.z);p.setXYZ(i+1,a.x,a.y,a.z);}mesh.geometry=geometry;
  },'makeup-wall-face-geometry');
  mutate('Tri-fold miter seam cap must be genuinely closed',tri,root=>removeTriangle(root,'makeup-frame-left'),'makeup-wall-open-or-inconsistent');
  for(const design of ['round','tri-fold']){
    const original=await load('evidence/company-makeup-wall-mirror-production-v1/initial-original-head',design,true);
    reject(`Original actual ${design} joint defect remains rejected`,original.scene,original.resource,design==='round'?'makeup-wall-duplicate-outer-face':'makeup-wall-frame-geometry');
    checks.at(-1).originalAsset={path:original.modelPath,sha256:sha(original.bytes)};
  }
  const library=createCompanyAssetLibrary({fetchImpl:async url=>{
    const bytes=await fs.readFile(`prototype/public${url}`);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  }});
  try{await library.preload([...fixtures.values()].map(fixture=>fixture.resource).concat(alternate));checks.push({name:'Actual shared asset-library loader admits all four and the new version through the dedicated wall gate',passed:true});}
  finally{library.dispose();}
}catch(error){failure={message:error.message,code:error.code,path:error.path,details:error.details,stack:error.stack};}
const sourceHashes={};for(const filename of ['prototype/src/company/makeup-wall-mirror-geometry.js','prototype/src/company/asset-library.js','scripts/company-platform/test-makeup-wall-mirror-geometry.mjs'])sourceHashes[filename]=sha(await fs.readFile(filename));
const report={status:failure?'failed':'passed',checks,realAssets,failure,sourceHashes,
  limits:['Actual imported wall GLBs and controlled real mesh mutations. Static geometry, mirror-plane coverage and positive support contact only. GPU reflection, real illumination, wall-anchor strength and character use remain separate.']};
await fs.writeFile(path.join(runDirectory,'report.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(output,'latest.json'),JSON.stringify({status:report.status,report:path.relative(process.cwd(),path.join(runDirectory,'report.json')).replaceAll('\\','/')},null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:checks.length,assets:realAssets.length,report:path.join(runDirectory,'report.json'),failure},null,2));
if(failure)process.exitCode=1;
