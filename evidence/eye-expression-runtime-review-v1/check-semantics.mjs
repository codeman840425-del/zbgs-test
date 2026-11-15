// Read-only source/library semantics fixture. No application runtime edits.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {VRMExpressionManager,VRMExpression,VRMExpressionMorphTargetBind} from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),rows=[];
function glb(file){const raw=fs.readFileSync(file),len=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+len)),bin=raw.subarray(28+len);
 function acc(id){const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],T={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[a.componentType],n={SCALAR:1,VEC3:3}[a.type];assert(T&&n&&!v.byteStride&&!a.sparse);const start=(v.byteOffset||0)+(a.byteOffset||0),b=bin.subarray(start,start+a.count*n*T.BYTES_PER_ELEMENT);return new T(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}return{raw,doc,acc};}
for(const sex of['female','male']){
 const g=glb(path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`)),m=g.doc.meshes.find(m=>m.name.startsWith('Face')),names=m.extras.targetNames;
 const find=s=>{const matches=names.map((n,i)=>n.endsWith(s)?i:-1).filter(i=>i>=0);assert.equal(matches.length,1);return matches[0];};
 const joy=find('ALL_Joy'),eye=find('EYE_Joy'),blink=find('EYE_Close'),aa=find('MTH_A');
 const meshes=m.primitives.map(p=>({name:g.doc.materials[p.material].name,morphTargetInfluences:Array(names.length).fill(0),index:g.acc(p.indices)}));
 const targeted=meshes.filter(mesh=>/_(Face_00_SKIN|EyeWhite_00_EYE|FaceEyeline_00_FACE|FaceEyelash_00_FACE)$/.test(mesh.name)),protectedMeshes=meshes.filter(m=>!targeted.includes(m));assert.equal(targeted.length,4);
 const a=new Set(targeted.flatMap(m=>[...m.index])),b=new Set(protectedMeshes.flatMap(m=>[...m.index]));assert.equal([...a].filter(i=>b.has(i)).length,0);
 const manager=new VRMExpressionManager();
 function add(name,index,weight,primitives){const e=new VRMExpression(name);e.addBind(new VRMExpressionMorphTargetBind({index,weight,primitives}));manager.registerExpression(e);return e;}
 add('happy',joy,1,meshes);add('blink',blink,1,meshes);add('aa',aa,1,meshes);
 const correction=add('fixtureJoyBlinkCorrection',eye,-1,targeted);
 manager.setValue('fixtureJoyBlinkCorrection',-.65);assert.equal(manager.getValue('fixtureJoyBlinkCorrection'),0);
 const h=.65,bw=.998971,aw=.511979;manager.setValue('happy',h);manager.setValue('blink',bw);manager.setValue('aa',aw);manager.setValue('fixtureJoyBlinkCorrection',h*bw);manager.update();
 for(const mesh of meshes){assert.equal(mesh.morphTargetInfluences[joy],h);assert.equal(mesh.morphTargetInfluences[blink],bw);assert.equal(mesh.morphTargetInfluences[aa],aw);assert.equal(mesh.morphTargetInfluences[eye],targeted.includes(mesh)?-h*bw:0);}
 const first=meshes.map(m=>m.morphTargetInfluences.slice());manager.update();assert.deepEqual(meshes.map(m=>m.morphTargetInfluences),first);
 const delta=g.acc(m.primitives[0].targets[eye].POSITION);let protectedMax=0,eyeMax=0;
 for(const mesh of meshes)for(const i of mesh.index){const w=mesh.morphTargetInfluences[eye];const dist=Math.hypot(delta[i*3]*w,delta[i*3+1]*w,delta[i*3+2]*w);if(targeted.includes(mesh))eyeMax=Math.max(eyeMax,dist);else protectedMax=Math.max(protectedMax,dist);}
 assert.equal(protectedMax,0);
 manager.setValue('fixtureJoyBlinkCorrection',0);manager.update();assert(meshes.every(m=>m.morphTargetInfluences[eye]===0));
 manager.setValue('fixtureJoyBlinkCorrection',h*bw);manager.update();correction.clearAppliedWeight();manager.unregisterExpression(correction);assert(meshes.every(m=>m.morphTargetInfluences[eye]===0));
 rows.push({sex,sourceSha256:sha(g.raw),targetCount:names.length,indices:{joy,eye,blink,aa},targetedMaterials:targeted.map(m=>m.name),protectedMaterials:protectedMeshes.map(m=>m.name),indexedDomainIntersection:0,protectedContributionMaxM:protectedMax,correctedEyeContributionMaxM:eyeMax,checks:['negative-manager-value-is-clamped','negative-existing-bind-coefficient-is-preserved','ALL-Joy-blink-aa-weights-unchanged','protected-primitive-no-correction','repeated-manager-update-no-accumulation','zero-and-unregister-clear']});
}
const report={scope:'Read-only actual source + installed three-vrm classes. Plain per-primitive influence fixtures; not actual loaded VRM/MToon/normal rendering acceptance.',librarySha256:sha(fs.readFileSync(path.join(root,'prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js'))),rows};
fs.writeFileSync(path.join(dir,'cpu-semantics.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
