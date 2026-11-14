import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {makeRecord,validateRecord} from './avatar-record-contract.mjs';
const catalog=JSON.parse(fs.readFileSync(fileURLToPath(new URL('../schemas/fixtures/avatar-record-catalog-v1.json',import.meta.url))));
const cases=[];
for(const body of catalog.bodies){
 const r=makeRecord(catalog,body.baseId,'qa-actor:49a12793-a310-4828-8123-57abd1007124',0,1);
 assert.equal(validateRecord(JSON.parse(JSON.stringify(r)),catalog,body.baseId).outfitIndex,0);cases.push(body.bodyType+' valid roundtrip');
 const changes={bodyHash:x=>x.body.sha256='0'.repeat(64),bodyId:x=>x.body.baseId='unknown',fitHash:x=>x.equipment[0].sha256='0'.repeat(64),fitId:x=>x.equipment[0].fitResourceId='unknown',styleId:x=>x.equipment[0].styleId='unknown',manifest:x=>x.provenance.manifestVersions[0].sha256='0'.repeat(64),schema:x=>x.schemaVersion='future',expression:x=>x.appearance.parameters.happy=1,revision:x=>x.appearanceRevision=0,accessory:x=>x.equipment.at(-1).sha256='0'.repeat(64),extra:x=>x.behavior={happy:1},duplicate:x=>x.equipment.push(x.equipment[0])};
 for(const [name,change]of Object.entries(changes)){const copy=structuredClone(r);change(copy);assert.throws(()=>validateRecord(copy,catalog,body.baseId));cases.push(body.bodyType+' reject '+name);}
 assert.throws(()=>validateRecord(r,catalog,catalog.bodies.find(x=>x!==body).baseId));cases.push(body.bodyType+' reject cross-body');
}
console.log(JSON.stringify({scope:'pure QA contract; no browser/product save claim',passed:cases.length,cases},null,2));
