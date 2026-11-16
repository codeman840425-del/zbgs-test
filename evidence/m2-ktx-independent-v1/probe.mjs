import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createKtxPilotAdapter} from '../../scripts/m2-ktx-pilot-v1/runtime-adapter.mjs';
import {createCharacterAppearance} from '../../prototype/src/character-appearance.js';

const root=path.resolve('F:/gamemake'),out=path.join(root,'evidence/m2-ktx-independent-v1',process.argv[2]??'');
await fs.mkdir(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=name=>fs.readFile(path.join(root,name));
const checks=[],failures=[];
function check(name,ok,details={}){const row={name,ok,...details};checks.push(row);if(!ok)failures.push(row);}
const sourceNames=['scripts/m2-ktx-pilot-v1/runtime-adapter.mjs','scripts/qa-ktx-room.cjs','prototype/src/character-appearance.js'];
const sourceSha256=Object.fromEntries(await Promise.all(sourceNames.map(async name=>[name,sha(await read(name))])));
await fs.copyFile(path.join(root,sourceNames[0]),path.join(out,'tested-runtime-adapter.mjs'));
const fixedAppearance=execFileSync('git',['show','58bc10748cc9fa618f8ecf58b54abbb7de12ffb8:prototype/src/character-appearance.js'],{cwd:root});
check('actual appearance source equals fixed801 source',sha(fixedAppearance)===sourceSha256[sourceNames[2]],{fixedSha256:sha(fixedAppearance)});
const sourceManifest=JSON.parse(await read('assets-source/m2-ktx-pilot-v1/manifest.json'));
const decoderManifest=JSON.parse(await read('assets-source/m2-ktx-pilot-v1/runtime-dependencies.json'));
for(const descriptor of decoderManifest.files){
  const bytes=await read('prototype/node_modules/three/examples/jsm/libs/basis/'+descriptor.name);
  check('decoder bytes '+descriptor.name,sha(bytes)===descriptor.sha256&&bytes.length===descriptor.bytes);
}
check('KTX2Loader pinned bytes',sha(await read(decoderManifest.ktx2Loader.path))===decoderManifest.ktx2Loader.sha256);
for(const sample of sourceManifest.samples){
  const encoded=await read(sample.encoded.path),png=await read(sample.sourcePng),model=await read(sample.sourceModel);
  check(sample.id+' exact source/encoded identities',sha(encoded)===sample.encoded.sha256&&encoded.length===sample.encoded.bytes&&sha(png)===sample.sourcePngSha256&&sha(model)===sample.sourceModelSha256);
}
const browserEvidence=[];
for(const body of ['male','female']){
  const dir=`evidence/m2-ktx-room-${body}-801-v2/`;
  const reportBytes=await read(dir+'report.json'),report=JSON.parse(reportBytes);
  check(body+' executed adapter historical snapshot linkage',report.adapterSha256==='6546e87e02406e1624eccd9312b9ea1d23d34a3fca02eeb54b70937f45286276'&&sha(await read(dir+'executed-adapter.mjs'))===report.adapterSha256);
  check(body+' executed harness/source linkage',sha(await read(dir+'executed-script.cjs'))===sourceSha256[sourceNames[1]]);
  check(body+' exact fixed runtime',report.runtime==='801c7a9c9026'&&report.identity.build.sourceDigest==='801c7a9c90260da47b0fc771caf3f282f67f8962d77fb6a15a07db3aca1fc0dc');
  const samples=sourceManifest.samples.filter(s=>s.gender===body);
  for(const descriptor of decoderManifest.files){
    const request=report.prepared.snapshot.requests.find(r=>r.role==='decoder-'+descriptor.name);
    check(body+' recorded pinned decoder '+descriptor.name,request?.sha256===descriptor.sha256&&request?.bytes===descriptor.bytes);
  }
  for(const sample of samples){
    const request=report.prepared.snapshot.requests.find(r=>r.role===sample.id);
    check(body+' recorded pinned sample '+sample.id,request?.sha256===sample.encoded.sha256&&request?.bytes===sample.encoded.bytes);
  }
  const requestedLoader=report.requests.find(r=>r.path.endsWith('/loaders/KTX2Loader.js'));
  check(body+' recorded pinned KTX2Loader',requestedLoader?.sha256===decoderManifest.ktx2Loader.sha256);
  const png=report.states.find(s=>s.label==='png-paused-face'),ktx=report.states.find(s=>s.label==='ktx-paused-face');
  const uniqueImages=new Map();
  for(const material of ktx.adapter.materials)if(!uniqueImages.has(material.sampleId))uniqueImages.set(material.sampleId,material.map);
  const pngBaseBytes=[...uniqueImages.values()].reduce((n,t)=>n+t.width*t.height*4,0);
  const mipBytes=[...uniqueImages.values()].reduce((n,t)=>n+t.transcodedMipDataBytes,0);
  check(body+' original target textures have no mip chain',png.adapter.materials.every(m=>!m.map.generateMipmaps&&m.map.mipLevels===0&&m.map.minFilter===THREE.LinearFilter));
  check(body+' observed compressed format and mip payload',uniqueImages.size===2&&[...uniqueImages.values()].every(t=>t.format===THREE.RGBA_BPTC_Format)&&mipBytes===6990560);
  browserEvidence.push({body,reportSha256:sha(reportBytes),adapterSha256:report.adapterSha256,status:report.status,errors:report.errors,
    images:[...uniqueImages].map(([sampleId,texture])=>({sampleId,width:texture.width,height:texture.height,format:texture.format,mipLevels:texture.mipLevels,transcodedMipDataBytes:texture.transcodedMipDataBytes})),
    estimatedRgba8BaseLevelBytes:pngBaseBytes,observedTranscodedMipPayloadBytes:mipBytes,uploadDataReductionEstimate:1-mipBytes/pngBaseBytes,
    textureCounts:report.states.map(s=>({label:s.label,textures:s.scene.renderer.textures})),
    limitation:'Texture counts are Three renderer allocations. Payload/RGBA estimates do not measure physical GPU VRAM. Original PNG VRM and added KTX files are both downloaded.'});
}

// This fixture checks binding/reference behavior using real Three objects.
// The actual character-appearance module runs unchanged. A CPU canvas shim
// exposes its preparation path but intentionally performs no pixel rendering.
const oldDocument=globalThis.document;
globalThis.document={createElement(name){if(name!=='canvas')throw Error('CPU fixture only supports canvas');return{width:0,height:0,getContext(){return{drawImage(){},getImageData(){return{data:new Uint8ClampedArray([255,255,255,255])};},putImageData(){}};}};}};
const samples=sourceManifest.samples.filter(s=>s.gender==='male');
const scene=new THREE.Group(),materials=[],originals=[];
for(const sample of samples){
  const texture=new THREE.Texture({width:sample.width,height:sample.height});texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map:texture});material.name=sample.materialUses[0].name;material.shadeMultiplyTexture=texture;material.shadeColorFactor=new THREE.Color(1,1,1);
  scene.add(new THREE.Mesh(new THREE.BufferGeometry(),material));materials.push(material);originals.push(texture);
}
const vrm={scene},appearance=createCharacterAppearance({vrm,avatarSha256:samples[0].sourceModelSha256});
const adapter=createKtxPilotAdapter({THREE,KTX2Loader:class{},renderer:{},vrm,bodyType:'male',avatarSha256:samples[0].sourceModelSha256,
  appearance,sourceManifest,sourceBaseUrl:'https://cpu.test/',transcoderPath:'https://cpu.test/decoder/',decoderManifest});
const tinted=await adapter.withCanvasAppearance(()=>appearance.set({hairColor:'brown',skinTone:'warm'}));
const hair=materials[1],previousCanvas=hair.map,previousShade=hair.shadeMultiplyTexture,stateBefore=appearance.getState();
check('actual appearance module produces prior tinted Canvas selection',tinted.applied===true&&stateBefore.hairColor==='brown'&&typeof previousCanvas.image.getContext==='function'&&previousCanvas!==originals[1]);
const failed=await adapter.withCanvasAppearance(()=>appearance.set({hairColor:'invalid-preset'}));
const stateAfter=appearance.getState();
check('rejected appearance change preserves prior Canvas bindings',failed.applied===false&&hair.map===previousCanvas&&hair.shadeMultiplyTexture===previousShade,
  {result:failed,stateBefore:{hairColor:stateBefore.hairColor,skinTone:stateBefore.skinTone,revision:stateBefore.revision},stateAfter:{hairColor:stateAfter.hairColor,skinTone:stateAfter.skinTone,revision:stateAfter.revision},mapMatchesPreviousCanvas:hair.map===previousCanvas,mapIsOriginalPng:hair.map===originals[1]});
if(process.argv[2]){
  let release;
  const gate=new Promise(resolve=>release=resolve);
  const older=adapter.withCanvasAppearance(async()=>{
    await gate;
    const result=await appearance.set({hairColor:'invalid-preset'});
    if(!result.applied)throw Error(result.reason);
    return result;
  });
  const newer=await adapter.withCanvasAppearance(()=>appearance.set({hairColor:'black'}));
  const newerMap=hair.map,newerShade=hair.shadeMultiplyTexture,newerColor=hair.color.toArray();
  const lastFailureBefore=adapter.snapshot().lastFailure;
  release();const late=await older;
  check('late rejected actual appearance result is cancelled after newer success',newer.applied===true&&late.applied===false&&late.cancelled===true,{newer,late});
  check('late exception preserves newer Canvas color/state and diagnostic result',hair.map===newerMap&&hair.shadeMultiplyTexture===newerShade&&JSON.stringify(hair.color.toArray())===JSON.stringify(newerColor)&&appearance.getState().hairColor==='black'&&adapter.snapshot().lastFailure===lastFailureBefore,
    {hairColor:appearance.getState().hairColor,lastFailureBefore,lastFailureAfter:adapter.snapshot().lastFailure});
}
adapter.dispose();appearance.dispose();globalThis.document=oldDocument;

const finalSha256=Object.fromEntries(await Promise.all(sourceNames.map(async name=>[name,sha(await read(name))])));
check('reviewed sources unchanged during CPU probe',JSON.stringify(finalSha256)===JSON.stringify(sourceSha256));
const result={schema:'independent-ktx-pilot-v1',time:new Date().toISOString(),sourceSha256,finalSha256,checks,failures,browserEvidence,
 limits:['No new browser/GPU or decoder execution. Browser measurements were audited from separately hashed executed evidence.','Canvas probe uses real unchanged character-appearance logic and real Three materials/textures with a CPU canvas API shim. It tests object bindings and state only, not pixels.','Reference scanner and reupload implementation inspected against Three187 WebGLTextures source. Full external detached-scene reference discovery is outside the adapter declared scan scope.']};
await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({sourceSha256,checks:checks.length,failures,measurements:browserEvidence.map(e=>({body:e.body,estimatedRgba8BaseLevelBytes:e.estimatedRgba8BaseLevelBytes,observedTranscodedMipPayloadBytes:e.observedTranscodedMipPayloadBytes}))},null,2));
