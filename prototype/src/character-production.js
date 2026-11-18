import {foundationProfile} from './foundation-profiles.js';
import {captureRuntimeCharacterRecord,deriveCharacterResourceIdentities} from './character-runtime-record.js';
import {resolveFacialGeometrySelection} from './facial-geometry-selection.js';
import {queryAppearanceCandidates} from './appearance-candidates.js';
import {queryCharacterProduction} from './character-production-query.js';
import {canonicalJson,isSafeCharacterRecordId,updateCharacterRecord} from './character-record.js';
import {validateNativeHairCenterPin} from './native-hair-center-record.js';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function fail(message,field){throw Object.assign(new Error(message),{code:'production-input',field});}
function keys(value,allowed,field){
 if(!object(value))fail('Expected an object',field);
 for(const key of Object.keys(value))if(!allowed.includes(key))fail('Unsupported field '+key,field+'.'+key);
}
function applied(result){if(!result?.applied)throw Object.assign(new Error(result?.reason||'Resource preparation did not apply'),{code:result?.cancelled?'production-cancelled':'production-preparation'});}

// Resolve against the current candidate's admitted sets. The caller passes the
// resulting index directly to the same transaction as an original index edit.
export function resolveProductionOutfitIndex(query, operation) {
 const sets = query.equipment.sets;
 if (!Object.hasOwn(operation, 'selection')) {
  keys(operation, ['domain','index'], 'edit');
  if (!sets.some(set => set.index === operation.index)) fail('Outfit is not registered for this body','outfit.index');
  return operation.index;
 }
 keys(operation, ['domain','selection'], 'edit');
 const selection = operation.selection;
 const field = 'outfit.selection';
 keys(selection, ['bodySha256','role','equipment'], field);
 if (selection.bodySha256 !== query.base.sha256) fail('Outfit selection requires its exact body',field+'.bodySha256');
 if (typeof selection.role !== 'string' || !selection.role.length) fail('Expected an outfit role',field+'.role');
 if (!Array.isArray(selection.equipment) || !selection.equipment.length) fail('Expected a complete equipment set',field+'.equipment');
 const requested = new Map();
 for (const [i,item] of selection.equipment.entries()) {
  const itemField = field+'.equipment.'+i;
  keys(item, ['id','slot','sha256'], itemField);
  for (const key of ['id','slot','sha256']) {
   if (typeof item[key] !== 'string' || !item[key].length) fail('Expected equipment '+key,itemField+'.'+key);
  }
  if (requested.has(item.id)) fail('Duplicate equipment ID',itemField+'.id');
  requested.set(item.id,item);
 }
 const matches = sets.filter(set => {
  if (set.role !== selection.role) return false;
  const resources = Object.values(set.resources);
  return resources.length === requested.size && resources.every(({id,slot,sha256}) => {
   const item = requested.get(id);
   return item && item.slot === slot && item.sha256 === sha256;
  });
 });
 if (matches.length !== 1) fail(matches.length ? 'Outfit selection is ambiguous' : 'No registered outfit matches the role and exact equipment set', field);
 return matches[0].index;
}

// A spring fit is selected at VRM parse time. Prepare the requested revision
// off-scene and retain the original envelope for the final capture/CAS.
async function prepareHairEdit(record, pin){
 const identities = row => deriveCharacterResourceIdentities(row.appearanceRecipe,row.liveAccessories,row.equipmentMaterials,row.nativeHairCenter);
 const validateResources = row => {
  if(canonicalJson(row.resourceIdentities)!==canonicalJson(identities(row)))throw Error('Source resource identities differ from recorded look');
  return {status:'pending'};
 };
 return updateCharacterRecord(record,{nativeHairCenter:pin,resourceIdentities:identities({...record,nativeHairCenter:pin})},
  {expectedRevision:record.revision,now:record.updatedAt},{validateResources});
}

// A production edit is made on a disposable candidate. Ordinary game actors,
// saved records and business state never become partially edited on failure.
async function edit(controller,operation){
 const actor=controller.actor,query=queryAppearanceCandidates(controller);
 switch(operation?.domain){
 case 'appearance': {
  keys(operation,['domain','values'],'edit');
  keys(operation.values,[...Object.keys(query.appearance),'surfaceLayers'],'appearance');
  for(const [field,value] of Object.entries(operation.values)){
   if(field==='surfaceLayers'){
    if(!Array.isArray(value))fail('Surface layers must be an array',field);
    const seen=new Set();
    for(const row of value){
     keys(row,['id','opacity'],field);
     const option=query.surface.choices.find(item=>item.id===row.id);
     if(!option||seen.has(row.id)||!Number.isFinite(row.opacity)||row.opacity<option.opacity.range[0]||row.opacity>option.opacity.range[1])fail('Unsupported surface selection or opacity',field);
     seen.add(row.id);
    }
   }else if(!query.appearance[field].choices.some(item=>item.value===value))fail('Value is not registered for this body',field);
  }
  applied(await actor.appearance.set(operation.values));break;
 }
 case 'geometry': {
  keys(operation,['domain','values'],'edit');
  keys(operation.values,['mouthWidth','browSample','noseSample','eyeSample'],'geometry');
  const current=actor.facialGeometry.getState();
  const desired=Object.fromEntries(['mouthWidth','browSample','noseSample','eyeSample'].map(key=>[key,current[key]]));
  Object.assign(desired,operation.values);
  resolveFacialGeometrySelection(actor.profile.sha256,desired);
  applied(await actor.facialGeometry.set(operation.values));break;
 }
 case 'outfit': {
  const index=resolveProductionOutfitIndex(query,operation);
  const update=await controller.prepareOutfit(index);
  try{if(!update.isCurrent())throw new Error('Outfit preparation cancelled');update.commit();}finally{update.dispose();}break;
 }
 case 'material': {
  keys(operation,['domain','equipmentId','recipeId'],'edit');
  const entry=Object.values(actor.getEquipmentRecipe(controller.outfit)).find(row=>row.id===operation.equipmentId);
  if(!entry||(operation.recipeId!==null&&!entry.materialRecipes?.some(row=>row.id===operation.recipeId)))fail('Material must belong to currently selected equipment','material');
  applied(await actor.setMaterialRecipe(operation.equipmentId,operation.recipeId));break;
 }
 case 'liveAccessory': {
  keys(operation,['domain','kind','enabled'],'edit');
  if(!['mic','glasses'].includes(operation.kind)||typeof operation.enabled!=='boolean')fail('Expected mic/glasses and boolean enabled','liveAccessory');
  applied(await actor.livePresentation.setAccessory(operation.kind,operation.enabled));break;
 }
 case 'accessory': {
  keys(operation,['domain','kind','selection'],'edit');
  if(!['ears','hat'].includes(operation.kind)||!query.accessories[operation.kind].choices.some(row=>row.selection===operation.selection))fail('Accessory selection is not registered','accessory');
  const layer=operation.kind==='ears'?actor.rigidAccessories:actor.headwear;
  applied(await layer.setSelection(operation.selection));break;
 }
 default:fail('Unknown edit domain','edit.domain');
 }
}

/** Pure request JSON in; actual shared browser production out. This does not
 * persist files or mutate a visible actor. The caller uses the existing CAS store.
 */
export async function performCharacterProduction(input,{scene,renderer,signal,isCurrent=()=>true}={}){
 const request=structuredClone(input);
 keys(request,['schema','operation','bodyType','identity','record','edits','nativeHairCenter'],'request');
 if(request.schema!=='character-production-request-v1'||!['query','create','edit','validate'].includes(request.operation))fail('Unknown production operation/schema','request');
 if(['query','create'].includes(request.operation)){
  if(typeof request.bodyType!=='string'||request.record!==undefined)fail('Query/create requires an explicit body and no source record','bodyType');
  foundationProfile(request.bodyType);
 }else if(!object(request.record)||request.bodyType!==undefined||request.identity!==undefined)fail('Edit/validate requires a complete source record; identity/body cannot be overridden','record');
 if(request.operation==='create'){
  keys(request.identity,['id','name','gender'],'identity');
  if(!isSafeCharacterRecordId(request.identity.id))fail('Creation requires an explicit stable identity.id','identity.id');
  for(const [key,max] of [['name',160],['gender',40]])if(typeof request.identity[key]!=='string'||!request.identity[key].length||request.identity[key].length>max)fail('Invalid identity '+key,'identity.'+key);
 }
 if(request.operation!=='create'&&request.identity!==undefined)fail('Identity belongs only to create','identity');
 const selectsFit=Object.hasOwn(request,'nativeHairCenter');
 if(selectsFit){
  if(!['create','edit'].includes(request.operation))fail('Hair fit selection belongs only to create/edit','nativeHairCenter');
  if(request.nativeHairCenter!==null){
   const base=request.record?.appearanceRecipe?.base??{bodyType:request.bodyType,sha256:foundationProfile(request.bodyType).sha256};
   await validateNativeHairCenterPin(request.nativeHairCenter,base);
  }
 }
 const operations=request.edits===undefined?[]:request.edits;
 if(!Array.isArray(operations)||operations.length>32||(['query','validate'].includes(request.operation)&&operations.length))fail('Invalid edits for operation','edits');
 const current=()=>!signal?.aborted&&isCurrent();
 const guard=()=>{if(!current())throw Object.assign(new Error('Production request cancelled'),{code:'production-cancelled'});};
 let instance,avatar,controller;
 const executed=[];
 try{
  guard();
  // Reject malformed requests without initializing browser-only model loaders.
  const {createRecordAppearanceController,prepareRecordedCharacter}=await import('./character-record-consumer.js');
  guard();
  if(request.record){
   const source=selectsFit?await prepareHairEdit(request.record,request.nativeHairCenter??undefined):request.record;
   guard();
   instance=await prepareRecordedCharacter(source,{scene,renderer,signal,isCurrent:current});
   avatar=instance.avatar;controller=instance.controller;
  }else{
   const {loadFoundationAvatar}=await import('./foundation-avatar.js');
   guard();
   avatar=await loadFoundationAvatar({scene,renderer,bodyType:request.bodyType,attachToScene:false,nativeHairCenter:request.nativeHairCenter??null});
   controller=createRecordAppearanceController(avatar);
  }
  guard();
  if(request.operation==='query')return{ok:true,operation:'query',query:queryCharacterProduction(controller),validation:'registered metadata; body/default equipment actually loaded, other choices not prepared'};
  for(let index=0;index<operations.length;index++){
   guard();
   try{await edit(controller,operations[index]);}catch(error){error.editIndex=index;throw error;}
   guard();executed.push({index,domain:operations[index].domain,status:'applied-to-detached-candidate'});
  }
  // Final capture runs the existing combined geometry/hair/hat/equipment/live
  // admission. Intermediate success cannot stand in for a valid final record.
  const record=request.operation==='validate'?structuredClone(request.record):await captureRuntimeCharacterRecord(controller,
   request.record?{previous:request.record,expectedRevision:request.record.revision}:
    {identity:request.identity,producer:'character-production-v1',sourceRefs:[{path:avatar.config.url,sha256:avatar.profile.sha256}]});
  guard();
  return{ok:true,operation:request.operation,record,executed,body:{bodyType:avatar.profile.bodyType,sha256:avatar.profile.sha256},
   validation:'runtime-resource-preparation-passed',limitations:['Prepared actual resources and registered fits; not a new visual/performance acceptance.','No file persisted; use existing store CAS.','No unregistered shape, outfit or material is inferred.']};
 }finally{if(instance)instance.dispose();else avatar?.dispose();}
}
