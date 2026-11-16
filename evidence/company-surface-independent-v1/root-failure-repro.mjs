import fs from 'node:fs';import crypto from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
const {createCompanyAssetLibrary}=await import(process.argv[2]==='baseline'?'./baseline-asset-library.mjs':'../../prototype/src/company/asset-library.js');
globalThis.self=globalThis;
function align4(n){return (n+3)&~3}
function glb(){
 const positions=new Float32Array([0,0,0,1,0,0,0,1,0]);
 const colors=new Uint8Array([255,0,0,255,0,255,0,0,0,255]);
 const indices=new Uint16Array([0,1,2]);
 const posBytes=new Uint8Array(positions.buffer), idxBytes=new Uint8Array(indices.buffer);
 const binLen=posBytes.length+colors.length+idxBytes.length;const bin=new Uint8Array(align4(binLen));
 let at=0;bin.set(posBytes,at);const posOff=at;at+=posBytes.length;bin.set(colors,at);const colorOff=at;at+=colors.length;bin.set(idxBytes,at);const idxOff=at;
 const j={asset:{version:'2.0',generator:'independent-failure-repro'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Visible',mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,COLOR_0:1},indices:2,material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[1,0.4,0.2,1]}}],buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteOffset:posOff,byteLength:posBytes.length,target:34962},{buffer:0,byteOffset:colorOff,byteLength:colors.length,target:34962},{buffer:0,byteOffset:idxOff,byteLength:idxBytes.length,target:34963}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5121,count:3,type:'VEC3',normalized:true},{bufferView:2,componentType:5123,count:3,type:'SCALAR',min:[0],max:[2]}]};
 const jb=Buffer.from(JSON.stringify(j));const jp=Buffer.concat([jb,Buffer.alloc(align4(jb.length)-jb.length,0x20)]);const bp=Buffer.from(bin);const total=12+8+jp.length+8+bp.length;const out=Buffer.alloc(total);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(total,8);let o=12;out.writeUInt32LE(jp.length,o);out.writeUInt32LE(0x4e4f534a,o+4);jp.copy(out,o+8);o+=8+jp.length;out.writeUInt32LE(bp.length,o);out.writeUInt32LE(0x004e4942,o+4);bp.copy(out,o+8);return out;
}
const bytes=glb();const path='evidence/company-surface-independent-v1/failure-repro.glb';fs.writeFileSync(path,bytes);const sha=crypto.createHash('sha256').update(bytes).digest('hex');
const resource={id:'failure-repro',version:1,coordinates:{units:'metres',up:'+Y',forward:'+Z'},asset:{format:'glb',url:'/failure-repro.glb',sha256:sha,bytes:bytes.length},usePoints:[{id:'bad',seatNodeId:'MissingSeat',backNodeId:'MissingBack'}]};
const counts={material:0,geometry:0,texture:0},duplicateDispose={material:0,geometry:0,texture:0};const seen={material:new WeakSet(),geometry:new WeakSet(),texture:new WeakSet()};const md=THREE.Material.prototype.dispose,gd=THREE.BufferGeometry.prototype.dispose,td=THREE.Texture.prototype.dispose;THREE.Material.prototype.dispose=function(){counts.material++;if(seen.material.has(this))duplicateDispose.material++;seen.material.add(this);return md.call(this)};THREE.BufferGeometry.prototype.dispose=function(){counts.geometry++;if(seen.geometry.has(this))duplicateDispose.geometry++;seen.geometry.add(this);return gd.call(this)};THREE.Texture.prototype.dispose=function(){counts.texture++;if(seen.texture.has(this))duplicateDispose.texture++;seen.texture.add(this);return td.call(this)};
const lib=createCompanyAssetLibrary({fetchImpl:async()=>({ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)})});let error;try{await lib.preload([resource])}catch(e){error={code:e.code,message:e.message}}
lib.dispose();THREE.Material.prototype.dispose=md;THREE.BufferGeometry.prototype.dispose=gd;THREE.Texture.prototype.dispose=td;
const report={sha256:sha,bytes:bytes.length,error,candidate:process.argv[2]||"fixed",disposeCounts:counts,duplicateDispose,expectation:'COLOR_0 triggers GLTFLoader assignFinalMaterial clone. Parser cache retains source material while pack scene uses cloned material. Both must be disposed on post-parse validation failure.',source:'prototype/src/company/asset-library.js'};fs.writeFileSync('evidence/company-surface-independent-v1/root-'+(process.argv[2]||'fixed')+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));


