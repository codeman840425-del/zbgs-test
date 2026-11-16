import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import sourceCatalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates.json' with {type:'json'};
import {createCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';

const catalog=structuredClone(sourceCatalog),checks=[];
const badge=structuredClone(catalog.resources.find(resource=>resource.id==='keyboard'));
badge.id='independent-badge';badge.mountRole='badge';delete badge.mount;delete badge.footprint;
badge.stateDefaults={on:true};badge.node.children[0].screen=true;catalog.resources.push(badge);
const nested=structuredClone(catalog.resources.find(resource=>resource.id==='chair'));
nested.id='independent-nested-seat';nested.mountRole='independent-nested-seat';delete nested.footprint;catalog.resources.push(nested);
const document=prepareCompanyChange(createCompany({id:'subtree',width:20,depth:20},catalog),[
  {type:'add-facility',id:'sofa',parentId:'subtree/room-1',resource:{id:'lounge-sofa',version:1},transform:{position:[0,0,0],yaw:0}},
],{catalog,templates}).document;
const library=createCompanyAssetLibrary({fetchImpl:async url=>new Response(await fs.readFile(new URL(`../../prototype/public${url}`,import.meta.url)))});
await library.preload([catalog.resources.find(resource=>resource.id==='lounge-sofa'&&resource.version===1)]);
const world=new THREE.Scene(),scene=createCompanyScene(world,document,{catalog,templates,assetLibrary:library});
const held=['sofa#left','sofa#right'].map(id=>scene.resolveUsePoint(id));let heldDisposes=0;
for(const point of held)point.chairSeat.geometry.addEventListener('dispose',()=>heldDisposes++);
const geometry=new Map(),material=new Map(),originalAdd=THREE.Object3D.prototype.add,originalClone=THREE.Object3D.prototype.clone;let cloning=0;
THREE.Object3D.prototype.clone=function(...args){cloning++;try{return originalClone.apply(this,args);}finally{cloning--;}};
THREE.Object3D.prototype.add=function(...objects){if(!cloning)for(const object of objects)object.traverse(node=>{
  if(node.geometry&&!geometry.has(node.geometry)){geometry.set(node.geometry,0);node.geometry.addEventListener('dispose',()=>geometry.set(node.geometry,geometry.get(node.geometry)+1));}
  for(const item of node.material?[node.material].flat():[])if(!material.has(item)){material.set(item,0);item.addEventListener('dispose',()=>material.set(item,material.get(item)+1));}
});return originalAdd.apply(this,objects);};
const counts=()=>({geometryTracked:geometry.size,geometryUndisposed:[...geometry.values()].filter(value=>value===0).length,materialTracked:material.size,materialUndisposed:[...material.values()].filter(value=>value===0).length});
function preserved(){for(const point of held){assert.equal(scene.resolveUsePoint(point.id).chair,point.chair);assert.equal(scene.resolveUsePoint(point.id).chairSeat,point.chairSeat);}assert.equal(heldDisposes,0);}
function apply(operations){const handle=scene.prepareChange(operations,{isUsePointBusy:()=>true});try{scene.commit(handle,{isUsePointBusy:()=>true});}finally{scene.discard(handle);}}
function check(name,fn){try{const details=fn();checks.push({name,passed:true,details});}catch(error){checks.push({name,passed:false,code:error.code,error:error.stack});}}
function mesh(id){return scene.root.getObjectByName(id)?.getObjectByName('keyboard');}
try{
  check('Add a legal child keeps its actual visual branch and original sofa contacts',()=>{
    apply([{type:'add-facility',id:'badge',parentId:'sofa',resource:{id:badge.id,version:1},transform:{position:[0,1.1,0],yaw:0}}]);
    assert.equal(scene.document.nodes.some(node=>node.id==='badge'),true);assert.equal(scene.root.getObjectByName('badge').parent,scene.root.getObjectByName('sofa'));assert.equal(mesh('badge').material.emissiveIntensity,.35);preserved();return{visualChildPresent:true,heldSeatDisposes:heldDisposes};
  });
  check('Child state edit updates actual material and releases the outgoing child only',()=>{
    const outgoing=mesh('badge');let released=0;outgoing.geometry.addEventListener('dispose',()=>released++);outgoing.material.addEventListener('dispose',()=>released++);
    apply([{type:'set-state',id:'badge',state:{on:false}}]);assert.equal(mesh('badge').material.emissiveIntensity,0);assert.equal(released,2);assert.notEqual(mesh('badge'),outgoing);preserved();return{outgoingGeometryAndMaterialDisposeEvents:released};
  });
  check('Child transform edit follows document position and releases prior actual mesh',()=>{
    const outgoing=mesh('badge');let released=0;outgoing.geometry.addEventListener('dispose',()=>released++);
    apply([{type:'move',id:'badge',transform:{position:[.2,1.1,.1],yaw:Math.PI/2}}]);
    assert.deepEqual(scene.root.getObjectByName('badge').getWorldPosition(new THREE.Vector3()).toArray(),[.2,1.1,.1]);assert.equal(mesh('badge').material.emissiveIntensity,0);assert.equal(released,1);preserved();return{outgoingGeometryDisposeEvents:released};
  });
  check('Child removal removes its document and visual branch without disposing sofa contacts',()=>{
    const outgoing=mesh('badge');let released=0;outgoing.geometry.addEventListener('dispose',()=>released++);outgoing.material.addEventListener('dispose',()=>released++);
    apply([{type:'remove',id:'badge'}]);assert.equal(scene.document.nodes.some(node=>node.id==='badge'),false);assert.equal(scene.root.getObjectByName('badge'),undefined);assert.equal(released,2);preserved();return{outgoingGeometryAndMaterialDisposeEvents:released};
  });
  check('Nested contact-bearing child keeps both generations of contact references during grandchild edits',()=>{
    apply([{type:'add-facility',id:'nested',parentId:'sofa',resource:{id:nested.id,version:1},transform:{position:[0,0,1.2],yaw:0}},
      {type:'add-facility',id:'nested-badge',parentId:'nested',resource:{id:badge.id,version:1},transform:{position:[0,1.1,0],yaw:0}}]);
    const contact=scene.resolveUsePoint('nested#seat');let disposed=0;contact.chairSeat.geometry.addEventListener('dispose',()=>disposed++);
    apply([{type:'set-state',id:'nested-badge',state:{on:false}},{type:'move',id:'nested-badge',transform:{position:[.1,1.1,0],yaw:0}}]);
    assert.equal(scene.resolveUsePoint(contact.id).chair,contact.chair);assert.equal(scene.resolveUsePoint(contact.id).chairSeat,contact.chairSeat);assert.equal(disposed,0);assert.equal(mesh('nested-badge').material.emissiveIntensity,0);assert.equal(scene.root.getObjectByName('nested-badge').parent,scene.root.getObjectByName('nested'));assert.equal(scene.root.getObjectByName('nested').parent,scene.root.getObjectByName('sofa'));preserved();return{nestedHeldSeatDisposes:disposed,scope:'Synthetic nonblocking nested reference fixture only, no character-use claim'};
  });
  check('Final scene disposal releases all resources tracked on affected branches and placeholders',()=>{
    preserved();scene.dispose();assert.equal(world.children.length,0);const observed=counts();assert.equal(observed.geometryUndisposed,0);assert.equal(observed.materialUndisposed,0);return observed;
  });
}finally{THREE.Object3D.prototype.add=originalAdd;THREE.Object3D.prototype.clone=originalClone;scene.dispose();library.dispose();}
const inputs=[];
for(const file of ['prototype/src/company/render.js','prototype/src/company/authoring.js','prototype/src/company/document.js','prototype/src/company/library-catalog.json'])inputs.push({path:file,sha256:createHash('sha256').update(await fs.readFile(new URL(`../../${file}`,import.meta.url))).digest('hex')});
const report={status:checks.every(row=>row.passed)?'passed':'failed',configuration:{model:'gpt-6.1-sol',reasoning_effort:'high',reuseKnownConfiguration:true,difficulty:'complex',reason:'Targeted contact-root retention and facility child reconciliation',actualProviderConfiguration:'not independently verified',desktopHookInterception:'not independently verified'},inputs,checks,
  limits:['Targeted subtree fix only. Initial failure evidence retained. Earlier eight unrelated checks were not rerun.','Actual Three CPU meshes/materials and real sofa GLB. Badge and nonblocking nested seat are explicit reference fixtures. Busy callbacks are fixture state, not actual actor occupancy. No browser/GPU or C3 acceptance.']};
await fs.writeFile(new URL('./subtree-recheck.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.status!=='passed')process.exitCode=1;
