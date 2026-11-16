import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import { createFacialGeometry } from '../prototype/src/facial-geometry.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=path.join(root,'assets-source/face-parameters-v1');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'recipe-manifest.json')));
let gate=null,fetchCount=0,networkFailure=false,tamper=false; let tamperBrowIdentity=false;
globalThis.fetch=async url=>{
 fetchCount++;if(gate)await gate;
 if(networkFailure&&String(url).includes('face-eye'))return new Response('unavailable',{status:503});
 let bytes=fs.readFileSync(path.join(root,'prototype/public',String(url).slice(1)));
 if(tamper&&String(url).endsWith('-eye.recipe.json'))bytes=Buffer.concat([bytes,Buffer.from(' ')]);
 return new Response(bytes);
};

function glb(filename){
 const bytes=fs.readFileSync(filename),length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length).toString()),bin=bytes.subarray(28+length);
 function acc(i){const a=doc.accessors[i],v=doc.bufferViews[a.bufferView],types={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},Type=types[a.componentType],size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type];assert(!a.sparse&&!v.byteStride);const b=bin.subarray((v.byteOffset||0)+(a.byteOffset||0),(v.byteOffset||0)+(a.byteOffset||0)+a.count*size*Type.BYTES_PER_ELEMENT);return {array:new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)),size};}
 return {doc,acc,sha:sha(bytes)};
}
function fixture(source,geometries=null){
 const scene=new THREE.Group(),face=source.doc.meshes.find(m=>m.name.startsWith('Face')),meshes=[];
 if(!geometries)geometries=face.primitives.map(p=>{
  const g=new THREE.BufferGeometry();
  for(const [semantic,i]of Object.entries(p.attributes)){
   const names={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',JOINTS_0:'skinIndex',WEIGHTS_0:'skinWeight'},a=source.acc(i);if(names[semantic])g.setAttribute(names[semantic],new THREE.BufferAttribute(a.array,a.size));
  }
  const index=source.acc(p.indices);g.setIndex(new THREE.BufferAttribute(index.array,1));
  g.morphTargetsRelative=true;g.morphAttributes.position=p.targets.map(t=>{const a=source.acc(t.POSITION);return new THREE.BufferAttribute(a.array,a.size);});if(p.targets[0].NORMAL!==undefined)g.morphAttributes.normal=p.targets.map(t=>{const a=source.acc(t.NORMAL);return new THREE.BufferAttribute(a.array,a.size);});g.computeBoundingBox();g.computeBoundingSphere();return g;
 });
 for(let i=0;i<geometries.length;i++)for(const outline of [false,true]){
  const material=new THREE.MeshBasicMaterial();material.name=source.doc.materials[face.primitives[i].material].name+(outline?' (Outline)':'');
  const mesh=new THREE.SkinnedMesh(geometries[i],material);scene.add(mesh);meshes.push(mesh);
 }
 return {vrm:{scene},meshes,geometries};
}



const oi=process.argv.indexOf('--out');if(oi<0)throw Error('--out NEW_DIR required');const out=path.resolve(root,process.argv[oi+1]);if(fs.existsSync(out))throw Error('Refuse overwrite');fs.mkdirSync(out,{recursive:true});
const cases=[];
for(const sex of ['female','male'])for(const sample of ['mouth88','mouth112','brow','nose','eye']){
 const suffix={mouth88:`mouth-visible-v2/generated/${sex}-mouth-width-88-v2`,mouth112:`mouth-visible-v2/generated/${sex}-mouth-width-112-v2`,brow:`face-brow-visible-v2/generated/${sex}-brow-height3-spacing3-v2`,nose:`face-nose-visible-v2/generated/${sex}-nose-tip-forward2-v2`,eye:`face-eye-visible-v2/generated/${sex}-eye-aperture-width105-v2`}[sample];
 cases.push({name:sex+'-'+sample,source:`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`,endpoint:`assets-source/${suffix}/avatar.vrm`,args:{mouth88:{mouthWidth:-.12},mouth112:{mouthWidth:.12},brow:{browSample:'height3-spacing3-v2'},nose:{noseSample:'tip-forward2-v2'},eye:{eyeSample:'aperture-width105-v2'}}[sample]});
}
const results=[];
for(const item of cases){
 const source=glb(path.join(root,item.source)),endpoint=glb(path.join(root,item.endpoint)),f=fixture(source),api=createFacialGeometry({vrm:f.vrm,avatarSha256:source.sha}),targetFace=endpoint.doc.meshes.find(m=>m.name.startsWith('Face'));
 const applied=await api.set(item.args);assert.equal(applied.applied,true,JSON.stringify({case:item.name,applied}));let maxPosition=0,maxNormal=0,active=0,skipped=0,normalCompared=false;
 for(let mi=0;mi<f.meshes.length;mi+=2){
  const g=f.meshes[mi].geometry,original=f.geometries[mi/2],name=f.meshes[mi].material.name,p=targetFace.primitives.find(p=>endpoint.doc.materials[p.material].name===name);
  assert(p);assert.equal(sha(g.index.array),sha(endpoint.acc(p.indices).array));
  const isActive=g!==original;isActive?active++:skipped++;
  const vertices=isActive?Array.from({length:g.attributes.position.count},(_,i)=>i):[...new Set(g.index.array)];
  const pos=endpoint.acc(p.attributes.POSITION).array,n=endpoint.acc(p.attributes.NORMAL).array,hasNormals=p.targets.every(t=>t.NORMAL!==undefined);
  assert.equal(p.targets.length,g.morphAttributes.position.length);
  for(let j=-1;j<p.targets.length;j++){
   const delta=j<0?null:endpoint.acc(p.targets[j].POSITION).array,dn=j<0||!hasNormals?null:endpoint.acc(p.targets[j].NORMAL).array;
   for(const v of vertices)for(let c=0;c<3;c++){
    const i=v*3+c;maxPosition=Math.max(maxPosition,Math.abs(g.attributes.position.array[i]+(j<0?0:g.morphAttributes.position[j].array[i])-pos[i]-(delta?.[i]||0)));
    if(hasNormals){normalCompared=true;maxNormal=Math.max(maxNormal,Math.abs(g.attributes.normal.array[i]+(j<0?0:g.morphAttributes.normal?.[j]?.array[i]||0)-n[i]-(dn?.[i]||0)));}
   }
  }
 }
 assert(maxPosition<3e-7);if(normalCompared)assert(maxNormal<1e-5,JSON.stringify({name:item.name,maxNormal}));
 results.push({name:item.name,sourceSha256:source.sha,endpointSha256:endpoint.sha,active,skipped,maxPosition,maxNormal:normalCompared?maxNormal:null,normalReference:normalCompared?'source final NORMAL on every absolute expression':'Raw source has no NORMAL morph: no false source-normal claim; strict baseline NORMAL equality is in cpu-1 report.'});api.dispose();
}
fs.writeFileSync(path.join(out,'executed-script.mjs'),fs.readFileSync(fileURLToPath(import.meta.url)));
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({moduleSha256:sha(fs.readFileSync(path.join(root,'prototype/src/facial-geometry.js'))),positionTolerance:3e-7,normalTolerance:1e-5,comparison:'Active primitive complete buffers; inactive original actual referenced indices; independent source endpoints, all absolute shapes.',results},null,2));console.log(JSON.stringify({out,passed:results.length,maxPosition:Math.max(...results.map(r=>r.maxPosition)),maxNormal:Math.max(...results.map(r=>r.maxNormal||0))}));
