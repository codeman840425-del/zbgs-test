import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'file:///F:/gamemake-whole-look-prepare/prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {createFacialGeometry} from 'file:///F:/gamemake-whole-look-prepare/prototype/src/facial-geometry.js';
import {createCharacterAppearance} from 'file:///F:/gamemake-whole-look-prepare/prototype/src/character-appearance.js';
import {foundationProfile} from 'file:///F:/gamemake-whole-look-prepare/prototype/src/foundation-profiles.js';
import {outfitSelection} from 'file:///F:/gamemake-whole-look-prepare/prototype/src/outfit-selection.js';
import {queryAppearanceCandidates,admitAppearanceCandidate} from 'file:///F:/gamemake-whole-look-prepare/prototype/src/appearance-candidates.js';
import {captureAppearanceRecipe,validateAppearanceRecipe,applyAppearanceRecipe} from 'file:///F:/gamemake-whole-look-prepare/prototype/src/appearance-recipe.js';
const source='F:/gamemake-whole-look-prepare',saved='F:/gamemake/evidence/m2-static-admission-baseline-1fa-v1',out='F:/gamemake/evidence/m2-candidate-admission-independent-v1';
const cfg=foundationProfile('male'),base=new URL('file:///'+source+'/prototype/public/'),bufferOf=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
let fetchCount=0;
globalThis.window={location:{href:'http://fixture.invalid/'}};
globalThis.fetch=async input=>{fetchCount++;return new Response(await fs.readFile(new URL('.'+new URL(input,window.location.href).pathname,base)));};
const loader=new GLTFLoader();loader.register(()=>({name:'CPUTextureDecodeFixture',loadTexture:async()=>null}));
const raw=await fs.readFile(new URL('.'+cfg.url,base));assert.equal(createHash('sha256').update(raw).digest('hex'),cfg.sha256);
const parsed=await loader.parseAsync(bufferOf(raw),'');parsed.scene.updateMatrixWorld(true);
const vrm={scene:parsed.scene,humanoid:{getRawBoneNode:name=>parsed.scene.getObjectByName(name==='head'?'J_Bip_C_Head':name)}};
const appearance=createCharacterAppearance({vrm,avatarSha256:cfg.sha256}),facialGeometry=createFacialGeometry({vrm,avatarSha256:cfg.sha256});
const manifest=JSON.parse(await fs.readFile(new URL('.'+cfg.manifestUrl,base),'utf8')),entries=new Map(manifest.items.map(entry=>[entry.id,entry]));
const actor={profile:{bodyType:'male',sha256:cfg.sha256},config:cfg,appearance,facialGeometry,
 getEquipmentRecipe:index=>Object.fromEntries(outfitSelection(cfg,index).roles.map(role=>[role,structuredClone(entries.get(cfg.ids[role]))]))};
const controller={actor,outfit:0,outfitRevision:0,prepareOutfit(){return{isCurrent:()=>true,commit(){},dispose(){}};}};
const state=()=>JSON.stringify({face:facialGeometry.getState(),appearance:appearance.getState(),outfit:controller.outfit,outfitRevision:controller.outfitRevision});
const geometryHash=()=>{const hashes=[];vrm.scene.traverse(mesh=>{if(mesh.isMesh&&/_Face_/.test(mesh.material?.name))hashes.push(createHash('sha256').update(mesh.geometry.attributes.position.array).digest('hex'));});return JSON.stringify(hashes);};
const rows=[],original=JSON.parse(await fs.readFile(saved+'/original-v6.json','utf8'));
try{
 for(const id of ['mouth','brow']){
  const inputPath=saved+'/'+id+'-wrong-source-v6.json',bytes=await fs.readFile(inputPath,'utf8'),record=JSON.parse(bytes),before=state(),beforeHash=geometryHash(),count=fetchCount;
  const result=admitAppearanceCandidate(controller,record);assert.equal(result.accepted,false);assert.equal(result.stage,'static');assert.equal(result.issues[0].field,'geometry.'+(id==='mouth'?'recipeSha256':'browRecipeSha256'));
  assert.throws(()=>validateAppearanceRecipe(controller,record));await assert.rejects(applyAppearanceRecipe(controller,record));
  const rejectedFetches=fetchCount-count;assert.equal(rejectedFetches,0);assert.equal(state(),before);assert.equal(geometryHash(),beforeHash);assert.equal(await fs.readFile(inputPath,'utf8'),bytes);
  const corrected=JSON.parse(await fs.readFile(saved+'/'+id+'-correct-source-v6.json','utf8'));assert(admitAppearanceCandidate(controller,corrected).accepted);assert((await applyAppearanceRecipe(controller,corrected)).applied);
  assert.deepEqual(captureAppearanceRecipe(controller),corrected);assert((await applyAppearanceRecipe(controller,original)).applied);assert.equal(geometryHash(),beforeHash);
  rows.push({id,inputPath,staticRejection:result,fetchesDuringRejectedInput:rejectedFetches,revisionAndVisibleGeometryPreserved:true,correctedAppliesAndRestores:true});
 }
 await fs.writeFile(out+'/preserved-inputs-report.json',JSON.stringify({commit:'09e99f3d07bcc227e8e951fd1e557632b33a9647',rows,scope:'Saved full v6 inputs from 1fa59bd. Actual pinned male VRM and face recipes. Texture decode and outfit commit use CPU fixtures. fetch counter and revision equality measured before corrected-resource apply. No browser/GPU.'},null,2)+'\n');
 console.log(JSON.stringify({passed:true,rows:rows.map(row=>({id:row.id,result:row.staticRejection}))}));
}finally{facialGeometry.dispose();appearance.dispose();}
