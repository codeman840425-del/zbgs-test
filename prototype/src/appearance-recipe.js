import {createAccessoryTransactionContext} from './accessory-transaction-context.js';
import {ACCESSORY_SCHEMA,ACCESSORY_RULES,captureAccessories,validateAccessories,assertAccessoryHair,assertAccessoryGeometry} from './accessory-recipe.js';
import {validateHairSelection} from './hair-fit-contract.js';
import {HAIR_COLORS,SKIN_TONES} from './character-appearance.js';
import {EYE_COLORS,LIP_COLORS} from './facial-palette.js';
import {facialPaletteContract,compatiblePaletteVersions,assertPaletteRecipeVersion,LEGACY_FACIAL_PALETTE_VERSION as LEGACY_PALETTE} from './facial-palette-contract.js';
import {resolveFacialGeometrySelection,appearanceAdmissionError} from './facial-geometry-selection.js';
import {SURFACE_LAYER_PACKAGE} from './surface-layer-catalog.js';
import {validateSurfaceSelection} from './surface-layer-compositor.js';
import {assertAppearanceColorSelection} from './appearance-color-policy.js';
import {nativePaletteContract} from './native-palette-catalog.js';
import {validateLiveAccessories,assertPreparedLiveAccessory} from './live-accessory-record.js';
import {validateGarmentMaterials,assertPreparedGarmentMaterial,garmentMaterialIntent} from './garment-material-record.js';

export const SCHEMA='workbench-appearance-recipe-v6';
export const RULES='workbench-appearance-rules-v6';
export const SURFACE_SCHEMA='workbench-appearance-recipe-v7';
export const SURFACE_RULES='workbench-appearance-rules-v7';
export const NATIVE_SCHEMA='workbench-appearance-recipe-v9';
export const NATIVE_RULES='workbench-appearance-rules-v9';
const fields=['hairStyle','hairColor','skinTone','eyeColor','lipColor','eyebrowColor'];
// Iris-only bodies had complete original-color records before a palette was
// registered. Preserve the loaded version until the look needs a colored iris.
const restoredOriginalIrisVersions=new WeakMap();
export const appearanceDraftKey=bodyType=>'zbgs:appearance-draft:v1:'+bodyType;
export function captureAppearanceRecipe(controller){
 const a=controller.actor,s=a.appearance.getState(),face=a.facialGeometry.getState();
 if(s.loading||s.facialPaletteLoading||s.nativeEyebrowLoading||face.loading)throw Error('请等待外观加载完成后保存');
 const outfit=a.config.outfits.find(o=>o.index===controller.outfit);
 const hasSurface=Boolean(s.surfaceLayers?.length);
 const accessories=a.rigidAccessories&&a.headwear?captureAccessories(a):null;
 const nativeVersion=Boolean(nativePaletteContract(a.profile.sha256)?.eyebrow);
 const paletteVersion=(s.eyeColor==='original'?restoredOriginalIrisVersions.get(a):undefined)??facialPaletteContract(a.profile.sha256).version;
 return{schema:nativeVersion?NATIVE_SCHEMA:accessories?ACCESSORY_SCHEMA:hasSurface?SURFACE_SCHEMA:SCHEMA,rulesVersion:nativeVersion?NATIVE_RULES:accessories?ACCESSORY_RULES:hasSurface?SURFACE_RULES:RULES,paletteVersion,
  ...(accessories?{accessories}:{}),
  ...(hasSurface?{surface:{manifestSha256:s.surfaceManifestSha256,layers:structuredClone(s.surfaceLayers)}}:{}),
  base:{bodyType:a.profile.bodyType,sha256:a.profile.sha256},
  appearance:Object.fromEntries(fields.filter(key=>nativeVersion||key!=='eyebrowColor').map(key=>[key,s[key]??'original'])),
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
 const accessoryVersion=record?.schema===ACCESSORY_SCHEMA&&record.rulesVersion===ACCESSORY_RULES;
 const surfaceVersion=record?.schema===SURFACE_SCHEMA&&record.rulesVersion===SURFACE_RULES;
 const nativeVersion=record?.schema===NATIVE_SCHEMA&&record.rulesVersion===NATIVE_RULES;
 const hasSurface=surfaceVersion||((accessoryVersion||nativeVersion)&&Object.hasOwn(record,'surface'));
 const hasAccessories=accessoryVersion||(nativeVersion&&Object.hasOwn(record,'accessories'));
 if((!oldFit&&!surfaceVersion&&!accessoryVersion&&!nativeVersion&&(record?.schema!==SCHEMA||record.rulesVersion!==RULES))||(!compatiblePaletteVersions(a.profile.sha256).includes(record.paletteVersion)))
  throw appearanceAdmissionError('schema','incompatible-version','外观配方版本不兼容，已保留当前外观');
 if(!surfaceVersion&&!accessoryVersion&&!nativeVersion&&Object.hasOwn(record,'surface'))throw appearanceAdmissionError('surface','incompatible-version','旧版配方不能携带新版皮肤层');
 if(nativeVersion&&(!Object.hasOwn(record.appearance??{},'eyebrowColor')||typeof record.appearance.eyebrowColor!=='string'))throw appearanceAdmissionError('appearance.eyebrowColor','missing-value','新版配方缺少眉色');
 if(!nativeVersion&&record.appearance?.eyebrowColor&&record.appearance.eyebrowColor!=='original')throw appearanceAdmissionError('appearance.eyebrowColor','incompatible-version','旧版配方不能携带新增眉色');
 if(hasSurface){
  try{
   if(!SURFACE_LAYER_PACKAGE||record.surface?.manifestSha256!==SURFACE_LAYER_PACKAGE.sha256)throw Error('皮肤层资源版本不匹配');
   const layers=validateSurfaceSelection(record.surface.layers);
   if(!layers.length)throw Error('新版皮肤层配方缺少实际选择');
  }catch(e){throw appearanceAdmissionError('surface','incompatible-resource',e.message);}
 }
 if(!hasAccessories&&Object.hasOwn(record,'accessories'))throw appearanceAdmissionError('accessories','incompatible-version','旧版配方不能携带新版附件');
 if(hasAccessories){
  validateAccessories(a.profile.sha256,record.accessories);
  assertAccessoryGeometry(a.profile.sha256,record.accessories,record.geometry);
  assertAccessoryHair(a.profile.sha256,record.accessories,{hairStyle:record.appearance?.hairStyle,replacementSHA256:record.hairAssetSha256,hairFit:record.hairFit});
 }
 if(legacy&&(record.geometry?.browSample!==undefined||record.geometry?.browRecipeSha256!==undefined))throw appearanceAdmissionError('geometry.browSample','incompatible-version','旧版配方不能携带新版眉部数据');
 if((legacy||legacyBrow)&&(record.geometry?.noseSample!==undefined||record.geometry?.noseRecipeSha256!==undefined))throw appearanceAdmissionError('geometry.noseSample','incompatible-version','旧版配方不能携带新版鼻部数据');
 if((legacy||legacyBrow||legacyNose)&&(record.geometry?.eyeSample!==undefined||record.geometry?.eyeRecipeSha256!==undefined))throw appearanceAdmissionError('geometry.eyeSample','incompatible-version','旧版配方不能携带新版眼部数据');
 if(record.base?.bodyType!==a.profile.bodyType||record.base.sha256!==a.profile.sha256)
  throw appearanceAdmissionError('base','incompatible-body',`此配方属于${({female:'女性原版',male:'男性原版','m1a-jaw-v1':'女性下颌样件','m1a-waisthip-v1':'女性腰胯样件','m2-male-jaw-v1':'男性下颌样件'})[record.base?.bodyType]||'未知基模'}，请先选择对应人物；若已选中，说明素材版本不一致。当前人物未改变`);
 if(!a.appearance.getState().availableStyles.includes(record.appearance?.hairStyle))throw appearanceAdmissionError('appearance.hairStyle','unsupported-resource','配方发型未适配当前身体');
 for(const [key,choices] of [['hairColor',HAIR_COLORS],['skinTone',SKIN_TONES],['eyeColor',EYE_COLORS],['lipColor',LIP_COLORS]])
  if(!Object.hasOwn(choices,record.appearance[key]))throw appearanceAdmissionError('appearance.'+key,'unsupported-value','未知配色：'+key);
 assertAppearanceColorSelection(a.profile.sha256,record.appearance);
 assertPaletteRecipeVersion(a.profile.sha256,record.paletteVersion,record.appearance);
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
export async function applyAppearanceRecipe(controller,record,{liveAccessories,equipmentMaterials,isCurrent=()=>true}={}){
 validateAppearanceRecipe(controller,record);
 // Snapshot the requested values before awaiting resource I/O. The caller may
 // reuse its JSON object, but it cannot change an in-flight transaction.
 record=structuredClone(record);
 const actor=controller.actor;
 if(liveAccessories!==undefined){liveAccessories=structuredClone(liveAccessories);validateLiveAccessories(actor,liveAccessories);}
 if(equipmentMaterials!==undefined){equipmentMaterials=structuredClone(equipmentMaterials);validateGarmentMaterials(actor,record,equipmentMaterials);}
 const materialIds=equipmentMaterials?[...new Set([...Object.values(actor.getEquipmentRecipe(controller.outfit)).map(entry=>entry.id),...equipmentMaterials.selections.map(row=>row.equipmentId)])]:[];
 const materialVersions=new Map(materialIds.map(id=>[id,garmentMaterialIntent(actor,id)]));
 const materialsChanged=(except=null)=>materialIds.some(id=>id!==except&&(garmentMaterialIntent(actor,id))!==materialVersions.get(id));
 const liveVersions=liveAccessories?Object.fromEntries(Object.entries(actor.livePresentation.getState().accessories).map(([k,s])=>[k,s.version])):null;
 let geometryRevision=actor.facialGeometry.getState().revision;
 let appearanceRevision=actor.appearance.getState().revision;
 const outfitRevision=controller.outfitRevision||0;
 const accessoryVersion=record.schema===ACCESSORY_SCHEMA||(record.schema===NATIVE_SCHEMA&&Object.hasOwn(record,'accessories'));
 const accessoryDomains=[actor.rigidAccessories,actor.headwear].filter(Boolean);
 const accessoryRevisions=new Map(accessoryDomains.map(domain=>[domain,domain.getState().revision]));
 const updates=[],attemptedCommits=[],cleanupErrors=[];
 const attachmentTransaction=accessoryVersion?createAccessoryTransactionContext(actor,record.accessories):null;
 let commitStarted=false;
 const superseded=(materialExcept=null)=>!isCurrent()||controller.actor!==actor||materialsChanged(materialExcept)||
  actor.facialGeometry.getState().revision!==geometryRevision||
  actor.appearance.getState().revision!==appearanceRevision||
  (controller.outfitRevision||0)!==outfitRevision||
  accessoryDomains.some(domain=>domain.getState().revision!==accessoryRevisions.get(domain))||
  (liveVersions&&Object.entries(actor.livePresentation.getState().accessories).some(([k,s])=>s.version!==liveVersions[k]));
 const prepare=async(domain,input,options)=>{
  if(superseded())return false;
  const job=domain.prepareUpdate(input,options);
  if(domain===actor.facialGeometry)geometryRevision=domain.getState().revision;
  else if(domain===actor.appearance)appearanceRevision=domain.getState().revision;
  else accessoryRevisions.set(domain,domain.getState().revision);
  const update=await job;
  if(update.commit)updates.push(update);
  if(update.cancelled||superseded())return false;
  if(!update.commit)throw Error(update.reason||'造型资源准备失败');
  return true;
 };
 try{
  const options=attachmentTransaction?{accessoryTransaction:attachmentTransaction.token}:undefined;
  if(!await prepare(actor.facialGeometry,{mouthWidth:record.geometry.mouthWidth,expectedRecipeSha256:record.geometry.recipeSha256,
   browSample:record.geometry.browSample??'none',expectedBrowRecipeSha256:record.geometry.browRecipeSha256,
   noseSample:record.geometry.noseSample??'none',expectedNoseRecipeSha256:record.geometry.noseRecipeSha256,
   eyeSample:record.geometry.eyeSample??'none',expectedEyeRecipeSha256:record.geometry.eyeRecipeSha256},options))return{applied:false,cancelled:true};
  if(!await prepare(actor.appearance,{...record.appearance,eyebrowColor:record.appearance.eyebrowColor??'original',
   surfaceLayers:record.surface?.layers??[],expectedSurfaceManifestSha256:record.surface?.manifestSha256??null,
   expectedHairAssetSha256:record.hairAssetSha256,
   ...(Object.hasOwn(record,'hairFit')?{expectedHairFit:record.hairFit}:{})},options))return{applied:false,cancelled:true};
  const outfit=await controller.prepareOutfit(record.equipment.index);updates.push(outfit);
  if(equipmentMaterials){
   for(const row of equipmentMaterials.selections){
    if(superseded())return{applied:false,cancelled:true};
    let update;
    try{update=await actor.prepareMaterialRecipe(row.equipmentId,row.selection?.recipeId??null);}
    catch(error){
     // A current failed preparation also advances this domain's intent. Do
     // not report its own HTTP/identity failure as an unrelated cancellation.
     materialVersions.set(row.equipmentId,garmentMaterialIntent(actor,row.equipmentId));
     throw error;
    }
    if(update.commit)updates.push(update);
    if(update.cancelled||!update.isCurrent?.()||superseded(row.equipmentId))return{applied:false,cancelled:true};
    materialVersions.set(row.equipmentId,garmentMaterialIntent(actor,row.equipmentId));
    if(!update.commit)throw Error(update.reason||'服装材质准备失败');
    assertPreparedGarmentMaterial(update,row);
   }
  }
  if(accessoryVersion){
   if(!await prepare(actor.rigidAccessories,record.accessories.ears.selection))return{applied:false,cancelled:true};
   if(!await prepare(actor.headwear,record.accessories.hat.selection,{hairState:{hairStyle:record.appearance.hairStyle,replacementSHA256:record.hairAssetSha256,hairFit:record.hairFit}}))return{applied:false,cancelled:true};
  }
  if(liveAccessories){
   for(const kind of ['mic','glasses']){
    if(superseded())return{applied:false,cancelled:true};
    const job=actor.livePresentation.prepareAccessory(kind,liveAccessories.selections[kind].enabled);
    liveVersions[kind]=actor.livePresentation.getState().accessories[kind].version;
    const update=await job;
    if(update.commit)updates.push({isCurrent:()=>update.isCurrent(),validateCommit:()=>update.validateCommit(),
     commit:()=>update.commit(),rollback:()=>update.rollback(),dispose:()=>update.release()});
    if(update.cancelled||superseded())return{applied:false,cancelled:true};
    if(!update.commit)throw Error(update.reason||'道具准备失败');
    assertPreparedLiveAccessory(kind,update,liveAccessories);
   }
  }
  // Every domain checks freshness before the first visible write. Commits only
  // switch prepared resources and state synchronously, with no resource I/O.
  if(superseded()||updates.some(update=>!update.isCurrent()))return{applied:false,cancelled:true};
  // Equipment may have changed while resources were preparing. Recheck all
  // synchronous dependency guards before any domain becomes visible.
  for(const update of updates)update.validateCommit?.();
  attachmentTransaction?.beginCommit();
  commitStarted=true;
  for(const update of updates){attemptedCommits.push(update);update.commit();}
 }catch(error){
  if(commitStarted){
   const rollbackErrors=[];
   for(const update of attemptedCommits.reverse()){
    try{if(typeof update.rollback!=='function')throw Error('该造型域尚无回滚接口');update.rollback();}
    catch(failure){rollbackErrors.push(failure.message);}
   }
   if(rollbackErrors.length)throw Error(`造型提交失败且回滚不完整：${error.message}；${rollbackErrors.join('；')}`);
   throw Error(`造型提交失败，先前外观已恢复：${error.message}`);
  }
  if(superseded())return{applied:false,cancelled:true};
  throw Error(`恢复配方失败，先前外观已保留：${error.message}`);
 }finally{
  attachmentTransaction?.close();
  for(const update of updates)try{update.dispose();}catch(error){cleanupErrors.push(error.message);}
  if(cleanupErrors.length&&!commitStarted)throw Error(`先前外观已保留，准备资源清理失败：${cleanupErrors.join('；')}`);
 }
 const nativePalette=nativePaletteContract(actor.profile.sha256);
 if(nativePalette&&!nativePalette.eyebrow){
  if(record.appearance.eyeColor==='original')restoredOriginalIrisVersions.set(actor,record.paletteVersion);
  else restoredOriginalIrisVersions.delete(actor);
 }
 const notices=record.paletteVersion===LEGACY_PALETTE?['旧配方已使用新版瞳色渲染，颜色选择保持不变']:[];
 if(cleanupErrors.length)notices.push(`造型已应用，旧资源清理失败：${cleanupErrors.join('；')}`);
 try{controller.refreshOutfitSelection?.();}catch(error){notices.push(`造型已应用，服装按钮更新失败：${error.message}`);}
 try{if(!controller.isPeer&&controller.actor===actor)controller.game?.events?.emit('appearance-state-changed',{actor});}catch(error){notices.push(`造型已应用，控件同步失败：${error.message}`);}
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
 // Transport keeps the full binding identities, without pretty-print padding.
 // Native 130-joint equipment otherwise exceeds the unchanged 256 KiB limit.
 const text=JSON.stringify(record)+'\n';
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
 const accessoryRevisions=[actor.rigidAccessories,actor.headwear].filter(Boolean).map(domain=>[domain,domain.getState().revision]);
 const text=await file.text();
 if(isCancelled()||controller.actor!==actor||actor.appearance.getState().revision!==appearanceRevision||
  actor.facialGeometry.getState().revision!==geometryRevision||(controller.outfitRevision||0)!==outfitRevision||accessoryRevisions.some(([domain,revision])=>domain.getState().revision!==revision))
  return{applied:false,cancelled:true};
 return importAppearanceRecipe(controller,text);
}
