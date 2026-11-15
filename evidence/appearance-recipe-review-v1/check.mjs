import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { captureAppearanceRecipe, applyAppearanceRecipe, appearanceDraftKey } from '../../prototype/src/appearance-recipe.js';
const dir=path.dirname(fileURLToPath(import.meta.url));
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(dir,'../../prototype/src/appearance-recipe.js'))).digest('hex'),crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'source-tested/appearance-recipe.js'))).digest('hex'),'Reviewed recipe source changed; preserve this before evidence and use a separately identified after test.');
const pin='a'.repeat(64),recipePin='b'.repeat(64);
function fixture(){
 let color={hairStyle:'original',hairColor:'original',skinTone:'original',eyeColor:'original',lipColor:'original'},width=0,gen=0;
 let gate=null,entered=null,throwOutfit=false;const calls=[];
 const actor={profile:{bodyType:'female',sha256:pin},config:{manifestUrl:'/assets/example/equipment.json',outfits:[{index:0,role:'pants'},{index:1,role:'skirt'},{index:2,role:'shorts'}]},
  appearance:{getState:()=>({...color,availableStyles:['original','none'],replacementSHA256:null}),async set(value){const request=++gen;calls.push(['appearance',value]);const wait=gate;gate=null;if(wait){entered?.();await wait;}if(request!==gen)return{applied:false,cancelled:true};color={...color,...value};return{applied:true};}},
  facialGeometry:{getState:()=>({mouthWidth:width,available:true,recipeSha256:recipePin,loading:false}),async set(value){calls.push(['geometry',value]);if(value.mouthWidth&&value.expectedRecipeSha256&&value.expectedRecipeSha256!==recipePin)return{applied:false,reason:'wrong-version'};width=value.mouthWidth;return{applied:true};}}};
 const controller={actor,outfit:0,command(cmd){assert.equal(cmd.type,'outfit');this.outfit=cmd.value;calls.push(['outfit',cmd.value]);if(throwOutfit)throw Error('injected outfit UI failure after assignment');}};
 return{actor,controller,calls,delay(){let release;gate=new Promise(r=>release=r);const started=new Promise(r=>entered=r);return{release,started};},setOutfitFailure(){throwOutfit=true;}};
}
const results=[];
{
 const f=fixture(),record=captureAppearanceRecipe(f.controller);record.base.sha256='0'.repeat(64);
 await assert.rejects(applyAppearanceRecipe(f.controller,record));assert.equal(f.calls.length,0);
 results.push({name:'wrong-base-rejects-before-mutation',pass:true});
}
{
 const f=fixture(),record=captureAppearanceRecipe(f.controller);record.geometry={mouthWidth:.04,recipeSha256:'0'.repeat(64)};
 await assert.rejects(applyAppearanceRecipe(f.controller,record));assert.equal(f.actor.facialGeometry.getState().mouthWidth,0);
 results.push({name:'wrong-geometry-version-retains-before-state',pass:true,calls:f.calls});
}
{
 const f=fixture(),record=captureAppearanceRecipe(f.controller),wait=f.delay();record.appearance.hairColor='black';
 const pending=applyAppearanceRecipe(f.controller,record);await wait.started;
 const second=fixture();f.controller.actor=second.actor;wait.release();const result=await pending;
 assert.equal(result.cancelled,true);assert.equal(second.calls.length,0);
 results.push({name:'body-switch-does-not-write-new-actor',pass:true,result});
}
{
 const f=fixture(),record=captureAppearanceRecipe(f.controller),wait=f.delay();record.appearance.hairColor='black';
 const pending=applyAppearanceRecipe(f.controller,record);await wait.started;
 f.controller.command({type:'outfit',value:2});wait.release();const result=await pending;
 assert.equal(result.applied,true);assert.equal(f.controller.outfit,0);
 results.push({name:'reproduced-newer-outfit-overwritten',userNewerOutfit:2,actualFinalOutfit:f.controller.outfit,result,calls:f.calls});
}
{
 const f=fixture(),record=captureAppearanceRecipe(f.controller),wait=f.delay();record.appearance.hairColor='black';
 const pending=applyAppearanceRecipe(f.controller,record).catch(error=>({error:error.message}));await wait.started;
 await f.actor.appearance.set({hairColor:'brown'});wait.release();const result=await pending;
 assert.equal(f.actor.appearance.getState().hairColor,'original');
 results.push({name:'reproduced-superseded-restore-rolls-back-newer-api-edit',scope:'API-level concurrent request; normal workbench color fields are disabled while restoring',newerColor:'brown',actualFinalColor:f.actor.appearance.getState().hairColor,result,calls:f.calls});
}
{
 const f=fixture(),record=captureAppearanceRecipe(f.controller);record.equipment={index:1,role:'skirt',manifestUrl:f.actor.config.manifestUrl};f.setOutfitFailure();
 let message;try{await applyAppearanceRecipe(f.controller,record);}catch(e){message=e.message;}
 assert.equal(f.controller.outfit,1);
 results.push({name:'fault-injected-outfit-partial-commit-not-rolled-back',scope:'Injected synchronous command failure, not claimed an observed ordinary UI failure',beforeOutfit:0,actualFinalOutfit:1,message});
}
assert.notEqual(appearanceDraftKey('female'),appearanceDraftKey('male'));
const hashes=Object.fromEntries(['appearance-recipe.js','appearance-workbench.js','foundation-avatar.js','main.js'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'source-tested',name))).digest('hex')]));
const report={scope:'No GPU/browser. Actual recipe module with explicit async actor/controller fixtures. Source snapshots bind review identity.',sourceHashes:hashes,results};
fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
