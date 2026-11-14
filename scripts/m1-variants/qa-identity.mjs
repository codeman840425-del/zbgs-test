// Actual production equipment adapter negative identity gate, no browser/GLB decoding.
// The fixture needs no rig because the identity gate must reject before bindings/fetch.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createEquipment} from '../../prototype/src/equipment.js';
const root=new URL('../../',import.meta.url),reports=[];
const original='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95';
const male='62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff';
const variants=JSON.parse(await readFile(new URL('assets-source/m1-variants/build-report.json',root),'utf8'));
const savedFetch=globalThis.fetch,savedWindow=globalThis.window;globalThis.window={location:{href:'http://qa.invalid/'}};
try{
 for(const variant of variants){
  const manifest=JSON.parse(await readFile(new URL(`prototype/public/assets/m1-variants/${variant.id}/equipment/equipment.json`,root),'utf8'));
  for(const wrong of [original,male,...variants.filter(v=>v.id!==variant.id).map(v=>v.vrmSha256)]){
   let requests=0;globalThis.fetch=async()=>{requests++;assert.equal(requests,1,'Identity rejection must not request garment GLB');return{ok:true,json:async()=>manifest};};
   const scene=new THREE.Group();const adapter=await createEquipment({vrm:{scene,humanoid:{}},manifestUrl:'/equipment.json',avatarSha256:wrong});
   for(const entry of manifest.items)await assert.rejects(()=>adapter.load(entry.id),/not approved for this avatar identity/);
   adapter.dispose();assert.equal(scene.children.length,0);reports.push({id:variant.id,rejectedAvatarSha256:wrong,garmentsRejected:manifest.items.length,networkRequests:requests,noGarmentRequest:true,noSceneChildren:true});
  }
 }
}finally{globalThis.fetch=savedFetch;if(savedWindow===undefined)delete globalThis.window;else globalThis.window=savedWindow;}
await writeFile(new URL('assets-source/m1-variants/negative-identity-report.json',root),JSON.stringify({productionAdapter:'prototype/src/equipment.js',cases:reports,limits:'Actual negative identity gate only; successful loading/animation is independently checked in browser by the integration owner.'},null,2));console.log(JSON.stringify({cases:reports.length,rejectedGarments:reports.reduce((n,r)=>n+r.garmentsRejected,0),passed:true}));
