import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import catalog from '../../prototype/src/company/facility-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates.json' with {type:'json'};
import {createCompany,prepareCompanyChange,deriveCompany,restoreCompany,serializeCompany} from '../../prototype/src/company/document.js';

const context={catalog,templates}, checks=[];
function check(name, fn) {fn();checks.push({name,passed:true});}
const add=(id,x)=>({type:'add-workstation',id,parentId:'company-demo/room-1',template:{id:'stream-station',version:1},transform:{position:[x,0,0],yaw:0}});
const original=prepareCompanyChange(createCompany({},catalog),[add('station-1',-1.5),add('station-2',1.5)],context).document;
const d=deriveCompany(original,catalog,templates), bytes=serializeCompany(original,catalog,templates);
check('Two workstations have separate stable points and shared resources',()=>{
 assert.deepEqual(d.usePoints.map(p=>p.id),['station-1/chair#seat','station-2/chair#seat']);
 assert.equal(d.facilities.filter(p=>p.resource.id==='desk').length,2);
 assert.notDeepEqual(d.worlds.get('station-1/chair'),d.worlds.get('station-2/chair'));
});
check('Moving one desk moves its three devices, preserves chair and other station',()=>{
 const next=prepareCompanyChange(original,[{type:'move',id:'station-1/desk',transform:{position:[0,0,-1.1],yaw:0}}],context);
 for(const id of ['monitor','keyboard','microphone'])assert(Math.abs(next.derived.worlds.get(`station-1/${id}`).position[2]-d.worlds.get(`station-1/${id}`).position[2]+.2)<1e-8);
 assert.deepEqual(next.derived.worlds.get('station-1/chair'),d.worlds.get('station-1/chair'));
 assert.deepEqual(next.derived.worlds.get('station-2/monitor'),d.worlds.get('station-2/monitor'));
 assert.equal(serializeCompany(original,catalog,templates),bytes);
});
check('Whole-station rotation uses the same parent frame for visual metadata and footprints',()=>{
 const next=prepareCompanyChange(original,[{type:'move',id:'station-1',transform:{position:[-1.5,0,0],yaw:Math.PI}}],context);
 const m=next.derived.worlds.get('station-1/monitor');assert(Math.abs(m.position[2]-1.15)<1e-8);
 const chair=next.derived.obstacles.find(o=>o.id==='station-1/chair');assert(chair.max[1]<0);
 assert.deepEqual(next.derived.worlds.get('station-2/chair'),d.worlds.get('station-2/chair'));
});
check('Device state round-trips with all instance identities and local overrides',()=>{
 const changed=prepareCompanyChange(original,[{type:'set-state',id:'station-1/monitor',state:{on:false}}],context).document;
 assert.deepEqual(restoreCompany(serializeCompany(changed,catalog,templates),catalog,templates),changed);
 assert.equal(deriveCompany(changed,catalog,templates).facilities.find(f=>f.id==='station-2/monitor').state.on,true);
});
function rejects(name,op,code,extra={}){check(name,()=>{assert.throws(()=>prepareCompanyChange(original,op,{...context,...extra}),e=>e.code===code);assert.equal(serializeCompany(original,catalog,templates),bytes);});}
rejects('Busy station cannot move',[{type:'move',id:'station-1',transform:{position:[-1.5,0,1],yaw:0}}],'facility-busy',{isUsePointBusy:id=>id==='station-1/chair#seat'});
rejects('Busy station cannot be deleted',[{type:'remove',id:'station-1'}],'facility-busy',{isUsePointBusy:id=>id==='station-1/chair#seat'});
rejects('Later copy cannot erase an earlier busy movement from the transaction',[{type:'move',id:'station-1',transform:{position:[-1.5,0,1],yaw:0}},{type:'copy-workstation',id:'station-1',newId:'station-3'}],'facility-busy',{isUsePointBusy:id=>id==='station-1/chair#seat'});
rejects('Missing replacement preserves original',[{type:'replace-resource',id:'station-1/chair',resource:{id:'missing',version:99}}],'missing-resource-version');
rejects('Intersecting stations are refused before commit',[{type:'move',id:'station-2',transform:{position:[-1.5,0,0],yaw:0}}],'overlapping-facilities');
rejects('Outside-room change preserves original',[{type:'move',id:'station-2',transform:{position:[20,0,0],yaw:0}}],'outside-room');
rejects('Duplicate identity is refused',[add('station-1',1.5)],'duplicate-instance');
rejects('Unvalidated pitch/scale is refused',[{type:'move',id:'station-1',transform:{position:[0,0,0],yaw:0,scale:2}}],'invalid-transform');
rejects('Stale authoring request cannot overwrite a newer revision',[{type:'remove',id:'station-1'}],'revision-conflict',{expectedRevision:0});
check('Save with missing resource version fails without returning a partial document',()=>{
 const invalid=JSON.parse(bytes);invalid.nodes.find(n=>n.id==='station-1/chair').resource.version=99;
 assert.throws(()=>restoreCompany(JSON.stringify(invalid),catalog,templates),e=>e.code==='missing-resource-version');
});
check('Copy after removing the other station preserves local edits and gives all new identities',()=>{
 const next=prepareCompanyChange(original,[{type:'remove',id:'station-2'},{type:'copy-workstation',id:'station-1',newId:'station-copy',transform:{position:[1.5,0,0],yaw:0}}],context);
 assert(next.derived.usePoints.some(p=>p.id==='station-copy/chair#seat'));
 assert(!next.derived.nodes.has('station-2'));
 assert.equal(next.derived.facilities.filter(p=>p.node.stationId==='station-copy').length,6);
});
const out=new URL('../../evidence/company-c1-document-v1/',import.meta.url);
await fs.mkdir(out,{recursive:true});
await fs.writeFile(new URL('report.json',out),JSON.stringify({status:'passed',checks,limits:['CPU authoring checks only; no character reachability, actual rendering or browser persistence claim.']},null,2)+'\n');
console.log(`${checks.length} document authoring checks passed`);
