// Full-output equivalence to the published source, plus warmed CPU-only timing.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {glb,fixture,sha} from './face-visible-fixture.mjs';
import {createFacialGeometry} from '../prototype/src/facial-geometry.js';
import {reserveFaceNormalLayout} from '../prototype/src/face-normal-reservation.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2]||'');assert(process.argv[2]&&!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const baselineCommit='0137d7e94be80bff15ae391f54e3c31a259babeb';
const old=execFileSync('git',['show',baselineCommit+':prototype/src/facial-geometry.js'],{cwd:root});
for(const name of ['facial-geometry-profiles.js','facial-geometry-contract.js'])assert.equal(sha(fs.readFileSync(path.join(root,'prototype/src',name))),sha(execFileSync('git',['show',baselineCommit+':prototype/src/'+name],{cwd:root})));
let code=old.toString().replace("from 'three'",`from '${pathToFileURL(path.join(root,'prototype/node_modules/three/build/three.module.js')).href}'`);
for(const name of ['facial-geometry-profiles.js','facial-geometry-contract.js'])code=code.replace(`from './${name}'`,`from '${pathToFileURL(path.join(root,'prototype/src',name)).href}'`);
const baseline=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).createFacialGeometry;
globalThis.fetch=async url=>new Response(fs.readFileSync(path.join(root,'prototype/public',String(url).slice(1))));
const signature=g=>({attributes:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,sha(a.array)])),morph:{...Object.fromEntries(Object.entries(g.morphAttributes).filter(([k])=>k!=='normal').map(([k,list])=>[k,list.map(a=>sha(a.array))])),normal:(g.morphAttributes.normal||g.morphAttributes.position.map(a=>({array:new Float32Array(a.array.length)}))).map(a=>sha(a.array))},index:sha(g.index.array),box:g.boundingBox,sphere:g.boundingSphere});
const report={baselineCommit,baselineSHA:sha(old),candidateSHA:sha(fs.readFileSync(path.join(root,'prototype/src/facial-geometry.js'))),cases:[],reservations:[],benchmarks:[],scope:'CPU all preexisting attribute/index/morph/bounds bytes identical; absent NORMAL interpreted as exactly zero relative deltas only. Not identical GPU layout. No browser/GPU or speed acceptance.'};
const samples=[
 ['old025',{mouthWidth:.025}],['oldNegative',{mouthWidth:-.04}],['oldPositive',{mouthWidth:.04}],
 ['mouthNegative',{mouthWidth:-.12}],['mouthPositive',{mouthWidth:.12}],
 ['oldEye',{eyeSample:'aperture-width101-v1'}],['newEye',{eyeSample:'aperture-width105-v2'}],
 ['oldNose',{noseSample:'tip-forward05-v1'}],['newNose',{noseSample:'tip-forward2-v2'}],
 ['oldBrow',{browSample:'height1-spacing1-v1'}],['newBrow',{browSample:'height3-spacing3-v2'}],
 ['combined',{mouthWidth:.12,browSample:'height3-spacing3-v2',noseSample:'tip-forward2-v2',eyeSample:'aperture-width105-v2'}],
 ['mixed',{mouthWidth:.025,browSample:'height3-spacing3-v2',noseSample:'tip-forward2-v2',eyeSample:'aperture-width105-v2'}]
];
try{
 for(const body of ['female','male','jaw']){
  const src=glb(path.join(root,body==='jaw'?'prototype/public/assets/m2-male-face-v1/avatar.vrm':`prototype/public/assets/foundation/base-${body}-roundtrip.vrm`));
  const a=fixture(src),b=fixture(src);const reserved=reserveFaceNormalLayout(b.vrm,src.sha);report.reservations.push({body,...reserved});assert.deepEqual(a.geometries.map(signature),b.geometries.map(signature),'Only zero NORMAL slots may differ initially');a.api=baseline({vrm:a.vrm,avatarSha256:src.sha});b.api=createFacialGeometry({vrm:b.vrm,avatarSha256:src.sha});
  const initial=a.geometries.map(signature);
  for(const [name,patch]of body==='jaw'?[['jawMouth',{mouthWidth:.04}]]:samples){
   assert((await a.api.set({reset:true})).applied);assert((await b.api.set({reset:true})).applied);
   assert((await a.api.set(patch)).applied,name);assert((await b.api.set(patch)).applied,name);
   assert.deepEqual(a.api.getState(),b.api.getState());
   for(let i=0;i<a.meshes.length;i++)assert.deepEqual(signature(a.meshes[i].geometry),signature(b.meshes[i].geometry),body+':'+name+':'+i);
   assert.deepEqual(a.geometries.map(signature),initial);assert.deepEqual(b.geometries.map(signature),initial);
   report.cases.push({body,name,passed:true});
  }
  a.api.dispose();b.api.dispose();assert.deepEqual(a.geometries.map(signature),initial);assert.deepEqual(b.geometries.map(signature),initial);
 }
 report.status='passed';
}catch(e){report.status='failed';report.error=String(e);process.exitCode=1;console.error(e);}
finally{fs.writeFileSync(path.join(out,'baseline-facial-geometry.js'),old);fs.copyFileSync(fileURLToPath(import.meta.url),path.join(out,'executed-script.mjs'));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
