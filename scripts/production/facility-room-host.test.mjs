import assert from 'node:assert/strict';
import {createRequire,registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {Scene,Group} from '../../prototype/node_modules/three/build/three.module.js';
import {captureFacilityState,restoreFacilityState} from '../../prototype/src/record-facility-room.js';

// The room has already been mounted for these controls. Stub only the external
// company-module imports; the scene, child events and restore transaction are real.
const projectRequire=createRequire(new URL('../../prototype/package.json',import.meta.url));
const hooks=registerHooks({resolve(specifier,context,next) {
  if(specifier.startsWith('released-company/'))return {shortCircuit:true,
    url:'data:text/javascript,export const createCompanyAuthoring=undefined,createCompanyAssetLibrary=undefined,decodeCompanySave=undefined'};
  if(specifier==='three')return {shortCircuit:true,url:new URL('../../prototype/node_modules/three/build/three.module.js',import.meta.url).href};
  if(specifier.startsWith('three/addons/'))return {shortCircuit:true,url:pathToFileURL(projectRequire.resolve(specifier)).href};
  return next(specifier,context);
}});
let bindFacilityActorControls;
try {({bindFacilityActorControls}=await import('./facility-room-host.mjs'));} finally {hooks.deregister();}

function setup(t,pointKinds) {
  const scene=new Scene(),actors=new Map(),messages=[],stored=new Map(),calls=[];
  const controls=Object.fromEntries(['actor','seat','sit','stand','save','restore'].map(id=>[id,{disabled:false}]));
  const select=Object.assign(controls.actor,{value:'',options:[],writes:0,
    replaceChildren(...options){this.options=options;this.value=options[0]?.value??'';this.writes++;}});
  controls.seat.value='chair';
  const room={session:{scene:{document:{id:'company'}}},floorId:'floor',roomId:'room'};
  const pose={phase:'idle',position:[0,0,0]};
  const make=id=>{
    const root=new Group();
    return {identity:{id,name:'name-'+id},recordSha256:'sha-'+id,revision:1,root,
      attach(){scene.add(root);},dispose(){root.removeFromParent();},controller:{
        captureFacilityPose:()=>pose,restoreFacilityPose:async()=>{},
        requestBehavior(request){calls.push([id,request.kind]);return {task:{kind:request.kind,state:'running'}};},
        behaviorTasks:{get(){return null;}},
      }};
  };
  const consumer={scene,actors,captureFacilityState:()=>captureFacilityState(room,actors),
    restoreFacilityState:saved=>restoreFacilityState(room,actors,saved,{isCurrent:()=>true,prepare:async old=>make(old.identity.id)})};
  const attach=id=>{const actor=make(id);actor.attach();actors.set(id,actor);return actor;};
  const remove=id=>{const actor=actors.get(id);if(!actor)return false;actors.delete(id);actor.dispose();return true;};
  const globals={document:{getElementById:id=>controls[id.replace('facility-','')]},
    Option:class {constructor(text,value){Object.assign(this,{text,value});}},
    localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)}};
  for(const [key,value] of Object.entries(globals)){
    const old=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>{if(old)Object.defineProperty(globalThis,key,old);else delete globalThis[key];});
  }
  const release=bindFacilityActorControls(consumer,controls.seat,'saved',text=>messages.push(text),pointKinds);
  t.after(release);
  return {scene,actors,controls,select,stored,messages,calls,attach,remove,make,release,
    ids:()=>select.options.map(option=>option.value)};
}

test('a rejected second click keeps the original accepted task visible through completion',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=setup(t,new Map([['mic','standing-vocal']])),actor=f.attach('a');
  await Promise.resolve();
  f.controls.seat.value='mic';
  let original;
  actor.controller.requestBehavior=({kind,requestId})=>{
    if(original)return {task:{kind,requestId,admission:'rejected',reason:'seat-unavailable'}};
    original={kind,requestId,admission:'accepted',state:'running'};
    return {task:original};
  };
  actor.controller.behaviorTasks.get=id=>id===original.requestId?original:null;
  f.controls.sit.onclick();f.controls.sit.onclick();
  assert.match(f.messages.at(-1),/被拒绝/);
  original.state='completed';
  t.mock.timers.tick(301);
  assert.match(f.messages.at(-1),/站唱.*完成/);
});

test('the same use button sends the selected facility behavior and disables stale targets',async t=>{
  const f=setup(t,new Map([['chair','sit'],['mic','standing-vocal']]));
  f.attach('a');
  await Promise.resolve();
  f.controls.seat.value='mic';
  f.controls.seat.onchange();
  assert.match(f.controls.sit.textContent,/站唱/);
  f.controls.sit.onclick();
  assert.deepEqual(f.calls.at(-1),['a','standing-vocal']);
  f.controls.seat.value='chair';
  f.controls.seat.onchange();
  f.controls.sit.onclick();
  assert.deepEqual(f.calls.at(-1),['a','sit']);
  f.controls.seat.value='removed';
  f.controls.sit.onclick();
  assert.equal(f.calls.length,2);
  assert.match(f.messages.at(-1),/选择/);
  f.controls.stand.onclick();
  assert.deepEqual(f.calls.at(-1),['a','stand']);
});

test('direct Three children invalidate after the atomic map update; selection follows surviving actors',async t=>{
  const f=setup(t),{select,controls}=f;
  assert.ok(Object.values(controls).every(control=>control.disabled));
  f.attach('a');f.attach('b');
  assert.deepEqual(f.ids(),[]);
  await Promise.resolve();
  assert.deepEqual(f.ids(),['a','b']);assert.equal(select.writes,1);
  assert.equal(select.value,'a');assert.equal(select.options[1].text,'name-b');
  assert.ok(Object.values(controls).every(control=>!control.disabled));
  select.value='b';
  f.remove('a');assert.equal(f.remove('a'),false);
  await Promise.resolve();assert.equal(select.value,'b');assert.deepEqual(f.ids(),['b']);
  f.attach('a');await Promise.resolve();assert.equal(select.value,'b');
  controls.sit.onclick();assert.deepEqual(f.calls,[['b','sit']]);
  f.remove('b');controls.stand.onclick();
  assert.deepEqual(f.calls,[['b','sit']]);assert.equal(select.value,'a');
  controls.stand.onclick();assert.deepEqual(f.calls.at(-1),['a','stand']);
  controls.save.onclick();const saved=f.stored.get('saved');
  f.remove('a');controls.save.onclick();await controls.restore.onclick();
  assert.equal(f.stored.get('saved'),saved);
  await Promise.resolve();assert.deepEqual(f.ids(),[]);
  assert.ok(Object.values(controls).every(control=>control.disabled));
  f.scene.add(new Group());await Promise.resolve();assert.deepEqual(f.ids(),[]);
  f.attach('late');f.release();await Promise.resolve();assert.deepEqual(f.ids(),[]);
});

test('staged or cancelled instances stay out; restore failure preserves selection and success rebinds both roots',async t=>{
  const f=setup(t),a=f.attach('a'),b=f.attach('b');await Promise.resolve();
  f.select.value='b';f.controls.save.onclick();
  const saved=f.stored.get('saved'),invalid=JSON.parse(saved);
  invalid.actors[1].revision++;
  f.stored.set('saved',JSON.stringify(invalid));
  await f.controls.restore.onclick();assert.match(f.messages.at(-1),/version-mismatch/);
  assert.equal(f.actors.get('a'),a);assert.equal(f.actors.get('b'),b);
  assert.deepEqual(f.scene.children,[a.root,b.root]);assert.equal(f.select.value,'b');
  f.stored.set('saved',saved);
  await f.controls.restore.onclick();
  assert.equal(f.messages.at(-1),'角色状态已恢复');assert.equal(f.select.value,'b');
  assert.deepEqual(f.ids(),['a','b']);assert.equal(f.select.writes,1);
  assert.notEqual(f.actors.get('a'),a);assert.notEqual(f.actors.get('b'),b);
  assert.deepEqual(f.scene.children,[...f.actors.values()].map(actor=>actor.root));
  for(const actor of f.actors.values())actor.dispose();
  f.actors.clear();await Promise.resolve();
  const staged=f.make('staged');staged.dispose();await Promise.resolve();
  assert.deepEqual(f.ids(),[]);assert.equal(f.controls.sit.disabled,true);
  f.attach('b');await Promise.resolve();assert.equal(f.select.value,'b');
  f.attach('a');await Promise.resolve();assert.deepEqual(f.ids(),['b','a']);
});
