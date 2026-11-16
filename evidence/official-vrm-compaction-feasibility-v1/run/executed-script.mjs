// CPU feasibility only: call the installed official utility, never a custom compactor.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import {createFacialGeometry} from '../../prototype/src/facial-geometry.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.resolve(process.argv[2]||'');
assert(process.argv[2]&&!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={officialDocs:'https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMUtils.html',three:'0.187.0',threeVRM:'3.5.5',utilitySHA256:sha(fs.readFileSync(path.join(root,'prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js'))),facialModuleSHA256:sha(fs.readFileSync(path.join(root,'prototype/src/facial-geometry.js'))),scope:'Original male/female; actual GLTFLoader/VRMLoaderPlugin; texture decoding replaced by empty Texture. Official removeUnnecessaryVertices only. No combineMorphs, skeleton change, GPU or product writes.',bodies:[]};
function load(bytes){const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));loader.register(()=>({name:'CPUTexturePlaceholder',loadTexture:()=>Promise.resolve(new THREE.Texture())}));return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'/assets/foundation/');}
function meshes(vrm){const a=[];vrm.scene.traverse(m=>{if(m.isMesh)a.push(m);});return a;}
function attrsEqual(old,next,map){
 assert.equal(next.itemSize,old.itemSize);assert.equal(next.normalized,old.normalized);assert.equal(next.count,map.length);
 assert.equal(next.array?.constructor||next.data.array.constructor,old.array?.constructor||old.data.array.constructor);
 for(let v=0;v<map.length;v++)for(let c=0;c<old.itemSize;c++)assert(Object.is(next.getComponent(v,c),old.getComponent(map[v],c)),'Attribute remap differs');
}
function textureBytes(g,max,stride){const targets=(g.morphAttributes.position||g.morphAttributes.normal||[]).length;if(!targets)return 0;const n=g.attributes.position.count*stride;return Math.min(n,max)*Math.ceil(n/max)*16*targets;}
globalThis.fetch=async url=>new Response(fs.readFileSync(path.join(root,'prototype/public',String(url).slice(1))));
try{
 for(const sex of ['female','male']){
  const file=path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`),bytes=fs.readFileSync(file),a=(await load(bytes)).userData.vrm,b=(await load(bytes)).userData.vrm;
  VRMUtils.rotateVRM0(a);VRMUtils.rotateVRM0(b);
  const am=meshes(a),bm=meshes(b);assert.equal(am.length,bm.length);
  const before=bm.map(m=>({mesh:m,g:m.geometry,skeleton:m.skeleton,bind:m.bindMatrix?.toArray(),inverse:m.bindMatrixInverse?.toArray(),materials:m.material,dictionary:JSON.stringify(m.morphTargetDictionary),influences:m.morphTargetInfluences?.slice()}));
  const disposed=new Map();for(const s of before)if(!disposed.has(s.g)){disposed.set(s.g,0);s.g.addEventListener('dispose',()=>disposed.set(s.g,disposed.get(s.g)+1));}
  const begin=performance.now();VRMUtils.removeUnnecessaryVertices(b.scene);const cpuMs=performance.now()-begin;
  const rows=[];
  for(let i=0;i<before.length;i++){
   const s=before[i],m=bm[i],old=s.g,g=m.geometry;
   assert.equal(m,s.mesh);assert.equal(m.skeleton,s.skeleton);assert.equal(m.material,s.materials);assert.deepEqual(m.bindMatrix?.toArray(),s.bind);assert.deepEqual(m.bindMatrixInverse?.toArray(),s.inverse);assert.equal(JSON.stringify(m.morphTargetDictionary),s.dictionary);assert.deepEqual(m.morphTargetInfluences,s.influences);
   assert(old.index&&g.index);const used=[...new Set(old.index.array)].sort((x,y)=>x-y),map=Array.from(used);
   assert.equal(g.index.count,old.index.count);for(let j=0;j<g.index.count;j++)assert.equal(map[g.index.array[j]],old.index.array[j]);
   assert.deepEqual(Object.keys(g.attributes),Object.keys(old.attributes));for(const k of Object.keys(old.attributes))attrsEqual(old.attributes[k],g.attributes[k],map);
   const dropped=[];
   for(const [k,targets]of Object.entries(old.morphAttributes)){
    if(g.morphAttributes[k]){assert.equal(g.morphAttributes[k].length,targets.length);targets.forEach((attr,t)=>attrsEqual(attr,g.morphAttributes[k][t],map));}
    else {for(const attr of targets)for(const v of used)for(let c=0;c<attr.itemSize;c++)assert.equal(attr.getComponent(v,c),0);dropped.push({semantic:k,targetCount:targets.length,allReferencedComponentsExactlyZero:true});}
   }
   assert.deepEqual(g.groups,old.groups);assert.deepEqual(g.drawRange,old.drawRange);assert.equal(g.morphTargetsRelative,old.morphTargetsRelative);assert.deepEqual(g.boundingBox,old.boundingBox);assert.deepEqual(g.boundingSphere,old.boundingSphere);
   assert.equal(disposed.get(old),g===old?0:1);
   rows.push({mesh:i,name:m.name,materials:(Array.isArray(m.material)?m.material:[m.material]).map(m=>m.name),isFace:!!old.morphAttributes.position,oldVertices:old.attributes.position.count,newVertices:g.attributes.position.count,indexCount:g.index.count,oldIndexSHA256:sha(old.index.array),newIndexSHA256:sha(g.index.array),newToOld:map,oldMorphTargets:old.morphAttributes.position?.length||0,newMorphTargets:g.morphAttributes.position?.length||0,droppedAllZeroMorphs:dropped,oldDisposed:disposed.get(old),geometryReplaced:g!==old,allAttributesAndMorphsReferencedExact:true,trianglesPreserved:true,groupsAndDrawRangeExact:true,skeletonBindingAndMeshReferenceExact:true});
  }
  const names=Object.keys(a.expressionManager.expressionMap),expressions=[];
  for(const name of [...names,'mixed']){
   for(const n of names){a.expressionManager.setValue(n,0);b.expressionManager.setValue(n,0);}
   for(const [k,v]of Object.entries(name==='mixed'?{happy:.65,blink:.999,aa:.512}:{[name]:1})){a.expressionManager.setValue(k,v);b.expressionManager.setValue(k,v);}
   a.expressionManager.update();b.expressionManager.update();
   for(let i=0;i<am.length;i++)assert.deepEqual(am[i].morphTargetInfluences,bm[i].morphTargetInfluences);
   expressions.push({name,meshInfluencesExact:true});
  }
  const costs=[2048,4096,8192,16384].map(max=>{
   const face=rows.filter(r=>r.isFace),total=(which,stride)=>face.reduce((sum,r)=>sum+textureBytes(which==='old'?before[r.mesh].g:bm[r.mesh].geometry,max,stride),0);
   return {maxTextureSize:max,oldPositionOnlyFaceBytes:total('old',1),compactedPositionOnlyFaceBytes:total('new',1),oldHypotheticalPositionNormalAllFaceBytes:total('old',2),compactedHypotheticalPositionNormalAllFaceBytes:total('new',2),meaning:'Each value is theoretical CPU backing and GPU base texture bytes separately; all-zero dropped primitives have no morph texture. Not actual VRAM.'};
  });
  const api=createFacialGeometry({vrm:b,avatarSha256:sha(bytes)}),edit=await api.set({mouthWidth:-.12});assert.equal(edit.applied,false,'Current canonical-source contract must reject compact geometry');api.dispose();
  report.bodies.push({sex,assetSHA256:sha(bytes),utilityCPUms:cpuMs,rows,expressions,textureCosts:costs,currentEditorAttempt:edit,faceVertexSumBefore:rows.filter(r=>r.isFace).reduce((s,r)=>s+r.oldVertices,0),faceVertexSumAfter:rows.filter(r=>r.isFace).reduce((s,r)=>s+r.newVertices,0),facesWithDroppedMorphs:rows.filter(r=>r.isFace&&r.droppedAllZeroMorphs.length).map(r=>r.mesh)});
  VRMUtils.deepDispose(a.scene);VRMUtils.deepDispose(b.scene);assert.equal(sha(fs.readFileSync(file)),sha(bytes));
 }
 report.status='passed-feasibility-current-editor-rejection-expected';
}catch(e){report.status='failed';report.error=String(e);process.exitCode=1;console.error(e);}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));fs.copyFileSync(fileURLToPath(import.meta.url),path.join(out,'executed-script.mjs'));
console.log(JSON.stringify({status:report.status,bodies:report.bodies.map(b=>({sex:b.sex,faceVertices:[b.faceVertexSumBefore,b.faceVertexSumAfter],faceTargets:b.rows.filter(r=>r.isFace).map(r=>({mesh:r.mesh,vertices:r.newVertices,targets:r.newMorphTargets})),editor:b.currentEditorAttempt,cost:b.textureCosts.find(c=>c.maxTextureSize===16384)}))}));
