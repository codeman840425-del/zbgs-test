import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {registerHooks} from 'node:module';
import test from 'node:test';
import {runtimePath} from '../../scripts/runtime-package/files.mjs';
import {collectRecordResources} from '../../scripts/runtime-package/record-resources.mjs';

const jsonImports=registerHooks({load(url,context,next){
  return next(url,url.endsWith('.json')?{...context,importAttributes:{type:'json'}}:context);
}});
const {THREE}=await import('../../scripts/headless-avatar-node.mjs');
const {prepareRecordedCharacter}=await import('./character-record-consumer.js');
const {queryAppearanceCandidates,admitAppearanceCandidate}=await import('./appearance-candidates.js');
const {facialPaletteContract}=await import('./facial-palette-contract.js');
const {restoreRuntimeCharacterRecord}=await import('./character-runtime-record.js');
const {canonicalJson,sha256Hex}=await import('./character-record.js');
test.after(()=>jsonImports.deregister());
const publicFile=url=>new URL('../public'+url,import.meta.url);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fileSet(record){
  const paths=new Set();
  await collectRecordResources({record,sourceRoot:fileURLToPath(new URL('../../',import.meta.url)),
    async add(url,_reason,{parent,sha256,bytes:size}){
      const path=runtimePath(url,parent),bytes=await readFile(publicFile('/'+path));
      if(sha256)assert.equal(digest(bytes),sha256);
      if(size)assert.equal(bytes.length,size);
      paths.add('/'+path);
      return {path,bytes,value:path.endsWith('.json')?JSON.parse(bytes):null};
    }});
  return paths;
}

// The real GLTFLoader and native palette both decode the iris PNG. Supply
// actual RGBA bytes for those two images. Other textures only need dimensions.
async function installImageTransport(t,iris){
  const images=new Map();
  for(const descriptor of [iris.source,iris.colors.green]){
    const file=fileURLToPath(publicFile(descriptor.url));
    assert.equal(digest(await readFile(file)),descriptor.sha256);
    images.set(descriptor.sha256,execFileSync('python',['-c',
      'from PIL import Image; import sys; sys.stdout.buffer.write(Image.open(sys.argv[1]).convert("RGBA").tobytes())',
      file],{maxBuffer:4*1024*1024}));
  }
  const placeholder=globalThis.createImageBitmap;
  t.mock.method(globalThis,'createImageBitmap',async blob=>{
    const bytes=Buffer.from(await blob.arrayBuffer());
    if(bytes.length<24||bytes.readUInt32BE(0)!==0x89504e47)return placeholder(blob);
    return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),pixels:images.get(digest(bytes)),close(){}};
  });
  const previous=globalThis.document;
  globalThis.document={createElement(tag){
    assert.equal(tag,'canvas');
    let pixels;
    return {getContext:()=>({drawImage(image){assert(image.pixels);pixels=image.pixels;},getImageData:()=>({data:pixels})})};
  }};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  return images;
}

for(const name of ['contour-roundness-a','contour-cheek-b']){
  test(name+' restores historical records and prepares only its pinned green iris',async t=>{
    const record=JSON.parse(await readFile(new URL('../../evidence/m2-native-hair-record-v1/'+name+'.json',import.meta.url)));
    const contract=facialPaletteContract(record.appearanceRecipe.base.sha256);
    const manifestBytes=await readFile(publicFile(contract.url));
    assert.equal(digest(manifestBytes),contract.sha256);
    const {iris}=JSON.parse(manifestBytes),images=await installImageTransport(t,iris);
    const scene=new THREE.Scene(),renderer={compileAsync(){throw Error('Unexpected GPU compilation');}};
    const current=await prepareRecordedCharacter(record,{scene,renderer});
    t.after(()=>current.dispose());
    current.attach();
    const captured=await current.capture();
    assert.equal(captured.integrity.recipeSha256,record.integrity.recipeSha256);
    assert.deepEqual(captured.resourceIdentities,record.resourceIdentities);
    assert.equal(current.recordSha256,record.integrity.recordSha256);
    const query=queryAppearanceCandidates(current.controller);
    assert.deepEqual(query.appearance.eyeColor.choices.map(row=>row.value),['original','green']);
    for(const field of ['eyebrowColor','hairColor','skinTone','lipColor'])
      assert.deepEqual(query.appearance[field].choices.map(row=>row.value),['original']);
    const changed=await current.avatar.appearance.set({eyeColor:'green'});
    assert.equal(changed.applied,true,changed.reason);
    const green=await current.capture();
    assert.equal(green.appearanceRecipe.paletteVersion,contract.version);
    assert.deepEqual(green.identity,record.identity);
    assert.deepEqual(green.nativeHairCenter,record.nativeHairCenter);
    assert.deepEqual(green.liveAccessories,record.liveAccessories);
    const baselineFiles=await fileSet(record),greenFiles=await fileSet(green);
    assert.deepEqual([...baselineFiles].filter(file=>!greenFiles.has(file)),[]);
    assert.deepEqual([...greenFiles].filter(file=>!baselineFiles.has(file)).sort(),
      [contract.url,iris.source.url,iris.colors.green.url].sort());
    const restored=await prepareRecordedCharacter(green,{scene,renderer});
    t.after(()=>restored.dispose());
    const irisMaterials=new Set();
    restored.avatar.vrm.scene.traverse(mesh=>{
      for(const material of [].concat(mesh.material??[]))
        if(material.name===iris.materialName)irisMaterials.add(material);
    });
    assert(irisMaterials.size>0);
    for(const material of irisMaterials)assert.deepEqual(material.map.image.pixels,images.get(iris.colors.green.sha256));
    const wrong=structuredClone(green);
    wrong.appearanceRecipe.paletteVersion=record.appearanceRecipe.paletteVersion;
    assert.equal(admitAppearanceCandidate(current.controller,wrong.appearanceRecipe).accepted,false);
    wrong.integrity.recipeSha256=await sha256Hex(canonicalJson(wrong.appearanceRecipe));
    delete wrong.integrity.recordSha256;
    wrong.integrity.recordSha256=await sha256Hex(canonicalJson(wrong));
    await assert.rejects(restoreRuntimeCharacterRecord(current.controller,wrong),/paletteVersion/);
    assert.equal(current.avatar.appearance.getState().eyeColor,'green');
    assert.deepEqual(scene.children,[current.avatar.root]);
  });
}
