import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createAppearanceSample} from '../../prototype/src/company/appearance-samples.js';
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {deriveCableConnections} from '../../prototype/src/company/cable-data.js';

const resources=catalog.resources.filter(resource=>resource.productionBranch==='power-strip');
assert.equal(resources.length,4);
const checks=[];
const record=(name,observed)=>checks.push({name,passed:true,observed});
for(const resource of resources){
  assert.equal(resource.mount,'desk-surface');
  assert.deepEqual(resource.mounting,{width:.35,height:.04,depth:.06,origin:'bottom'});
  assert.deepEqual(resource.stateDefaults,{on:false});
  assert.deepEqual(resource.stateSchema,{on:{type:'boolean'}});
  assert.deepEqual(resource.cablePorts.map(port=>port.id),['usb-1','usb-2','usb-3','usb-4']);
  assert.equal(new Set(resource.cablePorts.map(port=>JSON.stringify(port.position))).size,4);
  assert.equal(Object.keys(resource.cablePortNodes).length,4);
}
record('Four real appearances share one desk, state and four-endpoint contract',{ids:resources.map(resource=>resource.id),distinctAssets:new Set(resources.map(resource=>resource.asset.sha256)).size});

const samples=[];
for(let index=0;index<4;index++){
  const sample=createAppearanceSample('power-strip',index,catalog,templates);
  const derived=deriveCompany(sample.document,catalog,templates),routes=deriveCableConnections(derived,(code,path,message)=>{throw new Error(`${code}:${path}:${message}`);});
  assert.equal(routes.size,2);
  assert.equal(sample.document.nodes.filter(node=>node.cableLink).length,2);
  samples.push({sample,derived,routes});
}
record('Each appearance loads with two real device links',{samples:samples.map(value=>({target:value.sample.target,routes:value.routes.size}))});

const first=samples[0].sample.document, beforePrimary=first.nodes.find(node=>node.id==='power-strip/primary');
assert(beforePrimary);
let changed=prepareCompanyChange(first,[{type:'set-state',id:beforePrimary.id,state:{on:true}}],{catalog,templates}).document;
assert.deepEqual(changed.nodes.find(node=>node.id===beforePrimary.id).state,{on:true});
const beforeInvalid=JSON.stringify(changed);
assert.throws(()=>prepareCompanyChange(changed,[{type:'set-state',id:beforePrimary.id,state:{on:'yes'}}],{catalog,templates}),error=>error.code==='invalid-device-state');
assert.equal(JSON.stringify(changed),beforeInvalid);
record('Boolean state accepts on and rejects invalid input while preserving old document',{invalidCode:'invalid-device-state'});

const transform=structuredClone(beforePrimary.transform),links=changed.nodes.filter(node=>node.cableLink).map(node=>structuredClone(node.cableLink));
const finalResource=resources.at(-1);
changed=prepareCompanyChange(changed,[{type:'replace-resource',id:beforePrimary.id,resource:{id:finalResource.id,version:finalResource.version}}],{catalog,templates}).document;
assert.deepEqual(changed.nodes.find(node=>node.id===beforePrimary.id).transform,transform);
assert.deepEqual(changed.nodes.filter(node=>node.cableLink).map(node=>node.cableLink),links);
record('Appearance replacement retains transform and both endpoint references',{finalResource:changed.nodes.find(node=>node.id===beforePrimary.id).resource});

assert.throws(()=>prepareCompanyChange(changed,[{type:'add-facility',id:'power-strip/duplicate',parentId:'power-strip/desk',resource:{id:'cable-route-single-sleeve',version:1},transform:{position:[0,0,0],yaw:0},cableLink:{a:{deviceId:'power-strip/primary',portId:'usb-3'},b:{deviceId:'power-strip/monitor',portId:'usb'}}}],{catalog,templates}),error=>error.code==='cable-port-in-use');
record('A claimed fourth-port route cannot be duplicated',{code:'cable-port-in-use'});

const save=await encodeCompanySave(changed,catalog,templates),restored=await decodeCompanySave(save,catalog,templates);
assert.deepEqual(restored,changed);
record('Save and decode preserves the four-port graph and state',{bytes:Buffer.byteLength(save)});
await fs.mkdir(new URL('../../evidence/company-power-strip-v1/',import.meta.url),{recursive:true});
const report={status:'passed',scope:'Power-strip four-endpoint desk resource, visual state, device links, replacement and save/restore',checks,limits:['Visual endpoints reuse the existing USB visual-link profile','No electrical simulation or USB communication','No character C3 usage']};
await fs.writeFile(new URL('../../evidence/company-power-strip-v1/data-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:checks.length}));
