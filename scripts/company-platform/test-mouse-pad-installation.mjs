import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Group} from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import examples from './batch-inputs/mouse-pad-rooms.json' with {type:'json'};
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {listPlacementTargets,createFacilityPlacement} from '../../prototype/src/company/facility-edit-data.js';
import {appearanceCandidates,createAppearanceSample} from '../../prototype/src/company/appearance-samples.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';

const inputs = {catalog,templates};
const ref = resource => ({id:resource.id,version:resource.version});
const candidates = appearanceCandidates(catalog,'mouse-and-pad');
const originalLooks = ['office','gaming','trackball','desk-mat'].map(suffix => 'mouse-pad-'+suffix);
assert(originalLooks.every(id => candidates.some(r => r.id===id)));
for (const [index, resource] of candidates.entries()) {
  assert.equal(resource.mounting.reserveDesktopArea,true);
  assert(compareFacilityFunction(candidates[0],resource).compatible);
  const sample = createAppearanceSample('mouse-and-pad',index,catalog,templates);
  const installed = sample.document.nodes.find(n => n.id===sample.target);
  assert.deepEqual(installed.resource,ref(resource));
  assert.equal(installed.parentId,'sample/station/desk');
}
installNodeImageDecodeShim();
const library = createCompanyAssetLibrary({fetchImpl:async url => {
  const bytes = await fs.readFile(new URL('../../prototype/public'+url,import.meta.url));
  return {ok:true,arrayBuffer:async () => bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
}});
const records = new Map();
const storage = {getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)};
const moves = (id,x,z,yaw=0) => ({type:'move',id,transform:{position:[x,.84,z],yaw}});
const checks = [];
for (const item of examples.items) {
  const start = createCompanyScaleV2(item.input,catalog,templates);
  const layout = prepareCompanyChange(start,item.operations,inputs).document;
  const session = await createCompanyAuthoring(new Group(),layout,{...inputs,storage,assetLibrary:library});
  const station = item.key+'/ground/live/station-1', mouse=station+'/mouse', desk=station+'/desk';
  try {
    async function rejectKeepingSave(operation, code) {
      await session.save();
      const previous = session.document, saved = session.readSavedText(item.key);
      await assert.rejects(session.apply([operation]),{code});
      assert.deepEqual(session.document,previous);
      assert.equal(session.readSavedText(item.key),saved);
    }
    for (const appearance of candidates) {
      await session.apply([{type:'replace-resource',id:mouse,resource:ref(appearance)}]);
      assert.equal(deriveCompany(session.document,catalog,templates).nodes.get(mouse).parentId,desk);
    }
    if (item.key==='mouse-pad-home') {
      const link = station+'/mouse-cable';
      const route = deriveCompany(session.document,catalog,templates).cableConnections.get(link);
      assert(Math.abs(route.span-.249)<1e-6);
      await rejectKeepingSave(moves(mouse,.60,.25),'unsupported-cable-route');
      checks.push('Four-way replacement keeps the 249 mm cable between the second monitor and the mouse');
    } else {
      await rejectKeepingSave(moves(mouse,.90,.20),'invalid-desktop-envelope');
      await session.apply([moves(mouse,.88,.20,Math.PI/2)]);
      await rejectKeepingSave(moves(mouse,.88,.20),'invalid-desktop-envelope');
      await rejectKeepingSave(moves(mouse,.10,.21),'desktop-area-occupied');
      await session.setView({mode:'building'});
      await rejectKeepingSave(moves(mouse,.10,.21),'desktop-area-occupied');
      await session.apply([moves(mouse,.50,.21)]);
      await rejectKeepingSave({type:'add-facility',id:station+'/second-mouse',parentId:desk,resource:ref(candidates[0]),
        transform:{position:[.75,.84,.21],yaw:0}},'desktop-area-occupied');
      await session.apply([{type:'move',id:desk,transform:{position:[1,0,-.15],yaw:Math.PI/2}}]);
      await session.setView({mode:'floor'});
      const child = deriveCompany(session.document,catalog,templates).nodes.get(mouse);
      assert.deepEqual(child.transform,{position:[.5,.84,.21],yaw:0});
      await session.apply([{type:'remove',id:mouse}]);
      const region = item.key+'/ground/live';
      const targets = listPlacementTargets(session.document,catalog,candidates[0],region,{templates});
      const onDesk = targets.filter(target => target.parentId===desk);
      assert.deepEqual(onDesk.map(t => t.position[0]),[.5,-.5,0]);
      const {operation} = createFacilityPlacement(session.document,catalog,candidates[0],onDesk[0].id,{},region,{templates});
      await session.apply([operation]);
      assert.deepEqual(session.document.nodes.find(n => n.id===operation.id).transform.position,[.5,.84,.21]);
      checks.push('Quarter turns use the full pad outline','Keyboard or a second pad occupying the area is rejected, including in building view','Desk translation and rotation preserve the local attachment');
      checks.push('The editor placement API installs a new pad on the right side of a furnished and rotated desk');
    }
  } finally {session.dispose();}
}
console.log(JSON.stringify({status:'passed',looks:candidates.map(ref),checks},null,2));
