import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {createBehaviorTasks} from '../prototype/src/behavior-tasks.js';
import {createSeatLeases} from '../prototype/src/seat-lease.js';
import {createTurnPolicy} from '../prototype/src/turn-policy.js';
const root=process.cwd(),out='evidence/native-seat-curve-recovery-v1';
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
  const nav = text.slice(text.indexOf('function movingSteering('), text.indexOf('const names ='));
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
const report={passed:true,fixture,baselineSHA:hash(baseline),testedSHA:hash(source),inputReportSHA:hash(await fs.readFile('evidence/native-factory-room-58f0-v1/report.json')),before,after,taskCases,checks,scope:'Actual CharacterScene simulate/navigation/turn/task/lease; motion pose update is a minimal CPU fixture. Internal speed reconstructed from last .85m/s minus 2.5m/s2 * recorded idle .006s. GPU variable dt unavailable, so not bit-identical replay. No skin/foot/visual claim.'};
await fs.writeFile(out+'/result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,checks,afterTime:after.time,testedSHA:report.testedSHA},null,2));
