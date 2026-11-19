import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {checkSingingRooms} from './check-singing-room.mjs';
import {runCompanyBatch} from './batch.mjs';

const [output,batchFile = fileURLToPath(new URL('./batch-inputs/singing-rooms.json',import.meta.url)),...extra] = process.argv.slice(2);
if (!output || extra.length) throw Error('Usage: node test-singing-room.mjs NEW_OUTPUT_DIRECTORY [BATCH_JSON]');
const out = path.resolve(output);
const read = filename=>fs.readFile(filename,'utf8');
const json = async filename=>JSON.parse(await read(filename));
const batch = await json(batchFile);
const keys = ['singing-studio','singing-rental'];
const filenames = ['input.json','layout.json','report.json','save.json'];
const studio = keys[0], rental = keys[1];
const options = {catalog,templates};
const outputs = path.join(out,'published');
const sha = bytes=>createHash('sha256').update(bytes).digest('hex');
const snapshot = async () => Object.fromEntries(await Promise.all(keys.flatMap(key=>filenames.map(async name=>{
  const file = key+'/'+name;
  return [file,sha(await fs.readFile(path.join(outputs,file)))];
}))));
const run = (value=batch,only,outputDirectory=outputs)=>runCompanyBatch(value,{outputDirectory,only});
const itemIn = (input,key)=>input.items.find(item=>item.key===key);
const round = value=>Math.round(value*1e6)/1e6 || 0;
const localGeometry = result=>[result.standing.mouth,result.standing.eye,result.microphone.surface,result.camera.lens,
  ...result.score.map(page=>page.point),result.access.threshold,...result.access.approach,...result.access.inside];

assert.deepEqual(batch.items.map(item=>item.key),keys);
await fs.mkdir(out);
const created = await run();
assert.equal(created.ok,true,JSON.stringify(created));
assert.deepEqual(created.results.map(item=>item.status),['created','created']);
const hashes = await snapshot();
const rooms = [];
for (const key of keys) {
  const directory = path.join(outputs,key);
  const saved = await decodeCompanySave(await read(path.join(directory,'save.json')),catalog,templates);
  assert.deepEqual(saved,await json(path.join(directory,'layout.json')));
  const [measured] = await checkSingingRooms(saved,options);
  assert.deepEqual(measured,(await json(path.join(directory,'report.json'))).checks.singingRooms[0]);
  assert.equal(measured.standing.width,.50);
  assert.equal(measured.standing.height,1.90);
  assert.equal(measured.portalId,itemIn(batch,key).singingRooms[0].portalId);
  assert.deepEqual(measured.access.inside.at(-1),itemIn(batch,key).singingRooms[0].performer.position);
  assert.deepEqual(measured.score.map(page=>page.page),['left','right']);
  assert.notDeepEqual(measured.score[0].point,measured.score[1].point);
  assert.deepEqual(measured.camera.rays.map(ray=>ray.reference),['mouth','eye']);
  assert.deepEqual([measured.supports.mic.feet.length,measured.supports.score.feet.length],[3,3]);
  assert.equal(Object.keys(measured.microphone.joins).length,4);
  assert(measured.supports.camera.contactArea > 0);
  assert(measured.microphone.distanceMetres>.06 && measured.microphone.distanceMetres<.26);
  if (key===rental) {
    assert.equal(measured.access.fromRegion,'singing-rental/ground/living');
    assert(measured.access.approach.length>=2);
  } else {
    assert.equal(measured.access.fromRegion,null);
  }

  const rotated = structuredClone(saved), floor = rotated.nodes.find(node=>node.id===measured.floorId);
  floor.transform.position = [3.125,0,-6.25];
  floor.transform.yaw += Math.PI/2;
  const [afterRotation] = await checkSingingRooms(rotated,options);
  assert.deepEqual(localGeometry(afterRotation).map(point=>point.map(round)),localGeometry(measured).map(point=>point.map(round)));
  rooms.push({key,coldRead:true,wholeFloorRotation:Math.PI/2,measured});
}
assert.notDeepEqual(rooms[0].measured.camera.forward,rooms[1].measured.camera.forward);

const negativeCases = [];
async function rejectPanel(key,position,yaw,code,location) {
  const candidate = structuredClone(batch), item = itemIn(candidate,key), [rule] = item.singingRooms;
  const id = rule.regionId+'/blocked-probe';
  // This asset is non-blocking in the placement footprint. Its real mesh must cause the rejection.
  item.operations.push({type:'add-facility',id,parentId:rule.regionId,resource:{id:'background-grid-panel',version:1},
    transform:{position,yaw}});
  const rejection = await run(candidate,key);
  assert.equal(rejection.ok,false);
  const [failed] = rejection.results;
  assert.equal(failed.status,'failed');
  assert.equal(failed.code,code,failed.message);
  assert.equal(failed.path,location??id);
  assert.deepEqual(await snapshot(),hashes);
  assert.deepEqual((await fs.readdir(outputs)).sort(),[...keys].sort());
  negativeCases.push({...failed,entity:id,preservedFiles:Object.keys(hashes).length});
}
await rejectPanel(studio,[0,0,-.75],0,'singing-camera-occluded');
await rejectPanel(rental,[1.92,0,0],Math.PI/2,'room-door-unreachable','singing-rental/ground/portal-stream-living');

const retry = await run(batch,studio);
assert.equal(retry.ok,true);
assert.deepEqual(retry.results.map(({key,status})=>[key,status]),[[studio,'idempotent']]);
assert.deepEqual(await snapshot(),hashes);

const variation = structuredClone(batch), changed = itemIn(variation,rental), [rule] = changed.singingRooms;
rule.performer.mouth[1] += .008;
rule.performer.eye[1] += .008;
rule.performer.yaw += .035;
changed.operations.find(operation=>operation.id===rule.roles.score).transform.position[2] -= .025;
const changedOutputs = path.join(out,'adjusted-rental');
const republished = await run(variation,rental,changedOutputs);
assert.equal(republished.ok,true,JSON.stringify(republished));
assert.deepEqual(await fs.readdir(changedOutputs),[rental]);
const reopened = await decodeCompanySave(await read(path.join(changedOutputs,rental,'save.json')),catalog,templates);
assert.deepEqual(reopened.singingRooms,[rule]);
const [adjusted] = await checkSingingRooms(reopened,options);
assert.notEqual(adjusted.microphone.distanceMetres,rooms[1].measured.microphone.distanceMetres);
assert.notDeepEqual(adjusted.score.map(page=>page.point),rooms[1].measured.score.map(page=>page.point));
assert.deepEqual(await snapshot(),hashes);

const report = {status:'passed',rooms,negativeCases,retry:retry.results.map(({key,status})=>({key,status})),
  adjustedRental:{coldRead:true,mouthHeight:adjusted.standing.mouth[1],eyeHeight:adjusted.standing.eye[1],score:adjusted.score},
  publishedSha256:hashes};
const reportFile = path.join(out,'report.json');
await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,rooms:keys,negativeCases:negativeCases.map(({code})=>code),reportFile},null,2));
