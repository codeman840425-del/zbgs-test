import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import * as T from '../prototype/node_modules/three/build/three.module.js';
import {createBodyCoverageSet,completeBodyGeometry} from '../prototype/src/body-coverage.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const geometry=new T.BufferGeometry();
geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,1,0,2,1,0],3));
geometry.setIndex(new T.Uint32BufferAttribute([0,1,2,0,2,3,1,4,2],1));
geometry.addGroup(0,9,0);geometry.addGroup(0,9,1);
const mat=new T.MeshBasicMaterial();mat.name='body';
const mesh=new T.Mesh(geometry,[mat,mat]),peer=new T.Mesh(geometry,[mat,mat]);
const fixtures=new Map();
function binding(id,faces){
 const fit={schema:'zbgs-equipment-body-coverage.1',id:'mask-'+id,avatarSha256:'body',itemId:id,itemSha256:'sha-'+id,
  bodyMaterial:'body',bodyFaceCount:3,bodyIndexComponentType:5125,bodyIndexAccessorSha256:sha(Buffer.from(geometry.index.array.buffer)),
  selectedFaceIds:faces,selectedTriangles:faces.map(f=>[...geometry.index.array.slice(f*3,f*3+3)])};
 const bytes=Buffer.from(JSON.stringify(fit));fixtures.set(id,bytes);
 return {entry:{id,sha256:'sha-'+id,compatibleAvatarSha256:'body'},descriptor:{url:id,sha256:sha(bytes)}};
}
const bindings=[binding('top',[0]),binding('outer',[0,1])],oldFetch=globalThis.fetch;
globalThis.fetch=async url=>new Response(fixtures.get(url));
const checks=[];let controller,other;
try{
 controller=await createBodyCoverageSet({body:[mesh],avatarSha256:'body',bindings});
 other=await createBodyCoverageSet({body:[peer],avatarSha256:'body',bindings});
 controller.applyEquipmentSet(['top']);assert.equal(mesh.geometry.index.count,6);
 assert.equal(completeBodyGeometry(mesh),geometry);assert.equal(peer.geometry,geometry);
 controller.applyEquipmentSet(['top','outer']);assert.equal(mesh.geometry.index.count,3);
 assert.equal(controller.getInfo().hiddenFaces,2,'Overlap counted once');
 assert.deepEqual(mesh.geometry.groups,[{start:0,count:3,materialIndex:0},{start:0,count:3,materialIndex:1}]);
 const old=mesh.geometry;controller.applyEquipmentSet(['outer','top','shoes']);assert.equal(mesh.geometry,old,'Same mask set reuses geometry');
 controller.applyEquipmentSet(['top']);assert.deepEqual([...mesh.geometry.index.array],[0,2,3,1,4,2]);
 other.applyEquipmentSet(['outer']);assert.equal(peer.geometry.index.count,3);assert.equal(mesh.geometry.index.count,6);
 controller.applyEquipmentSet([]);assert.equal(mesh.geometry,geometry);assert.equal(peer.geometry.index.count,3);
 checks.push('Overlapping mask union, removal restores only released region, full restore, independent instance, contact original and duplicated outline groups');
 await assert.rejects(createBodyCoverageSet({body:[mesh],avatarSha256:'body',bindings}),/layout|owned/);
 assert.throws(()=>controller.applyEquipmentSet(['top','top']));assert.equal(mesh.geometry,geometry);
 controller.dispose();other.dispose();assert.equal(peer.geometry,geometry);
 const bad=structuredClone(bindings);bad[1].entry.sha256='wrong';
 await assert.rejects(createBodyCoverageSet({body:[mesh],avatarSha256:'body',bindings:bad}),/versions/);
 assert.equal(mesh.geometry,geometry);assert.equal(completeBodyGeometry(mesh),geometry);
 controller=await createBodyCoverageSet({body:[mesh],avatarSha256:'body',bindings});controller.applyEquipmentSet(['outer']);controller.dispose();controller.applyEquipmentSet(['top']);assert.equal(mesh.geometry,geometry);
 checks.push('Duplicate owner, invalid set and wrong asset rejected without partial mask registration; retry and dispose restore complete body');
}finally{controller?.dispose();other?.dispose();globalThis.fetch=oldFetch;}
const result={passed:true,checks,scope:'Synthetic exact-index masks exercise runtime implementation. Existing female top requires browser regression; no outerwear garment fit claim.'};
if(process.argv[2]){await mkdir(process.argv[2],{recursive:true});await writeFile(path.join(process.argv[2],'coverage.json'),JSON.stringify(result,null,2));}
console.log(JSON.stringify(result,null,2));
