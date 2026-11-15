import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createBehaviorTasks } from '../prototype/src/behavior-tasks.js';
const dir=path.resolve('.');
const oi=process.argv.indexOf('--out');if(oi<0)throw Error('--out NEW_DIR required');
const out=path.resolve(process.argv[oi+1]);if(fs.existsSync(out))throw Error('Refuse overwrite');fs.mkdirSync(out,{recursive:true});
const main=fs.readFileSync(path.join(dir,'prototype/src/main.js'),'utf8');
const extract=(start,end)=>main.slice(main.indexOf(start),main.indexOf(end,main.indexOf(start)));
const fn=extract('async function switchFoundationBody(bodyType)', 'function populateDanceSelect(');
const sync=extract('function syncFoundationControls(a)', 'function bindFoundationControls(a)');
fs.mkdirSync(path.join(out,'source-tested'),{recursive:true});
fs.writeFileSync(path.join(out,'source-tested/switch-and-sync.js'),sync+'\n'+fn);
const noop=()=>{};
class V { constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});} clone(){return new V(this.x,this.y,this.z);} copy(v){return Object.assign(this,v);} fromArray(a){[this.x,this.y,this.z]=a;return this;} }
function fixture(fault){
 const effects=[],compileCalls=[];
 const world={children:new Set(),add(root){root.parent=this;this.children.add(root);if(fault==='attach'&&root.id==='new')throw Error('injected attachment');}};
 const makeAvatar=(id)=>{const a={id,disposed:false,profile:{bodyType:id,sha256:id,motion:{}},config:{outfits:[{index:0,role:'pants'},...(id==='old'?[{index:1,role:'skirt'}]:[])],ids:{},pantsLabel:'pants',label:id},vrm:{},root:{id,position:new V(2,0,3),rotation:{y:0},updateMatrixWorld:noop,removeFromParent(){this.parent?.children.delete(this);this.parent=null;}},appearance:{getState:()=>({availableStyles:['original'],hairStyle:id==='old'?'bob':'original',hairColor:'black',skinTone:'warm',eyeColor:'blue',lipColor:'rose'}),set:async(patch)=>{a.colors=patch;return {applied:true};}},setOutfit(n){this.outfit=n;},setDebugBody(value){this.debug=value;},setDynamics(value){this.dynamics=value;},update(){if(id==='new'&&fault==='avatar-update')throw Error('injected avatar update');},resetSecondary(){if(id==='new'&&fault==='secondary')throw Error('injected secondary');},updateGarment(){if(id==='new'&&fault==='garment')throw Error('injected garment');},dispose(){this.disposed=true;this.root.removeFromParent();}};return a;};
 const old=makeAvatar('old'),next=makeAvatar('new');world.add(old.root);
 const makeRig=(id)=>({id,disposed:false,setCorrections(value){this.corrections=value;},reset:noop,setAction:noop,update(){if(id==='new'&&fault==='motion-update')throw Error('injected motion update');},getDance:()=>({id:'dance'}),getDances:()=>[{id:'dance'}],setDance(){if(id==='new'&&fault==='dance')throw Error('injected dance');},dispose(){this.disposed=true;if(id==='old'&&fault==='old-rig-dispose')throw Error('injected old rig dispose');}});
 const oldRig=makeRig('old'),newRig=makeRig('new');
 const elements=new Map();const element=(s)=>{if(!elements.has(s))elements.set(s,{textContent:'',hidden:false,dataset:{outfit:s.match(/outfit="(\d)"/)?.[1]},querySelector:()=>element(s+' b'),pressed:s==='[data-outfit="1"]'?'true':'false',setAttribute(k,v){if(k==='aria-pressed')this.pressed=v;}});return elements.get(s);};
 const outfitElements=[0,1,2].map(n=>element(`[data-outfit="${n}"]`));
 const c={actorId:'primary',outfit:1,yaw:.2,maxSpeed:.8,paused:true,playbackRate:.25,simulationTime:4,mode:'walk',seatAlign:false,executingRequest:'old-task',deferredBehavior:{requestId:'queued-task'},path:[[3,4]],target:[3,4],sequence:[{}],cancelSequence(){this.sequence=[];this.sequenceIndex=-1;},reset(){this.resetCalled=true;},turnPolicy:{reset(yaw){effects.push(['turn-reset',yaw]);}},setSpeed:noop,setPlaybackRate:noop,setPaused:noop};
 c.behaviorTasks=createBehaviorTasks({ownerId:'primary',onEvent:event=>{if(event.type==='cancelled'&&c.executingRequest===event.task.requestId)effects.push(['unexpected-cancel-actor-mutation']);}});
 c.behaviorTasks.request({requestId:'old-task',kind:'walk'});c.behaviorTasks.request({requestId:'queued-task',kind:'greeting'});
 const ctx={ready:true,avatar:old,motion:oldRig,bodySelectionGeneration:0,bodySelection:{},world,renderer:{compileAsync(root,camera,target){
  compileCalls.push({root,camera,target});assert.equal(root,next.root);assert.equal(root.parent,undefined);assert.equal(target,world);assert(world.children.has(old.root));assert.equal(next.outfit,0);assert.equal(next.colors.hairColor,'black');
  if(fault==='compile-sync')throw Error('injected compile sync');if(fault==='compile-reject')return Promise.reject(Error('injected compile reject'));return Promise.resolve(root);
 }},loadFoundationAvatar:async()=>next,loadRetargetedMotions:async()=>{if(fault==='load')throw Error('injected load');return {};},createMotion:()=>newRig,controller:c,inspection:{bodyMode:'full',dynamics:true,corrections:'full'},correctionLayers:{full:{}},cameraMode:'close',camera:{position:new V(4,3,6)},controls:{target:new V(1,.9,2)},performance:{now:()=>123},marker:{visible:true},seatLeases:{disposeOwner(id){effects.push(['seat-release',id]);}},chairBounds:[],seatTargets:()=>({approach:[0,0,0]}),document:{querySelector:element,querySelectorAll:()=>outfitElements},populateDanceSelect(){if(fault==='ui')throw Error('injected UI');},createDebugHelpers(){if(fault==='helpers')throw Error('injected helpers');},syncInspectionUI:noop,fixedViews:new Set(),cameraTween:null,followPosition:new V(),updateFixedCamera:noop,syncViewButtons:noop,location:{href:'http://localhost/?body=old'},history:{state:{},replaceState:noop},refreshUI:noop,URL};
 vm.createContext(ctx);vm.runInContext(sync+'\n'+fn,ctx);
 return {ctx,old,next,oldRig,newRig,world,elements,c,effects,compileCalls};
}
const results=[];
function state(f){return {currentAvatar:f.ctx.avatar.id,currentRig:f.ctx.motion.id,oldVisible:f.world.children.has(f.old.root),newVisible:f.world.children.has(f.next.root),oldDisposed:f.old.disposed,newDisposed:f.next.disposed,newRigDisposed:f.newRig.disposed,oldReset:!!f.c.resetCalled,controllerOutfit:f.c.outfit,pantsPressed:f.elements.get('[data-outfit="0"]').pressed,skirtPressed:f.elements.get('[data-outfit="1"]').pressed,skirtHidden:f.elements.get('[data-outfit="1"]').hidden,effects:f.effects};}
for(const fault of ['load','compile-sync','compile-reject','motion-update','avatar-update','garment','secondary','dance','attach','ui','helpers','old-rig-dispose',null]){
 const f=fixture(fault),before=JSON.stringify({position:f.old.root.position,mode:f.c.mode,path:f.c.path,task:f.c.behaviorTasks.active()}),result=await f.ctx.switchFoundationBody('new');
 const success=fault===null||['ui','helpers','old-rig-dispose'].includes(fault);
 assert.equal(result.applied,success);
 assert.equal(f.ctx.avatar,success?f.next:f.old);assert.equal(f.ctx.motion,success?f.newRig:f.oldRig);
 assert.equal(f.world.children.size,1);assert.equal(f.world.children.has(f.next.root),success);
 assert.equal(f.next.disposed,!success);assert.equal(f.old.disposed,success);assert.equal(!!f.c.resetCalled,false);
 if(!success){assert.equal(JSON.stringify({position:f.old.root.position,mode:f.c.mode,path:f.c.path,task:f.c.behaviorTasks.active()}),before);assert.deepEqual(f.effects,[]);}
 else {
  assert.equal(f.elements.get('[data-outfit="0"]').pressed,'true');assert.equal(f.elements.get('[data-outfit="1"]').pressed,'false');
  assert.equal(f.c.mode,'idle');assert.equal(f.c.executingRequest,null);assert.equal(f.c.path.length,0);assert.equal(f.c.target,null);assert.equal(f.c.deferredBehavior,null);assert.equal(f.c.sequence.length,0);assert.equal(f.c.seatToken,null);
  assert.equal(f.c.behaviorTasks.active(),null);assert.equal(f.c.behaviorTasks.pending().length,0);
  assert.equal(f.c.behaviorTasks.get('old-task').reason,'body-replaced');
  assert.equal(f.effects.some(e=>e[0]==='unexpected-cancel-actor-mutation'),false);
  assert.equal(f.c.maxSpeed,.8);assert.equal(f.c.paused,true);assert.equal(f.c.playbackRate,.25);assert.equal(f.c.simulationTime,4);assert.equal(f.ctx.cameraMode,'close');
  assert.deepEqual({...f.ctx.camera.position},{x:4,y:3,z:6});assert.deepEqual({...f.ctx.controls.target},{x:1,y:.9,z:2});
  assert.equal(f.next.colors.hairStyle,'original');assert.equal(f.next.colors.hairColor,'black');assert.equal(f.next.colors.skinTone,'warm');assert.equal(f.next.colors.eyeColor,'blue');assert.equal(f.next.colors.lipColor,'rose');
 }
 results.push({name:fault||'success',pass:true,result,...state(f)});
}
{
 const f=fixture(null);f.c.mode='sit';f.ctx.seatTargets=()=>({approach:[1.2,0,-.7]});
 const result=await f.ctx.switchFoundationBody('new');assert.equal(result.applied,true);
 assert.deepEqual({...f.next.root.position},{x:1.2,y:0,z:-.7});assert.equal(f.next.root.rotation.y,.2);
 assert.equal(f.effects.some(e=>e[0]==='seat-release'),true);results.push({name:'seated-exit',pass:true,result,...state(f)});
}
for(const stage of ['load','clips','appearance','compile']){
 const f=fixture(null);let release;const gate=new Promise(resolve=>release=resolve);
 if(stage==='load')f.ctx.loadFoundationAvatar=async()=>{await gate;return f.next;};
 if(stage==='clips')f.ctx.loadRetargetedMotions=async()=>{await gate;return {};};
 if(stage==='compile')f.ctx.renderer.compileAsync=async()=>{await gate;return f.next.root;};
 if(stage==='appearance')f.next.appearance.set=async()=>{await gate;return {applied:true};};
 const pending=f.ctx.switchFoundationBody('new');for(let i=0;i<12;i++)await Promise.resolve();
 const current=await f.ctx.switchFoundationBody('old');release();const stale=await pending;
 assert.equal(current.applied,true);assert.equal(stale.cancelled,true);assert.equal(f.ctx.avatar,f.old);assert.equal(f.next.disposed,true);assert.equal(f.ctx.bodySelection.loading,false);assert.equal(f.c.behaviorTasks.active().requestId,'old-task');
 results.push({name:'latest-current-cancels-'+stage,pass:true,result:stale,...state(f)});
}

for(const seated of [false,true]){
 const f=fixture(null);let release,enter;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
 f.ctx.renderer.compileAsync=async(root,camera,target)=>{assert.equal(root,f.next.root);assert.equal(target,f.world);assert(f.world.children.has(f.old.root));enter();await gate;return root;};
 const pending=f.ctx.switchFoundationBody('new');await entered;
 assert.equal(f.ctx.avatar,f.old);assert.equal(f.old.disposed,false);assert.equal(f.next.root.parent,undefined);
 // Simulate newer commands on the still-live old actor during compilation.
 f.old.root.position.fromArray([8,0,9]);f.c.yaw=1.2;f.c.maxSpeed=2.1;f.c.paused=false;f.c.playbackRate=.8;f.c.simulationTime=12;
 f.ctx.cameraMode='room';f.ctx.camera.position.fromArray([7,6,5]);f.ctx.controls.target.fromArray([4,3,2]);
 f.c.mode=seated?'sit':'walk';f.oldRig.getDance=()=>({id:'latest-dance'});f.newRig.getDances=()=>[{id:'dance'},{id:'latest-dance'}];f.newRig.setDance=id=>{f.newRig.selected=id;};
 f.ctx.seatTargets=()=>({approach:[1.4,0,-.3]});
 release();const r=await pending;assert.equal(r.applied,true);assert.equal(f.c.yaw,1.2);assert.equal(f.c.maxSpeed,2.1);assert.equal(f.c.paused,false);assert.equal(f.c.playbackRate,.8);assert.equal(f.c.simulationTime,12);
 assert.deepEqual({...f.next.root.position},seated?{x:1.4,y:0,z:-.3}:{x:8,y:0,z:9});assert.equal(f.next.root.rotation.y,1.2);
 assert.equal(f.ctx.cameraMode,'room');assert.deepEqual({...f.ctx.camera.position},{x:7,y:6,z:5});assert.deepEqual({...f.ctx.controls.target},{x:4,y:3,z:2});assert.equal(f.newRig.selected,'latest-dance');assert(f.old.disposed);assert.equal(f.ctx.bodySelection.loading,false);
 results.push({name:seated?'compile-wait-reads-new-seated-state':'compile-wait-reads-current-motion-camera-speed-paused-dance',pass:true,result:r});
}
{
 const f=fixture(null);let reject,enter;const entered=new Promise(r=>enter=r),gate=new Promise((yes,no)=>reject=no);
 f.ctx.renderer.compileAsync=async()=>{enter();await gate;};const pending=f.ctx.switchFoundationBody('new');await entered;
 const latest=await f.ctx.switchFoundationBody('old');reject(Error('old compile rejected late'));const stale=await pending;
 assert.equal(latest.applied,true);assert.equal(f.ctx.avatar,f.old);assert.equal(f.old.disposed,false);assert.equal(f.next.disposed,true);assert.equal(f.newRig.disposed,true);assert.equal(f.ctx.bodySelection.error,null);assert.equal(f.ctx.bodySelection.loading,false);
 results.push({name:'late-compile-rejection-does-not-overwrite-new-selection-state',pass:true,result:stale});
}

{
 const f=fixture(null);let release,enter;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
 f.old.config.outfits.push({index:2,role:'shorts'});f.next.config.outfits.push({index:2,role:'shorts'});
 f.ctx.correctionLayers.off={footIK:false,handContact:false};
 f.ctx.renderer.compileAsync=async()=>{assert.equal(f.next.outfit,0);assert.equal(f.next.debug,false);assert.equal(f.next.dynamics,true);enter();await gate;return f.next.root;};
 const pending=f.ctx.switchFoundationBody('new');await entered;
 f.c.outfit=2;f.ctx.inspection.bodyMode='base';f.ctx.inspection.dynamics=false;f.ctx.inspection.corrections='off';
 release();const result=await pending;assert.equal(result.applied,true);assert.equal(f.c.outfit,2);assert.equal(f.next.outfit,2);assert.equal(f.next.debug,true);assert.equal(f.next.dynamics,false);assert.deepEqual({...f.newRig.corrections},f.ctx.correctionLayers.off);
 assert(!result.notice.includes('原服装没有此身体版型'));results.push({name:'latest-outfit-debug-dynamics-corrections-after-compile',pass:true,result});
}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={scope:'Exact current switch/sync functions; actual behavior-tasks module; controlled actor/scene/renderer fixtures. No GPU or shader readiness/performance claim.',sourceSha256:sha(fs.readFileSync(path.join(dir,'prototype/src/main.js'))),passed:results.length,results};
fs.writeFileSync(path.join(out,'executed-script.mjs'),fs.readFileSync(new URL(import.meta.url)));
fs.writeFileSync(path.join(out,'main.tested.js'),fs.readFileSync(path.join(dir,'prototype/src/main.js')));
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({sourceSha256:report.sourceSha256,passed:results.length}));
