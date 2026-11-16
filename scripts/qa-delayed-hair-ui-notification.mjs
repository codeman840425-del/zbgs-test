// Reproduce with production appearance/GLTF parsing and the actual main command
// method. PNG texture decoding is skipped. UI notification is a CPU observer.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {GLTFLoader} from '../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {createCharacterAppearance} from '../prototype/src/character-appearance.js';
import {foundationProfile} from '../prototype/src/foundation-profiles.js';
import {HAIRSTYLES} from '../prototype/src/hairstyle-catalog.js';

const root=path.resolve(import.meta.dirname,'..');
const out=path.resolve(process.argv[2]||path.join(root,'evidence/m2-delayed-hair-ui-review-v2'));
const expectStale=process.argv.includes('--expect-stale');
await fs.mkdir(out,{recursive:true});
const main=await fs.readFile(path.join(root,'prototype/src/main.js'),'utf8');
const appearanceBytes=await fs.readFile(path.join(root,'prototype/src/character-appearance.js'));
const notification=main.slice(main.indexOf('function notifyAppearanceStateChanged('),main.indexOf('class CharacterScene'));
const command=main.slice(main.indexOf('  command(cmd) {'),main.indexOf('  setMode(name) {'));
assert(notification && command);
const context=vm.createContext({ready:true,console});
vm.runInContext(`let controller;${notification}\nclass Subject{${command}}\nglobalThis.Subject=Subject;globalThis.primary=value=>{controller=value;};`,context);
const cfg=foundationProfile('male'),entry=HAIRSTYLES.find(e=>e.id==='male-sidepart-v1'&&e.compatibleBodies.includes(cfg.sha256));
assert(entry);
const publicRoot=path.join(root,'prototype/public');
const oldFetch=globalThis.fetch,oldParse=GLTFLoader.prototype.parseAsync;
const bufferOf=bytes=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
GLTFLoader.prototype.parseAsync=function(...args){
  this.register(()=>({name:'CPUTextureDecodeFixture',loadTexture:async()=>null}));
  return oldParse.apply(this,args);
};
let held=null;
globalThis.fetch=async input=>{
  const url=new URL(input,'http://fixture.invalid/');
  if(url.pathname===held?.path){const gate=held;held=null;gate.enter();await gate.promise;}
  return new Response(await fs.readFile(path.join(publicRoot,url.pathname.slice(1))));
};
function hold(resource){
  let release,enter;
  held={path:resource,promise:new Promise(resolve=>{release=resolve;}),enter:()=>enter()};
  return{release,started:new Promise(resolve=>{enter=resolve;})};
}
const fixtures=[];
async function fixture(){
  const bytes=await fs.readFile(path.join(publicRoot,cfg.url.slice(1)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),cfg.sha256);
  const parsed=await new GLTFLoader().parseAsync(bufferOf(bytes),'');parsed.scene.updateMatrixWorld(true);
  const vrm={scene:parsed.scene,humanoid:{getRawBoneNode:name=>parsed.scene.getObjectByName(name==='head'?'J_Bip_C_Head':name)}};
  const appearance=createCharacterAppearance({vrm,avatarSha256:cfg.sha256});
  const actor={appearance},events=new EventEmitter(),history=[];
  let ui=null;
  const read=()=>{const state=appearance.getState();return{hairStyle:state.hairStyle,hairColor:state.hairColor,revision:state.revision,loading:state.loading};};
  const subject=Object.assign(new context.Subject(),{actor,isPeer:false,game:{events},cancelSequence(){}});
  context.primary(subject);
  events.on('appearance-state-changed',event=>{ui={...event.actor.appearance.getState()};history.push({hairStyle:ui.hairStyle,hairColor:ui.hairColor,revision:ui.revision});});
  const f={appearance,subject,read,history,getUI:()=>({hairStyle:ui?.hairStyle,hairColor:ui?.hairColor,revision:ui?.revision})};
  fixtures.push(f);return f;
}
const report={status:'running',sourceSHA256:{main:createHash('sha256').update(main).digest('hex'),appearance:createHash('sha256').update(appearanceBytes).digest('hex')},
  baseAvatarSha256:cfg.sha256,hairAsset:{id:entry.id,sha256:entry.assetSha256,manifestSha256:entry.manifestSha256},
  scope:'Production createCharacterAppearance, pinned original VRM/hair GLB, real GLTFLoader geometry and extracted main command/notification. PNG texture decode skipped. CPU event observer stands in for workbench, no DOM/browser/GPU.',
  GPUUsed:false,browserStarted:false};
try{
  const f=await fixture(),gate=hold(entry.manifestUrl);
  const pending=f.subject.command({type:'appearance',hairStyle:entry.id});
  await gate.started;
  const newer=await f.subject.command({type:'appearance',hairColor:'black'});
  assert.equal(newer.applied,true);
  const afterColor={actual:f.read(),ui:f.getUI(),notificationCount:f.history.length};
  assert.equal(afterColor.actual.hairStyle,'original');assert.equal(afterColor.ui.hairStyle,'original');
  gate.release();const older=await pending;
  const afterHair={actual:f.read(),ui:f.getUI(),notificationCount:f.history.length};
  assert.equal(older.applied,false);assert.equal(older.cancelled,true);
  assert.equal(afterHair.actual.hairStyle,entry.id);assert.equal(afterHair.actual.hairColor,'black');
  assert.equal(afterHair.ui.hairStyle,expectStale?'original':entry.id);
  assert.equal(afterHair.notificationCount,afterColor.notificationCount+(expectStale?0:1));
  report.delayedHairCase={afterNewerColor:afterColor,olderHairResult:older,afterOlderHair:afterHair,notifications:f.history};

  const control=await fixture(),controlGate=hold(entry.manifestUrl);
  const discarded=control.subject.command({type:'appearance',hairStyle:entry.id});await controlGate.started;
  assert.equal((await control.subject.command({type:'appearance',hairStyle:'original',hairColor:'black'})).applied,true);
  controlGate.release();const discardedResult=await discarded;
  assert.equal(discardedResult.cancelled,true);assert.equal(control.read().hairStyle,'original');
  assert.equal(control.getUI().hairStyle,'original');
  report.control={newerExplicitHairIntentWins:true,result:discardedResult,actual:control.read(),ui:control.getUI()};
  report.status=expectStale?'confirmed-ui-stale-after-valid-independent-hair-intent':'passed-current-state-refresh-after-cancelled-hair-result';
}catch(error){report.status='reproduction-failed';report.error=error.stack;throw error;}
finally{
  for(const f of fixtures)f.appearance.dispose();
  globalThis.fetch=oldFetch;GLTFLoader.prototype.parseAsync=oldParse;
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  await fs.copyFile(new URL(import.meta.url),path.join(out,'executed-script.mjs'));
}
console.log(JSON.stringify({out,status:report.status,delayedHairCase:report.delayedHairCase},null,2));
