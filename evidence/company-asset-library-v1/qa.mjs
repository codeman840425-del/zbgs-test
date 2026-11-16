import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const checks=[];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAGUlEQVR42gXBAQ0AAAzDIJbcv+UeRNJNwgM+/wYAEzE7eQAAAABJRU5ErkJggg==','base64');
function makeGlb(edit=()=>{},textured=false,imageBytes=png){
  const positions=Buffer.from(new Float32Array([0,0,0,1,0,0,0,1,0]).buffer);
  const uv=Buffer.from(new Float32Array([0,0,1,0,0,1]).buffer);
  const bin=Buffer.concat([positions,...(textured?[uv,imageBytes]:[])]);
  const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],
    nodes:[{name:'seat-node',mesh:0},{name:'back-node',mesh:0,translation:[0,0,-.2]}],
    meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],
    materials:[{pbrMetallicRoughness:{baseColorFactor:[.8,.3,.2,1]}}],
    buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.length}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}]};
  if(textured){json.bufferViews.push({buffer:0,byteOffset:positions.length,byteLength:uv.length},{buffer:0,byteOffset:positions.length+uv.length,byteLength:imageBytes.length});json.accessors.push({bufferView:1,componentType:5126,count:3,type:'VEC2'});json.meshes[0].primitives[0].attributes.TEXCOORD_0=1;json.images=[{bufferView:2,mimeType:'image/png'}];json.textures=[{source:0}];json.materials[0].pbrMetallicRoughness.baseColorTexture={index:0};}
  edit(json);
  const raw=Buffer.from(JSON.stringify(json)),jsonChunk=Buffer.alloc(Math.ceil(raw.length/4)*4,0x20);raw.copy(jsonChunk);
  const binChunk=Buffer.alloc(Math.ceil(bin.length/4)*4);bin.copy(binChunk);
  const header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonChunk.length+binChunk.length,8);
  jh.writeUInt32LE(jsonChunk.length,0);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(binChunk.length,0);bh.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,jh,jsonChunk,bh,binChunk]);
}
function resource(bytes,changes={}){return {id:'cpu-fixture',version:1,coordinates:{units:'metres',up:'+Y',forward:'+Z'},
  usePoints:[{id:'seat',seatNodeId:'seat-node',backNodeId:'back-node'}],asset:{format:'glb',url:'/cpu-fixture.glb',sha256:hash(bytes),bytes:bytes.length},...changes};}
function release(root){const geometry=new Set(),materials=new Set(),textures=new Set();root.traverse(node=>{if(node.geometry)geometry.add(node.geometry);for(const material of node.material?[node.material].flat():[]){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});for(const item of [...textures,...materials,...geometry])item.dispose();}
function watchDisposal(){const sets={geometry:new Set(),material:new Set(),texture:new Set()},originals=[];for(const [kind,prototype]of [['geometry',THREE.BufferGeometry.prototype],['material',THREE.Material.prototype],['texture',THREE.Texture.prototype]]){const original=prototype.dispose;prototype.dispose=function(){sets[kind].add(this);return original.call(this);};originals.push([prototype,original]);}return{counts:()=>Object.fromEntries(Object.entries(sets).map(([key,set])=>[key,set.size])),stop(){for(const[prototype,original]of originals)prototype.dispose=original;}};}
async function check(name,fn){try{checks.push({name,passed:true,details:await fn()});}catch(error){checks.push({name,passed:false,error:error.stack,code:error.code});}}
async function rejects(bytes,code,change=()=>{}){let calls=0;const lib=createCompanyAssetLibrary({fetchImpl:async()=>{calls++;return new Response(bytes);}}),r=resource(bytes);change(r);try{await assert.rejects(lib.preload([r]),error=>error.name==='CompanyError'&&error.code===code);return{code,fetchCalls:calls};}finally{lib.dispose();}}
const normal=makeGlb();
await fs.writeFile(new URL('./triangle-contact.glb',import.meta.url),normal);
await check('Actual GLTFLoader parses embedded geometry and two required mesh contacts',async()=>{
  const lib=createCompanyAssetLibrary({fetchImpl:async()=>new Response(normal)}),r=resource(normal);try{await lib.preload([r]);const instance=lib.instantiate(r);assert.equal(instance.nodes.get('seat-node').isMesh,true);assert.equal(instance.nodes.get('back-node').isMesh,true);assert.equal(instance.nodes.get('seat-node').geometry.attributes.position.count,3);release(instance.root);return{threeRevision:THREE.REVISION};}finally{lib.dispose();}
});
await check('Wrong byte length rejects before parser',()=>rejects(normal,'asset-byte-length-mismatch',r=>r.asset.bytes++));
await check('Wrong digest rejects actual same-length bytes',()=>rejects(normal,'asset-digest-mismatch',r=>r.asset.sha256='0'.repeat(64)));
await check('External buffer URI rejects before loader fetch',()=>rejects(makeGlb(json=>json.buffers[0].uri='https://example.invalid/buffer.bin'),'external-asset-uri'));
await check('External image URI rejects before loader fetch',()=>rejects(makeGlb(json=>json.images=[{uri:'https://example.invalid/image.png'}]),'external-asset-uri'));
await check('Animation, skin, compression and nonfinite node matrix are rejected',async()=>{
  const cases=[['unsupported-asset-rig',json=>json.animations=[{}]],['unsupported-asset-rig',json=>json.skins=[{}]],['unsupported-asset-compression',json=>json.extensionsUsed=['KHR_draco_mesh_compression']]];
  for(const[code,edit]of cases)await rejects(makeGlb(edit),code);
  // JSON cannot encode NaN. Overflowing a finite JSON number yields Infinity.
  const bytes=Buffer.from(makeGlb(json=>json.nodes[0].scale=[1e308,1e308,1e308]).toString('binary').replaceAll('1e+308','1e+999'),'binary');
  await rejects(bytes,'invalid-asset-transform');return{cases:4};
});
await check('Missing required mesh and duplicate raw target names reject and release parsed assets',async()=>{
  await rejects(normal,'missing-contact-mesh',r=>r.usePoints[0].seatNodeId='missing');
  await rejects(makeGlb(json=>json.nodes[1].name='seat-node'),'missing-contact-mesh');
});
await check('Empty default scene is rejected',()=>rejects(makeGlb(json=>json.scenes[0].nodes=[]),'empty-asset'));
await check('Concurrent preload uses one fetch and instances own independent geometry and materials',async()=>{
  let calls=0;const lib=createCompanyAssetLibrary({fetchImpl:async()=>{calls++;return new Response(normal);}}),r=resource(normal);
  try{await Promise.all([lib.preload([r]),lib.preload([r]),lib.preload([r,r])]);assert.equal(calls,1);const a=lib.instantiate(r),b=lib.instantiate(r),am=a.nodes.get('seat-node'),bm=b.nodes.get('seat-node');assert.notEqual(am.geometry,bm.geometry);assert.notEqual(am.material,bm.material);am.geometry.attributes.position.setX(0,9);am.material.color.set('#00ff00');assert.equal(bm.geometry.attributes.position.getX(0),0);assert.notEqual(am.material.color.getHex(),bm.material.color.getHex());let events=0;bm.geometry.addEventListener('dispose',()=>events++);bm.material.addEventListener('dispose',()=>events++);release(a.root);assert.equal(events,0);const isolatedEvents=events;const c=lib.instantiate(r);assert.equal(c.nodes.get('seat-node').geometry.attributes.position.getX(0),0);release(b.root);release(c.root);return{fetchCalls:calls,otherInstanceDisposeEvents:isolatedEvents};}finally{lib.dispose();}
});
await check('Failed fetch may retry and cache separates content identities',async()=>{
  let calls=0;const lib=createCompanyAssetLibrary({fetchImpl:async()=>++calls===1?new Response(null,{status:503}):new Response(normal)}),r=resource(normal);
  try{await assert.rejects(lib.preload([r]),error=>error.code==='asset-fetch-failed');await lib.preload([r]);const another=structuredClone(r);another.asset.url='/same-content-other-url.glb';await lib.preload([another]);assert.equal(calls,3);return{fetchCalls:calls};}finally{lib.dispose();}
});
await check('Malformed external input returns CompanyError and procedural resources are skipped',async()=>{
  let calls=0;const lib=createCompanyAssetLibrary({fetchImpl:async()=>{calls++;return new Response(normal);}});
  try{await lib.preload([{id:'procedural'}]);for(const r of [{...resource(normal),id:42},{...resource(normal),asset:null},{...resource(normal),usePoints:{}},{...resource(normal),coordinates:{units:'cm',up:'+Y',forward:'+Z'}}])await assert.rejects(lib.preload([r]),error=>error.name==='CompanyError');assert.equal(calls,0);assert.throws(()=>lib.instantiate(resource(normal)),error=>error.code==='asset-not-preloaded');}finally{lib.dispose();}
});
await check('Dispose during a fetch rejects late bytes and does not resurrect cache',async()=>{
  let resolveFetch;const lib=createCompanyAssetLibrary({fetchImpl:()=>new Promise(resolve=>{resolveFetch=resolve;})}),r=resource(normal);
  const pending=lib.preload([r]);const rejection=assert.rejects(pending,error=>error.code==='asset-library-disposed');lib.dispose();resolveFetch(new Response(normal));await rejection;assert.throws(()=>lib.instantiate(r),error=>error.code==='asset-library-disposed');lib.dispose();
});
const savedSelf=globalThis.self,savedBitmap=globalThis.createImageBitmap;
let imageGate=null,imageStarted=null,failImageDecode=false;
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{
  if(failImageDecode)throw Error('Injected image decode failure');
  const bytes=Buffer.from(await blob.arrayBuffer());assert.equal(bytes[0],0x89);let offset=8;const compressed=[];
  while(offset<bytes.length){const length=bytes.readUInt32BE(offset),chunk=bytes.subarray(offset+4,offset+8+length);let crc=0xffffffff;for(const byte of chunk){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}assert.equal((crc^0xffffffff)>>>0,bytes.readUInt32BE(offset+8+length),'PNG CRC mismatch');if(chunk.toString('ascii',0,4)==='IDAT')compressed.push(chunk.subarray(4));offset+=length+12;}
  assert(inflateSync(Buffer.concat(compressed)).length>0);imageStarted?.();if(imageGate)await imageGate;return{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),close(){}};
};
try{
  const textured=makeGlb(()=>{},true);
  await fs.writeFile(new URL('./triangle-textured.glb',import.meta.url),textured);
  await check('Actual GLTFLoader embedded texture objects and sources are isolated per instance',async()=>{
    const lib=createCompanyAssetLibrary({fetchImpl:async()=>new Response(textured)}),r=resource(textured);try{await lib.preload([r]);const a=lib.instantiate(r),b=lib.instantiate(r),at=a.nodes.get('seat-node').material.map,bt=b.nodes.get('seat-node').material.map;assert(at?.isTexture);assert.equal(at.image.width,2);assert.equal(at.image.height,2);assert.equal(a.nodes.get('seat-node').geometry.attributes.uv.count,3);assert.notEqual(at,bt);assert.notEqual(at.source,bt.source);at.offset.x=.5;assert.equal(bt.offset.x,0);let events=0;bt.addEventListener('dispose',()=>events++);release(a.root);assert.equal(events,0);const isolatedEvents=events;const c=lib.instantiate(r);assert.equal(c.nodes.get('seat-node').material.map.offset.x,0);release(b.root);release(c.root);return{otherTextureDisposeEvents:isolatedEvents,imageDecode:'CPU image API shim validates PNG CRC and zlib stream, then returns dimensions. Pillow separately verifies actual RGBA pixels.'};}finally{lib.dispose();}
  });
  await check('Original bad-CRC PNG and loader-swallowed image failure reject with resource cleanup',async()=>{
    const oldPng=await fs.readFile(new URL('./failed-original-texture.png',import.meta.url));
    const invalidImageGlb=makeGlb(()=>{},true,oldPng);
    await fs.writeFile(new URL('./triangle-textured-bad-png.glb',import.meta.url),invalidImageGlb);
    const watch=watchDisposal();try{await rejects(invalidImageGlb,'asset-texture-load-failed');failImageDecode=true;await rejects(textured,'asset-texture-load-failed');const counts=watch.counts();assert(counts.geometry>0&&counts.material>0);return{disposed:counts,badPngFixture:{path:'triangle-textured-bad-png.glb',sha256:hash(invalidImageGlb),bytes:invalidImageGlb.length,hasTexcoord0:true}};}finally{failImageDecode=false;watch.stop();}
  });
  await check('Valid decoded PNG with missing UV rejects and disposes texture',async()=>{
    const watch=watchDisposal();try{await rejects(makeGlb(json=>{delete json.meshes[0].primitives[0].attributes.TEXCOORD_0;},true),'missing-asset-uv');const counts=watch.counts();assert(counts.texture>0);return{disposed:counts};}finally{watch.stop();}
  });
  await check('Dispose while GLTFLoader awaits embedded image cleans its late parsed objects',async()=>{
    let finishImage,startImage;imageGate=new Promise(resolve=>{finishImage=resolve;});const started=new Promise(resolve=>{startImage=resolve;});imageStarted=startImage;
    const watch=watchDisposal(),lib=createCompanyAssetLibrary({fetchImpl:async()=>new Response(textured)}),r=resource(textured);
    try{const pending=lib.preload([r]);const rejection=assert.rejects(pending,error=>error.code==='asset-library-disposed');await started;lib.dispose();finishImage();await rejection;const counts=watch.counts();assert(counts.geometry>0&&counts.material>0&&counts.texture>0);return{disposed:counts};}finally{imageGate=null;imageStarted=null;watch.stop();lib.dispose();}
  });
}finally{if(savedSelf===undefined)delete globalThis.self;else globalThis.self=savedSelf;if(savedBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=savedBitmap;}
await check('GLTFLoader partial parse failure cleans fulfilled cached geometry and materials',async()=>{
  const broken=makeGlb(json=>{json.meshes.push({primitives:[{attributes:{POSITION:999},material:0}]});json.nodes[1].mesh=1;});
  const watch=watchDisposal();try{await rejects(broken,'asset-load-failed');const counts=watch.counts();assert(counts.geometry>0&&counts.material>0);return{disposed:counts};}finally{watch.stop();}
});
await check('Actual lounge-sofa v1 and v2 load pinned GLB bytes and resolve four contact meshes independently',async()=>{
  const resources=[];
  for(const version of [1,2])resources.push(JSON.parse(await fs.readFile(new URL(`../../prototype/public/company-assets/lounge-sofa/v${version}/resource.json`,import.meta.url),'utf8')));
  let calls=0;const lib=createCompanyAssetLibrary({fetchImpl:async url=>{calls++;return new Response(await fs.readFile(new URL(`../../prototype/public${url}`,import.meta.url)));}});
  try{await lib.preload(resources);const instances=resources.map(r=>lib.instantiate(r));const details=[];
    for(let index=0;index<instances.length;index++){const instance=instances[index],r=resources[index];for(const point of r.usePoints){assert.equal(instance.nodes.get(point.seatNodeId)?.isMesh,true);assert.equal(instance.nodes.get(point.backNodeId)?.isMesh,true);}const box=new THREE.Box3().setFromObject(instance.root);details.push({version:r.version,sha256:r.asset.sha256,bytes:r.asset.bytes,contactNames:r.usePoints.flatMap(p=>[p.seatNodeId,p.backNodeId]),bounds:{min:box.min.toArray(),max:box.max.toArray()}});}
    assert.notEqual(instances[0].nodes.get('seat-left').geometry,instances[1].nodes.get('seat-left').geometry);assert.equal(calls,2);
    for(const instance of instances)release(instance.root);return{fetchCalls:calls,resources:details};
  }finally{lib.dispose();}
});
await check('Blocking GLB must fit declared XZ footprint before admission',async()=>{
  const watch=watchDisposal();try{await rejects(normal,'asset-footprint-mismatch',r=>r.footprint={blocking:true,center:[0,0],halfSize:[.1,.1]});const counts=watch.counts();assert(counts.geometry>0&&counts.material>0);const lib=createCompanyAssetLibrary({fetchImpl:async()=>new Response(normal)}),r=resource(normal,{footprint:{blocking:true,center:[.5,-.1],halfSize:[.5,.1]}});try{await lib.preload([r]);const invalid=structuredClone(r);invalid.footprint.halfSize[0]=.1;await assert.rejects(lib.preload([invalid]),error=>error.code==='asset-footprint-mismatch');const instance=lib.instantiate(r);release(instance.root);}finally{lib.dispose();}return{disposedAfterReject:counts,toleranceMetres:.001,cachedValidResourceRetained:true};}finally{watch.stop();}
});
const report={status:checks.every(row=>row.passed)?'passed':'failed',configuration:{model:'gpt-6.1-sol',reasoning_effort:'high',difficulty:'complex',reuseKnownConfiguration:true,reason:'Asynchronous byte verification, loader ownership and isolated instance resources',actualProviderConfiguration:'not independently verified',desktopHookInterception:'not independently verified'},threeRevision:THREE.REVISION,
  moduleSha256:hash(await fs.readFile(new URL('../../prototype/src/company/asset-library.js',import.meta.url))),checks,
  limits:['Real GLTFLoader and Three CPU geometry/material/texture objects. CPU image API validates PNG CRC/zlib; separate Pillow verification decodes fixture RGBA. Native browser decoding remains a root integration check.','Texture and TextureSource state are cloned. Decoded browser image content remains shared read-only; typed pixel arrays are copied.','No renderer, browser/GPU, art production or real sofa/character acceptance claim.']};
await fs.writeFile(new URL('./report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(report.status!=='passed')process.exitCode=1;
