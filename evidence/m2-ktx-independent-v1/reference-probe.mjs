import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createKtxPilotAdapter} from '../../scripts/m2-ktx-pilot-v1/runtime-adapter.mjs';
const root=path.resolve('F:/gamemake'),out=path.join(root,'evidence/m2-ktx-independent-v1');
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourcePath=path.join(root,'scripts/m2-ktx-pilot-v1/runtime-adapter.mjs');
const sourceSha256=sha(await fs.readFile(sourcePath));
const manifest=JSON.parse(await fs.readFile(path.join(root,'assets-source/m2-ktx-pilot-v1/manifest.json')));
const decoderManifest=JSON.parse(await fs.readFile(path.join(root,'assets-source/m2-ktx-pilot-v1/runtime-dependencies.json')));
const samples=manifest.samples.filter(s=>s.gender==='male');
const checks=[],failures=[];const check=(name,ok,details={})=>{const row={name,ok,...details};checks.push(row);if(!ok)failures.push(row);};
const scene=new THREE.Group(),world=new THREE.Scene();world.add(scene);
const materials=[],originals=[];
for(const sample of samples){
  const map=new THREE.Texture({width:sample.width,height:sample.height});map.flipY=false;map.colorSpace=THREE.SRGBColorSpace;
  map.generateMipmaps=false;map.minFilter=THREE.LinearFilter;map.needsUpdate=true;
  const shade=map.clone(),material=new THREE.MeshBasicMaterial({map});material.shadeMultiplyTexture=shade;material.name=sample.materialUses[0].name;
  materials.push(material);originals.push(map,shade);scene.add(new THREE.Mesh(new THREE.BufferGeometry(),material));
}
// Actual encoded/decoder hashes are consumed. Decoder execution is substituted
// only to isolate texture ownership, object identity and upload version behavior.
class OwnershipDecoder {
  constructor(manager){this.manager=manager;}
  setTranscoderPath(value){this.path=value;return this;}
  setWorkerLimit(){return this;}
  detectSupport(){return this;}
  async init(){for(const file of decoderManifest.files)if(!this.manager.resolveURL(this.path+file.name).startsWith('blob:'))throw Error('Unverified decoder reference');}
  parse(buffer,resolve){
    const view=new DataView(buffer),width=view.getUint32(20,true),height=view.getUint32(24,true),levels=view.getUint32(40,true),mips=[];
    for(let i=0;i<levels;i++){const w=Math.max(1,width>>i),h=Math.max(1,height>>i);mips.push({width:w,height:h,data:new Uint8Array(Math.ceil(w/4)*Math.ceil(h/4)*16)});}
    const texture=new THREE.CompressedTexture(mips,width,height,THREE.RGBA_BPTC_Format);texture.colorSpace=THREE.SRGBColorSpace;resolve(texture);
  }
  dispose(){}
}
const adapter=createKtxPilotAdapter({THREE,KTX2Loader:OwnershipDecoder,renderer:{},vrm:{scene},bodyType:'male',avatarSha256:samples[0].sourceModelSha256,
  appearance:{getState:()=>({hairStyle:'original',hairColor:'original'})},sourceManifest:manifest,decoderManifest,sourceBaseUrl:'https://cpu.test/',transcoderPath:'https://cpu.test/decoder/',
  fetchImpl:async url=>{
    const filename=new URL(url).pathname.slice(1);const file=filename.startsWith('decoder/')?path.join(root,'prototype/node_modules/three/examples/jsm/libs/basis',path.basename(filename)):path.join(root,filename);
    return new Response(await fs.readFile(file));
  }});
const prepared=await adapter.prepare();check('prepare succeeds with verified actual input bytes',prepared.prepared===true);
adapter.applyOriginalKtx();const compressed=materials.flatMap(m=>[m.map,m.shadeMultiplyTexture]);
const mipData=compressed.map(t=>t.mipmaps[0].data),originalImages=originals.map(t=>t.image);
const oldDisposeCounts=originals.map(()=>0),compressedDisposeCounts=compressed.map(()=>0);
originals.forEach((t,i)=>t.addEventListener('dispose',()=>oldDisposeCounts[i]++));
compressed.forEach((t,i)=>t.addEventListener('dispose',()=>compressedDisposeCounts[i]++));
const holderMaterial=new THREE.MeshBasicMaterial({map:originals[0]});
holderMaterial.lightMap=originals[2].clone();
const holder=new THREE.Mesh(new THREE.BufferGeometry(),holderMaterial);world.add(holder);
const retained=adapter.releaseInactiveGpu();
check('ancestor-scene direct and shared-Source aliases protect every original',retained.released.length===0&&retained.failures.length===0&&oldDisposeCounts.every(n=>n===0));
holderMaterial.map=null;holderMaterial.lightMap=null;
const uniforms={nested:{value:{textures:[originals[0],originals[2]]}}};uniforms.nested.value.self=uniforms.nested.value;
const shader=new THREE.ShaderMaterial({uniforms});holder.material=shader;
const uniformRetained=adapter.releaseInactiveGpu();
check('nested cyclic shader uniform references protect every original Source',uniformRetained.released.length===0&&uniformRetained.failures.length===0);
holder.removeFromParent();
const firstRelease=adapter.releaseInactiveGpu(),repeat=adapter.releaseInactiveGpu();
check('unreferenced original map/shade objects dispose once',firstRelease.released.length===4&&oldDisposeCounts.every(n=>n===1)&&repeat.released.length===0,{oldDisposeCounts:[...oldDisposeCounts]});
const oldVersions=originals.map(t=>t.version);adapter.restorePng();
check('PNG restore retains exact objects/images and increments upload versions',materials.every((m,i)=>m.map===originals[i*2]&&m.shadeMultiplyTexture===originals[i*2+1])&&originals.every((t,i)=>t.image===originalImages[i]&&t.version>oldVersions[i]));
const compressedRelease=adapter.releaseInactiveGpu();
check('unused compressed variants dispose once while mip arrays remain',compressedRelease.released.length===4&&compressedDisposeCounts.every(n=>n===1)&&compressed.every((t,i)=>t.mipmaps[0].data===mipData[i]));
const compressedVersions=compressed.map(t=>t.version);adapter.applyOriginalKtx();
check('KTX reapply retains exact objects/mip arrays and increments upload versions',materials.every((m,i)=>m.map===compressed[i*2]&&m.shadeMultiplyTexture===compressed[i*2+1])&&compressed.every((t,i)=>t.mipmaps[0].data===mipData[i]&&t.version>compressedVersions[i]));
adapter.dispose();
check('adapter disposal restores PNG and releases reactivated variants once',materials.every((m,i)=>m.map===originals[i*2]&&m.shadeMultiplyTexture===originals[i*2+1])&&compressedDisposeCounts.every(n=>n===2));
const finalSha256=sha(await fs.readFile(sourcePath));check('source remained unchanged',sourceSha256===finalSha256);
const result={schema:'independent-ktx-reference-probe-v1',sourceSha256,finalSha256,checks,failures,
  limits:['Real Three187 Texture/CompressedTexture/Source/ShaderMaterial objects and adapter reference scan used.','Actual encoded and decoder bytes hash-verified, with a decoder stand-in constructing inert mip data. No actual decode, GPU upload or pixel rendering asserted.','Version increments verify Three reupload preconditions, not completed GPU uploads. Browser evidence separately records renderer texture count changes.']};
await fs.writeFile(path.join(out,'reference-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
