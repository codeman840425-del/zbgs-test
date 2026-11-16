import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {EventEmitter} from 'node:events';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
const out=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(out,'../..'),sha=b=>createHash('sha256').update(b).digest('hex');
globalThis.location=new URL('http://fixture.invalid/?workbench=appearance');globalThis.window={location};globalThis.self={URL:globalThis.URL};globalThis.ProgressEvent??=class{constructor(type,details){this.type=type;Object.assign(this,details);}};
const hook=registerHooks({load(url,context,next){return next(url,url.endsWith('.json')?{...context,importAttributes:{type:'json'}}:context);}});
const {loadFoundationAvatar}=await import('../../prototype/src/foundation-avatar.js');
const {captureAppearanceRecipe,applyAppearanceRecipe}=await import('../../prototype/src/appearance-recipe.js');
const {accessorySelection}=await import('../../prototype/src/accessory-recipe.js');
const {createAccessoryTransactionContext}=await import('../../prototype/src/accessory-transaction-context.js');
const {HAIRSTYLES}=await import('../../prototype/src/hairstyle-catalog.js');
const {hairFitIdentity}=await import('../../prototype/src/hair-fit-contract.js');
const originalFetch=globalThis.fetch,originalParse=GLTFLoader.prototype.parseAsync;
const checks=[],findings=[],actors=[],requests=[];let held=null,failPath=null,fatal=null;
const check=(name,passed,details={})=>{const row={name,passed,...details};checks.push(row);if(!passed)findings.push(row);};
GLTFLoader.prototype.parseAsync=function(...args){this.register(()=>({name:'CPUTextureFixture',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}));return originalParse.apply(this,args);};
globalThis.fetch=async input=>{const u=new URL(String(input),location);requests.push(u.pathname);if(held?.path===u.pathname){const h=held;held=null;h.enter();await h.wait;}if(u.pathname===failPath)return new Response(null,{status:503});return new Response(await fs.readFile(path.join(root,'prototype/public',u.pathname)));};
const renderer={shadowMap:{enabled:false},getContext:()=>({isContextLost:()=>false}),compileAsync:async()=>{},domElement:{addEventListener(){},removeEventListener(){}}};
function hold(file){let release,enter;const h={path:file,wait:new Promise(r=>release=r),started:new Promise(r=>enter=r),enter:()=>enter()};held=h;return{started:h.started,release:()=>release()};}
async function fixture(bodyType='female'){
 const actor=await loadFoundationAvatar({scene:new THREE.Scene(),renderer,bodyType,attachToScene:false});actors.push(actor);const events=new EventEmitter(),notifications=[];events.on('appearance-state-changed',v=>notifications.push(v.actor));
 const controller={actor,outfit:0,outfitRevision:0,isPeer:false,game:{events},async prepareOutfit(value){const ticket=this.outfitRevision,update=await actor.prepareOutfit(value);return{isCurrent:()=>ticket===this.outfitRevision&&update.isCurrent(),commit:()=>{update.commit();this.outfit=value;this.outfitRevision++;},dispose:()=>update.dispose()};}};
 return{actor,controller,notifications};
}
function visible(f){const a=f.actor,s=a.appearance.getState(),g=a.facialGeometry.getState(),geometries=[];a.vrm.scene.traverse(n=>{if(n.isMesh&&!n.userData.rigidAccessoryId){const materials=Array.isArray(n.material)?n.material:[n.material];if(materials.some(m=>/Body_.*SKIN|Face_.*SKIN/.test(m.name)))geometries.push([n.uuid,n.geometry.uuid,sha(Buffer.from(n.geometry.attributes.position.array.buffer))]);}});return{hair:s.hairStyle,hairColor:s.hairColor,skin:s.skinTone,mouth:g.mouthWidth,brow:g.browSample,nose:g.noseSample,eye:g.eyeSample,outfit:f.controller.outfit,ears:a.rigidAccessories.getState().selection,hat:a.headwear.getState().selection,geometries};}
function target(f){const record=captureAppearanceRecipe(f.controller),entry=HAIRSTYLES.find(e=>e.id==='female-ponytail-v1');record.appearance.hairStyle=entry.id;record.hairAssetSha256=entry.assetSha256;record.hairFit=hairFitIdentity(entry);record.accessories={ears:accessorySelection(f.actor.profile.sha256,'ears','pair'),hat:accessorySelection(f.actor.profile.sha256,'hat','single')};return record;}
try{
 const a=await fixture(),base=captureAppearanceRecipe(a.controller),goal=target(a);assert((await applyAppearanceRecipe(a.controller,goal)).applied);assert.deepEqual(captureAppearanceRecipe(a.controller),goal);assert((await applyAppearanceRecipe(a.controller,base)).applied);assert.deepEqual(captureAppearanceRecipe(a.controller),base);check('actual foundation v8 original hair/none to exact long hair/hat/pair and back roundtrips',true,{notifications:a.notifications.length});
 const failureCase=await fixture(),before=visible(failureCase),failedTarget=target(failureCase);failedTarget.appearance.skinTone='warm';failPath='/assets/m2-hat-hair-v1/baseball-cap.glb';let error;try{await applyAppearanceRecipe(failureCase.controller,failedTarget);}catch(e){error=e.message;}failPath=null;check('actual missing final hat resource retains all previous appearance geometry outfit and accessories',Boolean(error)&&JSON.stringify(visible(failureCase))===JSON.stringify(before),{error});
 const race=await fixture(),raceBefore=visible(race),gate=hold('/assets/m2-hat-hair-v1/baseball-cap.glb'),pending=applyAppearanceRecipe(race.controller,target(race));await gate.started;assert.deepEqual(visible(race),raceBefore);await race.actor.rigidAccessories.setSelection('left');gate.release();const cancelled=await pending;const raceAfter=visible(race);check('actual delayed hat plus newer ear edit cancels full recipe and preserves newer visible ear',cancelled.cancelled&&raceAfter.ears==='left'&&raceAfter.hair===raceBefore.hair&&raceAfter.hat==='none'&&raceAfter.skin===raceBefore.skin,{result:cancelled});
 assert((await applyAppearanceRecipe(a.controller,goal)).applied);const earRevision=a.actor.rigidAccessories.getState().revision,hatRevision=a.actor.headwear.getState().revision,legacy=structuredClone(goal);delete legacy.accessories;legacy.schema='workbench-appearance-recipe-v6';legacy.rulesVersion='workbench-appearance-rules-v6';legacy.appearance.skinTone='warm';assert((await applyAppearanceRecipe(a.controller,legacy)).applied);check('legacy recipe changes compatible appearance while leaving both accessory domains and revisions untouched',a.actor.rigidAccessories.getState().revision===earRevision&&a.actor.headwear.getState().revision===hatRevision&&a.actor.headwear.getState().selection==='single');
 const reset=await a.actor.facialGeometry.set({reset:true});a.actor.setExpression('happy');a.actor.update(0);check('neutral face reset and normal expression remain allowed with current hat',reset.applied&&a.actor.facialGeometry.getState().mouthWidth===0&&a.actor.headwear.getState().selection==='single');
 const none={ears:accessorySelection(a.actor.profile.sha256,'ears','pair'),hat:accessorySelection(a.actor.profile.sha256,'hat','none')};
 const beforeRejections=visible(a);
 for(const [name,domain,input] of [['appearance',a.actor.appearance,{hairStyle:'original'}],['geometry',a.actor.facialGeometry,{mouthWidth:.04}]]){
  const old=await domain.prepareUpdate(input,{accessories:none});
  const forged=await domain.prepareUpdate(input,{accessoryTransaction:{}});
  check(`${name} rejects plain final accessories and forged token without visible writes`,!old.commit&&!forged.commit&&JSON.stringify(visible(a))===JSON.stringify(beforeRejections),{oldReason:old.reason,forgedReason:forged.reason});
 }
 const context=createAccessoryTransactionContext(a.actor,none);
 for(const [name,domain,input] of [['appearance',a.actor.appearance,{hairStyle:'original'}],['geometry',a.actor.facialGeometry,{mouthWidth:.04}]]){
  const u=await domain.prepareUpdate(input,{accessoryTransaction:context.token});assert(u.commit);u.validateCommit();let error;try{u.commit();}catch(e){error=e.message;}u.dispose();
  check(`${name} preparing token permits preflight but refuses direct commit`,Boolean(error)&&JSON.stringify(visible(a))===JSON.stringify(beforeRejections),{error});
 }
 const intent=await a.actor.appearance.prepareUpdate({hairStyle:'original'},{trackIntent:true,accessoryTransaction:context.token});assert(intent.commit);
 let intentError;try{intent.applyStyleIntent();}catch(e){intentError=e.message;}intent.dispose();
 const intentAfter=visible(a);let mismatch;try{a.actor.headwear.assertHairSelection(a.actor.appearance.getState());}catch(e){mismatch=e.code;}
 check('preparing token cannot change live hair through alternate applyStyleIntent path',intentAfter.hair===beforeRejections.hair,{actualHair:intentAfter.hair,actualHat:intentAfter.hat,error:intentError,liveDependencyError:mismatch,call:'prepareUpdate({hairStyle:original},{trackIntent:true,accessoryTransaction:context.token}); update.applyStyleIntent() without beginCommit'});
 context.close();
 assert((await applyAppearanceRecipe(a.controller,goal)).applied);
 const closed=createAccessoryTransactionContext(a.actor,none),staged=await a.actor.appearance.prepareUpdate({hairStyle:'original'},{accessoryTransaction:closed.token});assert(staged.commit);closed.close();let validateError,commitError;try{staged.validateCommit();}catch(e){validateError=e.message;}try{staged.commit();}catch(e){commitError=e.message;}staged.dispose();
 const closedAppearance=await a.actor.appearance.prepareUpdate({hairStyle:'original'},{accessoryTransaction:closed.token}),closedFace=await a.actor.facialGeometry.prepareUpdate({mouthWidth:.04},{accessoryTransaction:closed.token});
 check('closed token rejects reuse and already prepared preflight and commit',Boolean(validateError)&&Boolean(commitError)&&!closedAppearance.commit&&!closedFace.commit&&a.actor.appearance.getState().hairStyle==='female-ponytail-v1',{validateError,commitError});
 const peer=await fixture();assert((await applyAppearanceRecipe(peer.controller,target(peer))).applied);const peerBefore=visible(peer),peerContext=createAccessoryTransactionContext(a.actor,none);
 const peerHair=await peer.actor.appearance.prepareUpdate({hairStyle:'original'},{accessoryTransaction:peerContext.token}),peerFace=await peer.actor.facialGeometry.prepareUpdate({mouthWidth:.04},{accessoryTransaction:peerContext.token});peerContext.close();
 check('same-body different actual VRM refuses foreign token for hair and face',!peerHair.commit&&!peerFace.commit&&JSON.stringify(visible(peer))===JSON.stringify(peerBefore),{hairReason:peerHair.reason,faceReason:peerFace.reason,sameBody:a.actor.profile.sha256===peer.actor.profile.sha256,differentVRM:a.actor.vrm!==peer.actor.vrm});

 assert((await applyAppearanceRecipe(a.controller,base)).applied);const face=await a.actor.facialGeometry.prepareUpdate({mouthWidth:.04});assert(face.commit);assert((await a.actor.appearance.set({hairStyle:'female-ponytail-v1'})).applied);assert((await a.actor.headwear.setSelection('single')).applied);let refused=false;try{face.validateCommit();}catch{refused=true;}face.dispose();check('actual staged nonneutral face refuses final commit after concurrent hat equip',refused&&a.actor.facialGeometry.getState().mouthWidth===0);
 const other=await fixture();await other.actor.rigidAccessories.setSelection('right');check('actual peer actor accessory state remains independent',a.actor.headwear.getState().selection==='single'&&other.actor.headwear.getState().selection==='none'&&other.actor.rigidAccessories.getState().selection==='right');
}catch(error){fatal={message:error.message,stack:error.stack};}
finally{for(const actor of actors)actor.dispose();globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;hook.deregister();}
const files=['prototype/src/accessory-transaction-context.js','prototype/src/accessory-recipe.js','prototype/src/appearance-recipe.js','prototype/src/character-appearance.js','prototype/src/facial-geometry.js','prototype/src/foundation-avatar.js','prototype/src/rigid-accessory-layer.js'];const sourceSha256=Object.fromEntries(await Promise.all(files.map(async n=>[n,sha(await fs.readFile(path.join(root,n)))])));const report={reviewedRootCommits:['b8918fe64adc1cc3be2d17e714194d1d19169a13','9f0fa6d832d0a57675a3348e558974ce2fd6aa2f','294e87b9e54f65770ab8f4f45ce93e830498d219','86c354c70a50d5fc44c9eed989d8bb7515621cc7'],sourceSha256,checks,findings,fatal,limits:['Actual loadFoundationAvatar, real original female VRMs and all published GLTF/fit resources. Renderer compileAsync and texture decode are CPU placeholders, with shadow rendering disabled.','Controller fixture only delegates real actor.prepareOutfit and tracks controller outfit revisions/events. No browser/GPU, surface pixel rendering or motion/visual acceptance.']};await fs.writeFile(path.join(out,'root-integration-token-retest-v2.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:checks.length,findings,fatal},null,2));if(fatal||findings.length)process.exitCode=1;
