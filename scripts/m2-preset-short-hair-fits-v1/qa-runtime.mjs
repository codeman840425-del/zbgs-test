import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const runtimeRoot=path.resolve(process.argv[2]||'F:/gamemake');
const batchRoot=path.resolve(process.argv[3]||'F:/gamemake-representative-batch');
const base=path.join(root,'assets-source/m2-preset-short-hair-fits-v1');
const hook=registerHooks({resolve(s,c,next){return next(s,(s==='three'||s.startsWith('@pixiv/'))?{...c,parentURL:pathToFileURL(path.join(runtimeRoot,'prototype/src/hair-fit-contract.js')).href}:c);}});
const uri=p=>pathToFileURL(path.join(runtimeRoot,'prototype/node_modules',p)).href;
const THREE=await import(uri('three/build/three.module.js'));
const {GLTFLoader}=await import(uri('three/examples/jsm/loaders/GLTFLoader.js'));
const {VRMLoaderPlugin,VRMUtils}=await import(uri('@pixiv/three-vrm/lib/three-vrm.module.js'));
const {validateHairFitData,hairFitIdentity,sameHairFit}=await import(pathToFileURL(path.join(runtimeRoot,'prototype/src/hair-fit-contract.js')));
const read=p=>fs.readFile(p);
const json=async p=>JSON.parse(await read(p));
const sha=b=>createHash('sha256').update(b).digest('hex');
const buffer=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
globalThis.self={URL:globalThis.URL};
globalThis.ProgressEvent??=class{constructor(t,v){this.type=t;Object.assign(this,v);}};
async function parse(bytes,body=false){
 const loader=new GLTFLoader();
 if(body)loader.register(p=>new VRMLoaderPlugin(p));
 loader.register(()=>({name:'CPUTextureFixture',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));
 return loader.parseAsync(buffer(bytes),'');
}
const batch=await json(path.join(batchRoot,'assets-source/m2-representative-batch-v1/generated/manifest.json'));
const fits=[];
for(const group of ['ready','conditional']){
 const manifest=await json(path.join(base,group,'manifest.json'));
 fits.push(...manifest.results.map(row=>({...row,group})));
}
const spec=await json(path.join(base,'spec.json'));
const checks=[];
for(const row of fits){
 if(!['source-fit-ready','source-contact-candidate'].includes(row.status))continue;
 const target=batch.variants.find(v=>v.id===row.targetId);
 const source=spec.families[target.sex];
 const folder=path.join(base,row.group,row.targetId);
 const fitBytes=await read(path.join(folder,'fit.json'));
 const fit=JSON.parse(fitBytes),manifest=await json(path.join(folder,'manifest.json'));
 const bodyBytes=await read(path.join(batchRoot,target.avatar.path));
 const hairBytes=await read(path.join(root,source.asset));
 assert.equal(sha(bodyBytes),row.targetBodySha256);
 assert.equal(sha(hairBytes),manifest.sha256);
 assert.equal(sha(fitBytes),manifest.fit.sha256);
 assert.deepEqual(manifest.compatibleBodies,[sha(bodyBytes)]);
 const entry={id:manifest.id,sourceBodySha256:source.bodySha256,sourceMaterial:source.material,assetSha256:manifest.sha256,fit:manifest.fit};
 validateHairFitData(fit,entry,sha(bodyBytes),manifest);
 assert.throws(()=>validateHairFitData(fit,entry,source.bodySha256,manifest));
 assert.throws(()=>validateHairFitData({...fit,sourceBodySha256:'0'.repeat(64)},entry,sha(bodyBytes),manifest));
 const vrm=(await parse(bodyBytes,true)).userData.vrm;
 VRMUtils.rotateVRM0(vrm);vrm.update(0);
 const head=vrm.humanoid.getRawBoneNode('head');
 assert.equal(head.name,fit.rawBone);
 const hair=await parse(hairBytes),meshes=[];
 hair.scene.traverse(n=>{if(n.isMesh)meshes.push(n);});
 assert.equal(meshes.length,1);assert(!meshes[0].isSkinnedMesh);assert.equal(hair.animations.length,0);
 head.add(hair.scene);
 let finite=true;
 for(let i=0;i<4;i++){
  vrm.humanoid.getNormalizedBoneNode('head').rotation.set(.1*i,-.15*i,0);
  vrm.update(1/60);vrm.scene.updateMatrixWorld(true);
  const point=new THREE.Vector3();
  const positions=meshes[0].geometry.attributes.position;
  for(let k=0;k<positions.count;k++){
   point.fromBufferAttribute(positions,k).applyMatrix4(meshes[0].matrixWorld);
   finite&&=point.toArray().every(Number.isFinite);
  }
 }
 assert(finite);
 assert(sameHairFit(hairFitIdentity(entry),{kind:'explicit-fit-v1',id:fit.id,version:fit.version,sha256:sha(fitBytes)}));
 checks.push({targetId:row.targetId,sourceStatus:row.status,targetBodySha256:sha(bodyBytes),styleId:entry.id,fitSha256:sha(fitBytes),actualGLTFLoader:true,actualVRMLoader:true,exactContract:true,wrongBodyAndSourceRejected:true,posedHeadFinite:true});
 hair.scene.removeFromParent();VRMUtils.deepDispose(hair.scene);VRMUtils.deepDispose(vrm.scene);
}
hook.deregister();
const report={checks,passed:checks.length===8,contractSourceSha256:sha(await read(path.join(runtimeRoot,'prototype/src/hair-fit-contract.js'))),CPUOnly:true,runtimeAccepted:false,
 limits:['Eight actual target VRMs and exact existing hair GLBs. Texture decode uses CPU 1x1 placeholders.','Four normalized-head updates check finite mounting only. Root catalog admission, actual materials, facial expression combinations and game motion/contact acceptance remain pending.']};
await fs.writeFile(path.join(base,'runtime-readback.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({checkedTargets:checks.length,passed:report.passed}));
assert(report.passed);
