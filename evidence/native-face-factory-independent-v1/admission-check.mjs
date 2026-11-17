// Bounded adaptation of existing native color CPU QA for only newly registered Face.
// Actual runtime modules and source GLBs. Texture decode and outfit presentation
// are CPU fixtures. No browser, Studio, GPU or published resource changes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {foundationProfile} from '../../prototype/src/foundation-profiles.js';
import {outfitSelection} from '../../prototype/src/outfit-selection.js';
import {createCharacterAppearance,HAIR_COLORS,SKIN_TONES} from '../../prototype/src/character-appearance.js';
import {createFacialPalette,EYE_COLORS,LIP_COLORS} from '../../prototype/src/facial-palette.js';
import {createFacialGeometry} from '../../prototype/src/facial-geometry.js';
import {appearanceColorSupport} from '../../prototype/src/appearance-color-policy.js';
import {queryAppearanceCandidates,admitAppearanceCandidate} from '../../prototype/src/appearance-candidates.js';
import {captureAppearanceRecipe,validateAppearanceRecipe,applyAppearanceRecipe} from '../../prototype/src/appearance-recipe.js';

const output=path.resolve(process.argv[2]??'evidence/native-face-factory-independent-v1/admission-v1');
await fs.mkdir(output);
const publicRoot=path.resolve('prototype/public');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const presets={hairColor:HAIR_COLORS,skinTone:SKIN_TONES,eyeColor:EYE_COLORS,lipColor:LIP_COLORS};
const fixtures=[],checks=[],sourcePins={};
const oldFetch=globalThis.fetch;
let fetches=0;
globalThis.fetch=async()=>{fetches++;throw Error('CPU fixture stops before texture decode');};

async function fixture(bodyType) {
  const config=foundationProfile(bodyType);
  const bytes=await fs.readFile(path.join(publicRoot,config.url));
  assert.equal(sha(bytes),config.sha256);
  sourcePins[config.url]=config.sha256;
  const loader=new GLTFLoader();
  loader.register(()=>({name:'CPUTextureDecodeFixture',loadTexture:async()=>null}));
  const parsed=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const vrm={scene:parsed.scene};
  const catalog=[];
  for(const url of [config.manifestUrl,...(config.additionalEquipmentManifests??[]).map(item=>item.url)]) {
    const data=await fs.readFile(path.join(publicRoot,url));
    sourcePins[url]=sha(data);catalog.push(...JSON.parse(data).items);
  }
  const actor={config,profile:{bodyType,sha256:config.sha256},vrm,
    appearance:createCharacterAppearance({vrm,avatarSha256:config.sha256}),
    facialGeometry:createFacialGeometry({vrm,avatarSha256:config.sha256}),
    getEquipmentRecipe(index) {
      return Object.fromEntries(outfitSelection(config,index).roles.map(role=>{
        const entry=catalog.find(item=>item.id===config.ids[role]);
        assert(entry,'Actual configured equipment resource missing');
        return [role,structuredClone(entry)];
      }));
    }};
  const controller={actor,outfit:0,outfitRevision:0,outfitPreparations:0,
    async prepareOutfit(index) {
      this.outfitPreparations++;
      const revision=this.outfitRevision;let live=true;
      return {isCurrent:()=>live&&revision===this.outfitRevision,
        commit:()=>{assert(live);this.outfit=index;this.outfitRevision++;live=false;},
        dispose:()=>{live=false;}};
    }};
  const directPalette=createFacialPalette({vrm,avatarSha256:config.sha256});
  const result={actor,controller,directPalette};fixtures.push(result);return result;
}
function materials(actor) {
  const rows=[];
  actor.vrm.scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])rows.push({
      uuid:m.uuid,map:m.map,shadeMap:m.shadeMultiplyTexture,color:m.color?.toArray(),shade:m.shadeColorFactor?.toArray(),
    });
  });
  return rows;
}
function snapshot(f) {
  return {appearance:f.actor.appearance.getState(),geometry:f.actor.facialGeometry.getState(),
    palette:f.directPalette.getState(),materials:materials(f.actor),
    outfit:f.controller.outfit,outfitRevision:f.controller.outfitRevision,outfitPreparations:f.controller.outfitPreparations};
}
try {
  for(const body of ['native-female-face-v1']) {
    const f=await fixture(body),query=queryAppearanceCandidates(f.controller);
    assert.deepEqual(f.actor.config.previewAppearanceSupport,appearanceColorSupport(f.actor.profile.sha256));
    for(const field of Object.keys(presets))assert.deepEqual(query.appearance[field].choices,[{value:'original',color:null}]);
    assert(validateAppearanceRecipe(f.controller,query.defaultRecipe));
    assert((await applyAppearanceRecipe(f.controller,query.defaultRecipe)).applied);
    assert.deepEqual(captureAppearanceRecipe(f.controller),query.defaultRecipe);
    checks.push(body+' original query/default recipe applies and captures identically');

    for(const [field,choices] of Object.entries(presets)) {
      for(const value of Object.keys(choices).filter(value=>value!=='original')) {
        const before=snapshot(f),count=fetches;
        const record=structuredClone(query.defaultRecipe);record.appearance[field]=value;
        assert.throws(()=>validateAppearanceRecipe(f.controller,record),error=>error.field==='appearance.'+field&&error.code==='unsupported-resource');
        const admission=admitAppearanceCandidate(f.controller,record);
        assert.equal(admission.accepted,false);assert.equal(admission.issues[0].field,'appearance.'+field);
        await assert.rejects(applyAppearanceRecipe(f.controller,record),/仅支持原色/);
        for(const method of ['prepareUpdate','set']) {
          const result=await f.actor.appearance[method]({[field]:value});
          assert.equal(result.applied,false);assert.match(result.reason,/仅支持原色/);
          assert.deepEqual(snapshot(f),before);
        }
        if(field==='eyeColor'||field==='lipColor') {
          for(const method of ['prepareUpdate','set']) {
            const result=await f.directPalette[method]({[field]:value});
            assert.equal(result.applied,false);assert.match(result.reason,/仅支持原色/);
            assert.deepEqual(snapshot(f),before);
          }
        }
        assert.equal(fetches,count);assert.deepEqual(snapshot(f),before);
      }
    }
    checks.push(body+' every non-original preset rejected by query admission, recipe and actual set/prepare before state or I/O');

    const prepared=await f.actor.appearance.prepareUpdate({hairColor:'original'});
    assert(prepared.isCurrent());
    assert.equal((await f.actor.appearance.set({hairColor:'brown'})).applied,false);
    assert(prepared.isCurrent());prepared.commit();prepared.dispose();
    const palettePrepared=await f.directPalette.prepareUpdate({eyeColor:'original'});
    assert.equal((await f.directPalette.set({eyeColor:'green'})).applied,false);
    assert(palettePrepared.isCurrent());palettePrepared.commit();palettePrepared.dispose();
    const other=await fixture(body),otherBefore=snapshot(other);
    await f.actor.appearance.set({skinTone:'warm',hairColor:'brown'});
    assert.deepEqual(snapshot(other),otherBefore);
    assert((await f.actor.appearance.set({reset:true})).applied);
    checks.push(body+' rejected request preserves prepared original update and independent instance; reset remains valid');
    assert.deepEqual(query.appearance.eyebrowColor.choices,[{value:'original',color:null}]);
    const browState=snapshot(f);assert.equal((await f.actor.appearance.set({eyebrowColor:'brown'})).applied,false);assert.deepEqual(snapshot(f),browState);
    const wrongBrow=structuredClone(query.defaultRecipe);wrongBrow.appearance.eyebrowColor='brown';assert.throws(()=>validateAppearanceRecipe(f.controller,wrongBrow));
    const wrongBase=structuredClone(query.defaultRecipe);wrongBase.base.sha256='843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef';assert.throws(()=>validateAppearanceRecipe(f.controller,wrongBase));
    checks.push('new Face has original-only eyebrow and rejects old avatar identity recipe');
  }
  const files=['body-texture-coverage-admissions.js','appearance-color-policy.js','foundation-profiles.js','appearance-candidates.js','appearance-recipe.js',
    'character-appearance.js','facial-palette.js'];
  const runtimeSHA={};for(const file of files)runtimeSHA[file]=sha(await fs.readFile('prototype/src/'+file));
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:true,checks,runtimeSHA,sourcePins,
    scope:'Actual runtime modules and SHA-checked GLB geometry/materials. Texture decode is null fixture; outfit transaction is presentation fixture. Legacy eye/lip prove preparation path, not decoded pixels. No browser/GPU/visual acceptance.'},null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,output}));
} catch(error) {
  await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({checks,error:error.stack},null,2)+'\n');throw error;
} finally {
  for(const f of fixtures){f.actor.appearance.dispose();f.actor.facialGeometry.dispose();f.directPalette.dispose();}
  globalThis.fetch=oldFetch;
}
