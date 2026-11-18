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
const {NATIVE_SKIN_TONE_SCHEMA,nativeSkinToneContract}=await import('./native-skin-tone-contract.js');
const {restoreRuntimeCharacterRecord}=await import('./character-runtime-record.js');
const {canonicalJson,sha256Hex}=await import('./character-record.js');
const {foundationProfile}=await import('./foundation-profiles.js');
test.after(()=>jsonImports.deregister());
const publicFile=url=>new URL('../public'+url,import.meta.url);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const relativeAsset=(url,parent)=>new URL(url,new URL(parent,'http://geometry.local/')).pathname;
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
async function installImageTransport(t,iris,extras=[]){
  const images=new Map();
  for(const descriptor of [iris.source,iris.colors.green,...extras]){
    const bytes=descriptor.bytes??await readFile(publicFile(descriptor.url));
    assert.equal(digest(bytes),descriptor.sha256);
    images.set(descriptor.sha256,execFileSync('python',['-c',
      'from PIL import Image; import io, sys; sys.stdout.buffer.write(Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGBA").tobytes())'],
      {input:bytes,maxBuffer:20*1024*1024}));
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
  const originalRecord=JSON.parse(await readFile(new URL('../../evidence/m2-native-hair-record-v1/'+name+'.json',import.meta.url)));
  const tone=nativeSkinToneContract(originalRecord.appearanceRecipe.base.sha256);
  test(name+' restores historical records and prepares only its pinned green iris',async t=>{
    const record=structuredClone(originalRecord);
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
    for(const field of ['eyebrowColor','hairColor','lipColor'])
      assert.deepEqual(query.appearance[field].choices.map(row=>row.value),['original']);
    assert.deepEqual(query.appearance.skinTone.choices.map(row=>row.value),tone?['original','native-warm-v1']:['original']);
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

  test(name+' applies the four exact native skin maps and restores canonical records', {skip:!tone}, async t=>{
    const record=structuredClone(originalRecord), base=record.appearanceRecipe.base;
    const toneBytes=await readFile(publicFile(tone.url));
    assert.equal(digest(toneBytes),tone.sha256);
    const {face,eyeline,body}=JSON.parse(toneBytes), config=foundationProfile(base.bodyType);
    const paletteURL=facialPaletteContract(base.sha256).url;
    const {iris}=JSON.parse(await readFile(publicFile(paletteURL)));
    const {covered}=JSON.parse(await readFile(publicFile(config.bodyTextureCoverage.url)));
    const outputs=[face.authored,eyeline.authored,body.authored,body.coveredAuthored];
    const assets=outputs.map(ref=>({...ref,url:relativeAsset(ref.url,tone.url)}));
    const vrmBytes=await readFile(publicFile(config.url));
    const jsonSize=vrmBytes.readUInt32LE(12), doc=JSON.parse(vrmBytes.subarray(20,20+jsonSize));
    const originals=[face,eyeline,body].map(part=>{
      const material=doc.materials.find(item=>item.name===part.materialName);
      const main=material.pbrMetallicRoughness.baseColorTexture.index;
      assert.equal(material.extensions.VRMC_materials_mtoon.shadeMultiplyTexture.index,main);
      const view=doc.bufferViews[doc.images[doc.textures[main].source].bufferView], start=28+jsonSize+(view.byteOffset??0);
      return{bytes:vrmBytes.subarray(start,start+view.byteLength),sha256:part.sourceSha256};
    });
    const images=await installImageTransport(t,iris,[...assets,...originals,
      {...covered,url:relativeAsset(covered.url,config.bodyTextureCoverage.url)}]);
    const scene=new THREE.Scene(),renderer={compileAsync(){throw Error('Unexpected GPU compilation');}};
    const current=await prepareRecordedCharacter(record,{scene,renderer});
    t.after(()=>current.dispose());
    const attached=current.avatar;
    current.attach();

    function materialMaps(avatar) {
      const result=new Map();
      avatar.vrm.scene.traverse(mesh=>{
        for(const material of [].concat(mesh.material??[]))
          if(material?.map)result.set(material,[material.map,material.shadeMultiplyTexture]);
      });
      return result;
    }
    function assertMaps(avatar,coveredBody) {
      const inspection=new Map([[face.materialName,face.authored.sha256],[eyeline.materialName,eyeline.authored.sha256],
        [body.materialName,coveredBody?body.coveredAuthored.sha256:body.authored.sha256]]);
      for(const [material,maps] of materialMaps(avatar)){
        const pin=inspection.get(material.name.replace(/ \(Outline\)$/,''));
        if(pin)for(const texture of maps)assert.equal(texture.image.pixels,images.get(pin),material.name);
      }
    }
    const before=materialMaps(attached);
    const chosen=await attached.appearance.set({skinTone:'native-warm-v1'});
    assert.equal(chosen.applied,true,chosen.reason);
    assertMaps(attached,true);
    for(const [material,maps] of before)
      if(![face.materialName,eyeline.materialName,body.materialName].includes(material.name.replace(/ \(Outline\)$/,'')))
        assert.deepEqual(materialMaps(attached).get(material),maps,material.name);
    attached.setDebugBody(true);
    assert.equal(attached.getOutfitInfo().equipment.bodyTextureCoverage.covered,false);
    assertMaps(attached,false);
    attached.setDebugBody(false);
    assertMaps(attached,true);
    const green=await attached.appearance.set({eyeColor:'green'});
    assert.equal(green.applied,true,green.reason);
    assertMaps(attached,true);
    const native=await current.capture();
    assert.equal(native.appearanceRecipe.schema,NATIVE_SKIN_TONE_SCHEMA);
    assert.equal(native.appearanceRecipe.skinToneManifestSha256,tone.sha256);
    assert(native.resourceIdentities.some(r=>r.id==='appearance/skinToneManifestSha256'&&r.sha256===tone.sha256));
    for(const field of ['identity','liveAccessories','nativeHairCenter','equipmentMaterials'])
      assert.deepEqual(native[field],record[field]);
    const oldFiles=await fileSet(record),newFiles=await fileSet(native);
    assert.deepEqual([...oldFiles].filter(file=>!newFiles.has(file)),[]);
    assert.deepEqual([...newFiles].filter(file=>!oldFiles.has(file)).sort(),
      [tone.url,...assets.map(asset=>asset.url),paletteURL,iris.source.url,iris.colors.green.url].sort());
    const restored=await prepareRecordedCharacter(native,{scene,renderer});
    t.after(()=>restored.dispose());
    assertMaps(restored.avatar,true);
    assert.equal(restored.avatar.appearance.getState().eyeColor,'green');
    assert.deepEqual((await restored.capture()).appearanceRecipe,native.appearanceRecipe);

    const stale=structuredClone(native.appearanceRecipe);
    stale.skinToneManifestSha256='a'.repeat(64);
    assert.equal(admitAppearanceCandidate(current.controller,stale).accepted,false);
    assertMaps(attached,true);
    assert.equal((await restoreRuntimeCharacterRecord(current.controller,record)).applied,true);
    const original=await current.capture();
    assert.equal(original.integrity.recipeSha256,record.integrity.recipeSha256);
    assert.deepEqual(original.resourceIdentities,record.resourceIdentities);
    for(const [material,maps] of before)assert.deepEqual(materialMaps(attached).get(material),maps,material.name);
  });
}
