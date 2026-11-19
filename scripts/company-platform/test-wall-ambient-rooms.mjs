import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {checkManagedOutput} from './package-company.mjs';
import {Group, Raycaster, Vector3} from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import rooms from './batch-inputs/wall-ambient-rooms.json' with {type:'json'};
import {appearanceCandidates, createAppearanceSample} from '../../prototype/src/company/appearance-samples.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {runCompanyBatch} from './batch.mjs';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';

if (process.argv.length !== 3) throw Error('Use test-wall-ambient-rooms.mjs NEW_RESULTS_DIRECTORY');
const out = path.resolve(process.argv[2]);
await checkManagedOutput(out,undefined,{allowDelivery:false});
await fs.mkdir(out);
const batch = await runCompanyBatch(rooms, {outputDirectory:path.join(out,'batch')});
assert(batch.ok, JSON.stringify(batch.results));
installNodeImageDecodeShim();
const library = createCompanyAssetLibrary({fetchImpl:async url => {
  const bytes = await fs.readFile(new URL('../../prototype/public' + url, import.meta.url));
  return {ok:true,arrayBuffer:async () => bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
}});
const looks = appearanceCandidates(catalog,'ambient-led-and-neon');
for (const kind of ['strip','star','wash','studio']) assert(looks.some(r => r.id === 'wall-ambient-' + kind));
assert.equal(new Set(looks.map(r => r.asset.sha256)).size, looks.length);
const ref = ({id,version}) => ({id,version});
for (const [index,look] of looks.entries()) {
  const sample = createAppearanceSample('ambient-led-and-neon',index,catalog,templates);
  assert.deepEqual(sample.document.nodes.find(n => n.id === sample.target).resource, ref(look));
  inspectCompanyPlacement(sample.document,catalog,templates);
}

// Test actual tabletop triangles reachable by rays from the calibrated source. Other desktop
// equipment can intercept a ray, and the part that was hit must really belong to the table.
function measureDesk(light, desk) {
  const origin = light.getWorldPosition(new Vector3());
  const axis = light.target.getWorldPosition(new Vector3()).sub(origin).normalize();
  const desktop = desk.getObjectByName('desktop');
  assert(desktop?.isMesh, 'Expected the real tabletop in the furnished studio');
  const found = [];
  for (let x = -.9; x <= .91; x += .15) {
    for (let z = -.4; z <= .41; z += .1) {
      const direction = desk.localToWorld(new Vector3(x,.84,z)).sub(origin).normalize();
      if (axis.dot(direction) < Math.cos(light.angle)) continue;
      const hit = new Raycaster(origin,direction,.001,light.distance).intersectObject(desk,true)[0];
      if (hit?.object === desktop) found.push(hit.point.toArray());
    }
  }
  assert(found.length, 'The beam must reach a clear patch of the physical desk');
  return {sampledTableHits:found.length, worldExample:found[Math.floor(found.length/2)]};
}

const results = [];
try {
  for (const {key} of rooms.items) {
    const initial = JSON.parse(await fs.readFile(path.join(out,'batch',key,'layout.json'),'utf8'));
    const room = key+'/ground/live', id = room+'/ambient';
    const original = initial.nodes.find(n => n.id === id);
    const memory = new Map();
    const storage = {getItem:k => memory.get(k) ?? null,setItem:(k,v) => memory.set(k,v)};
    const open = () => createCompanyAuthoring(new Group(),initial,{catalog,templates,assetLibrary:library,storage});
    const session = await open();
    const measured = [];
    let saved;
    try {
      for (const look of looks) {
        await session.apply([{type:'replace-resource',id,resource:ref(look)}]);
        const actual = session.document.nodes.find(n => n.id === id);
        assert.equal(actual.parentId,room);
        assert.deepEqual(actual.transform,original.transform);
        assert.deepEqual(actual.state,original.state);
        const fixture = session.scene.root.getObjectByName(id);
        const lights = [];
        fixture.traverse(n => { if (n.isSpotLight) lights.push(n); });
        assert.equal(lights.length,1);
        assert.equal(lights[0].castShadow,false);
        measured.push({resource:ref(look),...measureDesk(lights[0],session.scene.root.getObjectByName(room+'/station-1/desk'))});
      }
      const clearance = inspectCompanyPlacement(session.document,catalog,templates);
      assert(clearance.checkedPortals.length && clearance.checkedPortals.every(p => p.connected));
      const seat = clearance.checkedPoints.find(p => p.facilityId === room+'/station-1/chair');
      assert(seat.approachConnected && seat.exitConnected);
      await session.apply([{type:'set-state',id,state:{on:true,intensity:2.75,colorHue:129}}]);
      await session.save();
      saved = session.readSavedText(key);
      const before = session.document;
      const invalid = [
        [{type:'set-state',id,state:{colorHue:360}}, 'invalid-device-state'],
        [{type:'move',id,transform:{position:[0,1.4,0],yaw:0}}, 'invalid-wall-fit'],
      ];
      if (key === 'ambient-rental')
        invalid.push([{type:'move',id,transform:{position:[2.15,1.4,0],yaw:-Math.PI/2}},'wall-display-over-portal']);
      for (const [operation,code] of invalid) {
        await assert.rejects(session.apply([operation]),{code});
        assert.deepEqual(session.document,before);
        assert.equal(session.readSavedText(key),saved);
      }
    } finally { session.dispose(); }
    const reopened = await open();
    try {
      await reopened.restore(key);
      assert.equal(await reopened.export(),saved);
      results.push({room,measured,restored:reopened.document.nodes.find(n => n.id === id).state});
    } finally { reopened.dispose(); }
  }
} finally { library.dispose(); }
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({status:'passed',rooms:results},null,2)+'\n');
console.log(JSON.stringify({status:'passed',rooms:results.length,looks:looks.map(ref),output:out}));
