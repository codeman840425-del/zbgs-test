import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from '../prototype/node_modules/three/build/three.module.js';
import { createBodyCoverage, completeBodyGeometry } from '../prototype/src/body-coverage.js';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const geometry=new T.BufferGeometry();
geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,1,0],3));
geometry.setIndex(new T.Uint32BufferAttribute([0,1,2,0,2,3],1));
geometry.addGroup(0,6,0);geometry.addGroup(0,6,1);
const material=new T.MeshBasicMaterial();material.name='body';
const mesh=new T.Mesh(geometry,[material,material]),other=new T.Mesh(geometry,material);
const valid={schema:'zbgs-outfit-body-coverage-candidate.1',id:'fixture',avatarSha256:'body',topId:'top',topSha256:'top-sha',bodyMaterial:'body',bodyFaceCount:2,bodyIndexComponentType:5125,bodyIndexAccessorSha256:sha(Buffer.from(geometry.index.array.buffer)),selectedFaceIds:[0],selectedTriangles:[[0,1,2]]};
const realFetch=globalThis.fetch;let checks=0;
async function create(fit=valid, overrides={}){
 const bytes=Buffer.from(JSON.stringify(fit));globalThis.fetch=async()=>new Response(bytes);
 return createBodyCoverage({body:[mesh],avatarSha256:'body',topEntry:{id:'top',sha256:'top-sha'},descriptor:{url:'fixture',sha256:sha(bytes)},...overrides});
}
try{
 const c=await create();c.setEnabled(true);
 assert.equal(mesh.geometry.index.count,3);assert.equal(completeBodyGeometry(mesh),geometry);
 assert.equal(other.geometry,geometry);assert.equal(other.geometry.index.count,6);
 assert.deepEqual(mesh.geometry.groups,[{start:0,count:3,materialIndex:0},{start:0,count:3,materialIndex:1}]);
 assert.deepEqual([...mesh.geometry.attributes.position.array],[...geometry.attributes.position.array]);checks+=5;
 c.setEnabled(false);assert.equal(mesh.geometry,geometry);c.setEnabled(true);c.dispose();assert.equal(mesh.geometry,geometry);c.setEnabled(true);assert.equal(mesh.geometry,geometry);checks+=3;
 const bad=[{avatarSha256:'wrong'},{topSha256:'wrong'},{topId:'wrong'},{bodyIndexAccessorSha256:'wrong'},{selectedFaceIds:[0,0],selectedTriangles:[[0,1,2],[0,1,2]]},{selectedFaceIds:[2]},{selectedTriangles:[[1,0,2]]},{bodyFaceCount:3},{bodyIndexComponentType:5123},{bodyMaterial:'missing'}];
 for(const change of bad){await assert.rejects(create({...valid,...change}));assert.equal(mesh.geometry,geometry);checks++;}
 await assert.rejects(create(valid,{descriptor:{url:'fixture',sha256:'wrong'}}));checks++;
 await assert.rejects(create(valid,{body:[mesh,other]}));checks++;
 const report={checks,passed:true,scope:'Reversible render index, original geometry for contact, shared-source instance isolation, outline group preservation, invalid identity/topology rejection; not visual fit.'};
 fs.mkdirSync('evidence/body-coverage-regression',{recursive:true});fs.writeFileSync('evidence/body-coverage-regression/report.json',JSON.stringify(report,null,2));console.log(report);
}finally{globalThis.fetch=realFetch;}
