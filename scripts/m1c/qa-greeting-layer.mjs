// Actual pinned GLB parser/retarget + independent instances. No browser and no
// claim about target clothing, fingers or visual quality.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {createGreetingLayer,retargetGreeting} from '../../prototype/src/greeting-layer.js';
import {createBehaviorTasks} from '../../prototype/src/behavior-tasks.js';

globalThis.ProgressEvent ??= class {constructor(type,values){this.type=type;Object.assign(this,values);}};
const bytes=await fs.readFile(new URL('../../prototype/public/assets/motion/m1c/greeting/greeting-wave-left-v1.glb',import.meta.url));
const names=['leftUpperArm','leftLowerArm','leftHand',...['Index','Middle','Ring','Little'].flatMap(f=>['Proximal','Intermediate','Distal'].map(s=>'left'+f+s)),...['Metacarpal','Proximal','Distal'].map(s=>'leftThumb'+s),'rightHand','hips'];
const checks=[];
function fixture(options={}){
  const nodes=new Map(names.map(n=>[n,new THREE.Bone()]));
  const vrm={meta:{metaVersion:'1'},humanoid:{getNormalizedBoneNode:name=>nodes.get(name)}};
  const fetchResource=async()=>new Response(bytes,{status:200});
  const layer=createGreetingLayer({vrm,fetchResource,...options});
  const tick=dt=>{for(const n of nodes.values())n.quaternion.identity();layer.update(dt);};
  return {nodes,layer,tick};
}
const a=fixture(),b=fixture();
assert.equal((await a.layer.start({requestId:'a'})).started,true);
assert.equal(a.layer.getState().sha256,'eec4ef8ab2fb073f7674cc6e839cbad7aea6931e4b19e8e70c0ee46c5fda2d06');
for(let i=0;i<120;i++)a.tick(1/120);
assert(a.nodes.get('leftHand').quaternion.angleTo(new THREE.Quaternion())>.05);
assert.equal(a.nodes.get('rightHand').quaternion.angleTo(new THREE.Quaternion()),0);
assert.equal(a.nodes.get('hips').quaternion.angleTo(new THREE.Quaternion()),0);
assert.equal(b.layer.getState().status,'idle');
checks.push('Actual source GLB hash, 18-bone retarget, excluded right hand/hips, instance isolation');
const time=a.layer.getState().time,q=a.nodes.get('leftHand').quaternion.clone();
for(let i=0;i<20;i++)a.tick(0);
assert.equal(a.layer.getState().time,time);assert(q.angleTo(a.nodes.get('leftHand').quaternion)<1e-7);
assert.equal((await a.layer.start({requestId:'duplicate'})).duplicate,true);assert.equal(a.layer.getState().requestId,'a');
checks.push('Pause dt0 stable; duplicate request does not restart or replace identity');
a.layer.cancel();a.tick(.1);assert.equal(a.layer.getState().status,'fading');assert(Math.abs(a.layer.getState().weight-.5)<1e-8);
a.tick(.1);assert.equal(a.layer.getState().status,'cancelled');assert.equal(a.layer.getState().weight,0);
checks.push('Cancellation fades over .2 simulation seconds');
await b.layer.start({requestId:'b'});
const tasks=createBehaviorTasks();tasks.request({requestId:'b',kind:'greeting'});
let completed=0;
for(let i=0;i<350;i++){b.tick(1/120);tasks.tick(1/120);if(b.layer.getState().status==='completed'&&tasks.complete('b'))completed++;}
assert.equal(completed,1);assert.equal(tasks.get('b').state,'completed');
checks.push('Full 2.8s clip reaches completed, behavior terminal emitted once');
for(const [label,fetchResource] of [['http',async()=>new Response('',{status:503})],['hash',async()=>new Response(new Uint8Array(bytes.length))]]){
  const f=fixture({fetchResource});assert.equal((await f.layer.start()).started,false);assert.equal(f.layer.getState().status,'failed');assert.match(f.layer.getState().error,label==='http'?/http:503/:/integrity/);f.layer.dispose();
}
checks.push('HTTP and hash errors produce failed state, no silent fallback');
let resolveFetch;
const delayed=fixture({fetchResource:()=>new Promise(resolve=>{resolveFetch=resolve;})});
const pending=delayed.layer.start({requestId:'old'});delayed.layer.cancel();resolveFetch(new Response(bytes));
assert.equal((await pending).cancelled,true);assert.equal(delayed.layer.getState().status,'cancelled');
checks.push('Cancelled fetch cannot revive an old request');
let releaseParse,disposedGeometries=0;
const late=fixture({parse:async data=>{const parsed=await new GLTFLoader().parseAsync(data,'');parsed.scene.traverse(o=>{if(o.isMesh)o.geometry.addEventListener('dispose',()=>disposedGeometries++);});await new Promise(resolve=>{releaseParse=resolve;});return parsed;}});
const parsing=late.layer.start();while(!releaseParse)await new Promise(resolve=>setTimeout(resolve,1));late.layer.dispose();releaseParse();
assert.equal((await parsing).cancelled,true);assert(disposedGeometries>0);
checks.push('Disposed during parse: late source mesh resources disposed and cannot install');
const anchored=fixture();await anchored.layer.start({requestId:'seated-reference'});
const baseQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(.8,-.4,.65));
const setBase=q=>{for(const [name,bone]of anchored.nodes)if(name.startsWith('left'))bone.quaternion.copy(q);};
setBase(baseQ);anchored.layer.update(.05);
assert(anchored.nodes.get('leftHand').quaternion.angleTo(baseQ)<.01,'Start must not pull a non-standing hand toward source Idle');
const source=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const targets=new Map([...anchored.nodes].map(([name,bone])=>[name,{bone,rest:new THREE.Quaternion()}]));
const original=retargetGreeting(source,targets);
setBase(baseQ);anchored.layer.update(1.05);
for(const track of original.tracks)assert(anchored.nodes.get(track.semantic).quaternion.clone().normalize().angleTo(new THREE.Quaternion().fromArray(track.sample.evaluate(1.1)).normalize())<1e-6,'High wave keys remain unchanged');
// Change the underlying seated pose after admission: endpoint must follow the
// current authored frame, not a cached request-time endpoint or standing Idle.
const changedBase=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.55,.8,.45));
setBase(changedBase);anchored.layer.update(1.65);
assert(anchored.nodes.get('leftHand').quaternion.angleTo(changedBase)<.003,'End must return to current authored pose');
setBase(changedBase);anchored.layer.update(.05);
assert(anchored.nodes.get('leftHand').quaternion.angleTo(changedBase)<1e-7);assert.equal(anchored.layer.getState().status,'completed');
anchored.layer.dispose();source.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
checks.push('Non-standing start/end stay at current authored reference; middle 18 source rotations unchanged');
a.layer.dispose();b.layer.dispose();delayed.layer.dispose();
console.log(JSON.stringify({passed:true,checks,scope:'Node source/lifecycle tests; room and target F/M visuals untested'},null,2));
