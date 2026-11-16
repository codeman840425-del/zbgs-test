import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const runtimeRoot=path.resolve(process.argv[2]||'F:/gamemake');
const modules=path.join(runtimeRoot,'prototype/node_modules');
const uri=p=>pathToFileURL(path.join(modules,p)).href;
const hook=registerHooks({resolve(s,c,next){return next(s,(s==='three'||s.startsWith('@pixiv/'))?{...c,parentURL:pathToFileURL(path.join(runtimeRoot,'prototype/src/hair-spring.js')).href}:c);}});
const THREE=await import(uri('three/build/three.module.js'));
const {GLTFLoader}=await import(uri('three/examples/jsm/loaders/GLTFLoader.js'));
const {VRMLoaderPlugin,VRMUtils}=await import(uri('@pixiv/three-vrm/lib/three-vrm.module.js'));
const {validateHairFitData,hairFitIdentity,sameHairFit}=await import(pathToFileURL(path.join(runtimeRoot,'prototype/src/hair-fit-contract.js')));
const base=path.join(root,'assets-source/m2-medium-curly-hair-v1');
const read=p=>fs.readFile(p);const json=async p=>JSON.parse(await read(p));
const sha=b=>createHash('sha256').update(b).digest('hex');
const arrayBuffer=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
globalThis.self={URL:globalThis.URL};globalThis.ProgressEvent??=class{constructor(t,v){this.type=t;Object.assign(this,v);}};
async function parse(bytes,body=false){const loader=new GLTFLoader();if(body)loader.register(p=>new VRMLoaderPlugin(p));loader.register(()=>({name:'CPUTextureFixture',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));return loader.parseAsync(arrayBuffer(bytes),'');}
const spec=await json(path.join(base,'spec.json'));const body=await read(path.join(root,spec.source.path));assert.equal(sha(body),spec.source.sha256);
const vrm=(await parse(body,true)).userData.vrm;VRMUtils.rotateVRM0(vrm);vrm.update(0);
const head=vrm.humanoid.getRawBoneNode('head');const checks=[],assets=[];
const sourceMaterials=[];vrm.scene.traverse(n=>{for(const m of (Array.isArray(n.material)?n.material:[n.material]))if(m?.name===spec.sourceMaterial&&!sourceMaterials.includes(m))sourceMaterials.push(m);});assert(sourceMaterials.length);
const originalColor=sourceMaterials[0].color.toArray();
for(const preset of spec.presets){
 const folder=path.join(base,'budget',preset.id);const manifest=await json(path.join(folder,'manifest.json')),fitBytes=await read(path.join(folder,'fit.json')),fit=JSON.parse(fitBytes),bytes=await read(path.join(folder,'hair.glb'));
 assert.equal(sha(bytes),manifest.sha256);assert.equal(sha(fitBytes),manifest.fit.sha256);
 const entry={id:manifest.id,sourceBodySha256:fit.sourceBodySha256,assetSha256:manifest.sha256,sourceMaterial:manifest.sourceMaterial,fit:manifest.fit};
 validateHairFitData(fit,entry,sha(body),manifest);
 assert.throws(()=>validateHairFitData(fit,entry,'0'.repeat(64),manifest));
 assert.throws(()=>validateHairFitData(fit,{...entry,fit:{...entry.fit,version:2}},sha(body),manifest));
 const a=await parse(bytes),b=await parse(bytes),meshes=[];a.scene.traverse(n=>{if(n.isMesh)meshes.push(n);});
 assert.equal(meshes.length,1);assert(!meshes[0].isSkinnedMesh);assert.equal(a.animations.length,0);
 assert.equal(meshes[0].geometry.attributes.position.count,3666);
 head.add(a.scene);head.rotation.x=.25;head.rotation.y=-.4;vrm.scene.updateMatrixWorld(true);
 const geometry=meshes[0].geometry;const point=new THREE.Vector3();
 for(let i=0;i<geometry.attributes.position.count;i++){point.fromBufferAttribute(geometry.attributes.position,i).applyMatrix4(meshes[0].matrixWorld);assert(point.toArray().every(Number.isFinite));}
 const bMesh=b.scene.getObjectByProperty('isMesh',true);
 meshes[0].material=sourceMaterials[0].clone();bMesh.material=sourceMaterials[0].clone();meshes[0].material.color.setRGB(1,0,0);
 assert.deepEqual(sourceMaterials[0].color.toArray(),originalColor);assert.deepEqual(bMesh.material.color.toArray(),originalColor);
 assert(sameHairFit(hairFitIdentity(entry),{kind:'explicit-fit-v1',id:fit.id,version:fit.version,sha256:sha(fitBytes)}));
 checks.push({id:preset.id,exactAssetAndFit:true,wrongBodyVersionRejected:true,actualGLTFMeshes:meshes.length,vertices:geometry.attributes.position.count,posedHeadFinite:true,materialInstanceIsolation:true,rigid:true});
 assets.push({id:preset.id,sha256:sha(bytes),bytes:bytes.length,fitSha256:sha(fitBytes),manifestSha256:sha(await read(path.join(folder,'manifest.json')))});
 a.scene.removeFromParent();VRMUtils.deepDispose(a.scene);VRMUtils.deepDispose(b.scene);
}
VRMUtils.deepDispose(vrm.scene);hook.deregister();
const report={checks,assets,sourceBodySha256:sha(body),runtimeRoot,sourceContractSha256:sha(await read(path.join(runtimeRoot,'prototype/src/hair-fit-contract.js'))),
 sourceGeometry:true,CPUOnly:true,runtimeAccepted:false,limits:['Real GLTFLoader/VRMLoaderPlugin and actual hair-fit validator with CPU 1x1 texture decode placeholders. Root catalog admission/publication and game appearance require integration/browser QA.','Rigid medium-length source, full head retained, no dynamics or all-action contact claim.']};
await fs.writeFile(path.join(base,'runtime-cpu-qa.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
