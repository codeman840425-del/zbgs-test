// Actual coverage and M1 factory functions with synthetic body/adapter fixtures.
import assert from 'node:assert/strict';
import {outfitSelection} from '../prototype/src/outfit-selection.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as T from '../prototype/node_modules/three/build/three.module.js';
import {createBodyCoverageSet,completeBodyGeometry} from '../prototype/src/body-coverage.js';
import {commitLoadedEquipmentSet,prepareLoadedEquipmentSet} from '../prototype/src/equipment-set.js';
if(!process.argv[2])throw Error('Pass a new evidence output directory');
const out=path.resolve(process.argv[2]);await fs.mkdir(out,{recursive:false});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const source=await fs.readFile('prototype/src/m1-equipment.js','utf8');
const coverageSource=await fs.readFile('prototype/src/body-coverage.js');
const report={scope:'Actual functions; synthetic SkinnedMesh and adapter using real equipment-set commit. CPU errors injected; no browser/GPU claim.',sourceSHA:{m1:hash(source),coverage:hash(coverageSource)},checks:[],passed:false};
function fixture(){
 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,1,0],3));
 g.setIndex(new T.Uint32BufferAttribute([0,1,2,0,2,3],1));g.addGroup(0,6,0);g.addGroup(0,6,1);
 const m=new T.MeshBasicMaterial();m.name='M00_000_Body_00_SKIN';
 const mesh=new T.SkinnedMesh(g,[m,m]);
 const fit={schema:'zbgs-equipment-body-coverage.1',id:'fixture',avatarSha256:'body',itemId:'top',itemSha256:'top-sha',bodyMaterial:m.name,bodyFaceCount:2,bodyIndexComponentType:5125,bodyIndexAccessorSha256:hash(Buffer.from(g.index.array.buffer)),selectedFaceIds:[0],selectedTriangles:[[0,1,2]]};
 const bytes=Buffer.from(JSON.stringify(fit));
 const binding={entry:{id:'top',sha256:'top-sha',compatibleAvatarSha256:'body'},descriptor:{url:'fixture',sha256:hash(bytes)}};
 return{g,mesh,bytes,binding};
}
const create=f=>createBodyCoverageSet({body:[f.mesh],avatarSha256:'body',bindings:[f.binding]});
const oldFetch=globalThis.fetch,controllers=new Set();let equipment;
try{
 const f=fixture();globalThis.fetch=async()=>new Response(f.bytes);
 const results=await Promise.allSettled([0,1].map(()=>create(f)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const c=results.find(r=>r.status==='fulfilled').value;controllers.add(c);
 c.applyEquipmentSet(['top']);assert.equal(completeBodyGeometry(f.mesh),f.g);c.dispose();c.dispose();assert.equal(f.mesh.geometry,f.g);
 report.checks.push('Concurrent new-set preparation has one owner; idempotent dispose restores full body');
 const c2=await create(f);controllers.add(c2);
 const realClone=f.g.clone;f.g.clone=()=>{throw Error('injected clone failure')};
 assert.throws(()=>c2.applyEquipmentSet(['top']),/injected/);assert.equal(f.mesh.geometry,f.g);
 f.g.clone=realClone;c2.applyEquipmentSet(['top']);const prior=f.mesh.geometry;
 const cancelled=c2.prepareEquipmentSet([]);assert.equal(f.mesh.geometry,prior);assert.deepEqual(c2.getInfo().activeItems,['top']);cancelled.dispose();cancelled.dispose();assert.equal(f.mesh.geometry,prior);
 const stale=c2.prepareEquipmentSet([]);c2.applyEquipmentSet([]);assert.throws(()=>stale.commit(),/no longer current/);stale.dispose();assert.equal(f.mesh.geometry,f.g);
 report.checks.push('Clone failure, abandoned preparation and stale commit preserve state; valid retry works');
 let pendingDisposed=0;
 f.g.clone=function(){const g=realClone.call(this);g.addEventListener('dispose',()=>{pendingDisposed++});return g};
 const pending=c2.prepareEquipmentSet(['top']);c2.dispose();pending.dispose();assert.equal(pendingDisposed,1);assert.throws(()=>pending.commit(),/no longer current/);
 f.g.clone=realClone;const c3=await create(f);controllers.add(c3);c3.dispose();
 report.checks.push('Controller dispose releases uncommitted clone once, rejects late commit and releases owner');

 const fnSource=source.slice(source.indexOf('export async function createM1Equipment')).replace('export async function','async function');
 function factoryFixture(){
  const f=fixture(),scene=new T.Group();scene.add(f.mesh);
  const material=new T.MeshBasicMaterial();material.name='M00_000_Tops_00_CLOTH';
  const cloth=new T.SkinnedMesh(new T.BufferGeometry(),material);scene.add(cloth);
  const ids={top:'top',pants:'pants',shoes:'shoes',skirt:'skirt',shorts:'shorts'};
  const catalog=Object.values(ids).map(id=>({...f.binding.entry,id,slot:id==='pants'||id==='shorts'?'bottom':id==='skirt'?'bottoms-overlay':id}));
  const loaded=new Map(catalog.map(entry=>[entry.id,{entry,meshes:[{}],container:{visible:false},stats:{}}]));
  const state={adapterDisposed:0,skirtDisposed:0,applied:0,failPrepare:false,failAdapter:false};
  const adapter={load:async()=>{},get:id=>loaded.get(id),prepareLoadedSet(selected){
   if(state.failAdapter)throw Error('injected adapter validation failure');
   const apply=prepareLoadedEquipmentSet(loaded,catalog,selected,'body');let live=true;
   return{isCurrent:()=>live,commit(){state.applied++;live=false;return apply();},dispose(){live=false;}};
  },applyLoadedSet(selected){
   state.applied++;if(state.failAdapter)throw Error('injected adapter validation failure');
   return commitLoadedEquipmentSet(loaded,catalog,selected,'body');
  },dispose(){state.adapterDisposed++}};
  const config={sha256:'body',ids,bodyCoverage:f.binding.descriptor,outfits:[{index:0,role:'pants'},{index:1,role:'skirt'},{index:2,role:'shorts'}]};
  const makeCoverage=async args=>{const c=await createBodyCoverageSet(args);return{...c,prepareEquipmentSet(selected){
   if(state.failPrepare)throw Error('injected coverage preparation failure');return c.prepareEquipmentSet(selected);
  }}};
  const factory=new Function('createEquipment','createM1Skirt','selectSkirtFit','foundationProfile','createBodyCoverageSet','outfitSelection',fnSource+';return createM1Equipment;')(
   async()=>adapter,()=>({dispose(){state.skirtDisposed++},getInfo(){return null}}),()=>({}),()=>config,makeCoverage,outfitSelection);
  return{...f,cloth,scene,state,factory,visible:()=>[...loaded].filter(([,item])=>item.container.visible).map(([id])=>id).sort()};
 }
 const x=factoryFixture();globalThis.fetch=async()=>new Response(x.bytes);const clone=x.g.clone;
 x.g.clone=()=>{throw Error('injected clone failure')};
 await assert.rejects(x.factory({vrm:{scene:x.scene},avatarSha256:'body'}),/injected clone failure/);
 // The selected pants outfit never prepares a skirt solver (lazy loading).
 assert.equal(x.state.adapterDisposed,1);assert.equal(x.state.skirtDisposed,0);assert.equal(x.state.applied,0);assert.equal(x.cloth.visible,true);assert.equal(x.mesh.geometry,x.g);
 x.g.clone=clone;const retry=await create(x);controllers.add(retry);retry.dispose();
 report.factoryFailure={adapterDisposed:x.state.adapterDisposed,skirtDisposed:x.state.skirtDisposed,sourceClothesVisible:x.cloth.visible,appliedSetCalls:x.state.applied,ownerReacquired:true};
 report.checks.push('First apply failure cleans adapter/corrective/coverage, keeps original clothes and allows reacquisition');
 equipment=await x.factory({vrm:{scene:x.scene},avatarSha256:'body'});
 assert.deepEqual(x.visible(),['pants','shoes','top']);assert.equal(x.cloth.visible,false);
 x.state.failPrepare=true;const priorGeometry=x.mesh.geometry,priorApplied=x.state.applied;
 assert.throws(()=>equipment.setOutfit(2),/injected coverage preparation/);
 assert.equal(equipment.getInfo().outfit,0);assert.equal(equipment.getInfo().debugBody,false);
 assert.equal(x.mesh.geometry,priorGeometry);assert.deepEqual(x.visible(),['pants','shoes','top']);assert.equal(x.state.applied,priorApplied);
 x.state.failPrepare=false;equipment.setOutfit(2);equipment.setDebugBody(true);assert.equal(x.mesh.geometry,x.g);
 x.g.clone=()=>{throw Error('injected clone failure')};assert.throws(()=>equipment.setDebugBody(false),/injected clone failure/);
 assert.equal(equipment.getInfo().outfit,2);assert.equal(equipment.getInfo().debugBody,true);assert.deepEqual(x.visible(),['shoes']);assert.equal(x.mesh.geometry,x.g);x.g.clone=clone;
 report.checks.push('Later outfit preparation and real debug clone failure preserve outfit/debug, clothes and body together');
 let released=0;x.g.clone=function(){const g=clone.call(this);g.addEventListener('dispose',()=>{released++});return g};
 x.state.failAdapter=true;assert.throws(()=>equipment.setDebugBody(false),/injected adapter/);
 assert.equal(released,1);assert.deepEqual(x.visible(),['shoes']);assert.equal(x.mesh.geometry,x.g);assert.equal(equipment.getInfo().debugBody,true);
 x.state.failAdapter=false;equipment.setDebugBody(false);assert.equal(equipment.getInfo().debugBody,false);assert.deepEqual(x.visible(),['shoes','shorts','top']);
 equipment.dispose();equipment.dispose();assert.equal(released,2);assert.equal(x.state.adapterDisposed,2);assert.equal(x.state.skirtDisposed,0);assert.equal(x.cloth.visible,true);assert.equal(x.mesh.geometry,x.g);
 const finalOwner=await create(x);controllers.add(finalOwner);finalOwner.dispose();
 report.checks.push('Adapter validation failure releases prepared clone; retry succeeds; final dispose is idempotent and restores originals');
 report.passed=true;
}catch(error){report.error={message:error.message,stack:error.stack};process.exitCode=1;
}finally{
 equipment?.dispose();for(const c of controllers)c.dispose();globalThis.fetch=oldFetch;
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 await fs.copyFile(new URL(import.meta.url),path.join(out,'executed-script.mjs'));
}
console.log(JSON.stringify(report,null,2));
