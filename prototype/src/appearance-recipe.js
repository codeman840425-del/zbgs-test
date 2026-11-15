import {HAIR_COLORS,SKIN_TONES} from './character-appearance.js';
import {EYE_COLORS,LIP_COLORS} from './facial-palette.js';

const SCHEMA='workbench-appearance-recipe-v3';
const RULES='workbench-appearance-rules-v3';
const BROW_SAMPLE='height1-spacing1-v1';
const NOSE_SAMPLE='tip-forward05-v1';
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
  geometry:{mouthWidth:face.mouthWidth||0,recipeSha256:face.mouthWidth?face.recipeSha256:null,
   browSample:face.browSample||'none',browRecipeSha256:face.browSample&&face.browSample!=='none'?face.browRecipeSha256:null,
   noseSample:face.noseSample||'none',noseRecipeSha256:face.noseSample&&face.noseSample!=='none'?face.noseRecipeSha256:null},
  equipment:{index:outfit.index,role:outfit.role,manifestUrl:a.config.manifestUrl,resources:a.getEquipmentRecipe(outfit.index)},
 };
}
export function validateAppearanceRecipe(controller,record){
 const a=controller.actor;
 const legacy=record?.schema==='workbench-appearance-recipe-v1'&&record.rulesVersion==='workbench-appearance-rules-v1';
 const legacyBrow=record?.schema==='workbench-appearance-recipe-v2'&&record.rulesVersion==='workbench-appearance-rules-v2';
 if((!legacy&&!legacyBrow&&(record?.schema!==SCHEMA||record.rulesVersion!==RULES))||record.paletteVersion!==PALETTE)
  throw Error('外观配方版本不兼容，已保留当前外观');
 if(legacy&&(record.geometry?.browSample!==undefined||record.geometry?.browRecipeSha256!==undefined))throw Error('旧版配方不能携带新版眉部数据');
 if((legacy||legacyBrow)&&(record.geometry?.noseSample!==undefined||record.geometry?.noseRecipeSha256!==undefined))throw Error('旧版配方不能携带新版鼻部数据');
 if(record.base?.bodyType!==a.profile.bodyType||record.base.sha256!==a.profile.sha256)
  throw Error('此配方属于另一具身体或资源版本，请先选择对应原样件');
 if(!a.appearance.getState().availableStyles.includes(record.appearance?.hairStyle))throw Error('配方发型未适配当前身体');
 for(const [key,choices] of [['hairColor',HAIR_COLORS],['skinTone',SKIN_TONES],['eyeColor',EYE_COLORS],['lipColor',LIP_COLORS]])
  if(!Object.hasOwn(choices,record.appearance[key]))throw Error('未知配色：'+key);
 const v=record.geometry?.mouthWidth;
 if(!Number.isFinite(v)||v<-.04||v>.04)throw Error('嘴宽参数不在已制作范围内');
 if(v&&(!a.facialGeometry.getState().available||!/^[a-f0-9]{64}$/.test(record.geometry.recipeSha256||'')))throw Error('此身体尚无对应嘴宽几何配方');
 const brow=legacy?'none':record.geometry.browSample;
 if(!['none',BROW_SAMPLE].includes(brow))throw Error('眉部样件不在已制作范围内');
 if(brow!=='none'&&(!a.facialGeometry.getState().browAvailable||!/^[a-f0-9]{64}$/.test(record.geometry.browRecipeSha256||'')))throw Error('此身体尚无对应眉部几何配方');
 if(!legacy&&brow==='none'&&record.geometry.browRecipeSha256!==null)throw Error('原位眉部不能携带派生配方身份');
 const nose=legacy||legacyBrow?'none':record.geometry.noseSample;
 if(!['none',NOSE_SAMPLE].includes(nose))throw Error('鼻部样件不在已制作范围内');
 if(nose!=='none'&&(!a.facialGeometry.getState().noseAvailable||!/^[a-f0-9]{64}$/.test(record.geometry.noseRecipeSha256||'')))throw Error('此身体尚无对应鼻部几何配方');
 if(!legacy&&!legacyBrow&&nose==='none'&&record.geometry.noseRecipeSha256!==null)throw Error('原位鼻部不能携带派生配方身份');
 if(!a.config.outfits.some(o=>o.index===record.equipment?.index&&o.role===record.equipment.role)||record.equipment.manifestUrl!==a.config.manifestUrl)
  throw Error('服装版型版本不兼容');
 if(JSON.stringify(record.equipment.resources)!==JSON.stringify(a.getEquipmentRecipe(record.equipment.index)))throw Error('服装资源或绑定版本已变化');
 const style=record.appearance.hairStyle;
 if(!['original','none'].includes(style)&&!/^[a-f0-9]{64}$/.test(record.hairAssetSha256||''))throw Error('发型资源身份缺失');
 return true;
}
export async function applyAppearanceRecipe(controller,record){
 validateAppearanceRecipe(controller,record);
 const actor=controller.actor,before=captureAppearanceRecipe(controller);
 // Capture all edit domains before the first await: a new color request can
 // arrive while geometry is loading, before this restore starts its own color.
 let ownGeometryRevision=actor.facialGeometry.getState().revision,ownAppearanceRevision=actor.appearance.getState().revision;
 const initialOutfitRevision=controller.outfitRevision||0;
 let outfitCommitted=false,ownOutfitRevision=initialOutfitRevision;
 const superseded=()=>controller.actor!==actor||
  (ownGeometryRevision!==null&&actor.facialGeometry.getState().revision!==ownGeometryRevision)||
  (ownAppearanceRevision!==null&&actor.appearance.getState().revision!==ownAppearanceRevision);
 try{
  const geometryJob=actor.facialGeometry.set({mouthWidth:record.geometry.mouthWidth,expectedRecipeSha256:record.geometry.recipeSha256,
   browSample:record.geometry.browSample??'none',expectedBrowRecipeSha256:record.geometry.browRecipeSha256,
   noseSample:record.geometry.noseSample??'none',expectedNoseRecipeSha256:record.geometry.noseRecipeSha256});
  ownGeometryRevision=actor.facialGeometry.getState().revision;
  const geometry=await geometryJob;
  if(geometry.cancelled||superseded())return{applied:false,cancelled:true};
  if(!geometry.applied)throw Error(geometry.reason||'几何配方未应用');
  const appearanceJob=actor.appearance.set(record.appearance);
  ownAppearanceRevision=actor.appearance.getState().revision;
  const appearance=await appearanceJob;
  if(appearance.cancelled||superseded())return{applied:false,cancelled:true};
  if(!appearance.applied)throw Error(appearance.reason||'外观配方未应用');
  if(record.hairAssetSha256&&actor.appearance.getState().replacementSHA256!==record.hairAssetSha256)throw Error('发型资源版本已变化');
  if((controller.outfitRevision||0)!==initialOutfitRevision)return{applied:true,notice:'较新的服装选择已保留'};
  try{outfitCommitted=true;controller.command({type:'outfit',value:record.equipment.index});}
  finally{ownOutfitRevision=controller.outfitRevision||0;}
  return{applied:true};
 }catch(error){
  if(superseded())return{applied:false,cancelled:true};
  const rollbackAppearance=actor.appearance.set(before.appearance),rollbackGeometry=actor.facialGeometry.set({mouthWidth:before.geometry.mouthWidth,expectedRecipeSha256:before.geometry.recipeSha256,
   browSample:before.geometry.browSample,expectedBrowRecipeSha256:before.geometry.browRecipeSha256,
   noseSample:before.geometry.noseSample,expectedNoseRecipeSha256:before.geometry.noseRecipeSha256});
  ownAppearanceRevision=actor.appearance.getState().revision;ownGeometryRevision=actor.facialGeometry.getState().revision;
  const restored=await Promise.all([rollbackAppearance,rollbackGeometry]);
  if(superseded()||restored.some(r=>r.cancelled))return{applied:false,cancelled:true};
  if(outfitCommitted&&(controller.outfitRevision||0)===ownOutfitRevision){
   try{controller.command({type:'outfit',value:before.equipment.index});}catch(e){throw Error(`恢复配方失败，服装回退未完成：${e.message}`);}
  }
  if(restored.some(r=>!r.applied))throw Error(`恢复配方失败，回退也未完成：${error.message}`);
  throw Error(`恢复配方失败，先前外观已保留：${error.message}`);
 }
}
