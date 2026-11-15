import {HAIR_COLORS,SKIN_TONES} from './character-appearance.js';
import {EYE_COLORS,LIP_COLORS} from './facial-palette.js';

const SCHEMA='workbench-appearance-recipe-v1';
const RULES='workbench-appearance-rules-v1';
const PALETTE='appearance-color-v1:4c3b817065283d2256990ddeeb17ef0772ced1c1e299cff5e9d0ce1a3c23042c';
const fields=['hairStyle','hairColor','skinTone','eyeColor','lipColor'];
export const appearanceDraftKey=bodyType=>'zbgs:appearance-draft:v1:'+bodyType;
export function captureAppearanceRecipe(controller){
 const a=controller.actor,s=a.appearance.getState(),face=a.facialGeometry.getState();
 if(s.loading||s.facialPaletteLoading||face.loading)throw Error('请等待外观加载完成后保存');
 const outfit=a.config.outfits.find(o=>o.index===controller.outfit);
 return{schema:SCHEMA,rulesVersion:RULES,paletteVersion:PALETTE,
  base:{bodyType:a.profile.bodyType,sha256:a.profile.sha256},
  appearance:Object.fromEntries(fields.map(key=>[key,s[key]])),
  hairAssetSha256:s.replacementSHA256,
  geometry:{mouthWidth:face.mouthWidth||0,recipeSha256:face.mouthWidth?face.recipeSha256:null},
  equipment:{index:outfit.index,role:outfit.role,manifestUrl:a.config.manifestUrl},
 };
}
export function validateAppearanceRecipe(controller,record){
 const a=controller.actor;
 if(record?.schema!==SCHEMA||record.rulesVersion!==RULES||record.paletteVersion!==PALETTE)
  throw Error('外观配方版本不兼容，已保留当前外观');
 if(record.base?.bodyType!==a.profile.bodyType||record.base.sha256!==a.profile.sha256)
  throw Error('此配方属于另一具身体或资源版本，请先选择对应原样件');
 if(!a.appearance.getState().availableStyles.includes(record.appearance?.hairStyle))throw Error('配方发型未适配当前身体');
 for(const [key,choices] of [['hairColor',HAIR_COLORS],['skinTone',SKIN_TONES],['eyeColor',EYE_COLORS],['lipColor',LIP_COLORS]])
  if(!Object.hasOwn(choices,record.appearance[key]))throw Error('未知配色：'+key);
 const v=record.geometry?.mouthWidth;
 if(!Number.isFinite(v)||v<-.04||v>.04)throw Error('嘴宽参数不在已制作范围内');
 if(v&&(!a.facialGeometry.getState().available||!/^[a-f0-9]{64}$/.test(record.geometry.recipeSha256||'')))throw Error('此身体尚无对应嘴宽几何配方');
 if(!a.config.outfits.some(o=>o.index===record.equipment?.index&&o.role===record.equipment.role)||record.equipment.manifestUrl!==a.config.manifestUrl)
  throw Error('服装版型版本不兼容');
 const style=record.appearance.hairStyle;
 if(!['original','none'].includes(style)&&!/^[a-f0-9]{64}$/.test(record.hairAssetSha256||''))throw Error('发型资源身份缺失');
 return true;
}
export async function applyAppearanceRecipe(controller,record){
 validateAppearanceRecipe(controller,record);
 const actor=controller.actor,before=captureAppearanceRecipe(controller);
 try{
  const geometry=await actor.facialGeometry.set({mouthWidth:record.geometry.mouthWidth,expectedRecipeSha256:record.geometry.recipeSha256});
  if(!geometry.applied)throw Error(geometry.reason||'几何配方未应用');
  if(controller.actor!==actor)return{applied:false,cancelled:true};
  const appearance=await actor.appearance.set(record.appearance);
  if(!appearance.applied)throw Error(appearance.reason||'外观配方未应用');
  if(controller.actor!==actor)return{applied:false,cancelled:true};
  if(record.hairAssetSha256&&actor.appearance.getState().replacementSHA256!==record.hairAssetSha256)throw Error('发型资源版本已变化');
  controller.command({type:'outfit',value:record.equipment.index});
  return{applied:true};
 }catch(error){
  if(controller.actor!==actor)return{applied:false,cancelled:true};
  const restored=await Promise.all([actor.appearance.set(before.appearance),actor.facialGeometry.set({mouthWidth:before.geometry.mouthWidth,expectedRecipeSha256:before.geometry.recipeSha256})]);
  if(restored.some(r=>!r.applied))throw Error(`恢复配方失败，回退也未完成：${error.message}`);
  throw Error(`恢复配方失败，先前外观已保留：${error.message}`);
 }
}
