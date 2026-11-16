import earManifest from '../public/assets/m2-paired-ear-accessory-v1/manifest.json' with {type:'json'};
import hatManifest from '../public/assets/m2-hat-hair-v1/manifest.json' with {type:'json'};
import hatFit from '../public/assets/m2-hat-hair-v1/fit.json' with {type:'json'};
import {assertHatHairSelection,validateHatHairCatalog} from './hat-accessory-contract.js';
import {appearanceAdmissionError} from './facial-geometry-selection.js';

export const ACCESSORY_SCHEMA='workbench-appearance-recipe-v8';
export const ACCESSORY_RULES='workbench-appearance-rules-v8';
export const EAR_MANIFEST_SHA='8d7ac33b9078f11a66f3ee1a0c53fd66df87a6569c16e8e55625de6bb09a6909';
export const HAT_MANIFEST_SHA='c62f1ecbc4b16f5e36a2b691f494e887d4367cbf662ade436d8659924fd182cc';
const fail=(field,message)=>{throw appearanceAdmissionError(field,'incompatible-resource',message);};
function exactKeys(value,allowed,field){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==allowed.length||allowed.some(key=>!Object.hasOwn(value,key)))
  fail(field,'附件记录字段不完整或包含未支持字段');
}
export function accessorySelection(bodySha,kind,selection){
 if(!(kind==='ears'?['none','left','right','pair']:kind==='hat'?['none','single']:[]).includes(selection))fail('accessories.'+kind,'未知附件选择');
 if(selection==='none')return{selection,resource:null};
 let resource;
 if(kind==='ears'){
  const fit=earManifest.fits.find(entry=>entry.baseAvatarSha256===bodySha);
  if(!fit)fail('accessories.ears','此身体尚无耳饰适配');
  resource={styleId:earManifest.styleId,version:earManifest.version,manifestUrl:'/assets/m2-paired-ear-accessory-v1/manifest.json',
   manifestSha256:EAR_MANIFEST_SHA,assetSha256:earManifest.asset.sha256,fitId:fit.fitId,fitSha256:fit.sha256};
 }else{
  if(hatFit.targetBodySha256!==bodySha)fail('accessories.hat','此身体尚无帽发适配');
  resource={styleId:hatManifest.id,version:hatManifest.version,manifestUrl:'/assets/m2-hat-hair-v1/manifest.json',
   manifestSha256:HAT_MANIFEST_SHA,assetSha256:hatManifest.sha256,fitId:hatManifest.fit.id,fitSha256:hatManifest.fit.sha256};
 }
 return{selection,resource};
}
export function validateAccessories(bodySha,value){
 exactKeys(value,['ears','hat'],'accessories');
 for(const kind of ['ears','hat']){
  const entry=value[kind],field='accessories.'+kind;
  exactKeys(entry,['selection','resource'],field);
  const expected=accessorySelection(bodySha,kind,entry.selection);
  if(expected.resource===null){if(entry.resource!==null)fail(field,'未装备附件不能携带资源');}
  else{
   exactKeys(entry.resource,Object.keys(expected.resource),field+'.resource');
   if(Object.keys(expected.resource).some(key=>expected.resource[key]!==entry.resource[key]))fail(field+'.resource','附件素材或适配版本不匹配');
  }
 }
 return true;
}
export function assertAccessoryHair(bodySha,accessories,descriptor){
 validateAccessories(bodySha,accessories);
 if(accessories.hat.selection==='single')assertHatHairSelection(descriptor,hatFit,validateHatHairCatalog(hatFit,bodySha));
}
export function assertAccessoryGeometry(bodySha,accessories,geometry){
 validateAccessories(bodySha,accessories);
 if(accessories.hat.selection==='single'&&(geometry.mouthWidth!==0||['browSample','noseSample','eyeSample'].some(key=>geometry[key]!=='none')))
  fail('accessories.hat','帽子只适配已登记的原始五官几何，请选择匹配组合');
}
export function captureAccessories(actor){
 const result={};
 for(const [kind,domain] of [['ears',actor.rigidAccessories],['hat',actor.headwear]]){
  const state=domain.getState();
  if(state.status==='loading'||state.status==='prepared')throw Error('请等待附件加载完成后保存');
  result[kind]=accessorySelection(actor.profile.sha256,kind,state.selection);
  if(result[kind].resource&&(state.assetSha256!==result[kind].resource.assetSha256||state.fitId!==result[kind].resource.fitId))fail('accessories.'+kind,'当前附件身份与登记资源不符');
 }
 return result;
}
export function queryAccessoryCandidates(bodySha){
 const result={recipeSchema:ACCESSORY_SCHEMA,rulesVersion:ACCESSORY_RULES};
 for(const [kind,values] of [['ears',['none','left','right','pair']],['hat',['none','single']]]){
  result[kind]={choices:values.flatMap(selection=>{try{return[accessorySelection(bodySha,kind,selection)];}catch{return[];}})};
 }
 result.hat.dependency={bodySha256:hatFit.targetBodySha256,hair:structuredClone(hatFit.hairDependency),geometry:'neutral-only'};
 return result;
}
