import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Color, Group} from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import rooms from './batch-inputs/phone-rooms.json' with {type:'json'};
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {appearanceCandidates, createAppearanceSample} from '../../prototype/src/company/appearance-samples.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {installNodeImageDecodeShim, preflightLibraryAssets} from './preflight-library-assets.mjs';
import {fileURLToPath} from 'node:url';

const looks = appearanceCandidates(catalog, 'phone-static');
const fixedIds = ['phone-static-portrait','phone-static-landscape','phone-static-cradle','phone-static-clamp'];
assert(fixedIds.every(id => looks.some(look => look.id === id)));
assert.equal(new Set(looks.map(look => look.asset.sha256)).size, looks.length);
const options = {catalog, templates};
const ref = ({id,version}) => ({id,version});
for (const [index, look] of looks.entries()) {
  assert(compareFacilityFunction(looks[0],look).compatible);
  assert.equal(look.mounting.reserveDesktopArea,true);
  assert.deepEqual(look.display.screen.nodes,['phone-screen']);
  const sample = createAppearanceSample('phone-static',index,catalog,templates);
  assert.deepEqual(sample.document.nodes.find(n => n.id === sample.target).resource,ref(look));
}

function checkScreen(session,id,look,on) {
  const root = session.scene.root.getObjectByName(id);
  const mesh = root?.getObjectByName('phone-screen');
  assert(mesh?.isMesh, 'The loaded phone must include its actual screen');
  const mapping = look.display.screen;
  for (const material of [mesh.material].flat()) {
    assert(material.color.equals(new Color(on ? mapping.onColor : mapping.offColor)));
    assert(material.emissive.equals(new Color(on ? mapping.emissive : '#000000')));
    assert.equal(material.emissiveIntensity, on ? mapping.onIntensity : 0);
  }
  return mesh;
}

installNodeImageDecodeShim();
const wrongTarget = structuredClone(looks[0]);
wrongTarget.display.screen.nodes = ['missing-phone-display'];
await assert.rejects(preflightLibraryAssets({root:fileURLToPath(new URL('../../',import.meta.url)),resources:[wrongTarget]}),
  {code:'missing-display-mesh',path:'resources.'+wrongTarget.id+'.missing-phone-display'});
const memory = new Map();
const storage = {getItem:key=>memory.get(key)??null, setItem:(key,value)=>memory.set(key,value)};
const assetLibrary = createCompanyAssetLibrary({fetchImpl:async url => {
  const b = await fs.readFile(new URL('../../prototype/public'+url,import.meta.url));
  return {ok:true,arrayBuffer:async () => b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};
}});
const results = [];
try {
  for (const input of rooms.items) {
    const base = createCompanyScaleV2(input.input,catalog,templates);
    const layout = prepareCompanyChange(base,input.operations,options).document;
    const id = input.key+'/ground/live/station-1/phone';
    const initial = layout.nodes.find(n=>n.id===id);
    const other = id+'-second';
    const session = await createCompanyAuthoring(new Group(),layout,{...options,assetLibrary,storage});
    try {
      await session.apply([{type:'add-facility',id:other,parentId:initial.parentId,resource:ref(looks[0]),
        transform:{position:[-initial.transform.position[0],.84,.06],yaw:0},state:{on:false}}]);
      for (const look of looks) {
        await session.apply([{type:'replace-resource',id,resource:ref(look)}]);
        const current = session.document.nodes.find(n=>n.id===id);
        assert.deepEqual(current.transform,initial.transform);
        assert.equal(current.parentId,initial.parentId);
        for (const on of [true,false]) {
          await session.apply([{type:'set-state',id,state:{on}}]);
          const firstScreen = checkScreen(session,id,look,on);
          const secondScreen = checkScreen(session,other,looks[0],false);
          assert.notEqual(firstScreen.material,secondScreen.material);
        }
      }
      await session.save();
      const saved = session.readSavedText(input.key);
      const rejects = [
        [{type:'set-state',id,state:{on:'yes'}},'invalid-device-state'],
        [{type:'move',id,transform:{position:[.97,.84,0],yaw:0}},'invalid-desktop-envelope'],
        [{type:'move',id,transform:{position:[-initial.transform.position[0],.84,.06],yaw:0}},'desktop-area-occupied']
      ];
      for (const [op,code] of rejects) {
        const previous = session.document;
        await assert.rejects(session.apply([op]),{code});
        assert.deepEqual(session.document,previous);
        assert.equal(session.readSavedText(input.key),saved);
      }
      results.push({room:input.key,looks:looks.map(ref),independentScreens:2,rejected:rejects.map(([,code])=>code)});
    } finally {session.dispose();}
  }
} finally {assetLibrary.dispose();}
console.log(JSON.stringify({status:'passed',results},null,2));
