import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createBehaviorTasks } from '../../prototype/src/behavior-tasks.js';
const dir=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const main=fs.readFileSync(path.resolve(dir,'../../prototype/src/main.js'),'utf8');
const extract=(start,end)=>main.slice(main.indexOf(start),main.indexOf(end,main.indexOf(start)));
const fn=extract('async function switchFoundationBody(bodyType)', 'function populateDanceSelect(');
const sync=extract('function syncFoundationControls(a)', 'function bindFoundationControls(a)');
fs.mkdirSync(path.join(dir,'after/source-tested'),{recursive:true});
fs.writeFileSync(path.join(dir,'after/source-tested/switch-and-sync.js'),sync+'\n'+fn);
const noop=()=>{};
class V { constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});} clone(){return new V(this.x,this.y,this.z);} copy(v){return Object.assign(this,v);} fromArray(a){[this.x,this.y,this.z]=a;return this;} }
function fixture(fault){
 const effects=[];
 const world={children:new Set(),add(root){root.parent=this;this.children.add(root);if(fault==='attach'&&root.id==='new')throw Error('injected attachment');}};
 const makeAvatar=(id)=>{const a={id,disposed:false,profile:{bodyType:id,sha256:id,motion:{}},config:{outfits:[{index:0,role:'pants'},...(id==='old'?[{index:1,role:'skirt'}]:[])],ids:{},pantsLabel:'pants',label:id},vrm:{},root:{id,position:new V(2,0,3),rotation:{y:0},updateMatrixWorld:noop,removeFromParent(){this.parent?.children.delete(this);this.parent=null;}},appearance:{getState:()=>({availableStyles:['original'],hairStyle:id==='old'?'bob':'original',hairColor:'black',skinTone:'warm',eyeColor:'blue',lipColor:'rose'}),set:async(patch)=>{a.colors=patch;return {applied:true};}},setOutfit(n){this.outfit=n;},setDebugBody:noop,setDynamics:noop,update(){if(id==='new'&&fault==='avatar-update')throw Error('injected avatar update');},resetSecondary(){if(id==='new'&&fault==='secondary')throw Error('injected secondary');},updateGarment(){if(id==='new'&&fault==='garment')throw Error('injected garment');},dispose(){this.disposed=true;this.root.removeFromParent();}};return a;};
 const old=makeAvatar('old'),next=makeAvatar('new');world.add(old.root);
 const makeRig=(id)=>({id,disposed:false,setCorrections:noop,reset:noop,setAction:noop,update(){if(id==='new'&&fault==='motion-update')throw Error('injected motion update');},getDance:()=>({id:'dance'}),getDances:()=>[{id:'dance'}],setDance(){if(id==='new'&&fault==='dance')throw Error('injected dance');},dispose(){this.disposed=true;if(id==='old'&&fault==='old-rig-dispose')throw Error('injected old rig dispose');}});
 const oldRig=makeRig('old'),newRig=makeRig('new');
 const elements=new Map();const element=(s)=>{if(!elements.has(s))elements.set(s,{textContent:'',hidden:false,dataset:{outfit:s.match(/outfit="(\d)"/)?.[1]},querySelector:()=>element(s+' b'),pressed:s==='[data-outfit="1"]'?'true':'false',setAttribute(k,v){if(k==='aria-pressed')this.pressed=v;}});return elements.get(s);};
 const outfitElements=[0,1,2].map(n=>element(`[data-outfit="${n}"]`));
 const c={actorId:'primary',outfit:1,yaw:.2,maxSpeed:.8,paused:true,playbackRate:.25,simulationTime:4,mode:'walk',seatAlign:false,executingRequest:'old-task',deferredBehavior:{requestId:'queued-task'},path:[[3,4]],target:[3,4],sequence:[{}],cancelSequence(){this.sequence=[];this.sequenceIndex=-1;},reset(){this.resetCalled=true;},turnPolicy:{reset(yaw){effects.push(['turn-reset',yaw]);}},setSpeed:noop,setPlaybackRate:noop,setPaused:noop};
 c.behaviorTasks=createBehaviorTasks({ownerId:'primary',onEvent:event=>{if(event.type==='cancelled'&&c.executingRequest===event.task.requestId)effects.push(['unexpected-cancel-actor-mutation']);}});
 c.behaviorTasks.request({requestId:'old-task',kind:'walk'});c.behaviorTasks.request({requestId:'queued-task',kind:'greeting'});
 const ctx={ready:true,avatar:old,motion:oldRig,bodySelectionGeneration:0,bodySelection:{},world,renderer:{},loadFoundationAvatar:async()=>next,loadRetargetedMotions:async()=>{if(fault==='load')throw Error('injected load');return {};},createMotion:()=>newRig,controller:c,inspection:{bodyMode:'full',dynamics:true,corrections:'full'},correctionLayers:{full:{}},cameraMode:'close',camera:{position:new V(4,3,6)},controls:{target:new V(1,.9,2)},performance:{now:()=>123},marker:{visible:true},seatLeases:{disposeOwner(id){effects.push(['seat-release',id]);}},chairBounds:[],seatTargets:()=>({approach:[0,0,0]}),document:{querySelector:element,querySelectorAll:()=>outfitElements},populateDanceSelect(){if(fault==='ui')throw Error('injected UI');},createDebugHelpers(){if(fault==='helpers')throw Error('injected helpers');},syncInspectionUI:noop,fixedViews:new Set(),cameraTween:null,followPosition:new V(),updateFixedCamera:noop,syncViewButtons:noop,location:{href:'http://localhost/?body=old'},history:{state:{},replaceState:noop},refreshUI:noop,URL};
 vm.createContext(ctx);vm.runInContext(sync+'\n'+fn,ctx);
 return {ctx,old,next,oldRig,newRig,world,elements,c,effects};
}
const results=[];
function state(f){return {currentAvatar:f.ctx.avatar.id,currentRig:f.ctx.motion.id,oldVisible:f.world.children.has(f.old.root),newVisible:f.world.children.has(f.next.root),oldDisposed:f.old.disposed,newDisposed:f.next.disposed,newRigDisposed:f.newRig.disposed,oldReset:!!f.c.resetCalled,controllerOutfit:f.c.outfit,pantsPressed:f.elements.get('[data-outfit="0"]').pressed,skirtPressed:f.elements.get('[data-outfit="1"]').pressed,skirtHidden:f.elements.get('[data-outfit="1"]').hidden,effects:f.effects};}
for(const fault of ['load','motion-update','avatar-update','garment','secondary','dance','attach','ui','helpers','old-rig-dispose',null]){
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
for(const stage of ['load','clips','appearance']){
 const f=fixture(null);let release;const gate=new Promise(resolve=>release=resolve);
 if(stage==='load')f.ctx.loadFoundationAvatar=async()=>{await gate;return f.next;};
 if(stage==='clips')f.ctx.loadRetargetedMotions=async()=>{await gate;return {};};
 if(stage==='appearance')f.next.appearance.set=async()=>{await gate;return {applied:true};};
 const pending=f.ctx.switchFoundationBody('new');for(let i=0;i<6;i++)await Promise.resolve();
 const current=await f.ctx.switchFoundationBody('old');release();const stale=await pending;
 assert.equal(current.applied,true);assert.equal(stale.cancelled,true);assert.equal(f.ctx.avatar,f.old);assert.equal(f.next.disposed,true);assert.equal(f.ctx.bodySelection.loading,false);assert.equal(f.c.behaviorTasks.active().requestId,'old-task');
 results.push({name:'latest-current-cancels-'+stage,pass:true,result:stale,...state(f)});
}
const report={scope:'Actual extracted switch/sync functions, real behavior-tasks module, stub actor/scene/controller/DOM. CPU fault injection and asynchronous ordering; no GPU assertion.',sourceSha256:crypto.createHash('sha256').update(main).digest('hex'),passed:results.length,results};
fs.writeFileSync(path.join(dir,'after/report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({sourceSha256:report.sourceSha256,passed:results.length,results:results.map(r=>({name:r.name,pass:r.pass,result:r.result}))},null,2));
