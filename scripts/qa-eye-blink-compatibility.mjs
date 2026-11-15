// Actual GLTFLoader/three-vrm/foundation/live CPU readback; textures are stubbed,
// no rendering or shader acceptance. Does not modify source assets.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {registerHooks} from 'node:module';import {fileURLToPath} from 'node:url';
registerHooks({load(url,context,next){if(url.endsWith('.json'))return{format:'module',source:'export default '+fs.readFileSync(new URL(url),'utf8'),shortCircuit:true};return next(url,context)}});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),oi=process.argv.indexOf('--out'),out=oi<0?path.join(root,'evidence/eye-blink-compatibility-v1'):path.resolve(root,process.argv[oi+1]);
if(fs.existsSync(path.join(out,'cpu.json')))throw Error('Refuse overwrite');fs.mkdirSync(out,{recursive:true});
await import('./headless-avatar-node.mjs');globalThis.location={search:''};
const {THREE}=await import('./headless-avatar-node.mjs'),{loadFoundationAvatar}=await import('../prototype/src/foundation-avatar.js'),{createEyeBlinkCompatibility}=await import('../prototype/src/eye-blink-compatibility.js');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),NAME='workbenchJoyBlinkCompensationV1',rows=[];
const renderer={compileAsync:async()=>{}};
const load=bodyType=>loadFoundationAvatar({scene:new THREE.Scene(),renderer,bodyType});
const faces=a=>{const r=[];a.vrm.scene.traverse(m=>{if(m.isMesh&&m.morphTargetDictionary&&Object.keys(m.morphTargetDictionary).some(n=>n.endsWith('_Fcl_EYE_Joy')))r.push(m);});return r;};
function packed(a){const x=new Float32Array(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let j=0;j<a.itemSize;j++)x[i*a.itemSize+j]=a.getComponent(i,j);return x;}
const fingerprint=meshes=>meshes.map(m=>{const g=m.geometry;return{uuid:g.uuid,index:sha(g.index.array),attributes:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,sha(packed(a))])),morphs:Object.fromEntries(Object.entries(g.morphAttributes).map(([k,aa])=>[k,aa.map(a=>sha(packed(a)))])),dictionary:{...m.morphTargetDictionary}};});
function appearanceSamples(meshes){return meshes.map(m=>{
 const ids=[...new Set(m.geometry.index.array)],p=[],n=[],normal=m.geometry.attributes.normal,targets=m.geometry.morphAttributes.normal||[];
 for(const i of ids){p.push(...m.getVertexPosition(i,new THREE.Vector3()).toArray());for(let c=0;c<3;c++){let value=normal.getComponent(i,c);for(let j=0;j<targets.length;j++)value+=m.morphTargetInfluences[j]*targets[j].getComponent(i,c);n.push(value);}}
 return{uuid:m.uuid,p,n};
 });}
function weights(a,h,b,aa){const e=a.vrm.expressionManager;e.resetValues();e.setValue('happy',h);e.setValue('blink',b);e.setValue('aa',aa);}
const baseEye={};
for(const bodyType of ['female','male','m1a-jaw-v1','m1a-waisthip-v1','m2-male-jaw-v1']){
 const a=await load(bodyType),f=faces(a),state=a.livePresentation.getState().eyeBlinkCompatibility,e=a.vrm.expressionManager;
 assert.equal(state.available,true,JSON.stringify(state));assert.equal(f.length,9);assert.equal(new Set(f.map(m=>m.morphTargetInfluences)).size,9);
 const target=new Set(state.targetedMeshes.map(x=>x.uuid)),protectedMeshes=f.filter(m=>!target.has(m.uuid));assert.equal(protectedMeshes.length,5);
 const peer=await load(bodyType),pf=faces(peer);assert(f.every(m=>pf.every(p=>m.morphTargetInfluences!==p.morphTargetInfluences)));
 const initial=fingerprint(f),counts=f.map(m=>m.geometry.morphAttributes.position.length);const scenarios=[];
 const family=a.config.referenceBody||bodyType,eye=packed(f[0].geometry.morphAttributes.position[state.eyeTargetIndex]);
 if(!baseEye[family])baseEye[family]=eye;let familyEyeDelta=0;for(let i=0;i<eye.length;i++)familyEyeDelta=Math.max(familyEyeDelta,Math.abs(eye[i]-baseEye[family][i]));assert(familyEyeDelta<3e-7);
 const samples=[['peak',.65,.998971,.511979],['half',.65,.5,.5],['open',.65,0,.6],['neutral-blink',0,1,0]];
 for(const edited of (bodyType==='female'||bodyType==='male')?[false,true]:[false]){
  if(edited)assert.equal((await a.facialGeometry.set({mouthWidth:.04,browSample:'height1-spacing1-v1',noseSample:'tip-forward05-v1',eyeSample:'aperture-width101-v1'})).applied,true);
  const geometryBefore=fingerprint(f);
  for(const [label,h,b,aa]of samples){
   weights(a,h,b,aa);a.livePresentation.setEyeBlinkCompatibility('legacy');a.livePresentation.refreshEyeBlinkCompatibility();const original=appearanceSamples(protectedMeshes),originalWeights=f.map(m=>m.morphTargetInfluences.slice());
   a.livePresentation.setEyeBlinkCompatibility('fixed');const fixedState=a.livePresentation.refreshEyeBlinkCompatibility();assert.equal(fixedState.coefficient,h*b);
   assert.deepEqual(appearanceSamples(protectedMeshes),original,'Rendered protected positions/normals changed');
   for(let j=0;j<f.length;j++)for(let i=0;i<counts[j];i++)assert.equal(f[j].morphTargetInfluences[i],i===state.eyeTargetIndex&&target.has(f[j].uuid)?(h*b===0?0:-h*b):originalWeights[j][i]);
   const after=f.map(m=>m.morphTargetInfluences.slice());for(let i=0;i<3;i++)a.livePresentation.refreshEyeBlinkCompatibility();assert.deepEqual(f.map(m=>m.morphTargetInfluences),after);
   for(const mesh of f)assert(appearanceSamples([mesh])[0].n.every(Number.isFinite));
   assert.deepEqual(fingerprint(f),geometryBefore,'Correction must not change geometry or morph arrays');
   scenarios.push({edited,label,h,b,aa,coefficient:fixedState.coefficient,protectedIndexedPositionsAndNormalsExact:true,geometryUnchanged:true});
  }
 }
 await a.facialGeometry.set({reset:true});assert.deepEqual(fingerprint(f),initial);
 // The real live update owns time/expression composition, not just a test formula.
 a.livePresentation.setExpression('happy');a.livePresentation.setSpeaking(true);const normalCycle=[];
 for(let i=0;i<25;i++){
  a.update(.18/24,{action:'idle'});const st=a.livePresentation.getState(),x=st.eyeBlinkCompatibility;
  assert.equal(e.getValue('happy'),.65);assert.equal(x.coefficient,e.getValue('happy')*e.getValue('blink'));
  normalCycle.push({time:st.time,happy:e.getValue('happy'),blink:e.getValue('blink'),coefficient:x.coefficient});
 }
 const beforePause=f.map(m=>m.morphTargetInfluences.slice()),time=a.livePresentation.getState().time;a.update(0,{action:'idle'});assert.equal(a.livePresentation.getState().time,time);assert.deepEqual(f.map(m=>m.morphTargetInfluences),beforePause);
 // Single-eye input is explicitly not generalized from the bilateral target.
 weights(a,.65,0,0);e.setValue('blinkLeft',1);a.livePresentation.refreshEyeBlinkCompatibility();assert.equal(a.livePresentation.getState().eyeBlinkCompatibility.skipped,'single-eye-expression-not-covered');assert(f.every(m=>m.morphTargetInfluences[state.eyeTargetIndex]===0));
 assert(pf.every(m=>m.morphTargetInfluences[state.eyeTargetIndex]===0));
 // Duplicate ownership fails closed without unregistering the active adapter.
 const duplicate=createEyeBlinkCompatibility({vrm:a.vrm,avatarSha256:a.profile.sha256});assert.equal(duplicate.getState().available,false);duplicate.dispose();assert(e.getExpression(NAME));
 weights(a,.65,1,0);a.livePresentation.refreshEyeBlinkCompatibility();a.livePresentation.dispose();assert.equal(e.getExpression(NAME),null);assert(f.every(m=>m.morphTargetInfluences[state.eyeTargetIndex]===0));
 const recreated=createEyeBlinkCompatibility({vrm:a.vrm,avatarSha256:a.profile.sha256});assert.equal(recreated.getState().available,true);recreated.dispose();assert.equal(e.getExpression(NAME),null);
 a.dispose();peer.dispose();rows.push({bodyType,avatarSha256:a.profile.sha256,initialState:state,sourceTargetCounts:counts,familyEyeDeltaMaxM:familyEyeDelta,scenarios,normalCycle,checks:['actual-GLTF-VRM-factory','nine-influence-arrays-independent','two-loaded-instance-isolation','actual-rendered-protected-positions-and-normals-exact','ALL-and-mouth-weights-kept','no-source-array-or-56-54-target-mutation','four-domain-geometry-replacement-and-reset','live-normal-timing','zero-time-repeat','explicit-single-eye-fallback','duplicate-owner-refused','dispose-clear-unregister-and-recreate']});
}
// Faults against actual loaded data. Known SHA is not enough to accept an invalid layout.
for(const fault of ['unknown-sha','shared-protected-array','shared-other-instance','occupied-eye-lane','wrong-target-count','wrong-happy-override']){
 const a=await load('female');a.livePresentation.dispose();const f=faces(a);let peer=null;
 if(fault==='shared-protected-array')f[4].morphTargetInfluences=f[1].morphTargetInfluences;
 if(fault==='shared-other-instance'){peer=await load('female');f[1].morphTargetInfluences=faces(peer)[1].morphTargetInfluences;}
 if(fault==='occupied-eye-lane')f[1].morphTargetInfluences[17]=.3;
 if(fault==='wrong-target-count')f[1].geometry.morphAttributes.position=f[1].geometry.morphAttributes.position.slice(1);
 if(fault==='wrong-happy-override')a.vrm.expressionManager.getExpression('happy').overrideBlink='block';
 const bad=createEyeBlinkCompatibility({vrm:a.vrm,avatarSha256:fault==='unknown-sha'?'0'.repeat(64):a.profile.sha256});assert.equal(bad.getState().available,false,fault);assert.equal(a.vrm.expressionManager.getExpression(NAME),null);bad.dispose();rows.push({fault,state:bad.getState(),rejected:true});a.dispose();peer?.dispose();
}
const files=['eye-blink-compatibility.js','live-presentation.js'];for(const file of files)fs.copyFileSync(path.join(root,'prototype/src',file),path.join(out,file));fs.copyFileSync(fileURLToPath(import.meta.url),path.join(out,'executed-check.mjs'));
const report={scope:'Actual immutable VRM bytes, GLTFLoader, three-vrm, foundation and live APIs. Image decoding stubbed; no GPU shading/alpha or visual acceptance. No animation loader or controllers altered.',sourceHashes:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(path.join(root,'prototype/src',f)))])),rows};fs.writeFileSync(path.join(out,'cpu.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,rows:rows.length,out,sourceHashes:report.sourceHashes},null,2));
