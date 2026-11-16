// Real query/admission/recipe/surface modules, pinned published metadata, no GPU.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {queryAppearanceCandidates,admitAppearanceCandidate} from '../prototype/src/appearance-candidates.js';
import {validateAppearanceRecipe,SURFACE_SCHEMA,SURFACE_RULES} from '../prototype/src/appearance-recipe.js';
import {SURFACE_LAYER_PACKAGE} from '../prototype/src/surface-layer-catalog.js';
import {createSurfaceLayers} from '../prototype/src/surface-layers.js';
import {foundationProfile} from '../prototype/src/foundation-profiles.js';
import {outfitSelection} from '../prototype/src/outfit-selection.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2]);await fs.mkdir(out,{recursive:true});
const baseCommit='10f5d5539907aa5c28ee6940161fcbde19cd4890';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const raw=await fs.readFile(path.join(root,'prototype/public',SURFACE_LAYER_PACKAGE.url));
const manifest=JSON.parse(raw);
const oldSource=execFileSync('git',['show',baseCommit+':prototype/src/appearance-candidates.js'],{cwd:root,encoding:'utf8'});
const resolvedOldSource=oldSource.replace(/from (['"])(\.[^'"]+)\1/g,(_,quote,name)=>'from '+quote+pathToFileURL(path.join(root,'prototype/src',name)).href+quote);
const previous=await import('data:text/javascript;base64,'+Buffer.from(resolvedOldSource).toString('base64'));
const checks=[],failures=[];
async function check(name,operation){try{await operation();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false});failures.push({name,error:error.stack});}}
const publicRoot=path.join(root,'prototype/public');
async function fixture(body){
  const config=foundationProfile(body),catalog=JSON.parse(await fs.readFile(path.join(publicRoot,config.manifestUrl),'utf8'));
  const state={availableStyles:['original'],revision:4,hairStyle:'original',hairColor:'original',skinTone:'original',eyeColor:'original',lipColor:'original'};
  return{outfit:0,outfitRevision:2,actor:{config,profile:{bodyType:body,sha256:config.sha256},
    appearance:{getState:()=>structuredClone(state)},
    getEquipmentRecipe(index){return Object.fromEntries(outfitSelection(config,index).roles.map(role=>{
      const entry=catalog.items.find(item=>item.id===config.ids[role]);assert(entry,'Actual configured resource missing');return[role,structuredClone(entry)];
    }));}}};
}
function surfaceRecord(query,layers=[{id:'freckles',opacity:1}]){
  return{...structuredClone(query.defaultRecipe),schema:SURFACE_SCHEMA,rulesVersion:SURFACE_RULES,
    surface:{manifestSha256:query.surface.manifest.sha256,layers}};
}
const beforeFetch=globalThis.fetch,beforeLocation=globalThis.location;
let fetches=0;
globalThis.fetch=async()=>{fetches++;throw Error('Static candidate path must not fetch');};
globalThis.location={href:'http://fixture.invalid/',origin:'http://fixture.invalid'};
try{
 await check('published manifest exact bytes match catalog pin',()=>assert.equal(hash(raw),SURFACE_LAYER_PACKAGE.sha256));
 for(const body of ['female','male']){
  const controller=await fixture(body),query=queryAppearanceCandidates(controller),variant=manifest.variants.find(v=>v.avatarSha256===query.base.sha256);
  await check(body+' keeps previous query fields and native v6 default',()=>{
    const old=previous.queryAppearanceCandidates(controller);
    for(const field of ['schema','base','defaultRecipe','appearance','geometry','equipment'])assert.deepEqual(query[field],old[field]);
    assert.equal(query.defaultRecipe.schema,'workbench-appearance-recipe-v6');
    assert.deepEqual(admitAppearanceCandidate(controller,query.defaultRecipe),previous.admitAppearanceCandidate(controller,query.defaultRecipe));
  });
  await check(body+' exposes only exact pinned body overlays and opacity multipliers',async()=>{
    assert.equal(query.surface.supported,true);assert.equal(query.surface.stage,'static');assert.deepEqual(query.surface.default,[]);
    assert.deepEqual(query.surface.supportedBodies,manifest.variants.map(v=>({bodyType:v.bodyType,sha256:v.avatarSha256})));
    assert.equal(query.surface.manifest.url,SURFACE_LAYER_PACKAGE.url);assert.equal(query.surface.manifest.sha256,SURFACE_LAYER_PACKAGE.sha256);
    assert.equal(query.surface.manifest.id,manifest.id);assert.equal(query.surface.manifest.version,manifest.version);
    assert.equal(query.surface.materialName,variant.materialName);assert.deepEqual(query.surface.mapSize,variant.mapSize);
    assert(query.surface.requiresPreparation.some(text=>text.includes('source pixels')));
    for(const [index,choice]of query.surface.choices.entries()){
      const actual=variant.layers[index];assert.equal(choice.id,actual.id);assert.equal(choice.order,actual.order);
      assert.deepEqual(choice.opacity.range,actual.allowedOpacity);assert.equal(choice.opacity.default,1);
      assert.deepEqual(choice.resource,{file:actual.url,sha256:actual.sha256});
      assert.equal(hash(await fs.readFile(path.join(publicRoot,path.posix.dirname(SURFACE_LAYER_PACKAGE.url),actual.url))),actual.sha256);
    }
  });
  for(const choice of query.surface.choices)for(const opacity of [0,.37,1])await check(`${body} admits actual ${choice.id} opacity${opacity}`,()=>{
    const record=surfaceRecord(query,[{id:choice.id,opacity}]);assert.equal(validateAppearanceRecipe(controller,record),true);
    const before=structuredClone(record),state=controller.actor.appearance.getState(),count=fetches;
    const result=admitAppearanceCandidate(controller,record);assert.equal(result.accepted,true);assert.equal(result.stage,'static');
    assert(result.requiresPreparation.includes('surface source pixels, material and UV identity'));
    assert.deepEqual(record,before);assert.deepEqual(controller.actor.appearance.getState(),state);assert.equal(fetches,count);
  });
  await check(body+' admits reversed combined layers through actual recipe validator',()=>{
    const record=surfaceRecord(query,query.surface.choices.toReversed().map(c=>({id:c.id,opacity:.6})));
    assert.equal(validateAppearanceRecipe(controller,record),true);assert.equal(admitAppearanceCandidate(controller,record).accepted,true);
  });
  await check(body+' query clones every new nested metadata array',()=>{
    const changed=queryAppearanceCandidates(controller);changed.surface.choices[0].opacity.range[0]=-100;
    changed.surface.supportedBodies[0].sha256='bad';changed.surface.mapSize[0]=1;changed.surface.manifest.sha256='bad';
    assert.deepEqual(queryAppearanceCandidates(controller),query);
  });
  const specimens=[
    ['wrong manifest',r=>r.surface.manifestSha256='0'.repeat(64),'surface'],
    ['missing manifest',r=>delete r.surface.manifestSha256,'surface'],
    ['unknown layer',r=>r.surface.layers[0].id='not-registered','surface.layers.0.id'],
    ['duplicate layer',r=>r.surface.layers.push({...r.surface.layers[0]}),'surface'],
    ['empty selection',r=>r.surface.layers=[],'surface'],
    ['negative opacity',r=>r.surface.layers[0].opacity=-.01,'surface'],
    ['opacity above one',r=>r.surface.layers[0].opacity=1.01,'surface'],
    ['string opacity',r=>r.surface.layers[0].opacity='0.5','surface'],
    ['nonfinite opacity',r=>r.surface.layers[0].opacity=NaN,'surface'],
    ['extra surface field',r=>r.surface.mask='unregistered','surface.mask'],
    ['extra layer field',r=>r.surface.layers[0].blendMode='multiply','surface.layers.0.blendMode'],
    ['extra base field',r=>r.base.referenceBody='female','base.referenceBody'],
    ['extra appearance field',r=>r.appearance.makeup=1,'appearance.makeup'],
    ['extra geometry field',r=>r.geometry.surface=1,'geometry.surface'],
    ['extra equipment field',r=>r.equipment.surface=1,'equipment.surface'],
    ['extra root field',r=>r.surfaceLayers=[],'surfaceLayers'],
    ['surface array',r=>r.surface=[],'surface'],
    ['layer array',r=>r.surface.layers=[[]],'surface.layers.0'],
    ['v7 rules mismatch',r=>r.rulesVersion='workbench-appearance-rules-v6','schema'],
    ['v6 cannot acquire surface field',r=>{r.schema='workbench-appearance-recipe-v6';r.rulesVersion='workbench-appearance-rules-v6';},'surface'],
  ];
  for(const [name,mutate,field]of specimens)await check(body+' rejects '+name+' without resource I/O or state mutation',()=>{
    const record=surfaceRecord(query),state=controller.actor.appearance.getState(),count=fetches;mutate(record);const saved=structuredClone(record);
    const result=admitAppearanceCandidate(controller,record);assert.equal(result.accepted,false);assert.equal(result.stage,'static');assert.equal(result.issues[0].field,field);
    assert.deepEqual(record,saved);assert.deepEqual(controller.actor.appearance.getState(),state);assert.equal(fetches,count);
  });
  await check(body+' actual recipe validator still rejects wrong geometry inside v7',()=>{
    const record=surfaceRecord(query);record.geometry.mouthWidth=.12;record.geometry.recipeSha256='0'.repeat(64);
    assert.throws(()=>validateAppearanceRecipe(controller,record));const result=admitAppearanceCandidate(controller,record);assert.equal(result.accepted,false);assert.equal(result.issues[0].field,'geometry.recipeSha256');
  });
 }
 for(const body of ['m1a-jaw-v1','m1a-waisthip-v1','m2-male-jaw-v1','m2-male-lower-leg-v1'])await check(body+' keeps v6 and rejects unregistered v7 fit',async()=>{
   const controller=await fixture(body),query=queryAppearanceCandidates(controller);
   assert.equal(query.surface.supported,false);assert.deepEqual(query.surface.choices,[]);assert(query.surface.reason);
   assert.equal(admitAppearanceCandidate(controller,query.defaultRecipe).accepted,true);
   assert.deepEqual(query.defaultRecipe,previous.queryAppearanceCandidates(controller).defaultRecipe);
   const record=surfaceRecord(query);const result=admitAppearanceCandidate(controller,record);assert.equal(result.accepted,false);assert.equal(result.issues[0].field,'surface');assert.equal(result.issues[0].code,'unsupported-resource');
 });
 const male=await fixture('male'),query=queryAppearanceCandidates(male),record=surfaceRecord(query);
 for(const failure of ['manifest HTTP','manifest digest','overlay HTTP'])await check('static admission remains distinct from actual '+failure+' preparation',async()=>{
   assert.equal(admitAppearanceCandidate(male,record).accepted,true);
   const owner=createSurfaceLayers({avatarSha256:male.actor.profile.sha256});const before=owner.getState();
   globalThis.fetch=async input=>{
     fetches++;const url=new URL(input,location.href);
     if(failure==='manifest HTTP')return new Response(null,{status:503});
     if(failure==='manifest digest')return new Response(Buffer.concat([raw,Buffer.from(' ')]));
     return url.pathname===SURFACE_LAYER_PACKAGE.url?new Response(raw):new Response(null,{status:503});
   };
   try{await assert.rejects(owner.prepare([],record.surface.layers,record.surface.manifestSha256),failure==='manifest digest'?/identity mismatch/:/HTTP 503/);assert.deepEqual(owner.getState(),before);}
   finally{owner.dispose();globalThis.fetch=async()=>{fetches++;throw Error('Static candidate path must not fetch');};}
 });
}finally{globalThis.fetch=beforeFetch;globalThis.location=beforeLocation;}
const names=['prototype/src/appearance-candidates.js','prototype/src/appearance-recipe.js','prototype/src/surface-layer-catalog.js','prototype/src/surface-layer-compositor.js','prototype/src/surface-layers.js','scripts/qa-surface-candidate-admission.mjs'];
const sourceSha256=Object.fromEntries(await Promise.all(names.map(async name=>[name,hash(await fs.readFile(path.join(root,name)))])));
const report={schema:'surface-candidate-admission-cpu-v1',baseCommit,passed:failures.length===0,checks,failures,sourceSha256,manifestSha256:hash(raw),
  limits:['Controller presentation fixtures use actual current profiles and equipment manifest records. Query, admission, recipe validation and surface preparation are the actual imported modules.','No texture/image decode, Canvas rendering, browser or GPU. Resource rejection cases fail actual preparation before image decoding.','Static metadata acceptance does not certify actual current face pixels, new body fits or resource availability.']};
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,checks:checks.length,failures,out},null,2));if(failures.length)process.exitCode=1;
