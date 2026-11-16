// CPU inspection of actual admitted operators before zero-NORMAL reservation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {glb,fixture,sha} from './face-visible-fixture.mjs';
import {createFacialGeometry} from '../prototype/src/facial-geometry.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2]||'');assert(process.argv[2]&&!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
globalThis.fetch=async url=>new Response(fs.readFileSync(path.join(root,'prototype/public',String(url).slice(1))));
const cases=[['mouth-4',{mouthWidth:-.04}],['mouth+4',{mouthWidth:.04}],['mouth-12',{mouthWidth:-.12}],['mouth+12',{mouthWidth:.12}],['brow1',{browSample:'height1-spacing1-v1'}],['brow3',{browSample:'height3-spacing3-v2'}],['nose05',{noseSample:'tip-forward05-v1'}],['nose2',{noseSample:'tip-forward2-v2'}],['eye1',{eyeSample:'aperture-width101-v1'}],['eye5',{eyeSample:'aperture-width105-v2'}],['combined',{mouthWidth:.12,browSample:'height3-spacing3-v2',noseSample:'tip-forward2-v2',eyeSample:'aperture-width105-v2'}]];
const report={scope:'Actual createFacialGeometry activeRecords/prepareRender results; no reservation and no GPU. Input complete index evidence retained.',bodies:[]};
for(const sex of ['female','male']){
 const src=glb(path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`)),f=fixture(src),face=src.doc.meshes.find(m=>m.name.startsWith('Face'));
 let parts=[];const api=createFacialGeometry({vrm:f.vrm,avatarSha256:src.sha,prepareRender:p=>{parts=p;}}),rows=[];
 const indexEvidence=f.geometries.map((g,i)=>({primitive:i,material:src.doc.materials[face.primitives[i].material].name,indexSha256:sha(g.index.array),indices:Array.from(g.index.array),uniqueReferencedVertices:[...new Set(g.index.array)].sort((a,b)=>a-b)}));
 for(const [name,patch]of cases){
  await api.set({reset:true});parts=[];assert((await api.set(patch)).applied,name);
  const active=[];
  for(let i=0;i<f.geometries.length;i++){
   const before=f.geometries[i],after=f.meshes[2*i].geometry;if(after===before)continue;
   assert(parts.some(p=>p.mesh===f.meshes[2*i]&&p.geometry===after));
   const ids=indexEvidence[i].uniqueReferencedVertices,positionChanged=[],normalChanged=[];
   for(const v of ids){
    let pc=false,nc=false;
    for(let c=0;c<3;c++){
     const j=v*3+c;if(before.attributes.position.array[j]!==after.attributes.position.array[j])pc=true;
     if(before.attributes.normal.array[j]!==after.attributes.normal.array[j])nc=true;
     for(let t=0;t<after.morphAttributes.position.length;t++){
      if(before.morphAttributes.position[t].array[j]!==after.morphAttributes.position[t].array[j])pc=true;
      if((before.morphAttributes.normal?.[t]?.array[j]||0)!==(after.morphAttributes.normal?.[t]?.array[j]||0))nc=true;
     }
    }
    if(pc)positionChanged.push(v);if(nc)normalChanged.push(v);
   }
   active.push({primitive:i,material:indexEvidence[i].material,indexSha256:indexEvidence[i].indexSha256,positionChangedReferencedVertices:positionChanged,normalChangedReferencedVertices:normalChanged,normalMorphPropertyPresent:after.morphAttributes.normal!==undefined,normalTargets:after.morphAttributes.normal?.length||0,originalNormalTargets:before.morphAttributes.normal?.length||0});
  }
  rows.push({name,patch,actualRecipeSha256:api.getState().recipeSha256,active});
 }
 const mouths=rows.filter(r=>r.name.startsWith('mouth'));
 const expected=sex==='female'?[0,7]:[1,5];for(const r of mouths)assert.deepEqual(r.active.map(p=>p.primitive),expected);
 report.bodies.push({sex,baseSha256:src.sha,positionCount:f.geometries[0].attributes.position.count,targetCount:f.geometries[0].morphAttributes.position.length,indexEvidence,cases:rows,mouthOnlyPrimitives:expected});api.dispose();
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));fs.copyFileSync(fileURLToPath(import.meta.url),path.join(out,'executed-script.mjs'));
console.log(JSON.stringify(report.bodies.map(b=>({sex:b.sex,cases:b.cases.map(c=>({name:c.name,active:c.active.map(p=>({i:p.primitive,normal:p.normalMorphPropertyPresent,changed:p.normalChangedReferencedVertices.length}))}))}))));
