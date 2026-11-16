// Independent CPU review. Executes actual coverage module and actual M1 factory
// function with an equipment adapter fixture; no GLTF/browser or exporter.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as T from '../prototype/node_modules/three/build/three.module.js';
import {createBodyCoverageSet,completeBodyGeometry} from '../prototype/src/body-coverage.js';
const out=path.resolve(process.argv[2]);await fs.mkdir(out,{recursive:false});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const source=await fs.readFile('prototype/src/m1-equipment.js','utf8');
const coverageSource=await fs.readFile('prototype/src/body-coverage.js');
const report={scope:'Actual functions; synthetic SkinnedMesh and adapter; clone failure is injected, not observed GPU OOM',sourceSHA:{m1:hash(source),coverage:hash(coverageSource)},checks:[]};
const fixture=()=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,1,0],3));g.setIndex(new T.Uint32BufferAttribute([0,1,2,0,2,3],1));g.addGroup(0,6,0);g.addGroup(0,6,1);const m=new T.MeshBasicMaterial();m.name='M00_000_Body_00_SKIN';const mesh=new T.SkinnedMesh(g,[m,m]);const fit={schema:'zbgs-equipment-body-coverage.1',id:'fixture',avatarSha256:'body',itemId:'top',itemSha256:'top-sha',bodyMaterial:m.name,bodyFaceCount:2,bodyIndexComponentType:5125,bodyIndexAccessorSha256:hash(Buffer.from(g.index.array.buffer)),selectedFaceIds:[0],selectedTriangles:[[0,1,2]]};const bytes=Buffer.from(JSON.stringify(fit));const binding={entry:{id:'top',sha256:'top-sha',compatibleAvatarSha256:'body'},descriptor:{url:'fixture',sha256:hash(bytes)}};return{g,mesh,bytes,binding}};
const oldFetch=globalThis.fetch;
try{
 const f=fixture();globalThis.fetch=async()=>new Response(f.bytes);
 const results=await Promise.allSettled([0,1].map(()=>createBodyCoverageSet({body:[f.mesh],avatarSha256:'body',bindings:[f.binding]})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const c=results.find(r=>r.status==='fulfilled').value;c.applyEquipmentSet(['top']);assert.equal(completeBodyGeometry(f.mesh),f.g);c.dispose();
 report.checks.push({name:'Concurrent new-set preparation has one owner',pass:true});
 const c2=await createBodyCoverageSet({body:[f.mesh],avatarSha256:'body',bindings:[f.binding]});
 const realClone=f.g.clone;f.g.clone=()=>{throw Error('injected clone failure')};assert.throws(()=>c2.applyEquipmentSet(['top']),/injected/);assert.equal(f.mesh.geometry,f.g);f.g.clone=realClone;c2.applyEquipmentSet(['top']);c2.dispose();
 report.checks.push({name:'Coverage helper failed preparation preserves existing render and can retry',pass:true});

 const x=fixture();globalThis.fetch=async()=>new Response(x.bytes);const scene=new T.Group();scene.add(x.mesh);
 const clothMaterial=new T.MeshBasicMaterial();clothMaterial.name='M00_000_Tops_00_CLOTH';const cloth=new T.SkinnedMesh(new T.BufferGeometry(),clothMaterial);scene.add(cloth);
 let disposed=0,applied=0;const adapter={load:async()=>{},get:()=>({entry:x.binding.entry,meshes:[]}),applyLoadedSet:()=>{applied++},dispose:()=>{disposed++}};
 const config={sha256:'body',ids:{top:'top',pants:'pants',shoes:'shoes'},bodyCoverage:x.binding.descriptor,outfits:[{index:0}]};
 const fnSource=source.slice(source.indexOf('export async function createM1Equipment')).replace('export async function','async function');
 const factory=new Function('createEquipment','createM1Skirt','selectSkirtFit','foundationProfile','createBodyCoverageSet',fnSource+';return createM1Equipment;')(async()=>adapter,()=>null,()=>null,()=>config,createBodyCoverageSet);
 const clone=x.g.clone;x.g.clone=()=>{throw Error('injected clone failure')};let failure;
 try{await factory({vrm:{scene},avatarSha256:'body'});}catch(e){failure=e.message}
 x.g.clone=clone;let retryError=null,retry;
 try{retry=await createBodyCoverageSet({body:[x.mesh],avatarSha256:'body',bindings:[x.binding]});}catch(e){retryError=e.message}finally{retry?.dispose()}
 assert.equal(failure,'injected clone failure');
 report.factoryFailure={error:failure,adapterDisposed:disposed,sourceClothesVisible:cloth.visible,appliedSetCalls:applied,retryCoverageError:retryError,expected:{adapterDisposed:1,sourceClothesVisible:true,retryCoverageError:null}};
 report.factoryCleanupPassed=disposed===1&&cloth.visible===true&&retryError===null;
 report.status=report.factoryCleanupPassed?'passed':'confirmed-factory-cleanup-gap';
}finally{globalThis.fetch=oldFetch;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await fs.copyFile(new URL(import.meta.url),path.join(out,'executed-script.mjs'))}
console.log(JSON.stringify(report,null,2));
