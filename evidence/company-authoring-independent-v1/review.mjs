import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import baseCatalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates.json' with {type:'json'};
import {createCompany,prepareCompanyChange,deriveCompany} from '../../prototype/src/company/document.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';

const catalog=structuredClone(baseCatalog),checks=[];
const context={catalog,templates},roomId='independent/room-1';
const station={type:'add-workstation',id:'station',parentId:roomId,template:{id:'stream-station',version:1},transform:{position:[-4,0,-3],yaw:0}};
const basic=prepareCompanyChange(createCompany({id:'independent',width:20,depth:20},catalog),[station],context).document;
const addSofa=(version=1)=>({type:'add-facility',id:'sofa',parentId:roomId,resource:{id:'lounge-sofa',version},transform:{position:[2,0,2],yaw:0}});
const withSofa=prepareCompanyChange(basic,[addSofa()],context).document;
const authoringBasic=JSON.parse(await fs.readFile(new URL('../../prototype/src/company/examples/c1-two-stations.json',import.meta.url),'utf8'));
const authoringStudio=JSON.parse(await fs.readFile(new URL('../../prototype/src/company/examples/c1-studio.json',import.meta.url),'utf8'));
const actualSofa=authoringStudio.nodes.find(n=>n.resource?.id==='lounge-sofa');
const delayedSofa={type:'add-facility',...structuredClone(actualSofa),resource:{id:'lounge-sofa',version:2}};
const storage=()=>{const map=new Map();return{getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};};
const readAsset=async url=>new Response(await fs.readFile(new URL(`../../prototype/public${url}`,import.meta.url)));
function deferred(){let resolve;const promise=new Promise(value=>{resolve=value;});return{promise,resolve};}
const documentOnly=process.argv.includes('--document-only');
async function check(name,fn){if(documentOnly&&!name.startsWith('Unpack/group/copy'))return;try{checks.push({name,...await fn()});}catch(error){checks.push({name,status:'unexpected-error',code:error.code,error:error.stack});}}
function watchCreation(){
  const geometry=new Map(),material=new Map(),add=THREE.Object3D.prototype.add,clone=THREE.Object3D.prototype.clone;let cloning=0;
  THREE.Object3D.prototype.clone=function(...args){cloning++;try{return clone.apply(this,args);}finally{cloning--;}};
  THREE.Object3D.prototype.add=function(...objects){if(!cloning)for(const object of objects)object.traverse(node=>{if(node.geometry&&!geometry.has(node.geometry)){geometry.set(node.geometry,0);node.geometry.addEventListener('dispose',()=>geometry.set(node.geometry,geometry.get(node.geometry)+1));}for(const item of node.material?[node.material].flat():[])if(!material.has(item)){material.set(item,0);item.addEventListener('dispose',()=>material.set(item,material.get(item)+1));}});return add.apply(this,objects);};
  return{stop(){THREE.Object3D.prototype.add=add;THREE.Object3D.prototype.clone=clone;},counts(){return{geometryCreated:geometry.size,geometryDisposed:[...geometry.values()].filter(value=>value>0).length,geometryUndisposed:[...geometry.values()].filter(value=>value===0).length,materialCreated:material.size,materialDisposed:[...material.values()].filter(value=>value>0).length,materialUndisposed:[...material.values()].filter(value=>value===0).length};}};
}
async function makeScene(document=withSofa,options={}){const library=createCompanyAssetLibrary({fetchImpl:readAsset});const chosenCatalog=options.catalog||catalog;await library.preload(deriveCompany(document,chosenCatalog,templates).facilities.map(f=>f.resource));const world=new THREE.Scene(),scene=createCompanyScene(world,document,{catalog:chosenCatalog,templates,assetLibrary:library});return{world,scene,library,dispose(){scene.dispose();library.dispose();}};}

for(const [name,delayedKind,laterKind]of [
  ['Delayed load cannot roll back a later edit','load','edit'],
  ['Delayed edit cannot roll back a later load','edit','load'],
])await check(name,async()=>{
  const started=deferred(),gate=deferred();let calls=0;
  const library=createCompanyAssetLibrary({fetchImpl:async url=>{calls++;started.resolve();await gate.promise;return readAsset(url);}}),world=new THREE.Scene();
  const author=await createCompanyAuthoring(world,authoringBasic,{...context,storage:storage(),assetLibrary:library});
  try{const candidate=prepareCompanyChange(authoringBasic,[delayedSofa],context).document;
    const pending=delayedKind==='load'?author.load(candidate):author.apply([delayedSofa]);
    const rejected=assert.rejects(pending,error=>error.code==='revision-conflict');await started.promise;
    if(laterKind==='edit')await author.apply([{type:'set-state',id:'station-1/monitor',state:{on:false}}]);
    else{const next=structuredClone(author.document);next.nodes.find(n=>n.id==='station-1/monitor').state.on=false;await author.load(next);}
    const saved=JSON.stringify(author.document),root=author.scene.root;gate.resolve();await rejected;
    assert.equal(JSON.stringify(author.document),saved);assert.equal(author.scene.root,root);assert.equal(author.document.nodes.some(n=>n.resource?.id==='lounge-sofa'),false);
    assert.equal(author.scene.root.getObjectByName('station-1/monitor').getObjectByName('monitor-screen').material.emissiveIntensity,0);
    return{status:'passed',realGlbFetches:calls,worldRoots:world.children.length};
  }finally{gate.resolve();author.dispose();library.dispose();}
});
await check('Dispose during an actual delayed GLB preload prevents late scene publication',async()=>{
  const started=deferred(),gate=deferred(),library=createCompanyAssetLibrary({fetchImpl:async url=>{started.resolve();await gate.promise;return readAsset(url);}}),world=new THREE.Scene();
  const author=await createCompanyAuthoring(world,authoringBasic,{...context,storage:storage(),assetLibrary:library});
  try{const pending=author.apply([delayedSofa]),rejected=assert.rejects(pending,error=>error.code==='revision-conflict');await started.promise;author.dispose();gate.resolve();await rejected;assert.equal(world.children.length,0);return{status:'passed',worldRoots:0};}finally{gate.resolve();author.dispose();library.dispose();}
});

for(const [name,resourceId,edit,code]of [
  ['Actual room overflow rejects legal footprint metadata without publishing or leaking','desk',r=>{r.node.children[0].geometry.parameters[0]=60;},'visual-outside-room'],
  ['Actual desktop overhang rejects legal mount origin without publishing or leaking','keyboard',r=>{r.node.children[0].geometry.parameters[0]=4;},'visual-surface-overhang'],
])await check(name,async()=>{
  const altered=structuredClone(catalog),resource=structuredClone(altered.resources.find(r=>r.id===resourceId));resource.version=2;edit(resource);altered.resources.push(resource);
  const fixture=await makeScene(withSofa,{catalog:altered}),before=fixture.scene.save(),root=fixture.scene.root,contact=fixture.scene.resolveUsePoint('sofa#left');let seatDisposes=0;contact.chairSeat.geometry.addEventListener('dispose',()=>seatDisposes++);
  const watch=watchCreation();try{assert.throws(()=>fixture.scene.prepareChange([{type:'replace-resource',id:`station/${resourceId}`,resource:{id:resourceId,version:2}}],{isUsePointBusy:id=>id.startsWith('sofa#')}),error=>error.code===code);assert.equal(fixture.scene.root,root);assert.equal(fixture.scene.save(),before);assert.equal(fixture.scene.resolveUsePoint(contact.id).chairSeat,contact.chairSeat);assert.equal(seatDisposes,0);const counts=watch.counts();assert.equal(counts.geometryUndisposed,0);assert.equal(counts.materialUndisposed,0);return{status:'passed',code,resources:counts,heldSeatDisposes:seatDisposes};}finally{watch.stop();fixture.dispose();}
});

await check('Real sofa fabric overrides only its six declared meshes and preserves five frame meshes',async()=>{
  const fixture=await makeScene();try{
    const resource=catalog.resources.find(r=>r.id==='lounge-sofa'&&r.version===1),meshRoot=fixture.scene.root.getObjectByName('sofa');
    const frames=Object.fromEntries(resource.materialSlots.frame.map(name=>[name,meshRoot.getObjectByName(name).material.color.getHexString()]));
    const handle=fixture.scene.prepareChange([{type:'set-appearance',id:'sofa',appearance:{materials:{fabric:{color:'#2468ac',roughness:.23}}}}]);fixture.scene.commit(handle);
    const updated=fixture.scene.root.getObjectByName('sofa');
    for(const name of resource.materialSlots.fabric){assert.equal(updated.getObjectByName(name).material.color.getHexString(),'2468ac');assert.equal(updated.getObjectByName(name).material.roughness,.23);}
    for(const name of resource.materialSlots.frame)assert.equal(updated.getObjectByName(name).material.color.getHexString(),frames[name]);
    const left=fixture.scene.resolveUsePoint('sofa#left'),right=fixture.scene.resolveUsePoint('sofa#right');assert.notEqual(left.chair,right.chair);assert.notEqual(left.chairSeat,right.chairSeat);assert.equal(left.chair.parent,right.chair.parent);
    const screen=fixture.scene.prepareChange([{type:'set-state',id:'station/monitor',state:{on:false}}]);fixture.scene.commit(screen);
    assert.equal(fixture.scene.resolveUsePoint('sofa#left').chair,left.chair);assert.equal(fixture.scene.resolveUsePoint('sofa#right').chairSeat,right.chairSeat);
    assert.equal(fixture.scene.root.getObjectByName('sofa').getObjectByName('seat-left').material.color.getHexString(),'2468ac');
    assert.deepEqual(fixture.scene.document.nodes.find(n=>n.id==='sofa').appearance,{materials:{fabric:{color:'#2468ac',roughness:.23}}});
    return{status:'passed',fabricMeshes:resource.materialSlots.fabric.length,frameMeshes:resource.materialSlots.frame.length,independentPoints:['sofa#left','sofa#right']};
  }finally{fixture.dispose();}
});
await check('Bad actual material target rejects before publication and releases candidate resources',async()=>{
  const altered=structuredClone(catalog),bad=structuredClone(altered.resources.find(r=>r.id==='lounge-sofa'&&r.version===1));bad.version=3;bad.materialSlots.fabric=['missing-fabric-mesh'];altered.resources.push(bad);
  const fixture=await makeScene(withSofa,{catalog:altered});await fixture.library.preload([bad]);const root=fixture.scene.root,saved=fixture.scene.save(),point=fixture.scene.resolveUsePoint('sofa#left'),watch=watchCreation();
  try{assert.throws(()=>fixture.scene.prepareChange([{type:'replace-resource',id:'sofa',resource:{id:'lounge-sofa',version:3}},{type:'set-appearance',id:'sofa',appearance:{materials:{fabric:{color:'#ffffff'}}}}]),error=>error.code==='missing-material-target');assert.equal(fixture.scene.root,root);assert.equal(fixture.scene.save(),saved);assert.equal(fixture.scene.resolveUsePoint(point.id).chairSeat,point.chairSeat);const counts=watch.counts();assert.equal(counts.geometryUndisposed,0);assert.equal(counts.materialUndisposed,0);return{status:'passed',code:'missing-material-target',resources:counts};}finally{watch.stop();fixture.dispose();}
});

await check('Adding a legal child under a preserved seat facility keeps document and actual visual tree aligned',async()=>{
  const altered=structuredClone(catalog),badge=structuredClone(altered.resources.find(r=>r.id==='keyboard'));badge.id='independent-badge';delete badge.mount;delete badge.footprint;badge.mountRole='badge';altered.resources.push(badge);
  const fixture=await makeScene(withSofa,{catalog:altered});try{
    const handle=fixture.scene.prepareChange([{type:'add-facility',id:'sofa-badge',parentId:'sofa',resource:{id:'independent-badge',version:1},transform:{position:[0,1.1,0],yaw:0}}]);fixture.scene.commit(handle);
    const inDocument=fixture.scene.document.nodes.some(n=>n.id==='sofa-badge'),actual=fixture.scene.root.getObjectByName('sofa-badge');
    return{status:inDocument&&!actual?'defect-reproduced':'passed',documentHasChild:inDocument,visualHasChild:!!actual,expected:'New legal child must remain present after contact-root preservation'};
  }finally{fixture.dispose();}
});

await check('Unpack/group/copy preserve independently computed worlds and nested component parents',()=>{
  const source=structuredClone(basic);source.nodes.find(n=>n.id===roomId).transform={position:[2,0,1],yaw:Math.PI/2};source.nodes.find(n=>n.id==='station').transform={position:[-4,0,-3],yaw:Math.PI/2};
  const before=deriveCompany(source,catalog,templates),unpacked=prepareCompanyChange(source,[{type:'unpack-workstation',id:'station'}],context);
  const grouped=prepareCompanyChange(unpacked.document,[{type:'group-facilities',id:'set',parentId:roomId,memberIds:['station/desk','station/chair','station/fill-light'],transform:{position:[-1,0,-2],yaw:-Math.PI/2}}],context);
  for(const facility of before.facilities){const actual=grouped.derived.worlds.get(facility.id);facility.world.position.forEach((value,index)=>assert.ok(Math.abs(actual.position[index]-value)<1e-10));assert.ok(Math.abs(actual.yaw-facility.world.yaw)<1e-10);}
  const copy=prepareCompanyChange(grouped.document,[{type:'copy-group',id:'set',newId:'set-copy',transform:{position:[5,0,-2],yaw:-Math.PI/2}}],context);
  const newFacilities=copy.derived.facilities.filter(f=>!grouped.derived.nodes.has(f.id));assert.equal(newFacilities.length,6);assert.equal(new Set(copy.document.nodes.map(n=>n.id)).size,copy.document.nodes.length);
  for(const original of grouped.derived.facilities){const copied=newFacilities.find(f=>f.resource.id===original.resource.id);const expected=[original.world.position[0],original.world.position[1],original.world.position[2]-6];expected.forEach((value,index)=>assert.ok(Math.abs(copied.world.position[index]-value)<1e-10));assert.ok(Math.abs(copied.world.yaw-original.world.yaw)<1e-10);}
  const actualDesk=newFacilities.find(f=>f.resource.id==='desk'),newMonitor=newFacilities.find(f=>f.resource.id==='monitor');assert.equal(newMonitor.node.parentId,actualDesk.id);
  const after=prepareCompanyChange(grouped.document,[{type:'unpack-group',id:'set'}],context);for(const facility of before.facilities)assert.deepEqual(after.derived.worlds.get(facility.id),grouped.derived.worlds.get(facility.id));
  return{status:'passed',preservedFacilities:before.facilities.length,copiedFacilities:newFacilities.length,scope:'Targeted world and dependency checks, not replay of all historical document QA'};
});

const inputs=[];
for(const file of ['prototype/src/company/authoring.js','prototype/src/company/render.js','prototype/src/company/document.js','prototype/src/company/library-catalog.json','prototype/src/company/facility-catalog.json','prototype/src/company/templates.json','prototype/src/company/persistence.js','prototype/src/company/placement.js'])inputs.push({path:file,sha256:createHash('sha256').update(await fs.readFile(new URL(`../../${file}`,import.meta.url))).digest('hex')});
const report={configuration:{model:'gpt-6.1-sol',reasoning_effort:'high',reuseKnownConfiguration:true,difficulty:'complex',reason:'Independent integration audit of asynchronous scene transactions, actual material/contact references and failure preservation',actualProviderConfiguration:'not independently verified',desktopHookInterception:'not independently verified'},threeRevision:THREE.REVISION,inputs,checks,
  limits:['Real Three CPU objects and actual sofa GLB as a dependency. asset-library implementation is not the subject of this independent audit.','Busy callbacks and held contact references are fixtures. No real actor occupancy, browser, GPU, physical contact or C3 integration claim.','Program mesh enlargement and nonblocking badge are explicit synthetic negative/reference fixtures.']};
report.scope=documentOnly?'Targeted document-world supplement only':'Bounded authoring/render/document integration review';
await fs.writeFile(new URL(documentOnly?'./document-world-recheck.json':'./report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
