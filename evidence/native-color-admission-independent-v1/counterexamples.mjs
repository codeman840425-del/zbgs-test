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

const output=path.resolve(process.argv[2]??'evidence/native-color-admission-independent-v1/counterexamples');
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
try{
 for(const body of ['native-female-843ac-v1','native-male-7586-v1']){
  const f=await fixture(body),q=queryAppearanceCandidates(f.controller);
  for(const [field,choices] of Object.entries(presets)){
   const value=Object.keys(choices).find(x=>x!=='original');
   const prepared=await f.actor.appearance.prepareUpdate({hairColor:'original'}),before=snapshot(f),count=fetches;
   const bad=structuredClone(q.defaultRecipe);bad.appearance[field]=value;
   await assert.rejects(applyAppearanceRecipe(f.controller,bad),/仅支持原色/);
   assert(prepared.isCurrent());assert.deepEqual(snapshot(f),before);assert.equal(fetches,count);
   const rejected=await f.actor.appearance.prepareUpdate({[field]:value});assert.equal(rejected.applied,false);assert(prepared.isCurrent());
   prepared.commit();prepared.dispose();
   const reset=await f.actor.appearance.prepareUpdate({reset:true,[field]:value});assert(reset.isCurrent());reset.commit();reset.dispose();
   for(const k of Object.keys(presets))assert.equal(f.actor.appearance.getState()[k],'original');assert.equal(fetches,count);
  }
  const direct=await f.directPalette.prepareUpdate({reset:true,eyeColor:'green',lipColor:'rose'});direct.commit();direct.dispose();
  assert.equal(f.directPalette.getState().eyeColor,'original');assert.equal(f.directPalette.getState().lipColor,'original');
  // Front-end support metadata is not the source of runtime admission.
  f.actor.config.previewAppearanceSupport={hairColor:true,skinTone:true,eyeColor:true,lipColor:true};
  for(const field of Object.keys(presets))assert.deepEqual(queryAppearanceCandidates(f.controller).appearance[field].choices,[{value:'original',color:null}]);
  assert.equal((await f.actor.appearance.set({hairColor:'brown'})).applied,false);
  const support=appearanceColorSupport(f.actor.profile.sha256);support.hairColor=true;assert.equal(appearanceColorSupport(f.actor.profile.sha256).hairColor,false);
  checks.push(body+' effective reset resolves valid blocked colors to original; every rejected recipe/prepare preserves existing prepared; forged UI metadata cannot admit color');
 }
 assert.deepEqual(appearanceColorSupport('not-a-registered-source'),{hairColor:true,skinTone:true,eyeColor:true,lipColor:true});
 checks.push('Unknown SHA explicitly retains legacy policy defaults only; no runtime fit or resource claim inferred');
 const policy=await fs.readFile('prototype/src/appearance-color-policy.js','utf8');assert(!/^import\s/m.test(policy));
 checks.push('New policy module is a dependency leaf; imports of all actual modified modules evaluate without cycle/TDZ errors');
 const files=['appearance-color-policy.js','foundation-profiles.js','appearance-candidates.js','appearance-recipe.js','character-appearance.js','facial-palette.js'];
 const pins={};for(const f of files)pins[f]=sha(await fs.readFile('prototype/src/'+f));
 await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:true,checks,pins,scope:'Independent cross-entry/reset/pending transaction probes on actual runtime modules + real SHA-checked source geometry; original author fixture shells reused. No GPU/UI DOM test.'},null,2)+'\n');console.log(JSON.stringify({passed:true,checks}));
}finally{for(const f of fixtures){f.actor.appearance.dispose();f.actor.facialGeometry.dispose();f.directPalette.dispose();}globalThis.fetch=oldFetch;}
