import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { captureAppearanceRecipe, applyAppearanceRecipe, validateAppearanceRecipe } from '../../../prototype/src/appearance-recipe.js';
import { foundationProfile } from '../../../prototype/src/foundation-profiles.js';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(sha(fs.readFileSync(path.join(root,'prototype/src/appearance-recipe.js'))),sha(fs.readFileSync(path.join(dir,'source-tested/appearance-recipe.js'))));
const foundation=fs.readFileSync(path.join(dir,'source-tested/foundation-avatar.js'),'utf8');
const getter=foundation.slice(foundation.indexOf('getEquipmentRecipe: (index) => {')+'getEquipmentRecipe: '.length,foundation.indexOf('\n    setMaterialRecipe:',foundation.indexOf('getEquipmentRecipe: (index) => {'))).trim().replace(/,$/,'');
function fixture(){
 const config=foundationProfile('male'),manifest=JSON.parse(fs.readFileSync(path.join(root,'prototype/public',config.manifestUrl)));
 const surfaces={equipment:new Map(manifest.items.map(entry=>[entry.id,{entry}]))};
 const getEquipmentRecipe=vm.runInNewContext('('+getter+')',{config,surfaces,structuredClone});
 let color={hairStyle:'original',hairColor:'original',skinTone:'original',eyeColor:'original',lipColor:'original'},width=0,ar=0,gr=0;
 let gate=null,entered=null,outfitThrows=0,failAppearance=0;const calls=[];
 const recipePin='b'.repeat(64);
 const actor={config,profile:{bodyType:'male',sha256:config.sha256},getEquipmentRecipe,
  appearance:{getState:()=>({...color,availableStyles:['original','none'],replacementSHA256:null,revision:ar}),async set(value){const revision=++ar;calls.push(['appearance',value]);if(failAppearance){failAppearance--;return{applied:false,reason:'injected appearance failure'};}const wait=gate;gate=null;if(wait){entered?.();await wait;}if(revision!==ar)return{applied:false,cancelled:true};color={...color,...value};return{applied:true};}},
  facialGeometry:{getState:()=>({mouthWidth:width,available:true,recipeSha256:recipePin,loading:false,revision:gr}),async set(value){gr++;calls.push(['geometry',value]);if(value.mouthWidth&&value.expectedRecipeSha256&&value.expectedRecipeSha256!==recipePin)return{applied:false,reason:'wrong-version'};width=value.mouthWidth;return{applied:true};}}};
 const controller={actor,outfit:0,command(cmd){assert.equal(cmd.type,'outfit');this.outfit=cmd.value;calls.push(['outfit',cmd.value,this.actor===actor?'old':'new']);if(outfitThrows){outfitThrows--;throw Error('injected outfit UI failure after assignment');}}};
 return{actor,controller,calls,delay(){let release;gate=new Promise(r=>release=r);const started=new Promise(r=>entered=r);return{release,started};},setOutfitFailure(n=1){outfitThrows=n;},failNextAppearance(){failAppearance++;}};
}
const results=[];
{
 const f=fixture(),record=captureAppearanceRecipe(f.controller),wait=f.delay();record.appearance.hairColor='black';
 const pending=applyAppearanceRecipe(f.controller,record);await wait.started;f.controller.command({type:'outfit',value:2});wait.release();const result=await pending;
 assert.equal(result.applied,true);assert.equal(f.controller.outfit,2);results.push({name:'newer-outfit-preserved',pass:true,result,calls:f.calls});
}
{
 const f=fixture(),record=captureAppearanceRecipe(f.controller),wait=f.delay();record.appearance.hairColor='black';
 const pending=applyAppearanceRecipe(f.controller,record);await wait.started;await f.actor.appearance.set({hairColor:'brown'});wait.release();const result=await pending;
 assert.equal(result.cancelled,true);assert.equal(f.actor.appearance.getState().hairColor,'brown');results.push({name:'cancelled-restore-does-not-rollback-newer-edit',pass:true,result,calls:f.calls});
}
for(const failures of [1,2]){
 const f=fixture(),record=captureAppearanceRecipe(f.controller);record.equipment={index:2,role:'shorts',manifestUrl:f.actor.config.manifestUrl,resources:f.actor.getEquipmentRecipe(2)};f.setOutfitFailure(failures);
 let message;try{await applyAppearanceRecipe(f.controller,record);}catch(e){message=e.message;}
 assert.equal(f.controller.outfit,0);assert(message.includes(failures===1?'先前外观已保留':'服装回退未完成'));
 results.push({name:failures===1?'outfit-partial-commit-rolled-back':'outfit-rollback-ui-failure-honest',pass:true,message,calls:f.calls});
}
for(const mutation of ['body','geometry','equipment-sha','equipment-binding','equipment-missing']){
 const f=fixture(),record=captureAppearanceRecipe(f.controller);
 if(mutation==='body')record.base.sha256='0'.repeat(64);
 if(mutation==='geometry')record.geometry={mouthWidth:.04,recipeSha256:'0'.repeat(64)};
 if(mutation==='equipment-sha')record.equipment.resources.top.sha256='0'.repeat(64);
 if(mutation==='equipment-binding')record.equipment.resources.top.bindings[0].inverseBindMatrix[12]+=.001;
 if(mutation==='equipment-missing')delete record.equipment.resources;
 await assert.rejects(applyAppearanceRecipe(f.controller,record));assert.equal(f.actor.facialGeometry.getState().mouthWidth,0);assert.equal(f.controller.outfit,0);
 if(mutation!=='geometry')assert.equal(f.calls.length,0);results.push({name:mutation+'-rejects',pass:true});
}
{
 const f=fixture(),record=captureAppearanceRecipe(f.controller);validateAppearanceRecipe(f.controller,JSON.parse(JSON.stringify(record)));
 const resources=record.equipment.resources;resources.top.sha256='changed';assert.notEqual(f.actor.getEquipmentRecipe(0).top.sha256,'changed');
 results.push({name:'real-equipment-entry-snapshot-roundtrip-and-no-alias',pass:true,parts:Object.keys(resources)});
}
{
 const f=fixture(),record=captureAppearanceRecipe(f.controller),wait=f.delay();f.failNextAppearance();
 const pending=applyAppearanceRecipe(f.controller,record).catch(error=>({error:error.message}));await wait.started;
 const newer=fixture();f.controller.actor=newer.actor;f.controller.outfit=2;wait.release();const result=await pending;
 assert.equal(result.cancelled,true);assert.equal(f.controller.outfit,2);assert.equal(f.calls.some(c=>c[0]==='outfit'&&c[2]==='new'),false);
 results.push({name:'actor-switch-during-rollback',pass:true,newActorExpectedOutfit:2,actualOutfit:f.controller.outfit,newActorWritten:false,result,calls:f.calls});
}
const workbench=fs.readFileSync(path.join(dir,'source-tested/appearance-workbench.js'),'utf8');
assert(workbench.includes('for(const button of document.querySelectorAll(\'[data-outfit]\'))button.disabled=value;'));
assert(workbench.includes('if(restoreSelected)await restoreDraft(true);'));
results.push({name:'workbench-outfit-busy-and-hot-switch-draft-restore-wired',pass:true,scope:'Source assertions, not browser interaction'});
const report={scope:'Actual revised recipe functions and actual foundation getEquipmentRecipe closure against male installed manifest; async actor/controller fixtures; no GPU',sourceHashes:Object.fromEntries(fs.readdirSync(path.join(dir,'source-tested')).map(n=>[n,sha(fs.readFileSync(path.join(dir,'source-tested',n)))])),results};
fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({hashes:report.sourceHashes,results:results.map(({calls,...r})=>r)},null,2));
