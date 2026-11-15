import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {createBodyCoverage,completeBodyGeometry} from '../../prototype/src/body-coverage.js';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const root=new URL('../../',import.meta.url),out=new URL('./',import.meta.url);
const geometry=new T.BufferGeometry();
geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,1,0],3));
geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute([0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0],4));
geometry.setAttribute('skinWeight',new T.Float32BufferAttribute([.2,.8,0,0,.6,.4,0,0,.5,.5,0,0,.7,.3,0,0],4));
geometry.setIndex(new T.Uint32BufferAttribute([0,1,2,0,2,3],1));
geometry.addGroup(0,6,0);geometry.addGroup(0,6,1);
geometry.morphAttributes.position=[new T.Float32BufferAttribute([0,.1,0,0,.05,0,0,.04,0,0,.07,0],3)];geometry.morphTargetsRelative=true;
const material=new T.MeshBasicMaterial();material.name='body';
function instance(x){const scene=new T.Group();scene.position.set(x,.1,-.2);scene.rotation.y=.3;const a=new T.Bone(),b=new T.Bone();a.add(b);b.position.y=.3;scene.add(a);scene.updateMatrixWorld(true);const mesh=new T.SkinnedMesh(geometry,[material,material]);scene.add(mesh);const sk=new T.Skeleton([a,b]);mesh.bind(sk,scene.matrixWorld.clone());mesh.morphTargetInfluences[0]=.4;return {scene,a,b,mesh};}
const A=instance(1),B=instance(-2);
const originalHashes=()=>Object.fromEntries(Object.entries(geometry.attributes).map(([k,a])=>[k,sha(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength))]));
const before=originalHashes();
const config={schema:'zbgs-outfit-body-coverage-candidate.1',id:'independent-fixture',avatarSha256:'body',topId:'top',topSha256:'top-sha',bodyMaterial:'body',bodyFaceCount:2,bodyIndexComponentType:5125,bodyIndexAccessorSha256:sha(Buffer.from(geometry.index.array.buffer)),selectedFaceIds:[0],selectedTriangles:[[0,1,2]]};
const bytes=Buffer.from(JSON.stringify(config)),previous=globalThis.fetch;globalThis.fetch=async()=>new Response(bytes);
const create=body=>createBodyCoverage({body,avatarSha256:'body',topEntry:{id:'top',sha256:'top-sha'},descriptor:{url:'fixture',sha256:sha(bytes)}});
let c,d,disposedCovered=0,disposedOriginal=0;geometry.addEventListener('dispose',()=>disposedOriginal++);
const checks=[];
try{
 c=await create([A.mesh]);c.setEnabled(true);const covered=A.mesh.geometry;covered.addEventListener('dispose',()=>disposedCovered++);
 assert.equal(B.mesh.geometry,geometry);assert.notEqual(covered,geometry);assert.notEqual(covered.attributes.skinWeight,geometry.attributes.skinWeight);
 checks.push('Shared source remains complete; covered geometry/weights are per-instance clones');
 d=await create([B.mesh]);d.setEnabled(true);assert.notEqual(A.mesh.geometry,B.mesh.geometry);d.setEnabled(false);assert.equal(B.mesh.geometry,geometry);assert.equal(A.mesh.geometry,covered);
 checks.push('Two active controllers independently toggle geometry');
 A.a.rotation.z=.2;A.b.rotation.x=.5;A.scene.updateMatrixWorld(true);A.mesh.skeleton.update();
 const got=Array.from({length:4},(_,i)=>A.mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(A.mesh.matrixWorld));
 c.setEnabled(false);A.scene.updateMatrixWorld(true);const expected=Array.from({length:4},(_,i)=>A.mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(A.mesh.matrixWorld));
 const maxSkinDelta=Math.max(...got.map((v,i)=>v.distanceTo(expected[i])));assert.equal(maxSkinDelta,0);
 c.setEnabled(true);assert.equal(completeBodyGeometry(A.mesh).index.count,6);assert.equal(A.mesh.geometry.index.count,3);
 // The removed face uniquely references vertex 1. Full accessor keeps it available.
 assert(new Set(completeBodyGeometry(A.mesh).index.array).has(1));assert(!new Set(A.mesh.geometry.index.array).has(1));
 checks.push('Mixed weighted skin plus morph preserves every vertex, including hidden-face-only vertex; world delta exactly 0');
 await assert.rejects(create([A.mesh]));assert.equal(A.mesh.geometry,covered);checks.push('Sequential duplicate coverage rejects without replacing active instance');
 c.dispose();c.dispose();assert.equal(A.mesh.geometry,geometry);assert.equal(completeBodyGeometry(A.mesh),geometry);assert.equal(disposedCovered,1);assert.equal(disposedOriginal,0);assert.deepEqual(originalHashes(),before);
 checks.push('Double disposal restores original exact attributes and disposes only covered geometry once');
 const report={passed:true,checks,maxSkinDelta,disposedCovered,disposedOriginal,sourceHashes:Object.fromEntries(['prototype/src/body-coverage.js','prototype/src/m1-equipment.js','prototype/src/motion.js','scripts/qa-body-coverage.mjs'].map(p=>[p,sha(fs.readFileSync(new URL(p,root)))])),scriptSHA:sha(fs.readFileSync(import.meta.filename)),limits:['No factory/browser/network timing test; source integration separately reviewed.','Coverage changes triangle enumeration in mesh.geometry; completeBodyGeometry must be used for full-body triangle probes.']};
 fs.writeFileSync(new URL('additional-regression.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{c?.dispose();d?.dispose();globalThis.fetch=previous;}
