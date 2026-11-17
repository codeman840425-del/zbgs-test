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
  const mesh=new THREE.Mesh(new THREE.BufferGeometry(),[material,outline]);
  return{body:[mesh],map,shade,material,outline,sourceDisposes:()=>sourceDisposes};
}
const create=(f,extra={})=>createBodyTextureCoverage({body:f.body,avatarSha256:manifest.avatarSha256,entries,descriptor,...extra});
const base=f=>{assert.equal(f.material.map,f.map);assert.equal(f.material.shadeMultiplyTexture,f.shade);assert.equal(f.outline.map,f.map);assert.equal(f.outline.shadeMultiplyTexture,f.shade);};
const tests=[];
async function test(name,fn){await fn();tests.push(name);}
try{
  await test('unconfigured is null; wrong avatar and old catalog rejected',async()=>{
    assert.equal(await createBodyTextureCoverage({descriptor:null}),null);
    const f=fixture();await assert.rejects(create(f,{avatarSha256:'0'.repeat(64)}),/avatar/);base(f);
    const old=JSON.parse(fs.readFileSync(new URL('../native-vroid-equipment-v1/equipment.json',dir),'utf8')).items;
    await assert.rejects(create(f,{entries:old}),/equipment/);base(f);
  });
  await test('constructor and prepare are non-mutating; shared reference and tint retained; first paused commit updates official uniforms',async()=>{
    const f=fixture();f.material.color.set('#81685b');f.material.shadeColorFactor.set('#ddc5b4');
    const color=f.material.color.clone(),shade=f.material.shadeColorFactor.clone();
    const owner=await create(f);base(f);const prepared=owner.prepareEquipmentSet(ids);base(f);
    prepared.commit();prepared.dispose();
    assert.notEqual(f.material.map,f.map);assert.equal(f.material.map,f.material.shadeMultiplyTexture);
    assert.equal(f.material.map,f.outline.map);assert.notEqual(f.material.map.source,f.map.source);
    assert(f.material.color.equals(color));assert(f.material.shadeColorFactor.equals(shade));
    assert.equal(f.material.alphaTest,.5);assert.equal(f.material.transparent,false);
    assert.equal(f.material.uniforms.alphaTest.value,.5);assert.deepEqual(f.material.uniforms.mapUvTransform.value.elements,f.material.map.matrix.elements);
    assert.equal(owner.getInfo().ownedTextures,1);
    const owned=f.material.map;let disposed=0;owned.addEventListener('dispose',()=>disposed++);
    const restore=owner.prepareEquipmentSet([shoe]);restore.commit();restore.dispose();base(f);
    assert(f.material.color.equals(color));assert(f.material.shadeColorFactor.equals(shade));
    owner.dispose();owner.dispose();assert.equal(disposed,1);assert.equal(f.sourceDisposes(),0);
  });
  await test('KHR-style distinct map/shade wrappers preserve actual alias graph and sampler',async()=>{
    const f=fixture(false),owner=await create(f),p=owner.prepareEquipmentSet(ids);p.commit();
    assert.notEqual(f.material.map,f.material.shadeMultiplyTexture);assert.equal(owner.getInfo().ownedTextures,2);
    assert.equal(f.material.map.image,f.material.shadeMultiplyTexture.image);
    for(const key of ['flipY','colorSpace','wrapS','wrapT','minFilter','magFilter','generateMipmaps','channel'])assert.equal(f.material.map[key],f.map[key]);
    owner.dispose();base(f);assert.equal(f.sourceDisposes(),0);
  });
  await test('skin tone changing after preparation is never overwritten',async()=>{
    const f=fixture(),owner=await create(f),p=owner.prepareEquipmentSet(ids);
    f.material.color.set('#ddc5b4');f.material.shadeColorFactor.set('#81685b');
    const c=f.material.color.clone(),s=f.material.shadeColorFactor.clone();p.commit();
    assert(f.material.color.equals(c));assert(f.material.shadeColorFactor.equals(s));owner.dispose();
  });
  await test('two instances have separate texture ownership; disposing A preserves B',async()=>{
    const a=fixture(),b=fixture(),oa=await create(a),ob=await create(b);
    oa.prepareEquipmentSet(ids).commit();ob.prepareEquipmentSet(ids).commit();
    assert.notEqual(a.material.map,b.material.map);assert.notEqual(a.material.map.source,b.material.map.source);
    const bmap=b.material.map;let bd=0;bmap.addEventListener('dispose',()=>bd++);
    oa.dispose();assert.equal(b.material.map,bmap);assert.equal(bd,0);ob.dispose();assert.equal(bd,1);
    assert.equal(a.sourceDisposes()+b.sourceDisposes(),0);
  });
  await test('newest preparation wins; obsolete/disposed commits rejected without changes',async()=>{
    const f=fixture(),o=await create(f),old=o.prepareEquipmentSet(ids),latest=o.prepareEquipmentSet([shoe]);
    assert.equal(old.isCurrent(),false);assert.throws(()=>old.commit(),/superseded/);base(f);
    latest.commit();base(f);old.dispose();const gone=o.prepareEquipmentSet(ids);gone.dispose();
    assert.throws(()=>gone.commit(),/disposed/);o.dispose();
  });
  await test('unknown id, duplicate id, absent optional top and two tops fail closed',async()=>{
    const f=fixture(),o=await create(f);assert.throws(()=>o.prepareEquipmentSet(['unknown']),/unknown/);
    assert.throws(()=>o.prepareEquipmentSet([shoe,shoe]),/duplicate/);
    assert.throws(()=>o.prepareEquipmentSet(['native-unmasked-843ac-sleeve56-top-v1']),/unknown/);base(f);o.dispose();
    const optional=manifest.equipment.find(e=>!e.required);
    const fixtureEntry={...optional,compatibleAvatarSha256:manifest.avatarSha256};
    const f2=fixture(),o2=await create(f2,{entries:[...entries,fixtureEntry]});
    assert.throws(()=>o2.prepareEquipmentSet([ids[0],optional.id]),/conflicting/);
    o2.prepareEquipmentSet([optional.id,shoe]).commit();assert(o2.getInfo().covered);o2.dispose();
    await assert.rejects(create(fixture(),{entries:[...entries,{...fixtureEntry,compatibleAvatarSha256:'0'.repeat(64)}]}),/equipment/);
  });
  await test('HTTP, SHA, decode and size failures do not change materials or retain ownership',async()=>{
    for(const failure of ['http-fail','bad-png','decode','size']){
      const f=fixture();fetchMode=failure;decodeMode=failure==='decode'?'throw':failure==='size'?'size':'normal';
      await assert.rejects(create(f));base(f);assert.equal(f.sourceDisposes(),0);
      fetchMode='normal';decodeMode='normal';const owner=await create(f);owner.dispose();
    }
  });
  await test('duplicate owner and outside Body texture edits invalidate a pending transaction',async()=>{
    const f=fixture(),o=await create(f);await assert.rejects(create(f),/owned/);
    const p=o.prepareEquipmentSet(ids);f.material.map=new THREE.Texture();
    assert.equal(p.isCurrent(),false);assert.throws(()=>p.commit(),/superseded/);
    f.material.map=f.map;o.dispose();base(f);
  });
  await test('dispose invalidates all prepared state; owned bitmap released once',async()=>{
    const f=fixture(),o=await create(f),p=o.prepareEquipmentSet(ids),before=bitmapCloses;
    o.dispose();assert.equal(bitmapCloses,before+1);assert.equal(p.isCurrent(),false);
    assert.throws(()=>p.commit(),/disposed/);assert.throws(()=>o.prepareEquipmentSet(ids),/disposed/);base(f);
  });
  await test('unexpected live material-update error restores all previous map references',async()=>{
    const f=fixture(),o=await create(f),p=o.prepareEquipmentSet(ids),update=f.outline.update;
    f.outline.update=()=>{throw Error('injected live updater failure');};
    assert.throws(()=>p.commit(),/injected/);base(f);assert.equal(o.getInfo().covered,false);
    f.outline.update=update;o.dispose();
  });
  await test('invalid source sampler/alpha is rejected rather than silently repaired',async()=>{
    const f=fixture();f.map.minFilter=THREE.NearestFilter;await assert.rejects(create(f),/sampler/);base(f);
    const f2=fixture();f2.material.alphaTest=0;await assert.rejects(create(f2),/alpha/);base(f2);
  });
  const report={schema:'native-body-texture-coverage-cpu-check-v1',passed:tests.length,tests,
    implementationSha256:sha(fs.readFileSync(new URL('../../prototype/src/body-texture-coverage.js',dir))),manifestSha256:sha(manifestBytes),
    realLibraries:{three:THREE.REVISION,mtoon:'3.5.5'},decodeCalls,bitmapCloses,
    scope:'Actual Three/MToon objects and official update(0), real PNG bytes SHA/IHDR, mocked fetch/bitmap decode only. No WebGL/shadow/pixel-render test. Optional sleeve entry is a unit fixture, not garment fit admission.'};
  const output=process.argv[2]??'cpu-check.json';
  assert.match(output,/^[a-z0-9-]+\.json$/);
  fs.writeFileSync(new URL(output,import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(report));
}finally{globalThis.fetch=originalFetch;globalThis.createImageBitmap=originalBitmap;}
