import {canonicalJson} from './character-record.js';

export const GARMENT_MATERIAL_RECORD_SCHEMA='garment-material-record-v1';
const activeKeys='avatarSha256,equipmentId,fitId,garmentSha256,implementationId,implementationSha256,recipeId,recipeSha256,recipeVersion,schema,styleId';
const sha=/^[a-f0-9]{64}$/;
function entries(recipe){
 const values=Object.values(recipe.equipment.resources);
 if(new Set(values.map(item=>item.id)).size!==values.length)throw Error('服装材质记录存在重复装备');
 return values.sort((a,b)=>a.id.localeCompare(b.id));
}
export function captureGarmentMaterials(actor,recipe){
 const record={schema:GARMENT_MATERIAL_RECORD_SCHEMA,selections:entries(recipe).map(entry=>{
  const state=actor.getMaterialRecipeState(entry.id);
  if(!state||state.disposed||state.status==='loading'||state.pending||state.requested!=null)
   throw Error('请等待已选服装及材质加载完成后保存：'+entry.id);
  return{equipmentId:entry.id,garmentSha256:entry.sha256,selection:state.active?structuredClone(state.active):null};
 })};
 validateGarmentMaterials(actor,recipe,record);
 return record;
}
export function resolveGarmentMaterials(actor,recipe,input){
 if(input!==undefined){validateGarmentMaterials(actor,recipe,input);return{record:input,legacy:false};}
 // Old native records are unambiguous only when none of their exact garments
 // supports a material variant. Never guess an omitted selection on old shorts.
 if(entries(recipe).some(entry=>entry.materialRecipes?.length))
  throw Error('旧角色记录未保存服装材质，无法确定原造型；请用旧版还原并确认材质后重新保存角色记录');
 const record={schema:GARMENT_MATERIAL_RECORD_SCHEMA,selections:entries(recipe).map(entry=>({equipmentId:entry.id,garmentSha256:entry.sha256,selection:null}))};
 validateGarmentMaterials(actor,recipe,record);
 return{record,legacy:true};
}
export function validateGarmentMaterials(actor,recipe,record){
 if(record?.schema!==GARMENT_MATERIAL_RECORD_SCHEMA||Object.keys(record).sort().join(',')!=='schema,selections'||!Array.isArray(record.selections))throw Error('服装材质记录版本或字段不兼容');
 const expected=entries(recipe),actual=[...record.selections].sort((a,b)=>String(a?.equipmentId).localeCompare(String(b?.equipmentId)));
 if(actual.length!==expected.length)throw Error('服装材质记录必须覆盖全部已选装备');
 for(let i=0;i<expected.length;i++){
  const entry=expected[i],row=actual[i];
  if(!row||Object.keys(row).sort().join(',')!=='equipmentId,garmentSha256,selection'||row.equipmentId!==entry.id||row.garmentSha256!==entry.sha256)throw Error('服装材质记录与已选装备身份不一致');
  const selection=row.selection;if(selection===null)continue;
  const ref=entry.materialRecipes?.find(item=>item.id===selection?.recipeId);
  if(!selection||Object.keys(selection).sort().join(',')!==activeKeys||!ref||
   selection.schema!=='zbgs-equipment-material-selection-v1'||selection.equipmentId!==entry.id||selection.garmentSha256!==entry.sha256||
   selection.avatarSha256!==actor.profile.sha256||selection.fitId!==entry.fitId||selection.styleId!==entry.styleId||
   selection.recipeSha256!==ref.sha256||selection.recipeVersion!==1||typeof selection.implementationId!=='string'||!sha.test(selection.implementationSha256))
   throw Error('服装材质配方或身体适配身份不匹配：'+entry.id);
 }
 return true;
}
export function assertPreparedGarmentMaterial(update,row){
 if(canonicalJson(update.identity??null)!==canonicalJson(row.selection))throw Error('实际服装材质资源与角色记录不一致：'+row.equipmentId);
}
export function garmentMaterialIntent(actor,id){
 const revision=actor.getMaterialRecipeRevision?.(id);
 // Adapter request counts user/prepare intent; inner cleanup is not new intent.
 return canonicalJson(revision?{request:revision.request}:{inner:actor.getMaterialRecipeState(id)?.revision??0});
}
export function garmentMaterialRevision(actor,...recipes){
 const ids=[...new Set(recipes.filter(Boolean).flatMap(recipe=>entries(recipe).map(entry=>entry.id)))].sort();
 return canonicalJson(ids.map(id=>({id,intent:garmentMaterialIntent(actor,id)})));
}
