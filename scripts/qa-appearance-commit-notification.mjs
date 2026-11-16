// Run the actual command method and workbench listener in CPU fixtures.
// DOM selection and real actor swaps remain covered by fixed browser checks.
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
const main=await fs.readFile(path.join(root,'prototype/src/main.js'),'utf8');
const workbench=await fs.readFile(path.join(root,'prototype/src/appearance-workbench.js'),'utf8');
const notification=main.slice(main.indexOf('function notifyAppearanceStateChanged('),main.indexOf('class CharacterScene'));
const command=main.slice(main.indexOf('  command(cmd) {'),main.indexOf('  setMode(name) {'));
assert(notification && command);
const warnings=[];
const context=vm.createContext({ready:true,console:{warn:(...args)=>warnings.push(args)}});
vm.runInContext(`let controller;${notification}\nclass Subject{${command}}\nglobalThis.Subject=Subject;globalThis.primary=value=>{controller=value;};`,context);
const checks=[];
const check=async(name,test)=>{await test();checks.push(name);};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function fixture(set){
  const events=new EventEmitter(),received=[];events.on('appearance-state-changed',event=>received.push(event));
  let revision=0;
  const domain={set:cmd=>{revision++;return set(cmd);},getState:()=>({revision})};
  const actor={appearance:domain,facialGeometry:domain};
  const subject=Object.assign(new context.Subject(),{actor,isPeer:false,game:{events},cancelSequence(){}});
  context.primary(subject);
  return{subject,actor,events,received,bump:()=>{revision++;}};
}
await check('synchronous success retains object/return semantics and notifies primary actor',()=>{
  const result={applied:true},f=fixture(()=>result);
  assert.equal(f.subject.command({type:'appearance'}),result);
  assert.equal(f.received.length,1);assert.equal(f.received[0].actor,f.actor);
});
await check('async appearance and geometry success notify only after completion',async()=>{
  for(const type of ['appearance','faceGeometry']){
    const pending=deferred(),f=fixture(()=>pending.promise),result={applied:true};
    const operation=f.subject.command({type});assert.equal(f.received.length,0);
    pending.resolve(result);assert.equal(await operation,result);assert.equal(f.received.length,1);
  }
});
await check('failed/cancelled/rejected results preserve outcome and emit nothing',async()=>{
  for(const result of [{applied:false,reason:'failure'},{applied:false,cancelled:true},{applied:true,cancelled:true}]){
    const f=fixture(()=>Promise.resolve(result));assert.equal(await f.subject.command({type:'appearance'}),result);
    assert.equal(f.received.length,0);
  }
  const error=Error('resource failure'),f=fixture(()=>Promise.reject(error));
  await assert.rejects(f.subject.command({type:'appearance'}),value=>value===error);assert.equal(f.received.length,0);
});
await check('superseded revision, replaced actor/controller and peer do not notify primary',async()=>{
  for(const supersede of [f=>f.bump(),f=>{f.subject.actor={};},()=>context.primary({actor:{}})]){
    const pending=deferred(),f=fixture(()=>pending.promise),operation=f.subject.command({type:'appearance'});
    supersede(f);pending.resolve({applied:true});await operation;assert.equal(f.received.length,0);
  }
  const pending=deferred(),f=fixture(()=>pending.promise);f.subject.isPeer=true;
  assert.equal(f.subject.command({type:'appearance'}),pending.promise);
  pending.resolve({applied:true});await pending.promise;assert.equal(f.received.length,0);
});
await check('observer exceptions cannot turn committed commands into failure',async()=>{
  const result={applied:true},f=fixture(()=>Promise.resolve(result));
  f.events.on('appearance-state-changed',()=>{throw Error('UI unavailable');});
  assert.equal(await f.subject.command({type:'appearance'}),result);assert.equal(warnings.length,1);
});
const listenerCode=workbench.slice(workbench.indexOf('  const appearanceChanged ='),workbench.indexOf('  async function apply(patch)'));
assert(listenerCode.includes("events.off('appearance-state-changed'"));
await check('actual workbench listener reads current actor, ignores stale identity and removes on disposal',()=>{
  const events=new EventEmitter(),actor={},other={},seen=[],messages=[],listeners=[];
  const c=vm.createContext({controller:{game:{events}},disposed:false,actor:()=>actor,
    sync:()=>seen.push(actor),message:(...args)=>messages.push(args),listeners});
  vm.runInContext(listenerCode,c);
  events.emit('appearance-state-changed',{actor:other});assert.equal(seen.length,0);
  events.emit('appearance-state-changed',{actor});assert.equal(seen.length,1);
  c.sync=()=>{throw Error('unlisted current body');};
  assert.doesNotThrow(()=>events.emit('appearance-state-changed',{actor}));
  assert.equal(messages.length,1);assert.match(messages[0][0],/人物已更新.*unlisted/);assert.equal(messages[0][1],true);
  c.disposed=true;events.emit('appearance-state-changed',{actor});assert.equal(messages.length,1);
  listeners.forEach(remove=>remove());assert.equal(events.listenerCount('appearance-state-changed'),0);
});
await check('actual sync clears obsolete body/group selection for an unlisted actor',()=>{
  const syncCode=workbench.slice(workbench.indexOf('  function sync() {'),workbench.indexOf('  const appearanceChanged ='));
  let cleared=false;const pressed=[];
  const c=vm.createContext({state:()=>({}),actor:()=>({profile:{bodyType:'unlisted'}}),groupFor:()=>undefined,
    body:{replaceChildren:()=>{cleared=true;}},groupButtons:[{setAttribute:(name,value)=>pressed.push([name,value])}]});
  vm.runInContext(syncCode,c);assert.throws(()=>vm.runInContext('sync()',c),/已有样件/);
  assert.equal(cleared,true);assert.deepEqual(pressed,[['aria-pressed','false']]);
});
assert(main.includes("finish('状态界面更新失败', () => refreshUI());\n    notifyAppearanceStateChanged(avatar);")||
       main.includes("finish('状态界面更新失败', () => refreshUI());\r\n    notifyAppearanceStateChanged(avatar);"));
assert(main.includes('if (committed) {\n      notifyAppearanceStateChanged(avatar);')||
       main.includes('if (committed) {\r\n      notifyAppearanceStateChanged(avatar);'));
console.log(JSON.stringify({passed:true,checks,sourceSHA256:{main:crypto.createHash('sha256').update(main).digest('hex'),
  workbench:crypto.createHash('sha256').update(workbench).digest('hex')},
  scope:'Actual extracted command/listener/sync code with CPU actor/event fixtures. Body-swap commit placement inspected. Real DOM, assets and browser behavior require fixed browser QA.',
  GPUUsed:false,browserStarted:false},null,2));
