import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
if(!process.argv[2]||!process.argv[3])throw Error('Pass isolated worktree root explicitly');
const root=path.resolve(process.argv[2]),src=path.join(root,'prototype/src/glasses-temple-fit.js');
const sha=b=>createHash('sha256').update(b).digest('hex'),raw=await fs.readFile(src,'utf8'),registry=JSON.parse(await fs.readFile(path.join(root,'prototype/src/glasses-temple-fit-manifest.json')));
const code=raw.replace("from 'three'",'from '+JSON.stringify(pathToFileURL(path.join(root,'prototype/node_modules/three/build/three.module.js')).href)).replace("import registry from './glasses-temple-fit-manifest.json';",'const registry='+JSON.stringify(registry)+';');
const {validateTempleProfile,fitGlassesTemples}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const {GLTFLoader}=await import(pathToFileURL(path.join(root,'prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js')));
const bytes=await fs.readFile(path.join(root,'prototype/public/assets/m1c/studio-glasses-v1.glb')),accessorySHA256=sha(bytes),load=async()=> (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
const savedFetch=globalThis.fetch,checks=[],check=(name,value)=>{assert.ok(value,name);checks.push(name)},copy=x=>structuredClone(x);
try {
 for(const entry of registry.profiles){
 const buffer=await fs.readFile(path.join(root,'prototype/public',entry.url)),profile=JSON.parse(buffer);check(entry.body+' profile SHA',sha(buffer)===entry.sha256&&buffer.length===entry.bytes);
 check(entry.body+' positive schema',validateTempleProfile(profile,entry.bodySHA256,accessorySHA256));
 const negatives=[p=>p.bodySHA256='0'.repeat(64),p=>p.accessorySHA256='0'.repeat(64),p=>p.schema='unknown',p=>p.controls[1].mesh=p.controls[0].mesh,p=>p.controls[0].vertices=35,p=>p.controls[0].rings[0].indices[0]=1,p=>p.controls[0].rings[0].targetCenter[1]=NaN,p=>p.controls[0].rings[0].rotationRowMajor[0]=2,p=>p.controls[0].rings[0].rotationRowMajor[0]*=-1,p=>p.controls[0].positionSHA256='bad'];
 negatives.forEach((f,i)=>{const p=copy(profile);f(p);check(entry.body+' schema negative '+i,!validateTempleProfile(p,entry.bodySHA256,accessorySHA256));});
 globalThis.fetch=async()=>new Response(buffer);
 const one=await load(),two=await load(),original=new Map();one.traverse(m=>{if(m.isMesh)original.set(m.name,{geometry:m.geometry,hash:sha(Buffer.from(m.geometry.attributes.position.array.buffer))});});
 const options={bodySHA256:entry.bodySHA256,accessorySHA256};await fitGlassesTemples(one,options);
 one.traverse(m=>{if(!m.isMesh)return;const old=original.get(m.name),other=two.getObjectByName(m.name);check(entry.body+' source bytes retained '+m.name,sha(Buffer.from(old.geometry.attributes.position.array.buffer))===old.hash);check(entry.body+' instance untouched '+m.name,sha(Buffer.from(other.geometry.attributes.position.array.buffer))===old.hash);check(entry.body+' geometry identity '+m.name,m.name.startsWith('Temple')?m.geometry!==old.geometry:m.geometry===old.geometry);});
 const before=one.getObjectByName('Temple1').geometry.attributes.position.array.slice();await fitGlassesTemples(two,options);check(entry.body+' no shared fitted geometry',one.getObjectByName('Temple1').geometry!==two.getObjectByName('Temple1').geometry);two.getObjectByName('Temple1').geometry.attributes.position.setX(0,123);check(entry.body+' mutation isolated',one.getObjectByName('Temple1').geometry.attributes.position.getX(0)===before[0]);
 for(const [name,response,signal]of [['http',()=>new Response('no',{status:503})],['hash',()=>new Response(Buffer.alloc(buffer.length))],['aborted',()=>new Response(buffer),AbortSignal.abort()]]){
 globalThis.fetch=async()=>response();const object=await load(),old=object.getObjectByName('Temple1').geometry;await assert.rejects(()=>fitGlassesTemples(object,{...options,signal}));check(entry.body+' fail closed '+name,object.getObjectByName('Temple1').geometry===old);}
 globalThis.fetch=async()=>new Response(buffer);const malformed=await load(),old=malformed.getObjectByName('Temple-1').geometry;malformed.getObjectByName('Temple1').geometry.attributes.position.setX(0,999);await assert.rejects(()=>fitGlassesTemples(malformed,options));check(entry.body+' two-temple atomic failure',malformed.getObjectByName('Temple-1').geometry===old);
 }
 globalThis.fetch=()=>{throw Error('unknown body must not fetch')};const unknown=await load();await assert.rejects(()=>fitGlassesTemples(unknown,{bodySHA256:'f'.repeat(64),accessorySHA256}),/精确匹配/);checks.push('unsupported body rejects before fetch');
 const report={status:'passed',checks,sourceRawSHA256:sha(Buffer.from(raw)),accessorySHA256,method:'Exact helper text; only import specifiers resolved for Node and identical manifest inlined. Real GLTFLoader geometry, mocked profile HTTP. Browser post-load/version cancellation remains separate.'};await fs.mkdir(path.resolve(process.argv[3]),{recursive:false});await fs.writeFile(path.join(path.resolve(process.argv[3]),'node-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:checks.length,sourceRawSHA256:report.sourceRawSHA256}));
}finally{globalThis.fetch=savedFetch;}
