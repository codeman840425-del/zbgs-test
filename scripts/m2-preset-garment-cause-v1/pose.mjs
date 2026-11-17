// Read-only CPU pose probe. No renderer or browser is created.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
registerHooks({load(url,context,next){
  return next(url,url.endsWith('.json')?{...context,importAttributes:{type:'json'}}:context);
}});
const {loadGeometryAvatar, THREE}=await import('../headless-avatar-node.mjs');
const {createMotion}=await import('../../prototype/src/motion.js');

const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, 'evidence/m2-preset-garment-cause-v1');
fs.mkdirSync(output, {recursive:true});
const captured = JSON.parse(fs.readFileSync(path.join(root,
  'evidence/m2-preset-visual-triage-v1/capture-report.json')));
const pins = Object.fromEntries([
  'scripts/headless-avatar-node.mjs', 'prototype/src/motion.js',
  'prototype/src/m1-equipment.js', 'prototype/src/equipment.js',
  'prototype/src/foundation-avatar.js',
].map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]));
for (const body of ['male','male-wide-muscular-v2']) {
  const entry = captured.cases.find(c=>c.body===body);
  const snapshot = entry.views.find(v=>v.name==='half-front').cameraState.snapshot;
  const {avatar:a,motions} = await loadGeometryAvatar(body);
  let motion;
  try {
    a.setDebugBody(false);
    a.setExpression('neutral');
    motion = createMotion(a.vrm,a.root,motions,a.profile.motion);
    motion.reset();
    a.root.position.fromArray(snapshot.position);
    a.root.rotation.y=snapshot.facing;
    const elapsed=snapshot.motion.actionTime;
    // Preserve the controller's bounded dt. Browser frame history and live IK
    // cache are not claimed reproduced by this virtual equal-time control.
    let remaining=elapsed;
    while (remaining>1e-12) {
      const dt=Math.min(remaining,1/120);
      motion.update(dt,{action:'idle',moving:false,speed:0,distanceDelta:0});
      a.update(0,{action:'idle'});
      remaining-=dt;
    }
    a.root.updateWorldMatrix(true,true);
    const meshes=[];
    a.root.traverse(mesh=>{
      if (!mesh.isSkinnedMesh) return;
      mesh.skeleton.update();
      const geometry=mesh.geometry;
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      const names=materials.map(m=>m.name);
      if (!names.some(n=>n.includes('Body_00_SKIN')||n.includes('Tops_01_CLOTH'))) return;
      const world=[];
      for(let i=0;i<geometry.attributes.position.count;i++) {
        const p=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
        world.push(p.toArray());
      }
      let visible=true;
      for(let node=mesh;node;node=node.parent) visible&&=node.visible;
      meshes.push({name:mesh.name,materialNames:names,visible,
        positions:Array.from(geometry.attributes.position.array),
        worldPositionsM:world,indices:Array.from(geometry.index.array),
        bindMatrix:mesh.bindMatrix.toArray(),bindMatrixInverse:mesh.bindMatrixInverse.toArray(),
        matrixWorld:mesh.matrixWorld.toArray(),
        joints:Array.from(geometry.attributes.skinIndex.array),
        weights:Array.from(geometry.attributes.skinWeight.array),
        bones:mesh.skeleton.bones.map((bone,i)=>({name:bone.name,
          matrixWorld:bone.matrixWorld.toArray(),inverseBind:mesh.skeleton.boneInverses[i].toArray()})),
        groups:geometry.groups,
        role:mesh.userData.assetRole??null});
    });
    fs.writeFileSync(path.join(output,body+'-cpu-idle.json'),JSON.stringify({
      schema:'garment-cause-cpu-idle-probe-v1',body,sourcePins:pins,
      avatarSha256:a.profile.sha256,elapsed,frameHistoryReproduced:false,
      textureDecoding:'headless 1x1 fixture; geometry only',
      sourceCaptureBuild:captured.build,camera:snapshot.camera,
      controllerMetrics:motion.getMetrics(),equipment:a.getOutfitInfo(),meshes,
    }));
    console.log(JSON.stringify({body,meshes:meshes.length,elapsed}));
  } finally {motion?.dispose();a.dispose();}
}
