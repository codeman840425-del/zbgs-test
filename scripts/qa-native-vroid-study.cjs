// Preparation and future room QA for an actual VRoid export. Preparation uses no browser.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const {execFileSync} = require('node:child_process');
const esbuild = require('../prototype/node_modules/esbuild');
const {verifyCandidate} = require('./qa-m1-common.cjs');

const root = path.resolve(__dirname, '..');
const sourceCommit = 'bfde7d79bc6bce4eda42d3d06d870364f3f64818';
const build = '83decd027116';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const baseline = {body:'female', assetId:'beta-base-female-m1',
  sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'};

const browserSource = `
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '@pixiv/three-vrm';
import {loadRetargetedMotions} from './prototype/src/motion-source.js';
import {createMotion} from './prototype/src/motion.js';

function visible(mesh) {
  for(let node=mesh;node;node=node.parent) if(!node.visible)return false;
  return true;
}
function bounds(vrm) {
  const box=new THREE.Box3();let vertices=0;
  vrm.scene.updateMatrixWorld(true);
  vrm.scene.traverse(mesh=>{
    if(!mesh.isMesh||!visible(mesh))return;
    mesh.skeleton?.update();
    const ids=new Set(mesh.geometry.index?.array??Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>i));
    for(const i of ids){box.expandByPoint(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));vertices++;}
  });
  if(!vertices||box.isEmpty()||![...box.min,...box.max].every(Number.isFinite))throw Error('Candidate visible bounds invalid');
  return {minimum:box.min.toArray(),maximum:box.max.toArray(),vertices};
}
export async function install(expected) {
  const d=window.__debug,old=d.avatar();if(!old?.root)throw Error('Primary room not ready');
  const response=await fetch('/__native_vroid_qa__/model.vrm');if(!response.ok)throw Error('Candidate route unavailable');
  const bytes=await response.arrayBuffer();
  const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  if(sha!==expected.sha256)throw Error('Candidate browser SHA mismatch');
  const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
  const gltf=await loader.parseAsync(bytes,'/__native_vroid_qa__/');const vrm=gltf.userData.vrm;
  if(!vrm?.humanoid)throw Error('Export has no supported VRM humanoid');
  const group=new THREE.Group();group.name='NativeVRoidStudy:'+expected.id;
  let motion,raf,disposed=false;
  const oldVisible=old.root.visible;
  try {
    VRMUtils.rotateVRM0(vrm);vrm.update(0);
    const rest=bounds(vrm);
    const sourceFloorY=expected.sourceFloorY??rest.minimum[1];
    if(!Number.isFinite(sourceFloorY))throw Error('Invalid candidate source floor');
    // Apply the candidate's floor once. Never copy the original VRM0 scene transform.
    vrm.scene.position.y-=sourceFloorY;group.add(vrm.scene);
    group.position.copy(old.root.position);group.quaternion.copy(old.root.quaternion);
    if(old.root.scale.distanceTo(new THREE.Vector3(1,1,1))>1e-8)throw Error('Baseline root scale needs explicit unit review');
    group.updateMatrixWorld(true);
    const motions=await loadRetargetedMotions(vrm,{avatarSha256:sha,targetFloorY:group.getWorldPosition(new THREE.Vector3()).y});
    motion=createMotion(vrm,group,motions,{});motion.reset();
    const materials=[],bones={};
    vrm.scene.traverse(mesh=>{
      if(!mesh.isMesh)return;mesh.frustumCulled=false;mesh.castShadow=true;
      for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.push(material.name);
    });
    for(const [semantic,bone] of Object.entries(vrm.humanoid.normalizedHumanBones))
      bones[semantic]={normalizedName:bone.node.name,rawName:vrm.humanoid.getRawBoneNode(semantic)?.name};
    const info={id:expected.id,sha256:sha,metaVersion:vrm.meta?.metaVersion,
      defaultEmbeddedMaterials:[...new Set(materials)],normalizedBones:bones,
      sourceRestBounds:rest,sourceFloorY,floorMethod:expected.sourceFloorY===null?'visible source-rest minimum; sole semantics pending':'explicit measured source floor',
      retargetRatio:motions.ratio,clipTracks:Object.fromEntries(Object.entries(motions.clips).map(([id,c])=>[id,c.tracks.length])),
      unavailableDances:motions.unavailableDances,
      expressions:vrm.expressionManager?.expressions.map(e=>e.expressionName)??[],
      footwearCalibration:motion.getFootLockCalibration(),oldPrimaryVisibleBefore:oldVisible};
    old.root.visible=false;d.scene.add(group);
    const samples=[];let previous=d.snapshot(),lastSample=0,phase='stand';
    let tickError=null,updates=0;
    function tick() {
      if(disposed)return;
      try {
        const state=d.snapshot();const dt=state.simulationTime-previous.simulationTime;
        if(dt>0){
          group.position.copy(old.root.position);group.quaternion.copy(old.root.quaternion);
          motion.update(dt,{action:state.mode,moving:state.motion.moving,speed:state.speed,
            distanceDelta:Math.max(0,state.distance-previous.distance),locomotionIntent:'walk',allowUnplannedTurn:false});
          vrm.update(dt);group.updateMatrixWorld(true);updates++;
        }
        previous=state;
        if(performance.now()-lastSample>=100){
          lastSample=performance.now();samples.push({ms:lastSample,phase,roomMode:state.mode,roomSimulationTime:state.simulationTime,
            root:group.position.toArray(),motion:motion.getMetrics()});
        }
      }catch(error){tickError=String(error.stack??error);return;}
      raf=requestAnimationFrame(tick);
    }
    window.__nativeVRoidStudy={info,samples,
      snapshot:()=>({info,phase,tickError,updates,root:group.position.toArray(),motion:motion.getMetrics()}),
      phase:value=>{phase=value;},
      expression:name=>{
        const manager=vrm.expressionManager;manager?.resetValues();
        if(!manager?.getExpression(name))return {name,supported:false};
        manager.setValue(name,1);vrm.update(0);
        return {name,supported:true,actualValue:manager.getValue(name)};
      },
      dispose:()=>{
        if(disposed)return;disposed=true;cancelAnimationFrame(raf);motion.dispose();group.removeFromParent();
        old.root.visible=oldVisible;VRMUtils.deepDispose(vrm.scene);delete window.__nativeVRoidStudy;
      }};
    tick();return info;
  }catch(error){motion?.dispose();group.removeFromParent();old.root.visible=oldVisible;VRMUtils.deepDispose(vrm.scene);throw error;}
}
`;

function checkedPath(relative) {
  assert.equal(typeof relative,'string');const actual=path.resolve(root,relative);
  assert.ok(actual.startsWith(root+path.sep),'Input must be repo-relative');return actual;
}
async function pin(relative) {
  const bytes=await fs.readFile(checkedPath(relative));return {path:relative,sha256:digest(bytes),bytes:bytes.length};
}
function vrmMetadata(bytes) {
  assert.ok(bytes.length>=28,'GLB is truncated');assert.equal(bytes.toString('ascii',0,4),'glTF');
  assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const length=bytes.readUInt32LE(12);assert.equal(bytes.toString('ascii',16,20),'JSON');assert.ok(20+length<=bytes.length);
  const document=JSON.parse(bytes.toString('utf8',20,20+length));
  assert.ok(document.extensions?.VRM||document.extensions?.VRMC_vrm,'VRM0/1 extension missing');
  for(const row of [...document.buffers??[],...document.images??[]])
    assert.ok(!row.uri||row.uri.startsWith('data:'),'External resources require a separate exact dependency plan');
  return {extension:document.extensions.VRMC_vrm?'VRMC_vrm':'VRM',
    version:document.extensions.VRMC_vrm?.specVersion??document.extensions.VRM?.specVersion,
    materials:document.materials?.map(m=>m.name)??[],meshes:document.meshes?.length??0};
}
async function bundle() {
  const pins={};
  const packagePath='prototype/package-lock.json';
  const expected=execFileSync('git',['show',sourceCommit+':'+packagePath],{cwd:root});
  assert.equal(digest(await fs.readFile(path.join(root,packagePath))),digest(expected),'Installed dependency lock differs from fixed runtime');
  const result=await esbuild.build({stdin:{contents:browserSource,resolveDir:root,sourcefile:'native-vroid-study-loader.js'},
    bundle:true,write:false,format:'esm',platform:'browser',nodePaths:[path.join(root,'prototype/node_modules')],
    plugins:[{name:'exact-fixed-runtime-source',setup(api){api.onLoad({filter:/[\\/]prototype[\\/]src[\\/]/},args=>{
      const relative=path.relative(root,args.path).replaceAll(path.sep,'/');
      const content=execFileSync('git',['show',sourceCommit+':'+relative],{cwd:root});pins[relative]=digest(content);
      return {contents:content.toString(),loader:relative.endsWith('.json')?'json':'js',resolveDir:path.dirname(args.path)};
    });}}]});
  return {bytes:Buffer.from(result.outputFiles[0].contents),sourcePins:pins,packageLockSha256:digest(expected)};
}
function requestTemplate() {
  return {schema:'native-vroid-room-study-request-v1',id:'female-native-round-waist',url:'http://127.0.0.1:4196/',build,
    runtimeSourceCommit:sourceCommit,model:{path:null,sha256:null},sourceFloorY:null,
    nativeSource:{path:'assets-source/vroid-mcp-study-v1/generated/female-native-round-waist.vroid',sha256:null},
    nativeReadback:{path:'evidence/vroid-mcp-study-v1/native-readback.json',sha256:null}};
}
async function prepare(destination) {
  const out=await projectOutput(destination,await productionRoot());
  await fs.mkdir(out,{recursive:false});const compiled=await bundle();
  const request=requestTemplate();request.nativeSource=await pin(request.nativeSource.path);request.nativeReadback=await pin(request.nativeReadback.path);
  await fs.writeFile(path.join(out,'loader.mjs'),compiled.bytes);await fs.writeFile(path.join(out,'loader-source.js'),browserSource);
  await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
  await fs.writeFile(path.join(out,'request-template.json'),JSON.stringify(request,null,2)+'\n');
  const invalid=[];
  for(const input of [Buffer.alloc(0),Buffer.from('not a VRM')]){
    let refused=false;try{vrmMetadata(input);}catch{refused=true;}assert.ok(refused);invalid.push({bytes:input.length,refused});
  }
  const result={schema:'native-vroid-room-study-preparation-v1',status:'prepared-awaiting-real-vrm-sha-and-browser-window',
    browserLaunched:false,sourceCommit,build,scriptSha256:digest(await fs.readFile(__filename)),
    loaderSha256:digest(compiled.bytes),runtimeSourcePins:compiled.sourcePins,packageLockSha256:compiled.packageLockSha256,
    invalidContainerChecks:invalid,scope:'Test overlay uses the actual fixed loader/retarget/motion modules and current room. Full foundation/equipment/appearance factory admission remains pending.'};
  await fs.writeFile(path.join(out,'prepare-report.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
async function run(requestFile,destination) {
  const out=await projectOutput(destination,await productionRoot());
  const request=JSON.parse(await fs.readFile(requestFile,'utf8'));
  assert.equal(request.schema,'native-vroid-room-study-request-v1');assert.equal(request.build,build);
  assert.equal(request.runtimeSourceCommit,sourceCommit);assert.match(request.id,/^[a-z0-9-]+$/);
  assert.equal(new URL(request.url).origin,'http://127.0.0.1:4196');assert.match(request.model?.sha256??'',/^[a-f0-9]{64}$/);
  assert.ok(request.sourceFloorY===null||Number.isFinite(request.sourceFloorY));
  const bytes=await fs.readFile(checkedPath(request.model.path));assert.equal(digest(bytes),request.model.sha256);
  const metadata=vrmMetadata(bytes);
  for(const name of ['nativeSource','nativeReadback'])assert.equal((await pin(request[name].path)).sha256,request[name].sha256);
  await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
  await fs.copyFile(requestFile,path.join(out,'request.json'));const compiled=await bundle();
  await fs.writeFile(path.join(out,'loader.mjs'),compiled.bytes);await fs.writeFile(path.join(out,'loader-source.js'),browserSource);
  const report={schema:'native-vroid-room-study-result-v1',status:'running',build,sourceCommit,request,metadata,
    loaderSha256:digest(compiled.bytes),runtimeSourcePins:compiled.sourcePins,errors:[],checks:[],images:[],
    participation:{roomRendererLightsCamera:true,sharedVRMLoaderPlugin:true,sharedRetargetAndCreateMotion:true,
      rootTrajectory:'Existing original-female primary Phaser tasks, followed by the candidate group.',
      candidateFoundationFactory:false,candidateEquipmentFactory:false,candidateAppearanceAndLivePresentation:false,
      candidateBodyCollisionProfiles:false,clothing:'All embedded source meshes remain visible, no independent replacement.'},
    limits:['Candidate pose has its own normalized rig and motion controller; room task admission remains on original primary.',
      'No new exact equipment, coverage, palette, hair, accessory, forearm or hand fits.',
      'Footwear selection uses shared motion source material-name semantics and must be inspected.',
      'Technical observations require full visual review. No target-PC performance claim.']};
  const {browser,close}=await launchQABrowser(out,{channel:'chrome'});
  let context,page;
  const capture=async name=>{
    await page.screenshot({path:path.join(out,name+'.png')});report.images.push(name+'.png');
  };
  try {
    context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:out,size:{width:1440,height:1000}}});
    page=await context.newPage();page.on('pageerror',error=>report.errors.push(String(error)));
    await page.route('**/__native_vroid_qa__/loader.mjs',route=>route.fulfill({contentType:'text/javascript',body:compiled.bytes}));
    await page.route('**/__native_vroid_qa__/model.vrm',route=>route.fulfill({contentType:'model/gltf-binary',body:bytes}));
    await page.goto(request.url+'?workbench=appearance&body=female');
    await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
    report.roomIdentity=await verifyCandidate(page,{build,...baseline});
    await page.evaluate(()=>{__debug.setPaused(true);__debug.setPlaybackRate(1);__debug.camera('room');});
    report.candidate=await page.evaluate(async expected=>(await import('/__native_vroid_qa__/loader.mjs')).install(expected),
      {id:request.id,sha256:request.model.sha256,sourceFloorY:request.sourceFloorY});
    assert.equal(report.candidate.sha256,request.model.sha256);
    await page.evaluate(id=>{
      const note=document.createElement('div');note.id='native-vroid-study-note';
      note.textContent='临时原生VRoid候选 '+id+' · 原模型整套衣物 · 未注册人物';
      Object.assign(note.style,{position:'fixed',top:'12px',left:'12px',zIndex:'99999',background:'#fff5dc',padding:'8px',color:'#333'});
      document.body.appendChild(note);__debug.setPaused(false);
    },request.id);
    await page.waitForTimeout(1500);await capture('standing-room');
    report.standing=await page.evaluate(()=>__nativeVRoidStudy.snapshot());assert.equal(report.standing.tickError,null);
    await page.evaluate(()=>{__nativeVRoidStudy.phase('walk');__debug.setSpeed(1.05);});
    const task=await page.evaluate(()=>__debug.walkTo(-1.4,-.6));assert.ok(task?.task?.requestId,'Room walking request rejected');
    report.walkRequest=task;await page.waitForTimeout(800);await capture('walking-room');
    await page.waitForFunction(id=>['completed','cancelled','failed'].includes(__debug.tasks().get(id)?.state),task.task.requestId,{timeout:30000});
    report.walkTask=await page.evaluate(id=>__debug.tasks().get(id),task.task.requestId);assert.equal(report.walkTask.state,'completed');
    report.walkEnd=await page.evaluate(()=>__nativeVRoidStudy.snapshot());assert.equal(report.walkEnd.tickError,null);
    await page.waitForTimeout(1000);await page.evaluate(()=>__debug.setPaused(true));await capture('standing-after-walk');
    report.expressions=[];
    for(const name of ['blink','happy','aa','oh']){
      const result=await page.evaluate(name=>__nativeVRoidStudy.expression(name),name);report.expressions.push(result);
      if(result.supported){await page.evaluate(()=>__debug.renderer.render(__debug.scene,__debug.cameraObject()));await capture('expression-'+name);}
    }
    report.samples=await page.evaluate(()=>__nativeVRoidStudy.samples);
    assert.ok(report.samples.some(s=>s.phase==='walk'&&s.motion.moving),'Candidate has no actual walking sample');
    assert.ok(report.walkEnd.updates>report.standing.updates);assert.deepEqual(report.errors,[]);
    report.status=report.expressions.every(e=>e.supported)?'shared-motion-overlay-observed-visual-and-full-admission-pending':'overlay-observed-expression-gaps';
  }catch(error){report.status='failed-or-incomplete';report.error=String(error.stack??error);process.exitCode=1;try{await capture('failure');}catch{}}
  finally {
    try{report.finalCandidate=await page.evaluate(()=>__nativeVRoidStudy?.snapshot());await page.evaluate(()=>{__nativeVRoidStudy?.dispose();document.querySelector('#native-vroid-study-note')?.remove();});}catch{}
    try {
      const video=page?.video();await context?.close();
      if(video){await video.saveAs(path.join(out,'normal1x.webm'));await video.delete();}
    } catch(error) {
      report.status='failed-or-incomplete';report.videoError=String(error.stack??error);process.exitCode=1;
    } finally {await close();}
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  }
  console.log(JSON.stringify({status:report.status,error:report.error}));
}

if(require.main===module){
  const [mode,first,second]=process.argv.slice(2);
  const task=mode==='--prepare'&&first?prepare(path.resolve(first)):
    mode==='--run'&&first&&second?run(path.resolve(first),path.resolve(second)):
    Promise.reject(Error('Usage: node scripts/qa-native-vroid-study.cjs --prepare NEW_OUT | --run FILLED_REQUEST.json NEW_OUT'));
  task.catch(error=>{console.error(error.stack??error);process.exitCode=1;});
}
module.exports={vrmMetadata,requestTemplate};
