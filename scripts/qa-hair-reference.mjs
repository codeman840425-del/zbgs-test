// Real original VRM + real ponytail, testing reference covariance on CPU.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'evidence/m2-hair-head-reference-v1');
const base = path.join(root, 'assets-source/m2-long-hair-v1/revisions/raw-head-reference-v3');
const flag = process.argv.indexOf('--modules-root');
const modules = flag < 0 ? path.join(root, 'prototype/node_modules') : path.resolve(process.argv[flag+1]);
const uri = name => pathToFileURL(path.join(modules, name)).href;
const THREE = await import(uri('three/build/three.module.js'));
const {GLTFLoader} = await import(uri('three/examples/jsm/loaders/GLTFLoader.js'));
const {VRMLoaderPlugin, VRMUtils} = await import(uri('@pixiv/three-vrm/lib/three-vrm.module.js'));
const sha = data => createHash('sha256').update(data).digest('hex');
const moduleUrl = text => 'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
const springBytes = await fs.readFile(path.join(root,'prototype/src/hair-spring.js'));
const springUrl = moduleUrl(springBytes.toString().replace("from 'three'", `from '${uri('three/build/three.module.js')}'`)
  .replace("from '@pixiv/three-vrm'", `from '${uri('@pixiv/three-vrm/lib/three-vrm.module.js')}'`));
const {createHairSpring,validateHairSkin,validateHairSpringConfig} = await import(springUrl);
const contract = (await fs.readFile(path.join(root,'prototype/src/hair-fit-contract.js'),'utf8'))
  .replace("from './hairstyle-catalog.js'", `from '${pathToFileURL(path.join(root,'prototype/src/hairstyle-catalog.js')).href}'`)
  .replace("from './hair-spring.js'", `from '${springUrl}'`);
const {validateHairFitData,validateHairSelection} = await import(moduleUrl(contract));
const fit = JSON.parse(await fs.readFile(path.join(base,'fit.json'),'utf8'));
const manifest = JSON.parse(await fs.readFile(path.join(base,'manifest.json'),'utf8'));
const oldBase = path.join(root,'assets-source/m2-long-hair-v1/revisions/rootjoin-v2');
const oldFitBytes = await fs.readFile(path.join(oldBase,'fit.json')), oldManifestBytes = await fs.readFile(path.join(oldBase,'manifest.json'));
const oldFit = JSON.parse(oldFitBytes), oldManifest = JSON.parse(oldManifestBytes);
const checks = [];
const unchanged = structuredClone(fit.dynamics); delete unchanged.simulationReference;
assert.deepEqual(unchanged,oldFit.dynamics);
assert.equal(sha(oldFitBytes),'5e6d7499852ffc6198e6c7190a50cf5b55abd51f535c038044201b1cd9ada04f');
assert.equal(sha(oldManifestBytes),'28337f44c1d297f2657b8ca32466e0c3b9e0cfceb17c39bda019fc19bfb48b9d');
assert.equal(manifest.id,fit.styleId); assert.equal(fit.version,3); assert.equal(fit.id,'female-ponytail-headref-v3-fit');
assert.equal(manifest.sha256,oldManifest.sha256); assert.equal(manifest.url,oldManifest.url);
const entry = {id:manifest.id,fit:manifest.fit,sourceBodySha256:fit.sourceBodySha256,assetSha256:manifest.sha256,sourceMaterial:manifest.sourceMaterial};
validateHairFitData(fit,entry,fit.targetBodySha256,manifest);
assert.throws(()=>validateHairFitData(fit,{...entry,fit:oldManifest.fit},fit.targetBodySha256,manifest));
assert.throws(()=>validateHairSelection(fit.targetBodySha256,manifest.id));
for (const value of [null,undefined,'head','world',0,{}]) assert.throws(()=>validateHairSpringConfig({...fit.dynamics,simulationReference:value}));
checks.push('new exact fit validates; old fit identity and current default catalog reject it; unsupported reference values reject');
globalThis.self = {URL:globalThis.URL};
const bodyBytes = await fs.readFile(path.join(root,'prototype/public/assets/foundation/base-female-roundtrip.vrm'));
const hairBytes = await fs.readFile(path.join(oldBase,'female-ponytail.glb'));
assert.equal(sha(bodyBytes),fit.targetBodySha256); assert.equal(sha(hairBytes),fit.assetSha256);
async function parse(data,body=false) {
  const loader = new GLTFLoader(); if(body) loader.register(parser=>new VRMLoaderPlugin(parser));
  loader.register(()=>({name:'CPUTextureFixture',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
  return loader.parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
}
async function actor(config) {
  const vrm = (await parse(bodyBytes,true)).userData.vrm; VRMUtils.rotateVRM0(vrm); vrm.update(0);
  const gltf = await parse(hairBytes), meshes=[]; gltf.scene.traverse(n=>{if(n.isMesh)meshes.push(n);});
  validateHairSkin(gltf.scene,meshes);
  const head=vrm.humanoid.getRawBoneNode('head'),chest=vrm.humanoid.getRawBoneNode('chest'),hips=vrm.humanoid.getRawBoneNode('hips');
  head.add(gltf.scene); vrm.scene.updateWorldMatrix(true,true);
  const before=[head.children.length,chest.children.length];
  const spring=createHairSpring({vrm,scene:gltf.scene,config}); spring.reset();
  assert.equal(spring.getState().jointCount,6); assert.equal(spring.getState().bodyColliderCount,3);
  return {vrm,head,chest,hips,scene:gltf.scene,mesh:meshes[0],spring,before,hipY:hips.position.y};
}
const actors=[];
try {
  const moving=await actor(fit.dynamics),stationary=await actor(fit.dynamics),legacy=await actor(oldFit.dynamics),explicit=await actor({...oldFit.dynamics,simulationReference:'avatar-scene'});
  actors.push(moving,stationary,legacy,explicit);
  assert.equal(moving.spring.getState().simulationFrame,'raw-head'); assert.equal(legacy.spring.getState().simulationFrame,'avatar-scene');
  let rawDifference=0,legacyExplicitDifference=0,fixtureResponse=0;
  for(let i=0;i<180;i++) {
    const t=Math.min(1,i/120),drop=.3*t*t*(3-2*t);
    for(const a of [moving,legacy,explicit])a.hips.position.y=a.hipY-drop;
    for(const a of actors){a.vrm.scene.updateWorldMatrix(true,true);a.spring.update(1/120);}
    const a=moving.spring.getState().localRotations.flat(),b=stationary.spring.getState().localRotations.flat(),c=legacy.spring.getState().localRotations.flat(),d=explicit.spring.getState().localRotations.flat();
    rawDifference=Math.max(rawDifference,...a.map((v,k)=>Math.abs(v-b[k])));
    legacyExplicitDifference=Math.max(legacyExplicitDifference,...c.map((v,k)=>Math.abs(v-d[k])));
    fixtureResponse=Math.max(fixtureResponse,...c.map((v,k)=>Math.abs(v-b[k])));
  }
  assert(rawDifference<1e-9); assert(legacyExplicitDifference<1e-12); assert(fixtureResponse>.001);
  const dynamics=moving.spring.getState(); assert(dynamics.localRotations.flat().every(Number.isFinite));
  assert(Math.max(...dynamics.localRotations.map(q=>Math.hypot(...q.slice(0,3))))>.0001);
  const inverse=moving.head.userData.inverseCacheProxy.inverse;
  const identity=new THREE.Matrix4().multiplyMatrices(inverse,moving.head.matrixWorld);
  assert(Math.max(...identity.elements.map((v,i)=>Math.abs(v-(i%5===0?1:0))))<1e-10);
  checks.push('actual six-joint asset with unchanged three body colliders: raw-head history is invariant to common head/chest rigid translation; legacy remains sensitive');
  checks.push('omitted reference equals explicit avatar-scene and original force/collider settings remain byte-derived unchanged');
  const peer=stationary.spring.getState(); moving.spring.update(0); assert.deepEqual(moving.spring.getState(),dynamics);
  moving.spring.update(1/120,false); const disabled=moving.spring.getState();moving.spring.update(1/120,false);assert.deepEqual(moving.spring.getState(),disabled);
  moving.spring.update(1/120,true); moving.spring.reset(); const reset=moving.spring.getState().localRotations;moving.spring.reset();assert.deepEqual(moving.spring.getState().localRotations,reset);
  assert.deepEqual(stationary.spring.getState(),peer);
  const childCounts=[moving.head.children.length,moving.chest.children.length];
  assert.throws(()=>createHairSpring({vrm:{scene:moving.vrm.scene,humanoid:{getRawBoneNode:()=>null}},scene:moving.scene,config:fit.dynamics}),/raw head/);
  assert.deepEqual([moving.head.children.length,moving.chest.children.length],childCounts);
  const fallback=createHairSpring({vrm:{humanoid:moving.vrm.humanoid},scene:moving.scene,config:oldFit.dynamics});
  assert.equal(fallback.getState().simulationFrame,'world');fallback.dispose();
  checks.push('inverse cache follows changed head matrix; zero delta, toggle/reset, missing head, legacy world fallback and peer isolation checked');
  const ready=['fit.json','manifest.json'];
  const prior=await Promise.all(ready.map(async name=>({name,data:await fs.readFile(path.join(base,name)),mtime:(await fs.stat(path.join(base,name))).mtimeMs})));
  execFileSync('python',['-B',path.join(root,'scripts/m2-long-hair-v1/raw-head-reference-v3.py')],{cwd:root});
  for(const p of prior){assert(p.data.equals(await fs.readFile(path.join(base,p.name))));assert.equal((await fs.stat(path.join(base,p.name))).mtimeMs,p.mtime);}
  for(const a of actors){a.spring.dispose();a.spring.dispose();assert.deepEqual([a.head.children.length,a.chest.children.length],a.before);}
  checks.push('same-byte generation preserves mtimes; repeated dispose restores owned collider counts');
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({passed:true,checks,bodySha256:sha(bodyBytes),assetSha256:sha(hairBytes),
    fitSha256:sha(await fs.readFile(path.join(base,'fit.json'))),manifestSha256:sha(await fs.readFile(path.join(base,'manifest.json'))),runtimeSha256:sha(springBytes),
    fixture:{rigidLocalBodyDropM:.3,updates:180,dt:1/120,rawHeadMaxLocalQuaternionDifference:rawDifference,legacyVsExplicitMaxDifference:legacyExplicitDifference,legacyTranslationResponse:fixtureResponse},
    officialSharedCache:'inverseCacheProxy remains on its center node; deleting joints preserves shared cache for other official managers',
    CPUOnly:true,actualCapturedTrajectoryReplayed:false,limits:['Real original VRM and replacement GLB with 1x1 texture fixture. Rigid translation covariance only. No room or exact captured-trajectory replay.',
      'Raw-head reference may reduce desired head-driven inertia. Naturalness, rotation/seat contacts, walk/run, reset/recipe and hat compatibility require root comparison.'],runtimeAccepted:false},null,2)+'\n');
  console.log(JSON.stringify({passed:true,checks,rawDifference,legacyExplicitDifference,fixtureResponse}));
} finally {
  for(const a of actors){a.spring.dispose();a.scene.removeFromParent();VRMUtils.deepDispose(a.scene);VRMUtils.deepDispose(a.vrm.scene);}
}
