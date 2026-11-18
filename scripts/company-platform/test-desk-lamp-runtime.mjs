import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';

import {decodeCompanySave,encodeCompanySave} from '../../prototype/src/company/persistence.js';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';

const root = new URL('../../prototype/',import.meta.url);
const read = async file => JSON.parse(await fs.readFile(new URL(file,root),'utf8'));
const catalog = await read('src/company/library-catalog.json');
const templates = await read('src/company/templates-extended.json');
const lamps = catalog.resources.filter(r=>r.mountRole==='desk-lamp');
assert(lamps.length,'Publish at least one real desk-lamp resource before running this test');
const ref = r => ({id:r.id,version:r.version});
const near = (a,b,epsilon=1e-6) => assert(Math.abs(a-b)<epsilon,`${a} differs from ${b}`);
const vnear = (a,b) => near(a.distanceTo(b),0);
const state = (id,values) => ({type:'set-state',id,state:values});
const facility = (id,parentId,resource,position,yaw=0) => ({id,parentId,kind:'facility',resource,transform:{position,yaw},state:{}});
installNodeImageDecodeShim();
const bytesOverride = new Map();
const library = createCompanyAssetLibrary({fetchImpl:async url=>{
  const bytes=bytesOverride.get(url)??await fs.readFile(new URL('public'+url,root));
  return {ok:true,arrayBuffer:async ()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
}});

const example=await read('src/company/examples/c1-studio.json');
const original=structuredClone(example);
const doc={...example,nodes:example.nodes.filter(n=>['floor','room'].includes(n.kind))};
const room=doc.nodes.find(n=>n.kind==='room').id;
const desk={id:'desk',version:1};
doc.nodes.push(facility('desk-a',room,desk,[-2,0,0]),facility('desk-b',room,desk,[2,0,-.5],Math.PI/2));
doc.nodes.push(facility('a-lamp','desk-a',ref(lamps[0]),[-.3,.84,0]),facility('b-lamp','desk-b',ref(lamps[0]),[.2,.84,0]));
doc.nodes.push(facility('z-fill',room,{id:'fill-light',version:1},[0,0,2]));
const world=new THREE.Group();
const savedItems=new Map();
const storage={getItem:key=>savedItems.get(key)??null,setItem:(key,value)=>savedItems.set(key,value)};
const session=await createCompanyAuthoring(world,doc,{catalog,templates,assetLibrary:library,storage});
const reports=[];
function inspect(id,resource,state) {
  session.scene.root.updateWorldMatrix(true,true);
  const root=session.scene.root.getObjectByName(id),head=root.getObjectByName(resource.light.aim.pivot);
  const face=root.getObjectByName(resource.light.aim.emitter);
  const spot=root.children.find(n=>n.isSpotLight);
  assert(head.getObjectById(face.id)); assert(spot);
  const normal=face.getWorldDirection(new THREE.Vector3());
  const source=face.getWorldPosition(new THREE.Vector3()).addScaledVector(normal,.003);
  const actualSource=spot.getWorldPosition(new THREE.Vector3()),actualTarget=spot.target.getWorldPosition(new THREE.Vector3());
  vnear(actualSource,source);vnear(actualTarget.clone().sub(actualSource),normal);
  for (const material of [face.material].flat())
    near(material.emissiveIntensity,state.on?1.5*state.intensity/10:0);
  const supportY=root.getWorldPosition(new THREE.Vector3()).y;
  const hit=source.clone().addScaledVector(normal,(supportY-source.y)/normal.y);
  const localHit=root.parent.worldToLocal(hit.clone());
  near(localHit.y,.84);
  // Both chosen placements leave room in front of the lamp for every tested pitch.
  assert(Math.abs(localHit.x)<=1 && Math.abs(localHit.z)<=.5,'Beam misses the physical desktop at this placement');
  return {source,normal,spot,pitch:Math.asin(-normal.y),localHit,head};
}
try {
  // Existing workstation templates still use the legacy (fixed target) fill light and old saves.
  const previousCatalog={...catalog,resources:catalog.resources.filter(r=>r.mountRole!=='desk-lamp')};
  const oldSave=await encodeCompanySave(original,previousCatalog,templates);
  assert.deepEqual(await decodeCompanySave(oldSave,catalog,templates),original);
  const settings=lamps[0].stateDefaults;
  const old=inspect('a-lamp',lamps[0],settings);
  const second=inspect('b-lamp',lamps[0],settings);
  assert(old.normal.distanceTo(second.normal)>.15,'The lamps must follow differently rotated host desks');
  near(old.spot.intensity,4); near(second.spot.intensity,4);
  const fill=()=>session.scene.root.getObjectByName('z-fill').children.find(n=>n.isSpotLight);
  near(fill().intensity,0); assert.equal(fill().visible,false);
  const shaderLights=()=>{const result=[];session.scene.root.traverseVisible(n=>{if(n.isSpotLight)result.push(n);});return result;};
  assert.equal(shaderLights().length,2);
  await session.apply([state('a-lamp',{intensity:0})]);
  const unlit=inspect('a-lamp',lamps[0],{...settings,intensity:0});
  near(unlit.spot.intensity,0); assert.equal(unlit.spot.visible,false);
  assert(fill().visible); assert.equal(shaderLights().length,2);
  for(const resource of lamps){
    const compatible=compareFacilityFunction(lamps[0],resource); assert(compatible.compatible,JSON.stringify(compatible.differences));
    await session.apply([{type:'replace-resource',id:'a-lamp',resource:ref(resource)},state('a-lamp',{...settings})]);
    const center=inspect('a-lamp',resource,settings);
    const results=[];
    for(const angle of [-.35,.35]){
      const edit={on:true,intensity:8,angle};await session.apply([state('a-lamp',edit)]);
      const sample=inspect('a-lamp',resource,edit);
      near(sample.spot.intensity,8); near(sample.pitch-center.pitch,angle);
      const unchanged=inspect('b-lamp',lamps[0],settings); vnear(unchanged.normal,second.normal);
      results.push({angle,intensity:sample.spot.intensity,deskHit:sample.localHit.toArray()});
    }
    reports.push({resource:ref(resource),samples:results});
  }
  const edited={on:true,intensity:8,angle:.35}, last=lamps.at(-1);
  const beforeMove=inspect('a-lamp',last,edited);
  const initialLocal=session.document.nodes.find(n=>n.id==='a-lamp').transform;
  await session.apply([{type:'move',id:'desk-a',transform:{position:[-1.5,0,.35],yaw:Math.PI/2}}]);
  const afterMove=inspect('a-lamp',last,edited);
  assert(beforeMove.source.distanceTo(afterMove.source)>.15);
  vnear(afterMove.normal,beforeMove.normal.clone().applyAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2));
  vnear(afterMove.localHit,beforeMove.localHit);
  assert.deepEqual(session.document.nodes.find(n=>n.id==='a-lamp').transform,initialLocal);
  await session.apply([{type:'replace-resource',id:'a-lamp',resource:ref(lamps[0])}]);
  const retained=session.document.nodes.find(n=>n.id==='a-lamp');
  assert.deepEqual(retained.state,edited); assert.deepEqual(retained.transform,initialLocal); assert.equal(retained.parentId,'desk-a');
  inspect('a-lamp',lamps[0],edited);
  await session.apply([state('a-lamp',{on:false})]);
  near(inspect('a-lamp',lamps[0],{on:false,intensity:8,angle:.35}).spot.intensity,0);
  assert(fill().intensity>0 && fill().visible,'Disabling the lamp must free its shared real-light slot');
  assert.equal(shaderLights().length,2);
  const before=session.document, saved=await session.export();
  assert.deepEqual(await decodeCompanySave(saved,catalog,templates),before);
  await session.save();
  await session.apply([state('a-lamp',{on:true,angle:-.35,intensity:2})]);
  await session.restore(before.id);
  assert.deepEqual(session.document,before);
  near(inspect('a-lamp',lamps[0],{on:false,intensity:8,angle:.35}).spot.intensity,0);
  for(const patch of [{angle:.36},{angle:-.36},{intensity:11},{on:1},{angle:NaN}]){
    await assert.rejects(session.apply([state('a-lamp',patch)]),{code:'invalid-device-state'});
    assert.deepEqual(session.document,before);
  }
  // The mount origin fits but the installation footprint hangs past the edge of the rotated desk.
  await assert.rejects(session.apply([{type:'move',id:'b-lamp',transform:{position:[.95,.84,0],yaw:Math.PI/2}}]),{code:'invalid-desk-lamp-fit'});
  assert.deepEqual(await session.export(),saved);
  const first=lamps[0], sourceBytes=await fs.readFile(new URL('public'+first.asset.url,root));
  const broken=Buffer.from(sourceBytes);
  // Change just the physical node's same-length name and pin the resulting new bytes.
  const originalName=Buffer.from(first.light.aim.emitter);
  const index=broken.indexOf(originalName);
  assert(index>=20);
  for(let offset=broken.indexOf(originalName); offset!==-1; offset=broken.indexOf(originalName,offset+originalName.length))
    broken[offset+originalName.length-1]=0x58;
  const invalid=structuredClone(first);
  invalid.id='broken-desk-lamp-test';
  invalid.asset.url='/company-assets/desk-lamp-test-broken/model.glb';
  invalid.asset.sha256=createHash('sha256').update(broken).digest('hex');
  bytesOverride.set(invalid.asset.url,broken);
  await assert.rejects(library.preload([invalid]),{code:'invalid-desk-lamp-node'});
  const badOptics=structuredClone(first);
  badOptics.light.position[1]+=.04;
  await assert.rejects(library.preload([badOptics]),{code:'invalid-desk-lamp-calibration'});
  const changedAngle=structuredClone(first);changedAngle.light.angle=.7;
  assert.equal(compareFacilityFunction(first,changedAngle).compatible,false);
  assert.deepEqual(await session.export(),saved);
  console.log(JSON.stringify({status:'passed',assets:reports,hosts:['desk-a','desk-b'],legacyFillReactivated:fill().intensity,
    checks:['actual mesh and spot coincide','mounted desk rotation', 'pitch and dimmer on real geometry','shared two-light limit',
      'moving and rotating the host preserves its local beam hit','appearance replacement retains edited pitch and intensity','explicit save and restore recovers state','invalid state and desk overhang preserve room','missing diffuser and false calibration rejected']},null,2));
} finally {session.dispose();library.dispose();}
