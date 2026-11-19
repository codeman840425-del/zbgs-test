import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {createBehaviorTasks} from '../prototype/src/behavior-tasks.js';
import {createSeatLeases} from '../prototype/src/seat-lease.js';
import {createTurnPolicy,movingSteering} from '../prototype/src/turn-policy.js';
const root=process.cwd(),out='evidence/native-seat-curve-recovery-v2';
const original=JSON.parse(await fs.readFile('evidence/native-factory-room-58f0-v1/report.json','utf8'));
const stopped=original.states.find(x=>x.name==='stopped').snapshot;
const fixture={position:stopped.position,yaw:stopped.facing,internalSpeed:original.states.find(x=>x.name==='afterWalk').snapshot.speed-2.5*stopped.modeTime,seatBack:stopped.motion.seatBack,seatApproach:stopped.motion.seatApproach,chair:stopped.chair};
const baseline=execFileSync('git',['show','a462e8ff:prototype/src/main.js']).toString();
const source=await fs.readFile('prototype/src/main.js','utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
function environment(text, transform = fixture.chair) {
  const chair = new THREE.Group(), world = new THREE.Group(); world.add(chair);
  chair.position.fromArray(transform.position); chair.rotation.y = transform.yaw; chair.updateMatrixWorld(true);
  const dimensions = text.match(/let chairSeat = cube\(([\d.]+), ([\d.]+), ([\d.]+),/).slice(1).map(Number);
  const geometry = new THREE.BoxGeometry(...dimensions); geometry.computeBoundingBox();
  const box = geometry.boundingBox.clone(); geometry.dispose();
  const declarations = text.slice(text.indexOf('const obstacles = ['), text.indexOf('// Cloth uses oriented boxes'));
  const obstacles = new Function('defaultChair', declarations+'\nreturn obstacles;')({x: chair.position.x, z: chair.position.z});
  const broad = box.clone().applyMatrix4(chair.matrixWorld);
  Object.assign(obstacles.find(o => o.name === 'chair'), {x: chair.position.x, z: chair.position.z,
    hw: (broad.max.x-broad.min.x)/2+.1, hd: (broad.max.z-broad.min.z)/2+.1});
  const localSteering = text.indexOf('function movingSteering(');
  const nav = localSteering >= 0 ? text.slice(localSteering, text.indexOf('const names =')) :
    movingSteering.toString()+'\n'+text.slice(text.indexOf('function reversalArcClearance('), text.indexOf('const names ='));
  const targets = text.slice(text.indexOf('function seatTargets('), text.indexOf('function setChairTransform('));
  const controller = text.slice(text.indexOf('class CharacterScene extends'), text.indexOf('function average('));
  const factory = new Function('THREE', 'chair', 'chairBounds', 'obstacles', 'clamp', 'Phaser', 'createBehaviorTasks',
    'createSeatLeases', 'createTurnPolicy', 'initialPosition', 'document', 'performance', 'turnLegacy', 'avatar', 'motion',
    'const locomotionAcceleration={walk:1.5,run:3.4,braking:2.5}; const seatLeases=createSeatLeases();\n'+nav+'\n'+targets+'\n'+controller+'\nreturn {pathTo,blocked,lineClear,CharacterScene,seatLeases,seatTargets};');
  const api = factory(THREE, chair, [{localBox: box}], obstacles, (v,a,b) => Math.min(b,Math.max(a,v)), {Scene: class {}},
    createBehaviorTasks, createSeatLeases, createTurnPolicy, fixture.position, {hidden: false}, performance, false, null, null);
  function actor(start) {
    const rootNode = new THREE.Group(); rootNode.position.set(start[0], 0, start[1]);
    const metrics = {danceMix:0,seatBack:fixture.seatBack,moving:false,gait:0,stopTime:1,sitProgress:0,feet:[{contact:true},{contact:true}]};
    const instance = {actorId: 'cpu-seat-owner', avatar: {root: rootNode, update(){}, livePresentation: {canPerform: () => ({allowed:true}), getState: () => ({greeting:null}), setAction() {}}},
      motion: {getMetrics: () => metrics, getSeatApproach: () => fixture.seatApproach, update(dt,args){metrics.moving=args.moving;metrics.gait=args.moving?1:0;metrics.stopTime=args.moving?0:metrics.stopTime+dt;metrics.sitProgress=args.action==='sit'?Math.min(1,metrics.sitProgress+dt):0;}}};
    const scene=new api.CharacterScene(instance);scene.yaw=fixture.yaw;scene.speed=fixture.internalSpeed;scene.turnPolicy.reset(fixture.yaw);return {scene, metrics};
  }
  return {...api, chair, obstacles, actor};
}

function run(text,{task=false,dt=1/120,transform=fixture.chair}={}){
 const api=environment(text,transform),{scene}=api.actor([fixture.position[0],fixture.position[2]]);
 const events=[];if(scene.recoverBlockedPath){const recover=scene.recoverBlockedPath.bind(scene);scene.recoverBlockedPath=()=>{events.push({t:scene.simulationTime,type:'collision-veto-replan',position:scene.actor.root.position.toArray(),target:scene.target,path:scene.path,afterWalk:scene.afterWalk});recover();};}const clear=scene.clearPath.bind(scene);scene.clearPath=()=>{events.push({t:scene.simulationTime,type:'clear',position:scene.actor.root.position.toArray(),target:scene.target,path:scene.path,afterWalk:scene.afterWalk});clear();};
 if(task)scene.requestBehavior({requestId:'sit-case',kind:'sit'});else scene.action('sit');
 const initialPath=[scene.target,...scene.path];let unsafeSegments=0,stoppedEarly=false,previous=scene.actor.root.position.clone();
 for(let i=0;i<25/dt;i++){
  scene.simulate(dt);const p=scene.actor.root.position;
  if(api.blocked(p.x,p.z)||!api.lineClear([previous.x,previous.z],[p.x,p.z]))unsafeSegments++;
  previous.copy(p);
  if(scene.mode==='sit'&&scene.rig.getMetrics().sitProgress===1)break;
  if(scene.mode==='idle'&&!scene.target&&!scene.seatAlign&&scene.afterWalk===null&&scene.simulationTime>5)stoppedEarly=true;
 }
 return {initialPath,events,unsafeSegments,stoppedEarly,position:scene.actor.root.position.toArray(),mode:scene.mode,target:scene.target,afterWalk:scene.afterWalk,time:scene.simulationTime,task:task?scene.behaviorTasks.get('sit-case'):null,lease:api.seatLeases.forSeat('room-chair-1')};
}

function shallowRun(text, kind, seconds) {
  const api = environment(text);
  const desk = api.obstacles.find(o => o.name === 'desk');
  const leftFace = desk.x - desk.hw;
  const start = [leftFace - 0.000001, -1.6];
  const goal = [leftFace - 0.05, -0.6];
  const {scene} = api.actor(start);
  scene.yaw = 0.1;
  scene.speed = 0.835;
  scene.turnPolicy.reset(scene.yaw);
  assert.equal(api.blocked(...start), false);
  assert.equal(api.blocked(...goal), false);
  assert.equal(api.lineClear(start, goal), true);
  let recoveries = 0;
  const events = [];
  if (scene.recoverBlockedPath) {
    const recover = scene.recoverBlockedPath.bind(scene);
    scene.recoverBlockedPath = () => {
      recoveries++;
      if (events.length < 6) events.push({t:scene.simulationTime, position:scene.actor.root.position.toArray(),
        yaw:scene.yaw, speed:scene.speed, target:scene.target, afterWalk:scene.afterWalk});
      recover();
    };
  }
  if (kind === 'direct') assert.equal(scene.go(...goal), true);
  else scene.requestBehavior({requestId:'shallow-wall-walk', kind:'walk', payload:{x:goal[0],z:goal[1]}});
  const samples = [];let unsafeSegments=0,pivotSeen=false;let prior=scene.actor.root.position.clone();
  for (let tick = 0; tick < seconds * 120; tick++) {
    scene.simulate(1 / 120);const p=scene.actor.root.position;if(api.blocked(p.x,p.z)||!api.lineClear([prior.x,prior.z],[p.x,p.z]))unsafeSegments++;prior.copy(p);pivotSeen ||= scene.turnPolicy.sample().kind==='pivot';
    if (tick === 0 || (tick+1) % 120 === 0) samples.push({t:scene.simulationTime,
      position:scene.actor.root.position.toArray(), yaw:scene.yaw, speed:scene.speed,
      mode:scene.mode, pathTurn:scene.pathTurn, target:scene.target,
      task:scene.behaviorTasks.get('shallow-wall-walk')});
  }
  const result = {start,goal,desk,recoveries,events,samples,unsafeSegments,pivotSeen, final:{mode:scene.mode, target:scene.target,
    position:scene.actor.root.position.toArray(),yaw:scene.yaw, task:scene.behaviorTasks.get('shallow-wall-walk')}};
  if (kind === 'cancel') {
    scene.requestBehavior({requestId:'cancel-to-idle',kind:'idle'});
    for (let i=0; i<120; i++) scene.simulate(1/120);
    result.afterCancel = {target:scene.target,mode:scene.mode,task:scene.behaviorTasks.get('shallow-wall-walk')};
  }
  return result;
}

const before=run(baseline),after=run(source),checks=[];
assert.equal(before.mode,'idle');assert.equal(before.lease.state,'reserved');assert(before.events.some(e=>e.type==='clear'&&e.afterWalk==='sit'));
assert.equal(after.mode,'sit');assert.equal(after.lease.state,'occupied');assert.equal(after.unsafeSegments,0);
assert.equal(after.events.filter(e=>e.type==='collision-veto-replan').length,1);
checks.push({name:'actual input reproduces swallowed sit; one recovery reaches seat',passed:true});
const taskCases=[1/120,.006,1/60].map(dt=>run(source,{task:true,dt}));
for(const x of taskCases){assert.equal(x.mode,'sit');assert.equal(x.task.state,'completed');assert.equal(x.lease.state,'occupied');assert.equal(x.unsafeSegments,0);}
checks.push({name:'task concludes completed and seat occupied across actual/substep clocks',passed:true,times:taskCases.map(x=>x.time)});
for(const mode of ['unreachable','cancel']){
 const api=environment(source),{scene}=api.actor([fixture.position[0],fixture.position[2]]);let encountered=false;
 const recover=scene.recoverBlockedPath.bind(scene);
 scene.recoverBlockedPath=()=>{encountered=true;if(mode==='unreachable')api.obstacles.push({name:'new-divider',x:2.4,z:0,hw:.01,hd:3.2});recover();if(mode==='cancel')scene.requestBehavior({requestId:'cancel-to-idle',kind:'idle'});};
 scene.requestBehavior({requestId:'controlled-sit',kind:'sit'});
 for(let t=0;t<10*120;t++)scene.simulate(1/120);
 assert(encountered);assert.equal(scene.target,null);assert.equal(scene.afterWalk,null);assert.equal(scene.mode,'idle');assert.equal(api.seatLeases.forSeat('room-chair-1'),null);
 const task=scene.behaviorTasks.get('controlled-sit');assert.equal(task.state,mode==='unreachable'?'failed':'cancelled');
 if(mode==='unreachable')assert.equal(task.reason,'seat-path-unreachable');
 checks.push({name:mode+' during collision recovery preserves explicit task conclusion and releases lease',passed:true,task});
}
function openTrace(text){
 const api=environment(text),{scene}=api.actor([-2,2]);scene.yaw=0;scene.speed=.85;scene.turnPolicy.reset(0);
 let recoveries=0;if(scene.recoverBlockedPath){const original=scene.recoverBlockedPath.bind(scene);scene.recoverBlockedPath=()=>{recoveries++;original();};}
 scene.go(1.5,2.2);const trace=[];
 for(let t=0;t<8*120;t++){scene.simulate(1/120);trace.push([scene.actor.root.position.x,scene.actor.root.position.z,scene.yaw,scene.speed]);}
 return{trace,recoveries,mode:scene.mode};
}
const openBefore=openTrace(baseline),openAfter=openTrace(source);assert.deepEqual(openAfter.trace,openBefore.trace);assert.equal(openAfter.recoveries,0);assert.equal(openAfter.mode,'idle');
checks.push({name:'open-space turning trace unchanged for all 960 substeps; no recovery stop',passed:true,traceSHA:hash(JSON.stringify(openAfter.trace))});
const shallowBaseline=execFileSync('git',['show','dcf00bde:prototype/src/main.js']).toString();
const shallowBefore=shallowRun(shallowBaseline,'direct',10),shallowAfter=shallowRun(source,'task',10),shallowDirect=shallowRun(source,'direct',10);
assert.equal(shallowDirect.recoveries,1);assert.equal(shallowDirect.final.mode,'idle');assert.equal(shallowDirect.final.target,null);assert.equal(shallowDirect.unsafeSegments,0);
assert.equal(shallowBefore.recoveries,1200);assert.equal(shallowBefore.final.mode,'walk');
assert.equal(shallowAfter.recoveries,1);assert.equal(shallowAfter.final.mode,'idle');assert.equal(shallowAfter.final.task.state,'completed');assert(shallowAfter.pivotSeen);assert.equal(shallowAfter.unsafeSegments,0);
checks.push({name:'independent shallow desk counterexample: 1200 retries becomes one recovery and existing small pivot, task completed',passed:true});
const alignment='(Math.abs(angle) > .27 || (this.pathTurn === "recover" && dist > .10 && Math.abs(angle) > .06))';assert(source.includes(alignment));
const injected=source.replace(alignment,'Math.abs(angle) > .27');
const boundedTask=shallowRun(injected,'task',10),boundedDirect=shallowRun(injected,'direct',10);
assert.equal(boundedTask.recoveries,2);assert.equal(boundedTask.final.task.state,'failed');assert.equal(boundedTask.final.task.reason,'path-recovery-no-progress');
assert.equal(boundedDirect.recoveries,2);assert.equal(boundedDirect.final.mode,'idle');assert.equal(boundedDirect.final.target,null);
checks.push({name:'fault injection removes new alignment: repeated veto without .5mm net progress stops after two collisions for task and direct command',passed:true});
// Sit reservation receives the same finite terminal outcome if recovery cannot move.
const guardApi=environment(source),{scene:guardScene}=guardApi.actor([fixture.position[0],fixture.position[2]]);
guardScene.requestBehavior({requestId:'guard-sit',kind:'sit'});guardScene.recoverBlockedPath();guardScene.recoverBlockedPath();
assert.equal(guardScene.behaviorTasks.get('guard-sit').reason,'path-recovery-no-progress');assert.equal(guardApi.seatLeases.forSeat('room-chair-1'),null);
assert.equal(guardScene.requestBehavior({requestId:'fresh-sit',kind:'sit'}).task.state,'running');assert(guardScene.target);
checks.push({name:'terminal no-progress sit releases reservation; explicit fresh request can retry',passed:true});
const report={passed:true,fixture,baselineSHA:hash(baseline),testedSHA:hash(source),shallowBaselineSHA:hash(shallowBaseline),shallowBefore,shallowAfter,shallowDirect,boundedTask,boundedDirect,inputReportSHA:hash(await fs.readFile('evidence/native-factory-room-58f0-v1/report.json')),before,after,taskCases,checks,scope:'Actual CharacterScene simulate/navigation/turn/task/lease; motion pose update is a minimal CPU fixture. Internal speed reconstructed from last .85m/s minus 2.5m/s2 * recorded idle .006s. GPU variable dt unavailable, so not bit-identical replay. No skin/foot/visual claim.'};
await fs.writeFile(out+'/result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,checks,afterTime:after.time,testedSHA:report.testedSHA},null,2));
