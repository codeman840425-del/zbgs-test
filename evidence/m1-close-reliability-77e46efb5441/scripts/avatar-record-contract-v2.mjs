// QA-only versioned extension. The measured v1 module/fixture remain unchanged.
import {SCHEMA as V1,canonical,validateRecord as validateV1,makeRecord as makeV1} from './avatar-record-contract.mjs';
export {canonical};
export const SCHEMA='zbgs-qa-avatar-record-v2';
function exact(a,b,code){if(canonical(a)!==canonical(b))throw Error(code);}
function baseCatalog(catalog){return {...catalog,catalogVersion:catalog.legacy.catalogVersion,bodies:catalog.bodies.map(b=>({...b,manifestVersions:b.manifestVersions.filter(x=>x.url!==catalog.gripManifest.url)}))};}
export function validateRecord(record,catalog,loadedBodyId,legacyCatalog){
 if(record?.schemaVersion===V1){
  if(!legacyCatalog)throw Error('legacy-catalog-required');
  const plan=validateV1(record,legacyCatalog,loadedBodyId);
  if(plan.accessories.mic)throw Error('migration-required:v1-mic-attachment-fit');
  return {...plan,recordSchemaVersion:V1,migrationRequired:false};
 }
 if(record?.schemaVersion!==SCHEMA)throw Error('schema-version');
 const body=catalog.bodies.find(x=>x.baseId===record.body?.baseId);if(!body)throw Error('unknown-body');
 if(body.baseId!==loadedBodyId)throw Error('incompatible-loaded-body');
 exact(record.provenance,{catalogVersion:catalog.catalogVersion,manifestVersions:body.manifestVersions,presentationBuild:catalog.presentationBuild.sourceDigest},'manifest-catalog-or-presentation-version');
 const mic=record.equipment?.find(x=>x.slot==='mic');if(!mic)throw Error('missing-mic-slot');
 exact(mic.attachmentFit,mic.enabled?body.grip.record:null,'grip-id-hash-version-or-compatibility');
 const translated=structuredClone(record);translated.schemaVersion=V1;
 for(const e of translated.equipment)if(e.slot==='mic')delete e.attachmentFit;
 translated.provenance={catalogVersion:catalog.legacy.catalogVersion,manifestVersions:body.manifestVersions.filter(x=>x.url!==catalog.gripManifest.url)};
 const plan=validateV1(translated,baseCatalog(catalog),loadedBodyId);
 return {...plan,attachmentFit:mic.attachmentFit,recordSchemaVersion:SCHEMA,migrationRequired:false};
}
export function makeRecord(catalog,baseId,actorId,outfitIndex,appearanceRevision,enabled={mic:true,glasses:true}){
 const b=catalog.bodies.find(x=>x.baseId===baseId),r=makeV1(baseCatalog(catalog),baseId,actorId,outfitIndex,appearanceRevision,enabled);
 r.schemaVersion=SCHEMA;r.equipment.find(x=>x.slot==='mic').attachmentFit=enabled.mic?structuredClone(b.grip.record):null;
 r.provenance={catalogVersion:catalog.catalogVersion,manifestVersions:structuredClone(b.manifestVersions),presentationBuild:catalog.presentationBuild.sourceDigest};
 validateRecord(r,catalog,baseId);return r;
}
