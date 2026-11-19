import assets from '../public/assets/m1c/accessories.json' with {type:'json'};
import grips from '../public/assets/m1c/grips/manifest.json' with {type:'json'};
import glasses from './glasses-temple-fit-manifest.json' with {type:'json'};
import {MICROPHONE_PRESENTATION_FITS} from './microphone-presentation-fits.js';
import {canonicalJson} from './character-record.js';
import {assertGlassesHeadDependency} from './glasses-head-dependency.js';

export const LIVE_ACCESSORY_RECORD_SCHEMA='live-accessory-record-v1';
const ids={mic:'studio-microphone-v1',glasses:'studio-glasses-v1'};
export function captureLiveAccessories(actor){
 const slots=actor.livePresentation.getState().accessories;
 const selections={};
 for(const kind of Object.keys(ids)){
  const slot=slots[kind];
  if(slot.pending||slot.status==='loading')throw Error('请等待道具加载完成后保存');
  if(Boolean(slot.requested)!==Boolean(slot.loaded))throw Error('道具最终状态不完整');
  selections[kind]={enabled:slot.requested,identity:slot.requested?structuredClone(slot.identity):null};
 }
 const record={schema:LIVE_ACCESSORY_RECORD_SCHEMA,selections,
  microphonePresentation:selections.mic.enabled?structuredClone(MICROPHONE_PRESENTATION_FITS[actor.profile.sha256]):null};
 validateLiveAccessories(actor,record);
 return record;
}
export function validateLiveAccessories(actor,record,appearanceRecipe){
 if(record?.schema!==LIVE_ACCESSORY_RECORD_SCHEMA||
  Object.keys(record).sort().join(',')!=='microphonePresentation,schema,selections'||
  Object.keys(record.selections??{}).sort().join(',')!=='glasses,mic')throw Error('道具记录版本或字段不兼容');
 for(const kind of Object.keys(ids)){
  const slot=record.selections[kind];
  if(!slot||typeof slot.enabled!=='boolean'||Object.keys(slot).sort().join(',')!=='enabled,identity')throw Error('道具选择字段不完整');
  if(!slot.enabled){if(slot.identity!==null)throw Error('未装备道具不能携带旧身份');continue;}
  const identity=slot.identity,asset=assets.items.find(x=>x.id===ids[kind]);
  const fit=kind==='mic'?grips.items.find(x=>x.compatibleAvatarSha256===actor.profile.sha256):glasses.profiles.find(x=>x.bodySHA256===actor.profile.sha256);
  if(!identity||!asset||!fit||identity.bodySHA256!==actor.profile.sha256||identity.accessorySHA256!==asset.sha256||identity.fit?.sha256!==fit.sha256)
   throw Error('道具资源或身体适配版本不匹配：'+kind);
  if(Object.keys(identity).sort().join(',')!=='accessorySHA256,bodySHA256,fit'||
   identity.fit.bodySHA256!==actor.profile.sha256||identity.fit.accessorySHA256!==asset.sha256)throw Error('道具适配身份字段不兼容：'+kind);
  const keys=kind==='mic'?'accessorySHA256,bodySHA256,fitVersion,id,sha256':'accessorySHA256,bodySHA256,changedMeshes,id,sha256,sourceGeometryUnmodified,status,verified';
  if(Object.keys(identity.fit).sort().join(',')!==keys||typeof identity.fit.id!=='string'||!identity.fit.id)throw Error('道具适配字段不完整：'+kind);
  if(kind==='mic'&&(identity.fit.id!==fit.id||typeof identity.fit.fitVersion!=='string'||!identity.fit.fitVersion))throw Error('握麦配置身份不一致');
  if(kind==='glasses'&&(identity.fit.status!=='fitted-candidate'||identity.fit.verified!==false||identity.fit.sourceGeometryUnmodified!==true||
   !Array.isArray(identity.fit.changedMeshes)||identity.fit.changedMeshes.length!==2||identity.fit.changedMeshes.some(x=>typeof x!=='string')))throw Error('镜腿适配记录不兼容');
  if(kind==='glasses'&&fit.headDependency!==undefined){
   const look=appearanceRecipe===undefined?{appearance:actor.appearance.getState(),geometry:actor.facialGeometry.getState()}:appearanceRecipe;
   assertGlassesHeadDependency(fit.headDependency,look?.appearance,look?.geometry);
  }
  // Profile-internal metadata is compared against the SHA-checked, actually
  // prepared resource by assertPreparedLiveAccessory before any visible write.
 }
 const expected=record.selections.mic.enabled?MICROPHONE_PRESENTATION_FITS[actor.profile.sha256]:null;
 if(canonicalJson(record.microphonePresentation)!==canonicalJson(expected))throw Error('握麦使用姿态版本不匹配');
 return true;
}
export function assertPreparedLiveAccessory(kind,update,record){
 if(record.selections[kind].enabled&&canonicalJson(update.identity)!==canonicalJson(record.selections[kind].identity))
  throw Error('已加载道具的实际适配身份与记录不一致：'+kind);
}
