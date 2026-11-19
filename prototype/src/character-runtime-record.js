import {canonicalJson,createCharacterRecord,updateCharacterRecord,validateCharacterRecord,CHARACTER_RECORD_MAX_BYTES} from './character-record.js';
import {captureAppearanceRecipe,validateAppearanceRecipe,applyAppearanceRecipe} from './appearance-recipe.js';
import {admitAppearanceCandidate} from './appearance-candidates.js';
import {captureLiveAccessories,validateLiveAccessories} from './live-accessory-record.js';
import {captureGarmentMaterials,resolveGarmentMaterials,garmentMaterialRevision} from './garment-material-record.js';
import {nativeHairCenterResourceIdentities} from './native-hair-center-record.js';

// These records preserve a final look, not animation time, business progress,
// speaking state or camera. Stable identity is independent of the body type.
export function deriveCharacterResourceIdentities(appearanceRecipe,liveAccessories,equipmentMaterials,nativeHairCenter){
 const result=nativeHairCenterResourceIdentities(nativeHairCenter);
 const visit=(value,path)=>{
  if(!value||typeof value!=='object')return;
  for(const key of Object.keys(value).sort()){
   const next=value[key],name=path+'/'+key;
   if(typeof next==='string'&&/sha256$/i.test(key)&&/^[a-f0-9]{64}$/.test(next))result.push({id:name,sha256:next});
   else if(next&&typeof next==='object')visit(next,name);
  }
 };
 visit(appearanceRecipe,'appearance');visit(liveAccessories,'live');visit(equipmentMaterials,'materials');
 return result.sort((a,b)=>a.id.localeCompare(b.id));
}
function validateLoadedRecord(controller,record){
 if(canonicalJson(record.nativeHairCenter)!==canonicalJson(controller.actor.nativeHairCenter) ||
    (record.nativeHairCenter?.id??null)!==(controller.actor.nativeHairCenterFit??null))
  throw Error('角色记录的发束动态适配与当前加载的人物不一致，请重新加载人物');
 const admission=admitAppearanceCandidate(controller,record.appearanceRecipe);
 if(!admission.accepted)throw Error('角色配方未准入：'+JSON.stringify(admission.issues??admission));
 validateAppearanceRecipe(controller,record.appearanceRecipe);
 validateLiveAccessories(controller.actor,record.liveAccessories,record.appearanceRecipe);
 resolveGarmentMaterials(controller.actor,record.appearanceRecipe,record.equipmentMaterials);
 const actual=deriveCharacterResourceIdentities(record.appearanceRecipe,record.liveAccessories,record.equipmentMaterials,record.nativeHairCenter);
 if(canonicalJson(record.resourceIdentities)!==canonicalJson(actual))throw Error('角色资源清单与最终造型不一致');
 return{status:'pending',scope:'registered identities only; actual resource bytes and fit metadata checked during restore'};
}
function capture(controller){
 const actor=controller.actor,appearanceRecipe=captureAppearanceRecipe(controller);
 return{appearanceRecipe,liveAccessories:captureLiveAccessories(actor),equipmentMaterials:captureGarmentMaterials(actor,appearanceRecipe),
  nativeHairCenter:actor.nativeHairCenter===undefined?undefined:structuredClone(actor.nativeHairCenter)};
}
const restoreEpochs=new WeakMap();
export function characterLookRevision(controller,targetRecipe){
 const actor=controller.actor;
 return canonicalJson({materials:garmentMaterialRevision(actor,{equipment:{resources:actor.getEquipmentRecipe(controller.outfit)}},targetRecipe),geometry:actor.facialGeometry.getState().revision,appearance:actor.appearance.getState().revision,
  outfit:controller.outfitRevision??0,ears:actor.rigidAccessories?.getState().revision,hat:actor.headwear?.getState().revision,
  live:Object.fromEntries(Object.entries(actor.livePresentation.getState().accessories).map(([k,s])=>[k,s.version]))});
}
export async function captureRuntimeCharacterRecord(controller,{identity,previous,expectedRevision,producer='character-workbench',sourceRefs=[]}={}){
 const actor=controller.actor,stamp=characterLookRevision(controller),look=capture(controller);
 const prior=previous?structuredClone(previous):null;
 // Updating one identity may deliberately change its body. The historical
 // envelope must remain valid, but its old fit cannot be tested against the
 // new actor. Only the newly captured look is admitted against this actor.
 const validateResources=record=>prior&&record.integrity.recordSha256===prior.integrity.recordSha256
  ?{status:'pending',scope:'historical envelope; new current resources validated separately'}
  :validateLoadedRecord(controller,record);
 const resourceIdentities=deriveCharacterResourceIdentities(look.appearanceRecipe,look.liveAccessories,look.equipmentMaterials,look.nativeHairCenter);
 const record=prior?await updateCharacterRecord(prior,{...look,resourceIdentities},{expectedRevision},{validateResources}):
  await createCharacterRecord({identity,...look,resourceIdentities,provenance:{producer,sourceRefs}},{validateResources});
 if(controller.actor!==actor||stamp!==characterLookRevision(controller)||canonicalJson(look)!==canonicalJson(capture(controller)))throw Error('保存期间人物或造型已改变，请重试');
 return record;
}
export async function restoreRuntimeCharacterRecord(controller,input,{isCurrent=()=>true}={}){
 const record=typeof input==='string'?parseRuntimeCharacterRecord(input):structuredClone(input),actor=controller.actor;
 const stamp=characterLookRevision(controller,record.appearanceRecipe),epoch=(restoreEpochs.get(controller)??0)+1;
 restoreEpochs.set(controller,epoch);
 await validateCharacterRecord(record,{validationCallback:value=>validateLoadedRecord(controller,value)});
 if(!isCurrent()||restoreEpochs.get(controller)!==epoch||controller.actor!==actor||stamp!==characterLookRevision(controller,record.appearanceRecipe))return{applied:false,cancelled:true};
 const materials=resolveGarmentMaterials(actor,record.appearanceRecipe,record.equipmentMaterials);
 const result=await applyAppearanceRecipe(controller,record.appearanceRecipe,{liveAccessories:record.liveAccessories,equipmentMaterials:materials.record,isCurrent:()=>isCurrent()&&restoreEpochs.get(controller)===epoch});
 return{...result,...(materials.legacy&&result.applied?{materialMigration:'legacy-record-with-no-material-variants'}:{}),...(result.applied?{identity:structuredClone(record.identity),revision:record.revision,recordSha256:record.integrity.recordSha256}:{})};
}
export function parseRuntimeCharacterRecord(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>CHARACTER_RECORD_MAX_BYTES)throw Error('角色记录无效或超过512 KiB');
 const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('角色记录必须为对象');return value;
}
