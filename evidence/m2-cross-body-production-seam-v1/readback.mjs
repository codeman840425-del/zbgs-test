// CPU-only replay through the existing production API, including actual VRM
// and equipment bytes and raw bindings. Browser decoding and rendering are absent.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';

const hook = registerHooks({load(url, context, next) {
  return next(url, url.endsWith('.json') ? {...context, importAttributes:{type:'json'}} : context);
}});
const {THREE} = await import('../../scripts/headless-avatar-node.mjs');
const {performCharacterProduction} = await import('../../prototype/src/character-production.js');
const {canonicalJson} = await import('../../prototype/src/character-record.js');
globalThis.createImageBitmap = async blob => {
  const bytes = Buffer.from(await blob.arrayBuffer());
  const png = bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47;
  return {width:png ? bytes.readUInt32BE(16) : 1, height:png ? bytes.readUInt32BE(20) : 1, close(){}};
};
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
const requestSchema = 'character-production-request-v1';
const renderer = {compileAsync(){ throw Error('Unexpected GPU request in CPU replay'); }};
async function production(request) {
  const scene = new THREE.Scene();
  try { return await performCharacterProduction({schema:requestSchema, ...request}, {scene,renderer}); }
  finally { assert.equal(scene.children.length, 0, 'Production candidate must remain detached'); }
}

function equipment(resources) {
  return Object.values(resources).map(({id,slot,sha256,fitId,styleId}) => ({id,slot,sha256,fitId,styleId}));
}
const queryBodies = ['female','male','native-male-7586-v1','native-contour-roundness-a-v1'];
const queries = {};
for (const bodyType of queryBodies) {
  const {query} = await production({operation:'query',bodyType});
  assert.equal(query.body.bodyType, bodyType);
  queries[bodyType] = {
    body:query.body,
    outfits:query.appearance.equipment.sets.map(({index,role,bottomRole,resources}) =>
      ({index,role,bottomRole,equipment:equipment(resources)})),
    styles:query.styleVariants.map(({styleId,variants}) =>
      ({styleId,statuses:variants.map(v=>v.status)})),
    runtimeVariants:query.runtimeVariants,
    hair:query.appearance.appearance.hairStyle.choices,
    liveAccessories:Object.fromEntries(Object.entries(query.liveAccessories).map(([kind,config]) =>
      [kind,config.choices.filter(choice=>choice.enabled).map(({id,sha256,templeFit,grip}) =>
        ({id,sha256,fit:templeFit??grip}))])),
    rigidAccessories:Object.fromEntries(Object.entries(query.appearance.accessories).filter(([,config]) => Array.isArray(config?.choices))
      .map(([kind,config]) => [kind,config.choices.map(choice=>choice.selection)])),
  };
}

const cases = [];
async function replayCreate(request) {
  let result;
  try {
    result = await production(request);
  } catch (error) {
    const rejected = {request:{schema:requestSchema,...request},result:'rejected',field:error.field,
      code:error.code,reason:error.message,editIndex:error.editIndex};
    cases.push(rejected);
    return rejected;
  }
  const {record} = result, recipe = record.appearanceRecipe;
  const reopened = await production({operation:'validate',record:JSON.parse(JSON.stringify(record))});
  assert.equal(canonicalJson(reopened.record),canonicalJson(record));
  const selected = {request:{schema:requestSchema,...request},result:'completed-and-validated-after-serialization',
    bodySha256:recipe.base.sha256,recipeSha256:record.integrity.recipeSha256,
    outfit:{index:recipe.equipment.index,role:recipe.equipment.role,equipment:equipment(recipe.equipment.resources)}};
  cases.push(selected);
  return selected;
}

function createFor(bodyType, gender, suffix, index) {
  return replayCreate({operation:'create', bodyType,
    identity:{id:`cpu-${bodyType}-${suffix}`,name:`CPU ${bodyType} ${suffix}`,gender},
    edits:[{domain:'outfit',index}]});
}

const female3 = await createFor('female','female','same-index',3);
const male3 = await createFor('male','male','same-index',3);
const male6 = await createFor('male','male','athletic-socks',6);
const male7 = await createFor('male','male','same-role-socks',7);
const native3 = await createFor('native-male-7586-v1','male','same-index',3);
assert.equal(female3.outfit.role, 'pants-socks');
assert(female3.outfit.equipment.some(entry=>entry.slot==='socks'));
assert.equal(male3.outfit.role, 'outer-pants');
assert(male3.outfit.equipment.some(entry=>entry.slot==='outerwear'));
assert.equal(male6.outfit.role, 'shorts-socks');
assert(male6.outfit.equipment.some(entry=>entry.slot==='socks'));
assert.equal(male7.outfit.role, female3.outfit.role);
assert.equal(male7.outfit.equipment.find(entry=>entry.slot==='socks').styleId,
  female3.outfit.equipment.find(entry=>entry.slot==='socks').styleId);
assert.equal(native3.code, 'production-input');
assert.equal(native3.field, 'outfit.index');

for (const path of process.argv.slice(2)) {
  const request=JSON.parse(await readFile(path));
  const replayed=await replayCreate(request);
  assert.equal(replayed.result, 'completed-and-validated-after-serialization', replayed.reason);
  assert.equal(replayed.outfit.role, 'pants-socks');
}

const priorFiles = [
  'evidence/m2-production-fixed-v2/results/native-male-edited.json',
  'prototype/public/assets/record-consumer-v1/male-material.json',
  'evidence/m2-native-lip-game-handoff-v1/records.json',
];
const prior = [];
for (const path of priorFiles) {
  const bytes = await readFile(new URL('../../' + path,import.meta.url));
  const data = JSON.parse(bytes);
  prior.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),records:[].concat(data).map(record=>({
    id:record.identity.id,bodyType:record.appearanceRecipe.base.bodyType,revision:record.revision,
    recordSha256:record.integrity.recordSha256,outfit:record.appearanceRecipe.equipment.role,
    hairStyle:record.appearanceRecipe.appearance.hairStyle,
  }))});
}
hook.deregister();
console.log(JSON.stringify({sourceCommit,scope:'Actual production functions and asset IO on CPU; PNG dimensions only, no rendering, motion or formal admission.',queries,cases,prior}, null, 2));
