import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import {applyWindowCoverState,validateWindowCoverResource,validateWindowCoverGeometry} from '../../prototype/src/company/window-cover-data.js';

const out=process.argv[2]||'evidence/company-window-cover-geometry-v1';await fs.mkdir(out,{recursive:true});
const covers=catalog.resources.filter(r=>r.productionBranch==='window-cover');assert.equal(covers.length,4);
const loader=new GLTFLoader(),checks=[];
const hash=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
for(const resource of covers){
  const bytes=await fs.readFile(`prototype/public${resource.asset.url}`);assert.equal(bytes.length,resource.asset.bytes);assert.equal(await hash(bytes),resource.asset.sha256);
  const pack=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  validateWindowCoverResource(resource,(code,path,message)=>{throw Error(`${code}:${path}:${message}`)});
  validateWindowCoverGeometry(pack.scene,resource,(code,path,message)=>{throw Error(`${code}:${path}:${message}`)});
  const bounds=[];
  for(const value of [0,.5,1]){const root=pack.scene.clone(true);applyWindowCoverState(root,resource,{openFraction:value});const box=new THREE.Box3();box.makeEmpty();for(const part of resource.windowCoverParts.parts)for(const name of part.nodes)box.union(new THREE.Box3().setFromObject(root.getObjectByName(name)));assert(box.min.x>=-.801&&box.max.x<=.801&&box.min.y>=-.601&&box.max.y<=.601&&box.min.z>=-.001&&box.max.z<=.081,`${resource.id} state ${value} escapes window envelope`);bounds.push({openFraction:value,min:box.min.toArray(),max:box.max.toArray()});}
  assert.notDeepEqual(bounds[0],bounds[2],`${resource.id} open state did not change geometry`);
  checks.push({id:resource.id,sha256:resource.asset.sha256,mode:resource.windowCoverParts.mode,bounds,parts:resource.windowCoverParts.parts});
}
const report={status:'passed',checks,limits:['CPU GLTF readback and actual state transforms only; no GPU performance or C3 character evidence.']};await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:checks.length}));
