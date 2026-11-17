// Real Three/MToon material and transaction tests. Fetch/bitmap decoding are CPU
// stand-ins; PNG bytes/equality are independently checked by build.py.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {MToonMaterial} from '../../prototype/node_modules/@pixiv/three-vrm-materials-mtoon/lib/three-vrm-materials-mtoon.module.js';
import {createBodyTextureCoverage} from '../../prototype/src/body-texture-coverage.js';
const dir=new URL('../../assets-source/native-vroid-body-texture-fit-v1/',import.meta.url),read=name=>fs.readFileSync(new URL(name,dir));
const manifestBytes=read('manifest.json'),manifest=JSON.parse(manifestBytes),png=read('native-tops-body.png');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const entries=JSON.parse(fs.readFileSync(new URL('../native-vroid-factory-fit-v1/equipment.json',dir),'utf8')).items;
const descriptor={url:'https://test.local/manifest.json',sha256:sha(manifestBytes)};
const ids=entries.map(e=>e.id),shoe=entries.find(e=>e.slot==='shoes').id;
const originalFetch=globalThis.fetch,originalBitmap=globalThis.createImageBitmap;
let fetchMode='normal',decodeMode='normal',bitmapCloses=0,decodeCalls=0;
globalThis.fetch=async url=>{
  const bytes=String(url).endsWith('manifest.json')?manifestBytes:fetchMode==='bad-png'?Buffer.from('bad'):png;
  return new Response(bytes,{status:fetchMode==='http-fail'?503:200});
};
globalThis.createImageBitmap=async(blob,options)=>{
  decodeCalls++;
  assert.equal(options.premultiplyAlpha,'none');assert.equal(options.colorSpaceConversion,'none');
  assert.equal(options.imageOrientation,'none');
  assert.equal(sha(Buffer.from(await blob.arrayBuffer())),manifest.covered.sha256);
  if(decodeMode==='throw')throw Error('decode fixture failed');
  let closed=false;
  return{width:decodeMode==='size'?1024:png.readUInt32BE(16),height:png.readUInt32BE(20),
    close(){assert.equal(closed,false);closed=true;bitmapCloses++;}};
};
function fixture(shared=true){
  let sourceDisposes=0;
  const map=new THREE.Texture({width:2048,height:2048});
  Object.assign(map,{flipY:false,colorSpace:THREE.SRGBColorSpace,wrapS:THREE.RepeatWrapping,wrapT:THREE.RepeatWrapping,
    minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false});
  const shade=shared?map:map.clone();
  for(const t of new Set([map,shade]))t.addEventListener('dispose',()=>sourceDisposes++);
  const material=new MToonMaterial({map,shadeMultiplyTexture:shade,alphaTest:.5,transparent:false});
  material.name=manifest.materialName;material.update(0);
  const outline=material.clone();outline.name=manifest.materialName+' (Outline)';outline.isOutline=true;
  const mesh=new THREE.SkinnedMesh(new THREE.BufferGeometry(),[material,outline]);
  return{body:[mesh],map,shade,material,outline,sourceDisposes:()=>sourceDisposes};
}
const create=(f,extra={})=>createBodyTextureCoverage({body:f.body,avatarSha256:manifest.avatarSha256,entries,descriptor,...extra});
const base=f=>{assert.equal(f.material.map,f.map);assert.equal(f.material.shadeMultiplyTexture,f.shade);assert.equal(f.outline.map,f.map);assert.equal(f.outline.shadeMultiplyTexture,f.shade);};
import {createBodyCoverageSet} from '../../prototype/src/body-coverage.js';
import {prepareLoadedEquipmentSet} from '../../prototype/src/equipment-set.js';
import {outfitSelection} from '../../prototype/src/outfit-selection.js';
const source=fs.readFileSync('prototype/src/m1-equipment.js','utf8');
const fnSource=source.slice(source.indexOf('export async function createM1Equipment')).replace('export async function','async function');
const report={schema:'native-body-texture-glue-independent-audit-v1',scope:'Actual factory, texture helper, empty geometry coverage, real MToon/update(0) and equipment-set visibility; injected adapter boundary; CPU decode mock, no GPU.',sourceSHA:{m1:sha(source),texture:sha(fs.readFileSync('prototype/src/body-texture-coverage.js'))},checks:[],conditionalFindings:[]};
async function actor(extraConfig={}){
 const f=fixture(),scene=new THREE.Group();scene.add(...f.body);
 const cloth=new THREE.SkinnedMesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());cloth.material.name='M00_Tops_00';scene.add(cloth);
 const loaded=new Map(entries.map(entry=>[entry.id,{entry,meshes:[],container:{visible:false},stats:{}}]));
 const state={failAdapter:false,failCoverage:false,adapterDisposed:0};let revision=0;
 const adapter={load:async()=>{},get:id=>loaded.get(id),describe:id=>loaded.get(id).entry,prepareLoadedSet(selected){
  const apply=prepareLoadedEquipmentSet(loaded,entries,selected,manifest.avatarSha256),ticket=++revision;let live=true;
  return{isCurrent:()=>live&&ticket===revision,commit(){if(state.failAdapter)throw Error('injected dependency rejection before visibility');live=false;return apply();},dispose(){live=false;}};
 },dispose(){state.adapterDisposed++;for(const x of loaded.values())x.container.visible=false;}};
 const config={sha256:manifest.avatarSha256,ids:{top:entries.find(e=>e.slot==='top').id,shorts:entries.find(e=>e.slot==='bottom').id,shoes:shoe},outfits:[{index:0,role:'shorts',equipmentRoles:['top','shorts','shoes']}],bodyTextureCoverage:descriptor,...extraConfig};
 const coverage=async args=>{const c=await createBodyCoverageSet(args);if(!c)return null;return{...c,prepareEquipmentSet(selected){const p=c.prepareEquipmentSet(selected);return{...p,commit(){if(state.failCoverage)throw Error('injected later coverage commit failure');p.commit();}};}};};
 const factory=new Function('createEquipment','createM1Skirt','selectSkirtFit','foundationProfile','createBodyCoverageSet','createGarmentCoverage','createBodyTextureCoverage','outfitSelection',fnSource+';return createM1Equipment;')(async()=>adapter,()=>{throw Error('unexpected skirt')},()=>{},()=>config,coverage,()=>{throw Error('unexpected garment')},createBodyTextureCoverage,outfitSelection);
 const equipment=await factory({vrm:{scene},avatarSha256:manifest.avatarSha256});
 return{...f,cloth,state,equipment,visible:()=>[...loaded].filter(([,v])=>v.container.visible).map(([id])=>id).sort()};
}
const actors=[];
try{
 for(const extra of [{bodyCoverage:{}},{additionalBodyCoverage:[{}]},{garmentCoverage:{}}])await assert.rejects(actor(extra),/cannot be combined/);
 report.checks.push('All three unsupported geometry coverage configuration forms rejected at factory entry');
 const a=await actor();actors.push(a);const dressed=a.visible(),masked=a.material.map;
 assert.notEqual(masked,a.map);assert.equal(a.cloth.visible,false);
 a.state.failAdapter=true;const rejected=await a.equipment.prepareOutfit(0,true);
 assert.throws(()=>rejected.commit(),/dependency rejection/);rejected.dispose();
 assert.deepEqual(a.visible(),dressed);assert.equal(a.material.map,masked);assert.equal(a.equipment.getInfo().debugBody,false);
 report.checks.push('Dependency rejection before equipment visibility restores exact previous texture and activeIds; gear and logical state remain old');
 a.state.failAdapter=false;
 const old=await a.equipment.prepareOutfit(0,true),latest=await a.equipment.prepareOutfit(0,false);
 assert.equal(old.isCurrent(),false);assert.throws(()=>old.commit(),/no longer current/);old.dispose();latest.dispose();
 assert.deepEqual(a.visible(),dressed);assert.equal(a.material.map,masked);
 a.equipment.setDebugBody(true);base(a);assert.deepEqual(a.visible(),[shoe]);
 a.equipment.setDebugBody(false);assert.deepEqual(a.visible(),dressed);assert.equal(a.material.map,masked);
 report.checks.push('Supersession and abandoned prepare preserve active pair; successful debug/full restore swaps gear and mask together');
 let disposedOwned=0;masked.addEventListener('dispose',()=>disposedOwned++);
 const pending=await a.equipment.prepareOutfit(0,true);a.equipment.dispose();a.equipment.dispose();
 assert.equal(pending.isCurrent(),false);assert.throws(()=>pending.commit(),/no longer current/);pending.dispose();
 base(a);assert.equal(a.sourceDisposes(),0);assert.equal(disposedOwned,1);assert.equal(a.state.adapterDisposed,1);assert.equal(a.cloth.visible,true);
 report.checks.push('Actor dispose invalidates pending, restores borrowed full maps and original clothes, releases owned texture/adapter once');
 report.status='supported-native-empty-coverage-paths-pass';
}catch(error){report.status='audit-error';report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{for(const a of actors)a.equipment.dispose();globalThis.fetch=originalFetch;globalThis.createImageBitmap=originalBitmap;fs.writeFileSync(new URL('./glue-result.json',import.meta.url),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
