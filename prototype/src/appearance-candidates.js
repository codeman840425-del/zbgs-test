import {ACCESSORY_SCHEMA,queryAccessoryCandidates} from './accessory-recipe.js';
import {SCHEMA,RULES,SURFACE_SCHEMA,SURFACE_RULES,validateAppearanceRecipe} from './appearance-recipe.js';
import {facialPaletteContract} from './facial-palette-contract.js';
import {HAIR_COLORS,SKIN_TONES} from './character-appearance.js';
import {EYE_COLORS,LIP_COLORS} from './facial-palette.js';
import {HAIRSTYLES} from './hairstyle-catalog.js';
import {hairFitIdentity} from './hair-fit-contract.js';
import {outfitSelection} from './outfit-selection.js';
import {resolveEquipmentSet} from './equipment-set.js';
import {queryFacialGeometry,appearanceAdmissionError} from './facial-geometry-selection.js';
import {SURFACE_LAYER_PACKAGE} from './surface-layer-catalog.js';
import surfaceManifest from '../public/assets/m2-surface-layer-v1/manifest.json' with {type:'json'};
import {appearanceColorSupport} from './appearance-color-policy.js';

const preparationChecks=['resource bytes and digest','source geometry and expressions','skin weights and rest binds','actual head attachment and registered fit'];
const surfacePreparationChecks=['surface manifest and overlay bytes and digests','surface source pixels, material and UV identity','surface dimensions and actual texture composition'];
const recordFields={
  '':['schema','rulesVersion','paletteVersion','base','appearance','hairAssetSha256','hairFit','geometry','equipment'],
  base:['bodyType','sha256'],appearance:['hairStyle','hairColor','skinTone','eyeColor','lipColor'],
  geometry:['mouthWidth','recipeSha256','browSample','browRecipeSha256','noseSample','noseRecipeSha256','eyeSample','eyeRecipeSha256'],
  equipment:['index','role','manifestUrl','resources'],
};

function surfaceVariant(sha256){
  const variants=surfaceManifest.variants.filter(variant=>variant.avatarSha256===sha256);
  return variants.length===1?variants[0]:null;
}

function querySurfaceCandidates(base){
  const variant=surfaceVariant(base.sha256);
  return{supported:Boolean(variant),default:[],recipeSchema:SURFACE_SCHEMA,rulesVersion:SURFACE_RULES,
    manifest:{...SURFACE_LAYER_PACKAGE,id:surfaceManifest.id,version:surfaceManifest.version},
    supportedBodies:surfaceManifest.variants.map(item=>({bodyType:item.bodyType,sha256:item.avatarSha256})),
    ...(variant?{materialName:variant.materialName,mapSize:variant.mapSize}:{reason:'当前基模没有唯一已登记的皮肤层适配'}),
    choices:variant?.layers.map(layer=>({id:layer.id,order:layer.order,
      opacity:{default:1,range:layer.allowedOpacity,unit:'authored overlay alpha multiplier'},
      resource:{file:layer.url,sha256:layer.sha256}}))??[],
    stage:'static',requiresPreparation:surfacePreparationChecks};
}

// Reads only the currently loaded base and its existing configured resources.
// Defaults are authored initial selections, independent of the current look.
export function queryAppearanceCandidates(controller){
  const actor=controller.actor,base={bodyType:actor.profile.bodyType,sha256:actor.profile.sha256};
  const styles=actor.appearance.getState().availableStyles.map(value=>{
    const entry=HAIRSTYLES.find(item=>item.id===value&&item.compatibleBodies.includes(base.sha256));
    return{value,assetSha256:entry?.assetSha256??null,hairFit:hairFitIdentity(entry),
      ...(entry?{manifestUrl:entry.manifestUrl,...(entry.fit?{fit:entry.fit}:{})}:{})};
  });
  const sets=actor.config.outfits.map(look=>{
    const {ids,bottomRole}=outfitSelection(actor.config,look.index),resources=actor.getEquipmentRecipe(look.index);
    resolveEquipmentSet(Object.values(resources),ids,base.sha256);
    return{index:look.index,role:look.role,bottomRole,manifestUrl:actor.config.manifestUrl,resources};
  });
  const appearance={hairStyle:{default:'original',choices:styles}};
  const colorSupport=appearanceColorSupport(base.sha256);
  for(const [field,presets] of Object.entries({hairColor:HAIR_COLORS,skinTone:SKIN_TONES,eyeColor:EYE_COLORS,lipColor:LIP_COLORS}))
    appearance[field]={default:'original',unit:'preset',choices:Object.entries(presets)
      .filter(([value])=>value==='original'||colorSupport[field]).map(([value,color])=>({value,color}))};
  const defaultRecipe={schema:SCHEMA,rulesVersion:RULES,paletteVersion:facialPaletteContract(base.sha256).version,base,
    appearance:Object.fromEntries(Object.keys(appearance).map(field=>[field,appearance[field].default])),
    hairAssetSha256:null,hairFit:null,geometry:{mouthWidth:0,recipeSha256:null,browSample:'none',browRecipeSha256:null,
      noseSample:'none',noseRecipeSha256:null,eyeSample:'none',eyeRecipeSha256:null},
    equipment:{index:0,role:sets.find(set=>set.index===0).role,manifestUrl:actor.config.manifestUrl,resources:actor.getEquipmentRecipe(0)}};
  return structuredClone({schema:'workbench-appearance-candidates-v1',base,defaultRecipe,appearance,
    geometry:queryFacialGeometry(base.sha256),equipment:{defaultIndex:0,sets},surface:querySurfaceCandidates(base),accessories:queryAccessoryCandidates(base.sha256),
    limitations:{scope:'same loaded base; default v6 recipe, registered v7 surface/v8 accessory metadata and configured equipment sets',
      geometryFit:'Only registered resources are listed. Geometry choices do not certify new attachment or garment fits.',
      surfaceFit:'Surface choices require the exact registered body SHA. Preparation still verifies the published resources and current face pixels.',
      colorCoupling:'hairColor also tints authored eyebrows; independent eyebrow color is not implemented',
      requiresPreparation:preparationChecks}});
}

// A successful result admits metadata only. Applying still enters the existing
// prepare/commit path, which verifies the actual resource bytes and geometry.
export function admitAppearanceCandidate(controller,record){
  const accessoryVersion=record?.schema===ACCESSORY_SCHEMA;
  const surfaceVersion=record?.schema===SURFACE_SCHEMA||(accessoryVersion&&Object.hasOwn(record,'surface'));
  const requiresPreparation=[...preparationChecks,...(surfaceVersion?surfacePreparationChecks:[])];
  try{
    const fields={...recordFields,'':[...recordFields[''],...(surfaceVersion?['surface']:[]),...(accessoryVersion?['accessories']:[])],...(surfaceVersion?{surface:['manifestSha256','layers']}:{}),...(accessoryVersion?{accessories:['ears','hat']}:{})};
    for(const [path,allowed] of Object.entries(fields)){
      const object=path?record?.[path]:record;
      const unknown=Object.keys(object??{}).find(key=>!allowed.includes(key));
      if(unknown)return{accepted:false,stage:'static',issues:[{field:[path,unknown].filter(Boolean).join('.'),code:'unknown-field',reason:'候选包含尚未实现的字段'}],requiresPreparation};
    }
    if(surfaceVersion){
      if(!record.surface||typeof record.surface!=='object'||Array.isArray(record.surface))
        throw appearanceAdmissionError('surface','invalid-value','皮肤层候选必须是对象');
      if(Array.isArray(record.surface.layers))for(const [index,layer] of record.surface.layers.entries()){
        if(!layer||typeof layer!=='object'||Array.isArray(layer))
          throw appearanceAdmissionError(`surface.layers.${index}`,'invalid-value','皮肤层选择必须是对象');
        const unknown=Object.keys(layer).find(key=>!['id','opacity'].includes(key));
        if(unknown)throw appearanceAdmissionError(`surface.layers.${index}.${unknown}`,'unknown-field','皮肤层选择包含尚未实现的字段');
      }
    }
    validateAppearanceRecipe(controller,record);
    if(surfaceVersion){
      const variant=surfaceVariant(controller.actor.profile.sha256);
      if(!variant)throw appearanceAdmissionError('surface','unsupported-resource','当前基模没有唯一已登记的皮肤层适配');
      for(const [index,selection] of record.surface.layers.entries()){
        const layer=variant.layers.find(item=>item.id===selection.id);
        if(!layer)throw appearanceAdmissionError(`surface.layers.${index}.id`,'unsupported-resource','皮肤层未在当前基模登记');
        if(selection.opacity<layer.allowedOpacity[0]||selection.opacity>layer.allowedOpacity[1])
          throw appearanceAdmissionError(`surface.layers.${index}.opacity`,'unsupported-value','皮肤层透明度超出已登记范围');
      }
    }
    const {ids}=outfitSelection(controller.actor.config,record.equipment.index);
    resolveEquipmentSet(Object.values(record.equipment.resources),ids,controller.actor.profile.sha256);
    return{accepted:true,stage:'static',issues:[],requiresPreparation};
  }catch(error){
    return{accepted:false,stage:'static',issues:[{field:error.field??'equipment',code:error.code??'incompatible-resource',reason:error.message}],requiresPreparation};
  }
}
