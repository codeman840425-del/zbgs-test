// From the repository root: node evidence/m2-garment-texture-game-v1/receiver/verify-packages.mjs
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync,brotliCompressSync,brotliDecompressSync,constants} from 'node:zlib';
import {checkedBytes,digest} from '../../../scripts/runtime-package/files.mjs';
import {settings} from '../../../scripts/runtime-transfer-http/transport.mjs';

assert([2,5].includes(process.argv.length),'Expected no arguments or RECORDS_DIR RECEIVER_DIR PACKAGES_DIR');
const evidence=process.argv[2]??fileURLToPath(new URL('../',import.meta.url));
const receiver=process.argv[3]??path.join(evidence,'receiver');
const outputs=process.argv[4]??fileURLToPath(new URL('../../../output/m2-garment-texture-game-v1/',import.meta.url));
const json=async p=>JSON.parse(await readFile(p));
const paths={
  female:{near:'assets/m1/m1-uniform-top.glb',far:'assets/garment-basecolor-release-v1/female/m1-female-uniform-top-1k-v1.glb'},
  'source-male-ab9a-release-v1':{near:'assets/raw-male-equipment-v1/raw-male-ab9a-uniform-top-v1.glb',far:'assets/garment-basecolor-release-v1/male/raw-male-uniform-top-1k-v1.glb'},
};

async function list(dir,prefix=''){
  const out=[];
  for(const e of await readdir(path.join(dir,prefix),{withFileTypes:true})){
    const rel=path.posix.join(prefix,e.name);
    if(e.isDirectory())out.push(...await list(dir,rel));
    else {assert(e.isFile(),rel);out.push(rel);}
  }
  return out.sort();
}

function transferSize(name,raw){
  const measured={identity:raw.length,gzip:raw.length,br:raw.length};
  if(raw.length<settings.minInputBytes || !/\.(html|js|css|json|glb|vrm|svg|wasm)$/.test(name))return measured;
  for(const coding of ['gzip','br']){
    const zipped=coding==='gzip'?gzipSync(raw,{level:settings.gzipLevel}):
      brotliCompressSync(raw,{params:{[constants.BROTLI_PARAM_QUALITY]:settings.brotliQuality}});
    assert((coding==='gzip'?gunzipSync(zipped):brotliDecompressSync(zipped)).equals(raw),name);
    const saved=raw.length-zipped.length;
    if(saved>=settings.minSavingBytes && saved/raw.length>=settings.minSavingRatio)measured[coding]=zipped.length;
  }
  return measured;
}

async function verify(mode){
  const dir=path.join(outputs,mode+'-package');
  const input=await readFile(path.join(evidence,'records-'+mode+'.json'));
  const records=JSON.parse(input);
  const inventory=await readFile(path.join(receiver,mode+'-inventory.json'));
  assert(inventory.equals(await readFile(path.join(dir,'runtime-package.json'))));
  const inv=JSON.parse(inventory), budget=await json(path.join(receiver,mode+'-budget.json'));
  assert.equal(budget.inputSha256,digest(input));
  assert.equal(budget.sourceCommit,inv.runtime.sourceCommit);
  const files=new Map(inv.files.map(row=>[row.path,row]));
  const all=await list(dir);
  assert.deepEqual(all,[...files.keys(),'runtime-package.json'].sort());
  const amounts={identity:0,gzip:0,br:0}, receipt=transferSize('runtime-package.json',inventory);
  for(const row of inv.files){
    const sizes=transferSize(row.path,await checkedBytes(dir,row));
    for(const k of Object.keys(amounts))amounts[k]+=sizes[k];
  }
  assert.deepEqual(inv.records.map(r=>r.id),records.map(r=>r.identity.id));
  assert.deepEqual(new Set(inv.records.map(r=>r.bodyType)),new Set(Object.keys(paths)));
  const manifest=await json(path.join(dir,inv.recordManifest));
  assert.deepEqual(manifest.entries,records.map((r,i)=>({id:r.identity.id,url:'/'+inv.records[i].file,recordSha256:r.integrity.recordSha256})));
  const actors=[];
  for(const [i,record] of records.entries()){
    const r=inv.records[i], b=budget.records[i], look=record.appearanceRecipe.equipment;
    assert.deepEqual(await json(path.join(dir,r.file)),record);
    assert.equal(r.revision,record.revision);assert.equal(r.recordSha256,b.recordSha256);
    assert.equal(r.avatarSha256,record.appearanceRecipe.base.sha256);
    assert.equal(look.role,mode==='near'?'pants':'pants-top-far');
    const key=paths[r.bodyType][mode],entry=look.resources[mode==='near'?'top':'topFar'];
    assert.equal(files.get(key).sha256,entry.sha256);
    assert(!files.has(paths[r.bodyType][mode==='near'?'far':'near']));
    const catalogPath=mode==='near'?look.manifestUrl:'/assets/garment-basecolor-release-v1/'+(r.bodyType==='female'?'female':'male')+'/equipment.json';
    const catalog=await json(path.join(dir,catalogPath.slice(1)));
    // Signed JSON records serialize negative zero in inverse bind matrices as zero.
    const declared=catalog.items.find(item=>item.id===entry.id);
    assert(declared,entry.id);
    assert.deepEqual(JSON.parse(JSON.stringify(declared)),entry);
    if(r.bodyType==='female'){
      const mask=await json(path.join(dir,mode==='near'?'assets/body-coverage-risk-v1/female-top.json':'assets/garment-basecolor-release-v1/female/body-coverage.json'));
      assert.equal(mask.avatarSha256,r.avatarSha256);assert.equal(mask.topId,entry.id);assert.equal(mask.topSha256,entry.sha256);
    }
    actors.push({id:r.id,recordSha256:r.recordSha256,body:r.bodyType,outfitIndex:look.index,top:key,topBytes:files.get(key).bytes,
      rgba8MipBytes:b.selectedCost.totals.rgba8MipBytes,status:b.status});
  }
  return {runtime:inv.runtime,inventorySha256:digest(inventory),files:all.length,actors,budget:budget.status,
    resourceUnionSourceBytes:budget.closureUnionSourceBytes,inventoryFiles:amounts,
    physicalPackage:Object.fromEntries(Object.entries(amounts).map(([k,v])=>[k,v+receipt[k]]))};
}

const near=await verify('near'),far=await verify('far');
assert.deepEqual(near.runtime,far.runtime);
assert.deepEqual(near.actors.map(r=>r.id),far.actors.map(r=>r.id));
const delta=k=>Object.fromEntries(Object.keys(near[k]).map(c=>[c,near[k][c]-far[k][c]]));
console.log(JSON.stringify({schema:'garment-texture-receiver-v1',node:process.version,zlib:process.versions.zlib,
  brotli:process.versions.brotli,settings,near,far,physicalPackageSavings:delta('physicalPackage'),
  inventoryFilesSavings:delta('inventoryFiles'),resourceUnionSavings:near.resourceUnionSourceBytes-far.resourceUnionSourceBytes,
  scope:'CPU verified selected record packages. Gzip and Brotli represent separate offline per-file HTTP coding totals.'},null,2));
