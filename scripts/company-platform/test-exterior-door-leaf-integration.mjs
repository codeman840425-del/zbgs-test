import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import examples from '../../prototype/src/company/examples/c2-scale-v2.json' with {type:'json'};
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {listPlacementTargets,createFacilityPlacement} from '../../prototype/src/company/facility-edit-data.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';

const report={status:'passed',scope:'Exterior door leaf catalog, entrance binding, state, replacement and save/recovery CPU integration'};
const checks=[];const check=(name,fn)=>{const observed=fn();checks.push({name,observed,passed:true});};
const apply=(document,operations)=>prepareCompanyChange(document,operations,{catalog,templates}).document;
const leaves=catalog.resources.filter(resource=>resource.mount==='portal-door');
assert.equal(leaves.length,4);
let document=structuredClone(examples.smallHome),room=document.nodes.find(node=>node.kind==='room');
check('Four latest door leaf resources expose one common portal state contract',()=>{
  for(const resource of leaves){assert.equal(resource.movingProfile,'exterior-door-leaf-v1');assert.equal(resource.mountRole,'exterior-door-leaf');assert.deepEqual(resource.stateDefaults,{openFraction:0});assert.equal(resource.stateSemantics.openFraction,'exterior-door-opening-fraction');}
  return leaves.map(resource=>resource.id);
});
const target=listPlacementTargets(document,catalog,leaves[0],room.id,{templates})[0];
assert(target?.portalId);
const placement=createFacilityPlacement(document,catalog,leaves[0],target.id,{},room.id,{templates});
document=apply(document,[placement.operation]);
const leafId=placement.id;
check('A leaf can only be added at the explicit exterior entrance target',()=>({target:target.id,leafId,transform:document.nodes.find(node=>node.id===leafId).transform}));
check('Closed, half-open and fully open states derive without changing identity or entrance geometry',()=>{
  const values=[];
  for(const openFraction of [0,.5,1]){const next=apply(document,[{type:'set-state',id:leafId,state:{openFraction}}]);const node=next.nodes.find(candidate=>candidate.id===leafId);assert.equal(node.id,leafId);assert.equal(node.parentId,room.id);assert.equal(node.transform.yaw,document.nodes.find(candidate=>candidate.id===leafId).transform.yaw);assert.equal(node.state.openFraction,openFraction);values.push({openFraction,obstacle:Boolean(deriveCompany(next,catalog,templates).obstacles.find(obstacle=>obstacle.id===leafId))});}
  return values;
});
check('Four appearances replace in place and preserve the saved opening state',()=>{
  let current=apply(document,[{type:'set-state',id:leafId,state:{openFraction:.5}}]);
  const transform=current.nodes.find(node=>node.id===leafId).transform;
  for(const resource of leaves){current=apply(current,[{type:'replace-resource',id:leafId,resource:{id:resource.id,version:resource.version}}]);const node=current.nodes.find(candidate=>candidate.id===leafId);assert.deepEqual(node.transform,transform);assert.equal(node.state.openFraction,.5);}
  document=current;return{resource:document.nodes.find(node=>node.id===leafId).resource,state:document.nodes.find(node=>node.id===leafId).state};
});
check('Wrong portal, duplicate leaf and invalid state reject while preserving the prior document',()=>{
  const before=JSON.stringify(document);const node=document.nodes.find(candidate=>candidate.id===leafId);
  assert.throws(()=>apply(document,[{type:'add-facility',id:'wrong-leaf',parentId:room.id,resource:node.resource,transform:{position:[0,0,0],yaw:0}}]),error=>error.code==='invalid-portal-door-fit');
  assert.throws(()=>apply(document,[{type:'add-facility',id:'duplicate-leaf',parentId:room.id,resource:node.resource,transform:node.transform}]),error=>error.code==='duplicate-portal-door');
  assert.throws(()=>apply(document,[{type:'set-state',id:leafId,state:{openFraction:2}}]),error=>error.code==='invalid-device-state');
  assert.equal(JSON.stringify(document),before);return{rejected:['invalid-portal-door-fit','duplicate-portal-door','invalid-device-state']};
});
const saved=await encodeCompanySave(document,catalog,templates),decoded=await decodeCompanySave(saved,catalog,templates);
assert.deepEqual(decoded,document);checks.push({name:'Save and decode restore leaf identity, appearance, state and entrance binding',observed:{leafId,resource:decoded.nodes.find(node=>node.id===leafId).resource,state:decoded.nodes.find(node=>node.id===leafId).state},passed:true});
report.checks=checks;await fs.mkdir('evidence/company-exterior-door-leaf-integration-v1',{recursive:true});await fs.writeFile('evidence/company-exterior-door-leaf-integration-v1/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:checks.length}));
