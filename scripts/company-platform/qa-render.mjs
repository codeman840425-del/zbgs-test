import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import document from '../../prototype/src/company/examples/c1-two-stations.json' with {type:'json'};
import catalog from '../../prototype/src/company/facility-catalog.json' with {type:'json'};
import {createCompanyScene} from '../../prototype/src/company/render.js';

const checks=[],world=new THREE.Scene(),scene=createCompanyScene(world,document);
function check(name,fn){fn();checks.push({name,passed:true});}
const point=scene.resolveUsePoint('station-1/chair#seat'),other=scene.resolveUsePoint('station-2/chair#seat');
check('Two independent actual contact meshes resolve by stable use-point identity',()=>{
 assert(point.chairSeat.isMesh&&other.chairSeat.isMesh);assert.notEqual(point.chairSeat,other.chairSeat);
 assert.deepEqual(point.chair.getWorldPosition(new THREE.Vector3()).toArray(),[-1.5,0,.55]);
 assert.equal(scene.navigation().obstacles.length,6);assert.equal(scene.listUsePoints().length,2);
});
check('Desk transform prepares off-scene then commits all attached real meshes',()=>{
 const previous=scene.save(),before=scene.root.getObjectByName('station-1/monitor').getWorldPosition(new THREE.Vector3());
 const pending=scene.prepareChange([{type:'move',id:'station-1/desk',transform:{position:[0,0,-1.1],yaw:0}}]);
 assert.equal(scene.save(),previous);assert.equal(world.children.length,1);
 scene.commit(pending);const after=scene.root.getObjectByName('station-1/monitor').getWorldPosition(new THREE.Vector3());
 assert(Math.abs(after.z-before.z+.2)<1e-8);assert.equal(scene.resolveUsePoint(point.id).chair,point.chair);
 assert.equal(scene.resolveUsePoint(other.id).chair,other.chair);
});
check('Screen material and real spot-light intensity change with only one instance state',()=>{
 const pending=scene.prepareChange([{type:'set-state',id:'station-1/monitor',state:{on:false}},{type:'set-state',id:'station-1/fill-light',state:{on:false}}]);
 scene.commit(pending);
 assert.equal(scene.root.getObjectByName('station-1/monitor').getObjectByName('monitor-screen').material.emissiveIntensity,0);
 assert.equal(scene.root.getObjectByName('station-2/monitor').getObjectByName('monitor-screen').material.emissiveIntensity,.35);
 const lights=scene.snapshot().lights;assert.equal(lights.find(l=>l.id==='station-1/fill-light').intensity,0);assert.equal(lights.find(l=>l.id==='station-2/fill-light').intensity,5);
 assert.equal(scene.resolveUsePoint(point.id).chairSeat,point.chairSeat);
});
check('Commit rechecks a lease acquired after preparation and retains current scene',()=>{
 const previous=scene.save(),root=scene.root,pending=scene.prepareChange([{type:'move',id:'station-1',transform:{position:[-1.5,0,.3],yaw:0}}]);
 assert.throws(()=>scene.commit(pending,{isUsePointBusy:()=>true}),e=>e.code==='facility-busy');
 assert.equal(scene.save(),previous);assert.equal(scene.root,root);scene.discard(pending);
});
check('Stale prepared candidate cannot roll back a later screen edit',()=>{
 const stale=scene.prepareChange([{type:'set-state',id:'station-1/monitor',state:{on:true}}]);
 const fresh=scene.prepareChange([{type:'set-state',id:'station-2/monitor',state:{on:false}}]);scene.commit(fresh);
 assert.throws(()=>scene.commit(stale),e=>e.code==='revision-conflict');scene.discard(stale);
});
check('Restore is whole-document and cannot silently replace occupied furniture',()=>{
 const text=scene.save();assert.throws(()=>scene.restore(JSON.stringify(document),{isUsePointBusy:()=>true}),e=>e.code==='facility-busy');assert.equal(scene.save(),text);
 scene.restore(JSON.stringify(document));assert.deepEqual(scene.document,document);assert.equal(scene.snapshot().lights.every(l=>l.intensity===5),true);
});
check('Failed resource construction preserves the live scene before any publication',()=>{
 const withBad=structuredClone(catalog),bad=structuredClone(withBad.resources.find(r=>r.id==='desk'));bad.version=2;bad.node.children[0].geometry.type='UnknownGeometry';withBad.resources.push(bad);
 const testWorld=new THREE.Scene(),testScene=createCompanyScene(testWorld,document,{catalog:withBad}),saved=testScene.save(),root=testScene.root;
 assert.throws(()=>testScene.prepareChange([{type:'replace-resource',id:'station-1/desk',resource:{id:'desk',version:2}}]),e=>e.code==='unsupported-geometry');
 assert.equal(testScene.save(),saved);assert.equal(testScene.root,root);testScene.dispose();assert.equal(testWorld.children.length,0);
});
check('Prepared preview document is isolated from the actual staged commit',()=>{
 const pending=scene.prepareChange([{type:'set-state',id:'station-1/monitor',state:{on:false}}]);pending.document.nodes.length=0;scene.commit(pending);assert.equal(scene.listUsePoints().length,2);
});
check('Scene disposal removes its resources and rejects further edits',()=>{
 scene.dispose();assert.equal(world.children.length,0);assert.throws(()=>scene.prepareChange([]),e=>e.code==='scene-disposed');
});
const out=new URL('../../evidence/company-c1-render-v1/',import.meta.url);await fs.mkdir(out,{recursive:true});
await fs.writeFile(new URL('report.json',out),JSON.stringify({status:'passed',checks,limits:['Actual Three meshes/materials/lights under CPU only. No WebGL image, character usage, navigation or browser close/reopen proof yet.']},null,2)+'\n');
console.log(`${checks.length} actual-Three provider checks passed`);
