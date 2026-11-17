import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {captureGarmentMaterials,resolveGarmentMaterials,validateGarmentMaterials,assertPreparedGarmentMaterial} from '../prototype/src/garment-material-record.js';
import {createCharacterRecord,validateCharacterRecord} from '../prototype/src/character-record.js';

const equipment=JSON.parse(await fs.readFile('prototype/public/assets/m1b/equipment.json','utf8'));
const entry=equipment.items.find(item=>item.materialRecipes?.length);
assert(entry,'real material-bearing equipment fixture required');
const source=JSON.parse(await fs.readFile('prototype/public'+entry.materialRecipes[0].url,'utf8'));
const active={schema:'zbgs-equipment-material-selection-v1',equipmentId:entry.id,styleId:entry.styleId,fitId:entry.fitId,garmentSha256:entry.sha256,avatarSha256:source.fit.avatarSha256,recipeId:source.id,recipeVersion:source.version,recipeSha256:entry.materialRecipes[0].sha256,implementationId:source.implementation.id,implementationSha256:source.implementation.sha256};
let state={status:'ready',active,revision:2,requested:null,pending:null,disposed:false};
const actor={profile:{sha256:source.fit.avatarSha256},getMaterialRecipeState:()=>state};
const recipe={equipment:{resources:{shorts:entry}}};
const record=captureGarmentMaterials(actor,recipe);
assert.deepEqual(record.selections[0].selection,active);
assertPreparedGarmentMaterial({identity:active},record.selections[0]);
assert.throws(()=>assertPreparedGarmentMaterial({identity:{...active,implementationId:'wrong'}},record.selections[0]),/实际服装材质/);
assert.throws(()=>resolveGarmentMaterials(actor,recipe,undefined),/旧角色记录未保存/);
for(const patch of [{garmentSha256:'0'.repeat(64)},{equipmentId:'other'}]){
 const bad=structuredClone(record);Object.assign(bad.selections[0],patch);
 assert.throws(()=>validateGarmentMaterials(actor,recipe,bad),/装备身份/);
}
for(const patch of [{recipeSha256:'0'.repeat(64)},{avatarSha256:'0'.repeat(64)},{fitId:'other'},{recipeVersion:2},{extra:true}]){
 const bad=structuredClone(record);Object.assign(bad.selections[0].selection,patch);
 assert.throws(()=>validateGarmentMaterials(actor,recipe,bad),/适配身份/);
}
assert.throws(()=>validateGarmentMaterials(actor,recipe,{...record,selections:[]}),/覆盖全部/);
assert.throws(()=>validateGarmentMaterials(actor,recipe,{...record,selections:[...record.selections,...record.selections]}),/覆盖全部/);
state={...state,status:'loading',pending:'request'};
assert.throws(()=>captureGarmentMaterials(actor,recipe),/加载完成/);
state={...state,status:'original',active:null,pending:null};
assert.equal(captureGarmentMaterials(actor,recipe).selections[0].selection,null);
const noVariants={equipment:{resources:{plain:{...entry,materialRecipes:[]}}}};
const legacy=resolveGarmentMaterials(actor,noVariants,undefined);assert.equal(legacy.legacy,true);assert.equal(legacy.record.selections[0].selection,null);
const validateResources=async()=>({status:'pending'});
const envelope=await createCharacterRecord({identity:{id:'material-record-fixture',name:'fixture',gender:'unspecified'},appearanceRecipe:recipe,equipmentMaterials:record,provenance:{producer:'test',sourceRefs:[]}},{validateResources});
assert.deepEqual(envelope.equipmentMaterials,record);
const tampered=structuredClone(envelope);tampered.equipmentMaterials.selections[0].selection=null;
await assert.rejects(()=>validateCharacterRecord(tampered,{validationCallback:validateResources}),/record hash/);
console.log(JSON.stringify({status:'passed',scope:'Real registered shorts identity; complete material domain, explicit legacy limits, pending capture and envelope integrity. Not browser or visual acceptance.'}));
