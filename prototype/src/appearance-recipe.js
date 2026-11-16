import {validateHairSelection} from './hair-fit-contract.js';
import {HAIR_COLORS,SKIN_TONES} from './character-appearance.js';
import {EYE_COLORS,LIP_COLORS} from './facial-palette.js';
import {FACIAL_PALETTE_VERSION as PALETTE,LEGACY_FACIAL_PALETTE_VERSION as LEGACY_PALETTE} from './facial-palette-contract.js';
import {resolveFacialGeometrySelection,appearanceAdmissionError} from './facial-geometry-selection.js';

export const SCHEMA='workbench-appearance-recipe-v6';
export const RULES='workbench-appearance-rules-v6';
const fields=['hairStyle','hairColor','skinTone','eyeColor','lipColor'];
export const appearanceDraftKey=bodyType=>'zbgs:appearance-draft:v1:'+bodyType;
export function captureAppearanceRecipe(controller){
 const a=controller.actor,s=a.appearance.getState(),face=a.facialGeometry.getState();
 if(s.loading||s.facialPaletteLoading||face.loading)throw Error('请等待外观加载完成后保存');
 const outfit=a.config.outfits.find(o=>o.index===controller.outfit);
 return{schema:SCHEMA,rulesVersion:RULES,paletteVersion:PALETTE,
  base:{bodyType:a.profile.bodyType,sha256:a.profile.sha256},
  appearance:Object.fromEntries(fields.map(key=>[key,s[key]])),
  hairAssetSha256:s.replacementSHA256, hairFit:s.hairFit,
  geometry:{mouthWidth:face.mouthWidth||0,recipeSha256:face.mouthWidth?face.recipeSha256:null,
   browSample:face.browSample||'none',browRecipeSha256:face.browSample&&face.browSample!=='none'?face.browRecipeSha256:null,
   noseSample:face.noseSample||'none',noseRecipeSha256:face.noseSample&&face.noseSample!=='none'?face.noseRecipeSha256:null,
   eyeSample:face.eyeSample||'none',eyeRecipeSha256:face.eyeSample&&face.eyeSample!=='none'?face.eyeRecipeSha256:null},
  equipment:{index:outfit.index,role:outfit.role,manifestUrl:a.config.manifestUrl,resources:a.getEquipmentRecipe(outfit.index)},
 };
}
export function validateAppearanceRecipe(controller,record){
 const a=controller.actor;
 const legacy=record?.schema==='workbench-appearance-recipe-v1'&&record.rulesVersion==='workbench-appearance-rules-v1';
 const legacyBrow=record?.schema==='workbench-appearance-recipe-v2'&&record.rulesVersion==='workbench-appearance-rules-v2';
 const legacyNose=record?.schema==='workbench-appearance-recipe-v3'&&record.rulesVersion==='workbench-appearance-rules-v3';
 const legacyEye=record?.schema==='workbench-appearance-recipe-v4'&&record.rulesVersion==='workbench-appearance-rules-v4';
 const legacyFit=record?.schema==='workbench-appearance-recipe-v5'&&record.rulesVersion==='workbench-appearance-rules-v5';
 const oldGeometry=legacy||legacyBrow||legacyNose||legacyEye;
 const oldFit=oldGeometry||legacyFit;
 if((!oldFit&&(record?.schema!==SCHEMA||record.rulesVersion!==RULES))||![PALETTE,LEGACY_PALETTE].includes(record.paletteVersion))
  throw appearanceAdmissionError('schema','incompatible-version','外观配方版本不兼容，已保留当前外观');
 if(legacy&&(record.geometry?.browSample!==undefined||record.geometry?.browRecipeSha256!==undefined))throw appearanceAdmissionError('geometry.browSample','incompatible-version','旧版配方不能携带新版眉部数据');
 if((legacy||legacyBrow)&&(record.geometry?.noseSample!==undefined||record.geometry?.noseRecipeSha256!==undefined))throw appearanceAdmissionError('geometry.noseSample','incompatible-version','旧版配方不能携带新版鼻部数据');
 if((legacy||legacyBrow||legacyNose)&&(record.geometry?.eyeSample!==undefined||record.geometry?.eyeRecipeSha256!==undefined))throw appearanceAdmissionError('geometry.eyeSample','incompatible-version','旧版配方不能携带新版眼部数据');
 if(record.base?.bodyType!==a.profile.bodyType||record.base.sha256!==a.profile.sha256)
  throw appearanceAdmissionError('base','incompatible-body',`此配方属于${({female:'女性原版',male:'男性原版','m1a-jaw-v1':'女性下颌样件','m1a-waisthip-v1':'女性腰胯样件','m2-male-jaw-v1':'男性下颌样件'})[record.base?.bodyType]||'未知基模'}，请先选择对应人物；若已选中，说明素材版本不一致。当前人物未改变`);
 if(!a.appearance.getState().availableStyles.includes(record.appearance?.hairStyle))throw appearanceAdmissionError('appearance.hairStyle','unsupported-resource','配方发型未适配当前身体');
 for(const [key,choices] of [['hairColor',HAIR_COLORS],['skinTone',SKIN_TONES],['eyeColor',EYE_COLORS],['lipColor',LIP_COLORS]])
  if(!Object.hasOwn(choices,record.appearance[key]))throw appearanceAdmissionError('appearance.'+key,'unsupported-value','未知配色：'+key);
 resolveFacialGeometrySelection(a.profile.sha256,{
  mouthWidth:record.geometry?.mouthWidth,recipeSha256:record.geometry?.recipeSha256,
  browSample:legacy?'none':record.geometry?.browSample,browRecipeSha256:legacy?null:record.geometry?.browRecipeSha256,
  noseSample:legacy||legacyBrow?'none':record.geometry?.noseSample,noseRecipeSha256:legacy||legacyBrow?null:record.geometry?.noseRecipeSha256,
  eyeSample:legacy||legacyBrow||legacyNose?'none':record.geometry?.eyeSample,eyeRecipeSha256:legacy||legacyBrow||legacyNose?null:record.geometry?.eyeRecipeSha256,
 },{legacy:oldGeometry,requireIdentities:true});
 if(!a.config.outfits.some(o=>o.index===record.equipment?.index&&o.role===record.equipment.role)||record.equipment.manifestUrl!==a.config.manifestUrl)
  throw appearanceAdmissionError('equipment','incompatible-resource','服装版型版本不兼容');
 if(JSON.stringify(record.equipment.resources)!==JSON.stringify(a.getEquipmentRecipe(record.equipment.index)))throw appearanceAdmissionError('equipment.resources','resource-identity-mismatch','服装资源或绑定版本已变化');
 const style=record.appearance.hairStyle;
 if(oldFit&&Object.hasOwn(record,'hairFit'))throw appearanceAdmissionError('hairFit','incompatible-version','旧版配方不能携带新版发型适配数据');
 if(!oldFit&&!Object.hasOwn(record,'hairFit'))throw appearanceAdmissionError('hairFit','missing-identity','配方缺少发型适配身份');
 validateHairSelection(a.profile.sha256,style,{legacy:oldFit,expectedHairAssetSha256:record.hairAssetSha256,...(!oldFit?{expectedHairFit:record.hairFit}:{})});
 if(!['original','none'].includes(style)&&!/^[a-f0-9]{64}$/.test(record.hairAssetSha256||''))throw appearanceAdmissionError('hairAssetSha256','missing-identity','发型资源身份缺失');
 return true;
}
export async function applyAppearanceRecipe(controller,record){
 validateAppearanceRecipe(controller,record);
 // Snapshot the requested values before awaiting resource I/O. The caller may
 // reuse its JSON object, but it cannot change an in-flight transaction.
 record=structuredClone(record);
 const actor=controller.actor;
 let geometryRevision=actor.facialGeometry.getState().revision;
 let appearanceRevision=actor.appearance.getState().revision;
 const outfitRevision=controller.outfitRevision||0;
 const updates=[],cleanupErrors=[];
 let commitStarted=false;
 const superseded=()=>controller.actor!==actor||
  actor.facialGeometry.getState().revision!==geometryRevision||
  actor.appearance.getState().revision!==appearanceRevision||
  (controller.outfitRevision||0)!==outfitRevision;
 const prepare=async(domain,input)=>{
  if(superseded())return false;
  const job=domain.prepareUpdate(input);
  if(domain===actor.facialGeometry)geometryRevision=domain.getState().revision;
  else appearanceRevision=domain.getState().revision;
  const update=await job;
  if(update.commit)updates.push(update);
  if(update.cancelled||superseded())return false;
  if(!update.commit)throw Error(update.reason||'造型资源准备失败');
  return true;
 };
 try{
  if(!await prepare(actor.facialGeometry,{mouthWidth:record.geometry.mouthWidth,expectedRecipeSha256:record.geometry.recipeSha256,
   browSample:record.geometry.browSample??'none',expectedBrowRecipeSha256:record.geometry.browRecipeSha256,
   noseSample:record.geometry.noseSample??'none',expectedNoseRecipeSha256:record.geometry.noseRecipeSha256,
   eyeSample:record.geometry.eyeSample??'none',expectedEyeRecipeSha256:record.geometry.eyeRecipeSha256}))return{applied:false,cancelled:true};
  if(!await prepare(actor.appearance,{...record.appearance,expectedHairAssetSha256:record.hairAssetSha256,
   ...(Object.hasOwn(record,'hairFit')?{expectedHairFit:record.hairFit}:{})}))return{applied:false,cancelled:true};
  const outfit=controller.prepareOutfit(record.equipment.index);updates.push(outfit);
  // Every domain checks freshness before the first visible write. Commits only
  // switch prepared resources and state synchronously, with no resource I/O.
  if(superseded()||updates.some(update=>!update.isCurrent()))return{applied:false,cancelled:true};
  commitStarted=true;
  for(const update of updates)update.commit();
 }catch(error){
  if(commitStarted)throw Error(`造型同步提交失败：${error.message}`);
  if(superseded())return{applied:false,cancelled:true};
  throw Error(`恢复配方失败，先前外观已保留：${error.message}`);
 }finally{
  for(const update of updates)try{update.dispose();}catch(error){cleanupErrors.push(error.message);}
  if(cleanupErrors.length&&!commitStarted)throw Error(`先前外观已保留，准备资源清理失败：${cleanupErrors.join('；')}`);
 }
 const notices=record.paletteVersion===LEGACY_PALETTE?['旧配方已使用新版瞳色渲染，颜色选择保持不变']:[];
 if(cleanupErrors.length)notices.push(`造型已应用，旧资源清理失败：${cleanupErrors.join('；')}`);
 try{controller.refreshOutfitSelection?.();}catch(error){notices.push(`造型已应用，服装按钮更新失败：${error.message}`);}
 return notices.length?{applied:true,notice:notices.join('；')}:{applied:true};
}


// File/agent transport uses the same native recipe and restoration transaction.
export const APPEARANCE_RECIPE_MAX_BYTES=256*1024;
export function parseAppearanceRecipeText(text){
 if(typeof text!=='string')throw Error('配方必须是 JSON 文本');
 if(text.length>APPEARANCE_RECIPE_MAX_BYTES||new TextEncoder().encode(text).byteLength>APPEARANCE_RECIPE_MAX_BYTES)throw Error('配方文件超过 256 KiB 限制');
 let record;try{record=JSON.parse(text);}catch{throw Error('配方不是有效的 JSON 文件');}
 if(!record||typeof record!=='object'||Array.isArray(record))throw Error('配方必须是 JSON 对象');
 return record;
}
export function exportAppearanceRecipe(controller){
 const record=captureAppearanceRecipe(controller);
 validateAppearanceRecipe(controller,record);
 const text=JSON.stringify(record,null,2)+'\n';
 parseAppearanceRecipeText(text);
 return text;
}
export function importAppearanceRecipe(controller,text){
 return applyAppearanceRecipe(controller,parseAppearanceRecipeText(text));
}
export async function readAppearanceRecipeFile(controller,file,{isCancelled=()=>false}={}){
 if(!file||!Number.isSafeInteger(file.size)||file.size<0||file.size>APPEARANCE_RECIPE_MAX_BYTES||typeof file.text!=='function')throw Error('配方文件无效或超过 256 KiB 限制');
 const actor=controller.actor,appearanceRevision=actor.appearance.getState().revision,
  geometryRevision=actor.facialGeometry.getState().revision,outfitRevision=controller.outfitRevision||0;
 const text=await file.text();
 if(isCancelled()||controller.actor!==actor||actor.appearance.getState().revision!==appearanceRevision||
  actor.facialGeometry.getState().revision!==geometryRevision||(controller.outfitRevision||0)!==outfitRevision)
  return{applied:false,cancelled:true};
 return importAppearanceRecipe(controller,text);
}
