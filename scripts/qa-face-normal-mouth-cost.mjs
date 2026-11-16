// Fixed two-way CPU cost sample, not browser/performance acceptance.
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
const baseCommit='13526ff',read=p=>execFileSync('git',['show',baseCommit+':prototype/src/'+p],{cwd:root}),data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const three=pathToFileURL(path.join(root,'prototype/node_modules/three/build/three.module.js')).href;
const helperBytes=read('face-normal-reservation.js'),helperURL=data(helperBytes.toString().replace("from 'three'",`from '${three}'`)),helper=await import(helperURL);
const moduleBytes=read('facial-geometry.js');let code=moduleBytes.toString().replace("from 'three'",`from '${three}'`).replace("from './face-normal-reservation.js'",`from '${helperURL}'`);
for(const p of ['facial-geometry-profiles.js','facial-geometry-contract.js'])code=code.replace(`from './${p}'`,`from '${pathToFileURL(path.join(root,'prototype/src',p)).href}'`);
const old=(await import(data(code))).createFacialGeometry;
globalThis.fetch=async url=>new Response(fs.readFileSync(path.join(root,'prototype/public',String(url).slice(1))));
const rows=[];
for(const sex of ['female','male']){
 const src=glb(path.join(root,`prototype/public/assets/foundation/base-${sex}-roundtrip.vrm`));
 for(let round=0;round<4;round++)for(const variant of round%2?['two','six']:['six','two']){
  const f=fixture(src),start=performance.now(),reservation=(variant==='two'?reserveFaceNormalLayout:helper.reserveFaceNormalLayout)(f.vrm,src.sha),reserveMs=performance.now()-start;
  const api=(variant==='two'?createFacialGeometry:old)({vrm:f.vrm,avatarSha256:src.sha});
  const setStart=performance.now();assert((await api.set({mouthWidth:-.12})).applied);const firstMouthCPUms=performance.now()-setStart;
  rows.push({sex,round,variant,reserved:reservation.geometryCount,reserveMs,firstMouthCPUms});api.dispose();
 }
}
const summaries=[];for(const sex of ['female','male'])for(const variant of ['six','two']){
 const group=rows.filter(r=>r.sex===sex&&r.variant===variant);summaries.push({sex,variant,metrics:Object.fromEntries(['reserveMs','firstMouthCPUms'].map(k=>{const s=group.map(r=>r[k]).sort((a,b)=>a-b);return[k,{min:s[0],median:(s[1]+s[2])/2,max:s[3]}];}))});
}
const report={baselineCommit:baseCommit,baselineHelperSHA:sha(helperBytes),candidateHelperSHA:sha(fs.readFileSync(path.join(root,'prototype/src/face-normal-reservation.js'))),rows,summaries,scope:'Four fixed alternating CPU iterations; fixture construction excluded, local file fetch mocked, actual operator/crypto checks retained, no compile/GPU. No statistical performance conclusion or 570ms recovery claim.'};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));fs.copyFileSync(fileURLToPath(import.meta.url),path.join(out,'executed-script.mjs'));console.log(JSON.stringify(summaries));
