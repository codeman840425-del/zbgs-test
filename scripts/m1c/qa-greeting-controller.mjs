// Executes the actual CharacterScene task methods without WebGL/DOM. Movement
// and asset decoding are bounded doubles; layer decoding has a separate test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createBehaviorTasks} from '../../prototype/src/behavior-tasks.js';
import {createSeatLeases} from '../../prototype/src/seat-lease.js';
import {createTurnPolicy} from '../../prototype/src/turn-policy.js';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
const source=await fs.readFile(new URL('../../prototype/src/main.js',import.meta.url),'utf8');
const begin=source.indexOf('class CharacterScene extends Phaser.Scene {'),end=source.indexOf('\nfunction average(',begin);
assert(begin>0&&end>begin);
const CharacterScene=new Function('Phaser','createBehaviorTasks','createSeatLeases','createTurnPolicy','document','performance','seatLeases','chair','THREE','ready',source.slice(begin,end)+'\nreturn CharacterScene;')(
  {Scene:class{}},createBehaviorTasks,createSeatLeases,createTurnPolicy,{hidden:false},performance,createSeatLeases(),{parent:true},THREE,true);
const checks=[];
function fixture(){
  const gesture={status:'idle',requestId:null},metrics={gait:0,stopTime:1,danceMix:0,sitProgress:0};
  let loads=0,fail=false,cancelled=0;
  const actor={root:new THREE.Group(),livePresentation:{
    getState:()=>({greeting:{...gesture},accessories:{mic:{requested:false}}}),
    cancelGreeting(){if(['playing','loading'].includes(gesture.status))gesture.status='fading';cancelled++;},
    async playGreeting({requestId}){loads++;Object.assign(gesture,{requestId,status:fail?'failed':'playing'});return fail?{started:false,error:'injected-load-failure'}:{started:true};}
  }};
  const rig={getMetrics:()=>({...metrics})};
  const controller=new CharacterScene({avatar:actor,motion:rig,actorId:'test',position:[0,0,0]});
  controller.cancelSequence=()=>{};controller.setMode=name=>{controller.mode=name;};controller.clearPath=()=>{controller.target=null;};
  controller.go=(x,z)=>{controller.target={x,z};controller.mode='walk';return true;};
  controller.action=name=>{controller.mode=name;return true;};
  return {controller,gesture,metrics,actor,loads:()=>loads,cancelled:()=>cancelled,fail:()=>{fail=true;}};
}
const a=fixture();
const request=a.controller.command({type:'action',name:'greeting',requestId:'a'});
assert.equal(request.task.state,'running');assert.equal(a.loads(),1);
assert.equal(a.controller.command({type:'action',name:'greeting'}).duplicate,true);assert.equal(a.loads(),1);
assert.equal(a.controller.command({type:'action',name:'greeting',requestId:'a'}).duplicate,true);
assert.equal(a.controller.command({type:'action',name:'greeting',requestId:'other'}).admission,'rejected');assert.equal(a.loads(),1);
checks.push('Unified action command enters greeting task; repeated implicit/explicit identity does not restart');
a.gesture.status='completed';a.controller.updateBehavior(1/120,a.metrics);
assert.equal(a.controller.behaviorTasks.get('a').state,'completed');
assert.equal(a.controller.behaviorTasks.history().filter(e=>e.type==='completed').length,1);
checks.push('Task completes only after layer completed, once');
for(const mode of ['walk','dance','stand']){
  const f=fixture();f.controller.mode=mode;
  const result=f.controller.command({type:'action',name:'greeting',requestId:mode});
  assert.equal(result.task.state,'failed');assert.equal(f.loads(),0);assert.equal(f.controller.mode,mode);
}
const active=fixture();active.controller.requestBehavior({kind:'walk',requestId:'walk',payload:{x:1,z:1}});
const rejection=active.controller.command({type:'action',name:'greeting'});
assert.equal(rejection.admission,'rejected');assert.equal(active.controller.behaviorTasks.get('walk').state,'running');
checks.push('Walking/running, dancing and sit-rise transition refusal preserves unrelated ongoing movement');
const seated=fixture();seated.controller.mode='sit';seated.metrics.sitProgress=1;
seated.controller.command({type:'action',name:'greeting',requestId:'sit-greeting'});
seated.controller.behaviorTasks.cancel('sit-greeting');assert.equal(seated.controller.mode,'sit');assert.equal(seated.gesture.status,'fading');
checks.push('Stable seated greeting allowed; cancel does not release chair or make avatar stand');
const entering=fixture();entering.controller.mode='sit';entering.metrics.sitProgress=.99;
assert.equal(entering.controller.command({type:'action',name:'greeting'}).task.state,'failed');assert.equal(entering.loads(),0);
checks.push('A near-complete sit transition is not treated as seated stability');
const moving=fixture();moving.controller.command({type:'action',name:'greeting',requestId:'old'});
moving.controller.command({type:'walk',x:2,z:3,requestId:'new'});
assert.equal(moving.controller.mode,'idle');assert.equal(moving.controller.target,null);
assert.equal(moving.controller.behaviorTasks.get('old').state,'cancelled');
moving.gesture.status='cancelled';moving.controller.updateBehavior(.2,moving.metrics);
assert.equal(moving.controller.mode,'walk');assert.deepEqual(moving.controller.target,{x:2,z:3});
assert.equal(moving.controller.behaviorTasks.get('new').state,'running');
checks.push('Superseding locomotion waits for fade, then executes same pending task identity');
const rapid=fixture();rapid.controller.mode='sit';rapid.metrics.sitProgress=1;
rapid.controller.command({type:'action',name:'greeting',requestId:'seated'});
rapid.controller.command({type:'walk',x:1,z:1,requestId:'first-walk'});
rapid.controller.command({type:'walk',x:4,z:5,requestId:'last-walk'});
assert.equal(rapid.controller.mode,'sit');assert.equal(rapid.controller.target,null);
assert.equal(rapid.controller.behaviorTasks.get('first-walk').state,'cancelled');
rapid.gesture.status='cancelled';rapid.controller.updateBehavior(.2,rapid.metrics);
assert.deepEqual(rapid.controller.target,{x:4,z:5});
checks.push('Repeated supersession while seated keeps stable pose until outgoing layer finishes');
const timeout=fixture();timeout.controller.requestBehavior({kind:'greeting',requestId:'timeout',timeoutSeconds:.1});
timeout.controller.updateBehavior(.11,timeout.metrics);assert.equal(timeout.controller.behaviorTasks.get('timeout').reason,'timeout');assert.equal(timeout.gesture.status,'fading');
const failure=fixture();failure.fail();failure.controller.command({type:'action',name:'greeting',requestId:'failure'});await Promise.resolve();
assert.equal(failure.controller.behaviorTasks.get('failure').state,'failed');assert.equal(failure.controller.behaviorTasks.get('failure').reason,'injected-load-failure');
checks.push('Timeout and async resource failure finalize failed task, never false completion');
const late=fixture();let resolveOld;
late.actor.livePresentation.playGreeting=({requestId})=>{Object.assign(late.gesture,{status:'loading',requestId});return new Promise(resolve=>{resolveOld=resolve;});};
late.controller.command({type:'action',name:'greeting',requestId:'late'});
late.controller.command({type:'walk',x:3,z:4,requestId:'replacement'});
late.gesture.status='cancelled';late.controller.updateBehavior(.2,late.metrics);
resolveOld({started:false,error:'late-old-request-error'});await Promise.resolve();
assert.equal(late.controller.behaviorTasks.get('late').state,'cancelled');assert.equal(late.controller.behaviorTasks.get('replacement').state,'running');assert.equal(late.controller.mode,'walk');
checks.push('Old async failure callback cannot fail, stop or overwrite replacement task');
console.log(JSON.stringify({passed:true,checks,scope:'Actual controller methods with movement/asset doubles; not browser or visual validation'},null,2));
