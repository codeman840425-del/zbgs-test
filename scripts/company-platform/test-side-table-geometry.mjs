import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from '../../prototype/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import {validateSideTableGeometry} from '../../prototype/src/company/side-table-geometry.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';

const output=path.resolve(process.argv[2]||'evidence/company-side-table-geometry-v1');
const runDirectory=path.join(output,`run-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await fs.mkdir(runDirectory,{recursive:true});
const checks=[],realAssets=[],sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code,location,message,details)=>{throw Object.assign(new Error(message),{code,path:location,details});};
const invoke=(scene,resource)=>validateSideTableGeometry(scene,resource,fail);

function independent(root,name) {
  const mesh=root.getObjectByName(name);assert(mesh?.isMesh,`Missing actual fixture ${name}`);
  mesh.geometry=mesh.geometry.clone();return mesh;
}

function box(name,min,max,material) {
  const geometry=new THREE.BoxGeometry(...max.map((value,i)=>value-min[i]));
  geometry.translate(...max.map((value,i)=>(value+min[i])/2));
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;return mesh;
}

function mutate(name,fixture,change,codes,inspect) {
  const root=fixture.scene.clone(true),resource=structuredClone(fixture.resource);change(root,resource);
  let error;try{invoke(root,resource);}catch(caught){error=caught;}
  assert(error,`${name} unexpectedly passed`);
  assert((Array.isArray(codes)?codes:[codes]).includes(error.code),`${name} expected ${codes}, got ${error.code}: ${error.message}`);
  inspect?.(error);checks.push({name,passed:true,rejection:{code:error.code,path:error.path,message:error.message,details:error.details}});
}

function removeTriangle(root,name) {
  const mesh=independent(root,name),geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry;
  const positions=geometry.getAttribute('position');
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(Array.from(positions.array).slice(9),3));mesh.geometry=geometry;
}

async function load(modelPath,resourcePath) {
  const bytes=await fs.readFile(modelPath),resource=JSON.parse(await fs.readFile(resourcePath,'utf8'));
  assert.equal(sha(bytes),resource.asset.sha256);assert.equal(bytes.length,resource.asset.bytes);
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  return {bytes,resource,scene,modelPath,resourcePath};
}

let failure;
try{
  assert.deepEqual(validateSideTableGeometry(null,{mountRole:'vanity-table'},fail),{checked:false});
  checks.push({name:'Other pinned geometry profiles keep their original paths',passed:true});
  const fixtures=new Map();
  for(const design of ['round','square','nested','low']) {
    const directory=`prototype/public/company-assets/side-table-v1/${design}/v1`;
    const fixture=await load(`${directory}/model.glb`,`${directory}/resource.json`),actual=invoke(fixture.scene,fixture.resource);
    assert(actual.checked&&actual.support.checked);assert.equal(actual.profile,'side-table-v1');
    fixtures.set(design,fixture);realAssets.push({design,modelPath:fixture.modelPath,sha256:sha(fixture.bytes),actual});
    checks.push({name:`${design} actual external-derived GLB has complete board, closed source solids and real grounded support`,passed:true});
  }
  const round=fixtures.get('round'),square=fixtures.get('square'),nested=fixtures.get('nested'),low=fixtures.get('low');
  const alternate=structuredClone(round.resource);alternate.id='independent-side-table';alternate.version=2;
  assert(invoke(round.scene,alternate).checked);checks.push({name:'Same-function new ID and explicit version 2 remain supported',passed:true});
  for(const [fixture,names] of [[round,['side-table-top','side-table-round-board','side-table-round-support']],
    [square,['side-table-square-body','side-table-square-door','side-table-square-handle']],
    [nested,['side-table-nested-main','side-table-nested-small']]])for(const name of names)
      mutate(`Missing real ${name}`,fixture,root=>root.getObjectByName(name).removeFromParent(),'side-table-node');
  mutate('Thin planar circle cannot replace the solid board',round,root=>{
    const positions=independent(root,'side-table-round-board').geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++)positions.setY(i,.5);
  },'side-table-degenerate-face');
  mutate('Circle support cannot lose its true closed cut cap',round,root=>removeTriangle(root,'side-table-round-support'),'side-table-open-boundary');
  mutate('Circle annulus cannot lose a real triangle',round,root=>removeTriangle(root,'side-table-round-board'),'side-table-open-boundary');
  mutate('Shared patch cannot float above the real board',round,root=>independent(root,'side-table-top').geometry.translate(0,.002,0),'side-table-envelope');
  mutate('A duplicate coplanar closed patch cannot conceal an uncut original top',round,root=>{
    root.add(box('duplicate-top',[-.15,.499,-.11],[.15,.5,.11],root.getObjectByName('side-table-top').material));
  },'side-table-duplicate-face');
  mutate('Original column must actually meet the circle underside',round,root=>independent(root,'side-table-round-support').geometry.scale(1,.99,1),'side-table-round-board');
  mutate('Circle profile cannot become an oval under the same metadata',round,root=>{
    independent(root,'side-table-round-board').geometry.scale(.95,1,1);independent(root,'side-table-top').geometry.scale(.95,1,1);
  },'side-table-board');
  mutate('Open real low-table body is rejected',low,root=>removeTriangle(root,'side-table-low-body'),'side-table-open-boundary');
  mutate('Low table must keep four actual ground contacts',low,root=>{
    const p=independent(root,'side-table-low-body').geometry.getAttribute('position');
    for(let i=0;i<p.count;i++)if(p.getY(i)<.005&&!(p.getX(i)<0&&p.getZ(i)<0))p.setY(i,.01);
  },'side-table-ground-contact');
  mutate('Nested small table cannot borrow the main table ground',nested,root=>{
    const p=independent(root,'side-table-nested-small').geometry.getAttribute('position');
    for(let i=0;i<p.count;i++)if(p.getY(i)<.005&&!(p.getX(i)<.24&&p.getZ(i)<0))p.setY(i,.01);
  },'side-table-ground-contact');
  mutate('A closed added solid cannot penetrate the two real nested tables',nested,root=>{
    root.add(box('nested-penetrating-bridge',[.14,.09,.105],[.18,.13,.21],root.getObjectByName('side-table-top').material));
  },'side-table-intersection',error=>assert(error.details.overlap.kind==='inside'||error.details.overlap.kind==='surface-crossing'));
  mutate('Nested small table cannot silently move outside the validated source range',nested,root=>independent(root,'side-table-nested-small').geometry.translate(-.04,0,0),'side-table-nested-position');
  mutate('The source cabinet door and handle need a genuinely closed body',square,root=>removeTriangle(root,'side-table-square-handle'),'side-table-open-boundary');
  mutate('A real nested slab cannot be shortened into a thin unsupported foil',nested,root=>{
    const p=independent(root,'side-table-nested-small').geometry.getAttribute('position');
    for(let i=0;i<p.count;i++)if(p.getY(i)>.266&&p.getY(i)<.339)p.setY(i,.338);
  },'side-table-board');
  mutate('Named body cannot hide a disconnected closed block',low,root=>{
    const mesh=independent(root,'side-table-low-body'),extra=box('hidden',[.32,.36,-.25],[.34,.38,-.23],mesh.material);
    extra.geometry.deleteAttribute('uv');
    const original=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry;
    mesh.geometry=mergeGeometries([original,extra.geometry.toNonIndexed()]);
  },'side-table-components');
  mutate('An unknown extra mesh must still have a grounded contact path',round,root=>root.add(box('floating-extra',[.32,.36,-.25],[.34,.38,-.23],root.getObjectByName('side-table-top').material)),'side-table-detached');
  mutate('Transparent source material cannot fake a real board',round,root=>{
    const mesh=independent(root,'side-table-round-board');mesh.material=mesh.material.clone();mesh.material.transparent=true;mesh.material.opacity=.2;
  },'side-table-material');
  mutate('Unbaked source transforms are rejected',square,root=>{root.getObjectByName('side-table-square-body').scale.x=1.01;},'side-table-transform');
  mutate('Hidden source supports are rejected',round,root=>{root.getObjectByName('side-table-round-support').visible=false;},'side-table-transform');
  mutate('Unknown source form cannot be inferred from bounds',low,(root,r)=>{r.provenance.sourceDesign='unverified';},'side-table-source-form');
  mutate('Every actual referenced triangle must fit the complete installation box',low,root=>root.add(box('outside',[.39,.2,0],[.41,.22,.02],root.getObjectByName('side-table-top').material)),'side-table-envelope');
  mutate('Shared support node metadata must point to an actual usable two-triangle top',low,(root,r)=>{r.supportNodes.top='side-table-low-body';},'invalid-support-topology');
  const before=await load('evidence/company-side-table-production-v1/before-nested.glb','evidence/company-side-table-production-v1/before-nested-resource.json');
  const beforeActual=invoke(before.scene,before.resource);assert(beforeActual.checked);assert.notEqual(sha(before.bytes),sha(nested.bytes));
  checks.push({name:'Real prior .23m source-offset GLB also passes actual solids and independent ground checks',passed:true,sha256:sha(before.bytes),actual:beforeActual});
  const library=createCompanyAssetLibrary({fetchImpl:async url=>{
    const bytes=await fs.readFile(`prototype/public${url}`);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  }});
  try{await library.preload([...fixtures.values()].map(fixture=>fixture.resource).concat(alternate));checks.push({name:'Shared actual asset-library admits four external-derived assets and new identity/version through the dedicated gate',passed:true});}
  finally{library.dispose();}
}catch(error){failure={message:error.message,code:error.code,path:error.path,details:error.details,stack:error.stack};}
const sourceHashes={};for(const filename of ['prototype/src/company/side-table-geometry.js','prototype/src/company/support-geometry.js','prototype/src/company/asset-library.js','scripts/company-platform/test-side-table-geometry.mjs'])sourceHashes[filename]=sha(await fs.readFile(filename));
const report={status:failure?'failed':'passed',checks,realAssets,failure,sourceHashes,
  limits:['Actual external-derived imported GLBs with controlled real mesh mutations. Finite static closed shells, board coverage, contact and independent ground checks. The pinned producer separately proves original source-vertex adaptation and license identity.', 'No mechanical strength, dynamic nesting, ordinary-computer performance or character-use acceptance.']};
await fs.writeFile(path.join(runDirectory,'report.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(output,'latest.json'),JSON.stringify({status:report.status,report:path.relative(process.cwd(),path.join(runDirectory,'report.json')).replaceAll('\\','/')},null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:checks.length,assets:realAssets.length,report:path.join(runDirectory,'report.json'),failure},null,2));
if(failure)process.exitCode=1;
