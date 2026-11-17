import test from 'node:test';
import assert from 'node:assert/strict';
import {compileNativeProductionCatalog} from './native-production-catalog.js';
const row = {bodyType:'native-data-a',group:'female',sourceExportSha256:'a'.repeat(64),recipeSha256:'b'.repeat(64),profile:{id:'native-data-a',sha256:'c'.repeat(64),url:'/assets/data/body.vrm',manifestUrl:'/assets/data/equipment.json',sourceFloorY:0,baseBodyDisplay:'source-with-hair',label:'Data candidate',fitStatus:'candidate',bodyTextureCoverage:{url:'/assets/data/manifest.json',sha256:'d'.repeat(64)},ids:{top:'data-top',shorts:'data-shorts',shoes:'data-shoes'},defaultOutfit:{index:0,role:'shorts',bottomRole:'shorts',equipmentRoles:['top','shorts','shoes']}}};
const make = () => ({schema:'native-production-catalog-v1',entries:[structuredClone(row)]});
test('data entries produce independent profiles and choices without overwriting existing identities',()=>{
 const input=make(),result=compileNativeProductionCatalog(input);input.entries[0].profile.ids.top='changed';assert.equal(result.profiles['native-data-a'].ids.top,'data-top');assert.equal(result.choices.female[0].id,'native-data-a');
 assert.throws(()=>compileNativeProductionCatalog(make(),{'native-data-a':{id:'old'}}),/Duplicate/);
 assert.throws(()=>compileNativeProductionCatalog(make(),{old:{id:'old',sha256:row.profile.sha256}}),/Invalid production body/);
 const duplicate=make();duplicate.entries.push(structuredClone(row));assert.throws(()=>compileNativeProductionCatalog(duplicate),/Duplicate/);
});
test('missing exact resource identities, coverage, floor or equipment are rejected',()=>{
 for(const mutate of [p=>p.sha256='fake',p=>p.sourceFloorY=NaN,p=>p.bodyTextureCoverage.sha256=null,p=>p.url='/assets/../body.vrm',p=>p.ids.shorts=p.ids.top,p=>p.defaultOutfit.equipmentRoles=['top']]){const value=make();mutate(value.entries[0].profile);assert.throws(()=>compileNativeProductionCatalog(value));}
});
