import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as THREE from 'file:///F:/gamemake/prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from 'file:///F:/gamemake/prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

const subject = path.resolve(process.argv[2] || 'F:/gamemake-hair-fixed-length-v1');
const out = path.dirname(fileURLToPath(import.meta.url));
const source = await fs.readFile(path.join(subject, 'prototype/src/hair-spring.js'));
const {createHairSpring} = await import(pathToFileURL(path.join(subject, 'prototype/src/hair-spring.js')));
const checks = [];
const joint = {bone:'root', child:'tip', hitRadius:.01, stiffness:0, gravityPower:0, gravityDir:[0,-1,0], dragForce:1};
function fixture(pivot, endpoint, bounds, matrix = new THREE.Matrix4()) {
  const world = new THREE.Group(), scene = new THREE.Group();
  const bone = new THREE.Bone(), tip = new THREE.Bone();
  bone.name = 'root'; tip.name = 'tip'; bone.position.copy(pivot); tip.position.subVectors(endpoint, pivot);
  world.add(scene); scene.add(bone); bone.add(tip);
  const proxies = bounds.map(([min,max], index) => {
    const mesh = new THREE.Object3D(); mesh.name = `independent-box-${index}`;
    mesh.matrixAutoUpdate = false; mesh.matrix.copy(matrix); world.add(mesh);
    return {name:mesh.name, mesh, localBox:new THREE.Box3(new THREE.Vector3(...min),new THREE.Vector3(...max)),
      matrixWorld:mesh.matrixWorld, inverseMatrixWorld:new THREE.Matrix4(), projectOut(){},
      refresh(){mesh.updateWorldMatrix(true,false);this.inverseMatrixWorld.copy(mesh.matrixWorld).invert();}};
  });
  world.updateMatrixWorld(true); proxies.forEach(p => p.refresh());
  const manager = createHairSpring({scene,vrm:{humanoid:{getRawBoneNode:()=>null}},
    config:{schema:'hair-spring-v1', joints:[joint], colliders:[]}, environmentColliders:proxies});
  const shapes = proxies.map(p => p.mesh.children.find(c => c.shape)?.shape);
  return {world,scene,bone,tip,proxies,manager,shapes};
}
function solve(shape, point, radius=.01) {
  const normal = new THREE.Vector3();
  const distance = shape.calculateCollision(null,point,radius,normal);
  return {point:point.clone().addScaledVector(normal,-Math.min(distance,0)), distance, normal:normal.toArray(), outcome:shape.lastOutcome};
}
// Independent sampled witness. A positive value proves an interior intersection.
function penetration(proxy, start, end, radius=.01) {
  const inv = proxy.inverseMatrixWorld, e = inv.elements;
  const margin = radius*Math.max(Math.hypot(e[0],e[4],e[8]),Math.hypot(e[1],e[5],e[9]),Math.hypot(e[2],e[6],e[10]));
  let depth = 0, witness = null;
  for(let i=0;i<=1000;i++) {
    const p = start.clone().lerp(end,i/1000).applyMatrix4(inv);
    const d = Math.min(p.x-proxy.localBox.min.x+margin,proxy.localBox.max.x+margin-p.x,
      p.y-proxy.localBox.min.y+margin,proxy.localBox.max.y+margin-p.y,
      p.z-proxy.localBox.min.z+margin,proxy.localBox.max.z+margin-p.z);
    if(d>depth) {depth=d;witness=i/1000;}
  }
  return {depth,witness};
}
function record(name, passed, details) {checks.push({name,passed,...details});}
const captureBytes = await fs.readFile('F:/gamemake/evidence/m2-hair-chair-actual-508-v1/report.json');
const captured = JSON.parse(captureBytes);
for(let index=0;index<captured.samples.length;index++) {
  const s = captured.samples[index], bones = s.meshes[0].bones;
  const pivot = new THREE.Vector3(...bones.find(b=>b.name==='Pony5').world);
  const endpoint = new THREE.Vector3(...bones.find(b=>b.name==='Pony6').world);
  const b = s.boxes.find(b=>b.name==='chairBack');
  const f = fixture(pivot,endpoint,[[b.localMin,b.localMax]],new THREE.Matrix4().fromArray(b.matrixWorld));
  const solved = solve(f.shapes[0],endpoint,.0065), before = penetration(f.proxies[0],pivot,endpoint,.0065);
  const after = penetration(f.proxies[0],pivot,solved.point,.0065);
  const lengthError = Math.abs(solved.point.distanceTo(pivot)-endpoint.distanceTo(pivot));
  record(`actual508 segment ${index}`,before.depth>0 && after.depth<1e-10 && lengthError<1e-12,
    {before,after,lengthError,correction:-solved.distance,outcome:solved.outcome});
  f.manager.dispose();
}
{
  const pivot = new THREE.Vector3(), endpoint = new THREE.Vector3(1,1,0);
  const f = fixture(pivot,endpoint,[[[.4,.2,-.1],[.6,.7,.1]],[[0,.8,-.1],[1.5,1,.1]]]);
  const first = solve(f.shapes[0],endpoint), second = solve(f.shapes[1],first.point);
  f.manager.reset(); f.manager.update(1/60); f.world.updateMatrixWorld(true);
  const official = f.tip.getWorldPosition(new THREE.Vector3());
  const finalPenetrations = f.proxies.map(p=>penetration(p,pivot,official));
  const witnessFeasibleEndpoint = new THREE.Vector3(0,-Math.SQRT2,0);
  record('two disjoint room boxes preserve both prior constraints after official update',finalPenetrations.every(p=>p.depth<1e-10),
    {pivot:pivot.toArray(),initial:endpoint.toArray(),afterFirst:first.point.toArray(),afterSecond:second.point.toArray(),
      official:official.toArray(),finalPenetrations, lengthError:Math.abs(official.length()-Math.SQRT2),
      feasibleEndpoint:witnessFeasibleEndpoint.toArray(),feasiblePenetrations:f.proxies.map(p=>penetration(p,pivot,witnessFeasibleEndpoint)),
      diagnostics:f.manager.getState().environmentCollisionDiagnostics});
  f.manager.dispose();
}
{
  const f = fixture(new THREE.Vector3(),new THREE.Vector3(0,.2,0),[[[-1,-1,-1],[1,1,1]]]);
  for(const [name,p] of [['zero-length',new THREE.Vector3()],['contained-sphere',new THREE.Vector3(0,.2,0)]]) {
    const r=solve(f.shapes[0],p); record(name,r.point.toArray().every(Number.isFinite)&&r.distance===0,
      {point:r.point.toArray(),outcome:r.outcome});
  }
  f.manager.dispose();
}
{
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(2,.7,-1),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,.8,.3)),new THREE.Vector3(-2,.4,1.3));
  const pivot = new THREE.Vector3(0,.5,0).applyMatrix4(matrix), endpoint = new THREE.Vector3(0,-.5,0).applyMatrix4(matrix);
  const f = fixture(pivot,endpoint,[[[-.1,-.1,-.1],[.1,.1,.1]]],matrix);
  const result = solve(f.shapes[0],endpoint), after = penetration(f.proxies[0],pivot,result.point);
  record('reflected rotated nonuniform box projection',result.point.toArray().every(Number.isFinite)&&after.depth<1e-10&&
    Math.abs(result.point.distanceTo(pivot)-endpoint.distanceTo(pivot))<1e-12,
    {after,lengthError:Math.abs(result.point.distanceTo(pivot)-endpoint.distanceTo(pivot))});
  f.manager.dispose();
}
const fit = JSON.parse(await fs.readFile(path.join(subject,'prototype/public/assets/m2-long-hair-rootjoin-v2/fit.json'),'utf8'));
const asset = await fs.readFile(path.join(subject,'prototype/public/assets/m2-long-hair-rootjoin-v2/female-ponytail.glb'));
const actualRows = [];
for(let index=0;index<captured.samples.length;index++) {
  const s=captured.samples[index], loader=new GLTFLoader();
  loader.register(()=>({name:'IndependentCPUTexture',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
  const {scene}=await loader.parseAsync(asset.buffer.slice(asset.byteOffset,asset.byteOffset+asset.byteLength),'');
  scene.matrixAutoUpdate=false;scene.matrix.fromArray(s.meshes[0].bones[0].matrixWorld);
  s.hair.localRotations.forEach((q,i)=>scene.getObjectByName('Pony'+i).quaternion.fromArray(q));
  const world=new THREE.Group();world.add(scene);
  const proxies=s.boxes.map(b=>{
    const mesh=new THREE.Object3D();mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(b.matrixWorld);world.add(mesh);
    return {name:b.name,mesh,localBox:new THREE.Box3(new THREE.Vector3(...b.localMin),new THREE.Vector3(...b.localMax)),
      matrixWorld:mesh.matrixWorld,inverseMatrixWorld:new THREE.Matrix4(),projectOut(){}};
  });
  world.updateMatrixWorld(true);proxies.forEach(p=>p.inverseMatrixWorld.copy(p.matrixWorld).invert());
  const mesh=scene.getObjectByName('LongHairMesh');
  const replayError=Math.max(...s.meshes[0].vertices.map(v=>mesh.localToWorld(mesh.getVertexPosition(v.id,new THREE.Vector3())).distanceTo(new THREE.Vector3(...v.world))));
  const manager=createHairSpring({scene,vrm:{humanoid:{getRawBoneNode:()=>null}},config:{...fit.dynamics,colliders:[]},environmentColliders:proxies});
  manager.reset();manager.update(1/120);world.updateMatrixWorld(true);
  const segments=fit.dynamics.joints.map(j=>({bone:j.bone,radius:j.hitRadius,contacts:proxies.map(p=>({box:p.name,...penetration(p,
    scene.getObjectByName(j.bone).getWorldPosition(new THREE.Vector3()),scene.getObjectByName(j.child).getWorldPosition(new THREE.Vector3()),j.hitRadius)}))}));
  actualRows.push({sample:index,replayError,segments,diagnostics:manager.getState().environmentCollisionDiagnostics});
  manager.dispose();
  record(`actual GLB three508 seat/back official single step ${index}`,replayError<1e-12&&segments.every(s=>s.contacts.every(c=>c.depth<1e-10)),
    {replayError,remainingContacts:segments.filter(s=>s.contacts.some(c=>c.depth>=1e-10)),cleanupCount:proxies.reduce((n,p)=>n+p.mesh.children.length,0)});
}
{
  const f=fixture(new THREE.Vector3(0,.2,0),new THREE.Vector3(),[[[-.05,-.05,-.05],[.05,.05,.05]]]);
  const peer=f.scene.clone(true);f.world.add(peer);f.world.updateMatrixWorld(true);
  const peerManager=createHairSpring({scene:peer,vrm:{humanoid:{getRawBoneNode:()=>null}},
    config:{schema:'hair-spring-v1',joints:[joint],colliders:[]},environmentColliders:f.proxies});
  f.manager.reset();peerManager.reset();f.manager.update(1/60);peerManager.update(1/60);
  const peerBefore=peerManager.getState(),ownedBefore=f.proxies[0].mesh.children.length;
  f.manager.dispose();peerManager.update(1/60);
  const peerAfter=peerManager.getState(),ownedAfter=f.proxies[0].mesh.children.length;
  peerManager.dispose();
  record('shared proxy two-manager ownership and disposal isolation',ownedBefore===2&&ownedAfter===1&&
    peerAfter.updates===peerBefore.updates+1&&peerAfter.localRotations.flat().every(Number.isFinite)&&f.proxies[0].mesh.children.length===0,
    {ownedBefore,ownedAfter,finalOwned:f.proxies[0].mesh.children.length});
}
{
  const f=fixture(new THREE.Vector3(0,.2,0),new THREE.Vector3(),[[[-.05,-.05,-.05],[.05,.05,.05]]]);
  f.scene.removeFromParent();f.manager.reset();
  f.world.add(f.scene);f.proxies[0].mesh.matrix.makeTranslation(.02,0,0);f.proxies[0].refresh();
  f.manager.update(1/60);
  const collider=f.proxies[0].mesh.children.find(c=>c.shape);
  record('detached reset then shared-root attach refreshes public manager dependency order',
    collider.colliderMatrix.equals(f.proxies[0].matrixWorld)&&f.manager.getState().localRotations.flat().every(Number.isFinite),
    {colliderMatrixMatches:collider.colliderMatrix.equals(f.proxies[0].matrixWorld),state:f.manager.getState()});
  f.manager.dispose();
}
const report = {revision:execFileSync('git',['rev-parse','HEAD'],{cwd:subject,encoding:'utf8'}).trim(),
  sourceSha256:createHash('sha256').update(source).digest('hex'),
  dirty:execFileSync('git',['status','--porcelain','--','prototype/src/hair-spring.js'],{cwd:subject,encoding:'utf8'}).trim(),
  checks, actualRows, assetSha256:createHash('sha256').update(asset).digest('hex'),
  captureSha256:createHash('sha256').update(captureBytes).digest('hex'),
  versions:{three:'0.187.0',threeVrm:'3.5.5'},
  limits:['CPU only, actual Three0.187/VRM3.5.5 module and official manager. No browser or visual acceptance.',
    'Actual captured GLB replay uses frozen head matrix and omits body colliders because original raw-body frames were not captured.',
    'Penetration check samples 1001 segment locations. Positive interior depths prove intersection; zero is a bounded sample result.']};
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
