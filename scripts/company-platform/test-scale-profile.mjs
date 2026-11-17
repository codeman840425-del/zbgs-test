import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompany,deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {COMPANY_SPACE_V2} from '../../prototype/src/company/scale-profile.js';
const checks=[],fail=(name,doc,code)=>{const before=JSON.stringify(doc);assert.throws(()=>deriveCompany(doc,catalog,templates),e=>e.code===code);assert.equal(JSON.stringify(doc),before);checks.push({name,code,passed:true});};
const small=createCompany({id:'profile-check',width:4.5,depth:4},catalog);small.scale='small-home';small.spaceProfile=structuredClone(COMPANY_SPACE_V2);
const valid=deriveCompany(small,catalog,templates);assert.equal(valid.capacity.maximum.rooms,1);checks.push({name:'18 square metre small home admitted',passed:true});
for(const [name,mutate,code]of [
 ['unknown profile',d=>d.spaceProfile.id='unknown','unsupported-space-profile'],
 ['unrecognized profile version',d=>d.spaceProfile.version=2,'unsupported-space-profile'],
 ['extra profile configuration rejected',d=>d.spaceProfile.area=10,'unsupported-space-profile'],
 ['wrong small-home area',d=>d.nodes[1].bounds.width=6,'profile-room-area'],
 ['single-room uses twice base area',d=>d.scale='single-room','profile-room-area'],
 ['rental requires three business rooms',d=>d.scale='rental-home','profile-room-count'],
 ['flat requires sixteen business rooms',d=>d.scale='leased-floor','profile-room-count'],
 ]){const d=structuredClone(small);mutate(d);fail(name,d,code);}
const station=prepareCompanyChange(small,[{type:'add-workstation',id:'station',parentId:small.nodes[1].id,template:{id:'stream-station',version:1},transform:{position:[0,0,0],yaw:0}}],{catalog,templates}).document;
const work=structuredClone(station);work.nodes.find(n=>n.kind==='room').purpose='work';fail('ordinary workspace cannot count as live station',work,'room-capacity');
const json=await encodeCompanySave(station,catalog,templates);assert.deepEqual(await decodeCompanySave(json,catalog,templates),station);checks.push({name:'new profile, explicit identities and all station data survive pinned save restore',passed:true});
const legacy=createCompany({id:'legacy',width:9,depth:7},catalog),before=JSON.stringify(legacy);const restored=await decodeCompanySave(await encodeCompanySave(legacy,catalog,templates),catalog,templates);assert.deepEqual(restored,legacy);assert.equal(JSON.stringify(legacy),before);assert.equal(restored.spaceProfile,undefined);checks.push({name:'legacy 63-square-metre saved room is not resized or upgraded',passed:true});
const out=new URL('../../evidence/company-scale-profile-v2/',import.meta.url);await fs.mkdir(out,{recursive:true});await fs.writeFile(new URL('report.json',out),JSON.stringify({status:'passed',checks,scope:'Profile and save contract only; connected layouts, geometry and browser use are separate evidence.'},null,2)+'\n');console.log(JSON.stringify({status:'passed',checks:checks.length}));
