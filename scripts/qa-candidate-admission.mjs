// Real existing VRM, equipment/fit and facial recipe resources on CPU.
// Only texture decoding and controller presentation are fixtures. No GPU proof.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {execFileSync} from 'node:child_process';
import {GLTFLoader} from '../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {createFacialGeometry} from '../prototype/src/facial-geometry.js';
import {createCharacterAppearance} from '../prototype/src/character-appearance.js';
import {foundationProfile} from '../prototype/src/foundation-profiles.js';
import {outfitSelection} from '../prototype/src/outfit-selection.js';
import {queryAppearanceCandidates,admitAppearanceCandidate} from '../prototype/src/appearance-candidates.js';
import {applyAppearanceRecipe,captureAppearanceRecipe,validateAppearanceRecipe} from '../prototype/src/appearance-recipe.js';

const jsonHook=registerHooks({load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{type:'json'}}:context);}});
const {createM1Equipment}=await import('../prototype/src/m1-equipment.js');jsonHook.deregister();
const out=path.resolve(process.argv[2]);await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const base=new URL('../prototype/public/',import.meta.url),rows=[],fixtures=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bufferOf=bytes=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const originalParse=GLTFLoader.prototype.parseAsync,originalFetch=globalThis.fetch;
GLTFLoader.prototype.parseAsync=function(...args){this.register(()=>({name:'CPUTextureDecodeFixture',loadTexture:async()=>null}));return originalParse.apply(this,args);};
globalThis.window={location:{href:'http://fixture.invalid/'}};
let held=null,corruptUrl=null,fetchCount=0;
globalThis.fetch=async input=>{
  fetchCount++;const url=new URL(input,window.location.href);
  if(url.pathname===held?.url){const gate=held;held=null;gate.enter();await gate.promise;}
  const bytes=await fs.readFile(new URL('.'+url.pathname,base));
  return new Response(url.pathname===corruptUrl?Buffer.concat([bytes,Buffer.from(' ')]):bytes);
};
function hold(url){let release,enter;const gate={url,promise:new Promise(r=>release=r),started:new Promise(r=>enter=r),enter:()=>enter()};held=gate;return{started:gate.started,release};}
async function fixture(body){
  const config=foundationProfile(body),bytes=await fs.readFile(new URL('.'+config.url,base));assert.equal(hash(bytes),config.sha256);
  const parsed=await new GLTFLoader().parseAsync(bufferOf(bytes),'');parsed.scene.updateMatrixWorld(true);
  const document=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  const raw=Object.fromEntries(document.extensions.VRM.humanoid.humanBones.map(binding=>[binding.bone,document.nodes[binding.node].name]));
  const vrm={scene:parsed.scene,humanoid:{getRawBoneNode:name=>parsed.scene.getObjectByName(raw[name]??name)}};
  const equipment=await createM1Equipment({vrm,avatarSha256:config.sha256,bodyType:body}),adapter=equipment.getAssetProfile().equipment;
  const actor={config,profile:{bodyType:body,sha256:config.sha256},
    appearance:createCharacterAppearance({vrm,avatarSha256:config.sha256}),facialGeometry:createFacialGeometry({vrm,avatarSha256:config.sha256}),
    getEquipmentRecipe:index=>Object.fromEntries(outfitSelection(config,index).roles.map(role=>[role,structuredClone(adapter.get(config.ids[role]).entry)]))};
  const controller={actor,outfit:0,outfitRevision:0,prepareOutfit(value){const update=equipment.prepareOutfit(value),revision=this.outfitRevision;return{
    isCurrent:()=>this.outfitRevision===revision&&update.isCurrent(),commit:()=>{update.commit();this.outfit=value;this.outfitRevision++;},dispose:()=>update.dispose()};}};
  const f={controller,actor,equipment,vrm};fixtures.push(f);return f;
}
function fromQuery(options,{mouth,samples=true,hair=true}={}){
  const record=structuredClone(options.defaultRecipe),geometry=options.geometry;
  if(mouth!==undefined){record.geometry.mouthWidth=mouth;record.geometry.recipeSha256=mouth===0?null:geometry.mouthWidth.resources.find(resource=>
    resource.continuousRange?mouth>=resource.continuousRange[0]&&mouth<=resource.continuousRange[1]:resource.supportedValues.includes(mouth)).recipeSha256;}
  if(samples)for(const domain of ['brow','nose','eye']){const option=geometry[domain+'Sample'].choices.at(-1);record.geometry[domain+'Sample']=option.value;record.geometry[domain+'RecipeSha256']=option.resource?.recipeSha256??null;}
  if(hair){const style=options.appearance.hairStyle.choices.at(-1);record.appearance.hairStyle=style.value;record.hairAssetSha256=style.assetSha256;record.hairFit=style.hairFit;}
  const set=options.equipment.sets.at(-1);record.equipment={index:set.index,role:set.role,manifestUrl:set.manifestUrl,resources:set.resources};
  return record;
}
function state(f){return{face:f.actor.facialGeometry.getState(),appearance:f.actor.appearance.getState(),outfit:f.controller.outfit,revision:f.controller.outfitRevision};}
function oldRecord(record,version){
  const result=structuredClone(record);result.schema='workbench-appearance-recipe-v'+version;result.rulesVersion='workbench-appearance-rules-v'+version;
  if(version<6)delete result.hairFit;
  for(const [domain,min] of [['brow',2],['nose',3],['eye',4]])if(version<min){delete result.geometry[domain+'Sample'];delete result.geometry[domain+'RecipeSha256'];}
  return result;
}
const check=async(name,fn)=>{await fn();rows.push(name);};
try{
  for(const body of ['male','female','m2-male-jaw-v1'])await check(body+' query identities match actual manifests and query-built candidate applies/restores',async()=>{
    const f=await fixture(body),before=state(f),count=fetchCount,options=queryAppearanceCandidates(f.controller);
    assert(admitAppearanceCandidate(f.controller,options.defaultRecipe).accepted);assert.deepEqual(state(f),before);assert.equal(fetchCount,count);
    const resources=[...options.geometry.mouthWidth.resources,...['brow','nose','eye'].flatMap(domain=>options.geometry[domain+'Sample'].choices.map(choice=>choice.resource).filter(Boolean))];
    for(const resource of resources){
      const manifest=JSON.parse(await fs.readFile(new URL('.'+resource.baseURL+'recipe-manifest.json',base)));
      const entry=manifest.recipes.find(item=>item.baseAvatarSha256===options.base.sha256);assert.equal(entry.sha256,resource.recipeSha256);
      assert.equal(hash(await fs.readFile(new URL('.'+resource.baseURL+entry.file,base))),resource.recipeSha256);
    }
    const target=fromQuery(options,{mouth:options.geometry.mouthWidth.discreteValues.at(-1)}),serialized=JSON.stringify(target);
    assert(admitAppearanceCandidate(f.controller,target).accepted);assert((await applyAppearanceRecipe(f.controller,target)).applied);
    assert.deepEqual(captureAppearanceRecipe(f.controller),target);assert.equal(JSON.stringify(target),serialized);
    const defaults=queryAppearanceCandidates(f.controller).defaultRecipe;assert.deepEqual(defaults,options.defaultRecipe);
    assert((await applyAppearanceRecipe(f.controller,defaults)).applied);assert.deepEqual(captureAppearanceRecipe(f.controller),defaults);
    if(body==='m2-male-jaw-v1'){assert.equal(options.geometry.mouthWidth.continuousRange,null);assert.deepEqual(options.geometry.mouthWidth.discreteValues,[0,.04]);}
    else{assert.deepEqual(options.geometry.mouthWidth.continuousRange,[-.04,.04]);assert(options.geometry.mouthWidth.discreteValues.includes(.12));}
  });
  const f=await fixture('male'),options=queryAppearanceCandidates(f.controller),target=fromQuery(options,{mouth:.12});
  for(const body of ['m1a-jaw-v1','m1a-waisthip-v1'])await check(body+' query exposes only implemented unchanged geometry',async()=>{
    const specimen=await fixture(body),query=queryAppearanceCandidates(specimen.controller);
    assert(admitAppearanceCandidate(specimen.controller,query.defaultRecipe).accepted);
    assert.equal(query.geometry.mouthWidth.continuousRange,null);assert.deepEqual(query.geometry.mouthWidth.discreteValues,[0]);
    assert.deepEqual(query.geometry.browSample.choices,[{value:'none',resource:null}]);
    const unsupported=structuredClone(query.defaultRecipe);unsupported.geometry.mouthWidth=.04;
    assert(!admitAppearanceCandidate(specimen.controller,unsupported).accepted);
  });
  for(const [name,mutate,field] of [
    ['wrong mouth source',r=>r.geometry.recipeSha256=options.geometry.mouthWidth.resources[0].recipeSha256,'geometry.recipeSha256'],
    ['wrong brow source',r=>r.geometry.browRecipeSha256=options.geometry.browSample.choices[1].resource.recipeSha256,'geometry.browRecipeSha256'],
    ['unsupported mouth gap',r=>r.geometry.mouthWidth=.06,'geometry.mouthWidth'],
    ['unknown geometry field',r=>r.geometry.headWidth=1,'geometry.headWidth'],
    ['unknown appearance field',r=>r.appearance.beardColor='black','appearance.beardColor'],
    ['unknown equipment field',r=>r.equipment.socks='none','equipment.socks'],
    ['wrong hair fit',r=>r.hairFit.manifestSha256='0'.repeat(64),'hairFit'],
    ['wrong equipment resource',r=>r.equipment.resources={wrong:true},'equipment.resources'],
    ['wrong body',r=>r.base.sha256='0'.repeat(64),'base'],
    ['unknown color',r=>r.appearance.hairColor='toString','appearance.hairColor'],
  ])await check(name+' is a structured static rejection without I/O or revision changes',async()=>{
    const record=structuredClone(target),before=state(f),count=fetchCount;mutate(record);const input=JSON.stringify(record);
    const result=admitAppearanceCandidate(f.controller,record);assert(!result.accepted);assert.equal(result.issues[0].field,field);assert(result.issues[0].reason);
    assert.equal(fetchCount,count);assert.deepEqual(state(f),before);assert.equal(JSON.stringify(record),input);
    if(name.startsWith('wrong mouth')||name.startsWith('wrong brow')){
      assert.throws(()=>validateAppearanceRecipe(f.controller,record));await assert.rejects(applyAppearanceRecipe(f.controller,record));assert.equal(fetchCount,count);
    }
  });
  await check('runtime prepare shares the pure identity resolver before changing its generation',async()=>{
    const before=state(f),count=fetchCount,result=await f.actor.facialGeometry.prepareUpdate({mouthWidth:.12,
      expectedRecipeSha256:options.geometry.mouthWidth.resources[0].recipeSha256});
    assert(!result.applied);assert.equal(result.field,'geometry.recipeSha256');assert.equal(fetchCount,count);assert.deepEqual(state(f),before);
  });
  await check('query/admit during a real pending geometry request do not cancel it or expose mutable catalogs',async()=>{
    const pending=await fixture('male'),defaults=queryAppearanceCandidates(pending.controller),gate=hold('/assets/mouth-visible-v2/recipe-manifest.json');
    const job=pending.actor.facialGeometry.set({mouthWidth:.12});await gate.started;const before=state(pending),count=fetchCount;
    const query=queryAppearanceCandidates(pending.controller);assert(admitAppearanceCandidate(pending.controller,query.defaultRecipe).accepted);
    query.geometry.mouthWidth.continuousRange[0]=-999;query.appearance.hairStyle.choices[2].hairFit.manifestSha256='bad';query.defaultRecipe.appearance.hairColor='invalid';
    assert.deepEqual(queryAppearanceCandidates(pending.controller),defaults);assert.deepEqual(state(pending),before);assert.equal(fetchCount,count);
    gate.release();assert((await job).applied);assert.equal(pending.actor.facialGeometry.getState().mouthWidth,.12);
  });
  await check('correct static identity still requires byte validation and a failed actual fetch preserves the previous look',async()=>{
    const fresh=await fixture('male'),query=queryAppearanceCandidates(fresh.controller),record=fromQuery(query,{mouth:.12}),before=captureAppearanceRecipe(fresh.controller);
    const source=query.geometry.mouthWidth.resources[1],manifest=JSON.parse(await fs.readFile(new URL('.'+source.baseURL+'recipe-manifest.json',base)));
    const entry=manifest.recipes.find(item=>item.baseAvatarSha256===query.base.sha256);corruptUrl=source.baseURL+entry.file;
    assert(admitAppearanceCandidate(fresh.controller,record).accepted);
    await assert.rejects(applyAppearanceRecipe(fresh.controller,record),/校验失败/);assert.deepEqual(captureAppearanceRecipe(fresh.controller),before);
    corruptUrl=null;assert((await applyAppearanceRecipe(fresh.controller,record)).applied);
  });
  await check('existing v1-v6 restore keeps original source identities and input bytes',async()=>{
    const legacy=fromQuery(options,{mouth:.025,samples:false,hair:false});
    for(let version=1;version<=6;version++){
      const record=oldRecord(legacy,version),bytes=JSON.stringify(record);assert(admitAppearanceCandidate(f.controller,record).accepted);
      assert((await applyAppearanceRecipe(f.controller,record)).applied);assert.equal(JSON.stringify(record),bytes);assert.equal(f.actor.facialGeometry.getState().mouthWidth,.025);
    }
    assert((await applyAppearanceRecipe(f.controller,options.defaultRecipe)).applied);
  });
  const filenames=execFileSync('git',['diff','--name-only','HEAD'],{encoding:'utf8'}).trim().split('\n').filter(name=>name.startsWith('prototype/src/'));
  const sourceSha256={};for(const name of [...filenames,'prototype/src/facial-geometry-selection.js','prototype/src/appearance-candidates.js','scripts/qa-candidate-admission.mjs'])sourceSha256[name]=hash(await fs.readFile(name));
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({passed:true,rows,sourceSha256,scope:'Actual existing resources and runtime modules on CPU; textures decode to null, canvas/rendering/GPU untested; no new shape-fit certification'},null,2));
  console.log(JSON.stringify({passed:rows.length,out}));
}catch(error){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({rows,error:error.stack},null,2));throw error;}
finally{for(const f of fixtures){f.actor.facialGeometry.dispose();f.actor.appearance.dispose();f.equipment.dispose();}globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;}
