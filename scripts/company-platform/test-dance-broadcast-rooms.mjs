import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {pointInTransform} from '../../prototype/src/company/document.js';
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {checkTrainingClearance} from './check-training-clearance.mjs';
import {runCompanyBatch} from './batch.mjs';

const [directory,...extra] = process.argv.slice(2);
if (!directory || extra.length) throw Error('Usage: node test-dance-broadcast-rooms.mjs NEW_OUTPUT_DIRECTORY');
const out = path.resolve(directory);
const published = path.join(out,'published');
const readJson = async file => JSON.parse(await fs.readFile(file,'utf8'));
const write = (name,data) => fs.writeFile(path.join(out,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const readBatch = name => readJson(new URL('./batch-inputs/'+name+'.json',import.meta.url));
const documents = async (key,name) => readJson(path.join(published,key,name+'.json'));

// Give one receiving team the editable sources for all four specialties in a single normal production batch.
const dance = await readBatch('dance-broadcast-rooms');
assert.equal(dance.items.length,2);
const batch = structuredClone(dance);
for (const [source,key] of [['singing-rooms','singing-studio'],['interview-rooms','interview-hotel'],['product-showcase-rooms','showcase-rental']]) {
  const item = (await readBatch(source)).items.find(candidate => candidate.key === key);
  assert(item,key);
  batch.items.push(item);
}
await fs.mkdir(out);
await write('theme-batch.json',batch);
const result = await runCompanyBatch(batch,{outputDirectory:published});
assert.equal(result.ok,true,JSON.stringify(result));
const before = {};
for (const {key,status} of result.results) {
  assert.equal(status,'created',key);
  for (const name of ['input','layout','save','report']) {
    const file = key+'/'+name+'.json';
    before[file] = digest(await fs.readFile(path.join(published,file)));
  }
}
const reports = [];
for (const item of dance.items) {
  const {key,trainingClearance:rule} = item;
  const document = await decodeCompanySave(await fs.readFile(path.join(published,key,'save.json'),'utf8'),catalog,templates);
  assert.deepEqual(document,await documents(key,'layout'));
  assert.deepEqual(document.trainingBinding.trainingClearance,rule);
  const cold = await checkTrainingClearance(document,rule);
  assert.deepEqual(cold,(await documents(key,'report')).checks.trainingClearance);
  assert.equal(cold.access.portalId,rule.entry.portalId);
  assert(cold.access.fromRegion && cold.access.approach.length && cold.access.inside.length);
  const shot = cold.shot;
  assert.equal(shot.cameraId,rule.shot.cameraId);
  assert.equal(shot.backdrop.samples[1].first.instanceId,rule.shot.backdropId);
  assert.equal(shot.occlusion.method,'continuous-triangle-clip');
  const {start,end,top,bottom} = shot.frame;
  assert(top >= 1.8 && bottom === 0 && Math.hypot(end[0]-start[0],end[1]-start[1]) >= 1);
  assert.equal(shot.projection.cornersNdc.length,4);

  // Rotating the entire floor preserves the physical composition in room-local space.
  const turned = structuredClone(document);
  const turn = {position:[-2,0,3],yaw:Math.PI/2};
  for (const node of turned.nodes.filter(n => n.parentId===cold.floorId)) {
    node.transform.position = pointInTransform(turn,node.transform.position);
    node.transform.yaw += turn.yaw;
  }
  const rotated = await checkTrainingClearance(turned,rule);
  const near = (a,b) => assert(a.length===b.length && a.every((v,i)=>Math.abs(v-b[i])<1e-5));
  near(shot.lens,rotated.shot.lens);
  near(shot.forward,rotated.shot.forward);
  shot.projection.cornersNdc.forEach((p,i)=>near(p,rotated.shot.projection.cornersNdc[i]));

  const backwards = structuredClone(item);
  const camera = backwards.operations.find(op=>op.type==='add-facility' && op.id===shot.cameraId);
  camera.transform.yaw += Math.PI;
  const failed = await runCompanyBatch({...batch,items:[backwards]},{outputDirectory:published});
  assert.equal(failed.ok,false);
  assert.equal(failed.results[0].code,'dance-shot-out-of-frame',JSON.stringify(failed));
  assert.equal(failed.results[0].path,shot.cameraId);
  const retry = await runCompanyBatch(batch,{outputDirectory:published,only:key});
  assert.equal(retry.results[0].status,'idempotent',JSON.stringify(retry));
  reports.push({key,portal:cold.portal,activity:cold.activity,shot,access:cold.access,rotatedFloor:turn,
    rejected:failed.results[0],retry:retry.results[0].status});
}
for (const [file,pin] of Object.entries(before))
  assert.equal(digest(await fs.readFile(path.join(published,file))),pin,file);
await write('report.json',{status:'passed',roomKeys:batch.items.map(i=>i.key),rooms:reports,preservedFiles:before});
console.log(JSON.stringify({status:'passed',rooms:batch.items.map(i=>i.key),dance:reports.map(r=>r.shot.frame),report:path.join(out,'report.json')}));
