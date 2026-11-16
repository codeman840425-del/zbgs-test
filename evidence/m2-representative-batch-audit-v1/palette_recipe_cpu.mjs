// Real published metadata and actual query/recipe modules. Presentation is a
// CPU fixture only. No actor, texture preparation, render, or runtime claim.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {facialPaletteContract,compatiblePaletteVersions,FACIAL_PALETTE_VERSION,LEGACY_FACIAL_PALETTE_VERSION} from '../../prototype/src/facial-palette-contract.js';
import {REPRESENTATIVE_PRESETS,REPRESENTATIVE_PALETTE} from '../../prototype/src/representative-batch.js';
import {foundationProfile} from '../../prototype/src/foundation-profiles.js';
import {outfitSelection} from '../../prototype/src/outfit-selection.js';
import {queryAppearanceCandidates,admitAppearanceCandidate} from '../../prototype/src/appearance-candidates.js';
import {captureAppearanceRecipe,validateAppearanceRecipe,SURFACE_SCHEMA,SURFACE_RULES} from '../../prototype/src/appearance-recipe.js';
import {HAIRSTYLES} from '../../prototype/src/hairstyle-catalog.js';
import {SURFACE_LAYER_PACKAGE} from '../../prototype/src/surface-layer-catalog.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=[],checks=[];
async function read(name){const raw=await fs.readFile(path.join(root,name));files.push({path:name,bytes:raw.length,sha256:hash(raw)});return raw;}
const publicJSON=async url=>JSON.parse(await read('prototype/public'+url));
const previousCommit='296fe29';
async function oldModule(name){
 const source=execFileSync('git',['show',previousCommit+':prototype/src/'+name],{cwd:root,encoding:'utf8'});
 const resolved=source.replace(/from (['"])(\.[^'"]+)\1/g,(_,q,p)=>'from '+q+pathToFileURL(path.resolve(root,'prototype/src',p)).href+q);
 return import('data:text/javascript;base64,'+Buffer.from(resolved).toString('base64'));
}
const oldRecipe=await oldModule('appearance-recipe.js');
const oldCandidates=await oldModule('appearance-candidates.js');
function check(name,operation){operation();checks.push({name,passed:true});}
async function fixture(body,record=null){
 const config=foundationProfile(body),catalog=await publicJSON(config.manifestUrl);
 const state={hairStyle:'original',hairColor:'original',skinTone:'original',eyeColor:'original',lipColor:'original',replacementSHA256:null,hairFit:null,
  availableStyles:['original','none',...HAIRSTYLES.filter(e=>e.compatibleBodies.includes(config.sha256)).map(e=>e.id)],surfaceLayers:[]};
 if(record)Object.assign(state,record.appearance,{replacementSHA256:record.hairAssetSha256,hairFit:record.hairFit,surfaceLayers:record.surface?.layers??[],surfaceManifestSha256:record.surface?.manifestSha256??null});
 const actor={config,profile:{bodyType:body,sha256:config.sha256},appearance:{getState:()=>structuredClone(state)},
  facialGeometry:{getState:()=>structuredClone(record?.geometry??{mouthWidth:0,browSample:'none',noseSample:'none',eyeSample:'none'})},
  getEquipmentRecipe(index){return Object.fromEntries(outfitSelection(config,index).roles.map(role=>{const item=catalog.items.find(i=>i.id===config.ids[role]);assert(item);return[role,structuredClone(item)];}));}};
 if(record?.accessories)for(const [kind,key] of [['ears','rigidAccessories'],['hat','headwear']]){
  const part=record.accessories[kind];actor[key]={getState:()=>({selection:part.selection,status:'ready',assetSha256:part.resource?.assetSha256,fitId:part.resource?.fitId})};
 }
 return{actor,outfit:record?.equipment.index??0};
}
let fetches=0;const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{fetches++;throw Error('Static contract must not fetch');};
try{
 const indexRaw=await read('prototype/public/assets/m2-representative-batch-v1/runtime-index.json');
 check('actual-runtime-index-identity',()=>assert.equal(hash(indexRaw),'212b7542e319a69a511a5549b42631ccb22f7382059c501a48ab0fc250a7b0c6'));
 const paletteRaw=await read('prototype/public'+REPRESENTATIVE_PALETTE.url),palette=JSON.parse(paletteRaw);
 check('actual-batch-palette-pin',()=>assert.equal(hash(paletteRaw),REPRESENTATIVE_PALETTE.sha256));
 const oldPaletteRaw=await read('prototype/public/assets/appearance-color-v3/runtime-manifest.json'),oldPalette=JSON.parse(oldPaletteRaw);
 check('old-palette-remains-pinned',()=>assert.equal(hash(oldPaletteRaw),'2eff13c1d3837c4f8f76b7d97007b219059c212c1031d77e27a2f824715af321'));
 for(const body of ['female','male','m1a-jaw-v1','m1a-waisthip-v1','m2-male-jaw-v1']){
  const f=await fixture(body),q=queryAppearanceCandidates(f);
  check(body+' previous query unchanged',()=>assert.deepEqual(q,oldCandidates.queryAppearanceCandidates(f)));
  check(body+' previous capture unchanged',()=>assert.deepEqual(captureAppearanceRecipe(f),oldRecipe.captureAppearanceRecipe(f)));
  check(body+' palette version set unchanged',()=>assert.deepEqual(compatiblePaletteVersions(f.actor.profile.sha256),[FACIAL_PALETTE_VERSION,LEGACY_FACIAL_PALETTE_VERSION]));
  check(body+' v6 still validates',()=>assert.equal(validateAppearanceRecipe(f,q.defaultRecipe),true));
  const legacy=structuredClone(q.defaultRecipe);legacy.paletteVersion=LEGACY_FACIAL_PALETTE_VERSION;
  check(body+' legacy palette version still accepted',()=>assert.equal(validateAppearanceRecipe(f,legacy),true));
 }
 for(const sex of ['female','male']){
  const record=JSON.parse(await read('evidence/m2-accessory-record-room-785-v1/'+sex+'-v8.json')),f=await fixture(sex,record);
  check(sex+' actual historical v8 still validates',()=>assert.equal(validateAppearanceRecipe(f,record),true));
  check(sex+' old/current historical-v8 capture same',()=>assert.deepEqual(captureAppearanceRecipe(f),oldRecipe.captureAppearanceRecipe(f)));
  const v7=structuredClone(queryAppearanceCandidates(await fixture(sex)).defaultRecipe);
  Object.assign(v7,{schema:SURFACE_SCHEMA,rulesVersion:SURFACE_RULES,surface:{manifestSha256:SURFACE_LAYER_PACKAGE.sha256,layers:[{id:'freckles',opacity:.5}]}});
  check(sex+' v7 surface semantics preserved',()=>assert.equal(validateAppearanceRecipe(f,v7),true));
 }
 for(const preset of REPRESENTATIVE_PRESETS){
  const f=await fixture(preset.id),q=queryAppearanceCandidates(f),sha=f.actor.profile.sha256;
  const variant=palette.variants.find(v=>v.avatarSha256===sha),source=oldPalette.variants.find(v=>v.bodyType===preset.sex);
  check(preset.id+' exact new palette selector',()=>assert.deepEqual(compatiblePaletteVersions(sha),[REPRESENTATIVE_PALETTE.version]));
  check(preset.id+' query uses new version',()=>assert.equal(q.defaultRecipe.paletteVersion,REPRESENTATIVE_PALETTE.version));
  check(preset.id+' palette descriptors preserved',()=>assert.deepEqual({...variant,avatarSha256:source.avatarSha256,bodyType:source.bodyType},source));
  const v8=structuredClone(q.defaultRecipe);
  Object.assign(v8,{schema:'workbench-appearance-recipe-v8',rulesVersion:'workbench-appearance-rules-v8',accessories:{ears:{selection:'none',resource:null},hat:{selection:'none',resource:null}}});
  check(preset.id+' v8 none accessories validates',()=>assert.equal(validateAppearanceRecipe(f,v8),true));
  for(const key of ['rigidAccessories','headwear'])f.actor[key]={getState:()=>({selection:'none',status:'ready'})};
  check(preset.id+' current capture retains v8 schema and new palette',()=>assert.deepEqual(captureAppearanceRecipe(f),v8));
  const wrongHat=structuredClone(v8);wrongHat.accessories.hat.selection='single';
  check(preset.id+' original-body hat not inherited',()=>assert.throws(()=>validateAppearanceRecipe(f,wrongHat),e=>e.field==='accessories.hat'));
  const before=JSON.stringify(q.defaultRecipe);
  check(preset.id+' validates actual new default',()=>assert.equal(validateAppearanceRecipe(f,q.defaultRecipe),true));
  check(preset.id+' static admission',()=>assert.equal(admitAppearanceCandidate(f,q.defaultRecipe).accepted,true));
  for(const version of [FACIAL_PALETTE_VERSION,LEGACY_FACIAL_PALETTE_VERSION,'appearance-color-v3-batch1:'+'0'.repeat(64)]){
   const bad=structuredClone(q.defaultRecipe);bad.paletteVersion=version;
   check(preset.id+' wrong palette rejected '+version.slice(0,24),()=>assert.throws(()=>validateAppearanceRecipe(f,bad),e=>e.code==='incompatible-version'));
  }
  const badBody=structuredClone(q.defaultRecipe);badBody.base.sha256='0'.repeat(64);
  check(preset.id+' wrong body rejected',()=>assert.throws(()=>validateAppearanceRecipe(f,badBody),e=>e.code==='incompatible-body'));
  const badEquipment=structuredClone(q.defaultRecipe);badEquipment.equipment.resources.top.sha256='0'.repeat(64);
  check(preset.id+' wrong equipment rejected',()=>assert.throws(()=>validateAppearanceRecipe(f,badEquipment),e=>e.code==='resource-identity-mismatch'));
  check(preset.id+' input unchanged',()=>assert.equal(JSON.stringify(q.defaultRecipe),before));
 }
 check('no static network calls',()=>assert.equal(fetches,0));
}finally{globalThis.fetch=originalFetch;}
for(const name of ['representative-batch.js','facial-palette-contract.js','facial-palette.js','appearance-recipe.js','appearance-candidates.js'])await read('prototype/src/'+name);
const report={status:'passed',previousCommit,checks,files,scope:'Actual modules and actual published metadata. Controller presentation fixtures only, no texture/browser/transaction or visual acceptance.'};
await fs.writeFile(new URL('palette-recipe-contract-results.json',import.meta.url),JSON.stringify(report)+'\n');
console.log(JSON.stringify({status:report.status,checks:checks.length,fetches}));
