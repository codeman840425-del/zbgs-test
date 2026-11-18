import assert from 'node:assert/strict';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany, prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createCompanySaveStore, decodeCompanySave, encodeCompanySave} from '../../prototype/src/company/persistence.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';

const wall = catalog.resources.find(r => r.finish?.allowedSurfaces.includes('wall'));
const square = [[0,0], [.02,0], [.02,.12], [0,.12]];
const profiled = [[0,0], [.016,0], [.016,.06], [.01,.06], [.01,.08], [.016,.08], [.016,.12], [0,.12]];
function fixture(version, profile) {
  return {...structuredClone(wall), id:'test-baseboard-datum', version,
    finish:{...structuredClone(wall.finish), allowedSurfaces:['baseboard'], profile}};
}
const a = fixture(1, square), b = fixture(2, profiled.toReversed());
const context = {catalog:{...catalog, resources:[...catalog.resources, a, b]}, templates};
const make = (document, operations, ctx = context) => prepareCompanyChange(document, operations, ctx).document;
const ref = ({id, version}) => ({id, version});
const set = (id, resource, surface = 'baseboard', options = {}) => ({type:'set-surface-finish', id, surface,
  finish:resource ? {resource:ref(resource), ...options} : null});
const initial = createCompanyScaleV2({id:'baseboard-test', scale:'rental-home', spaceProfile:{id:'company-space-v2',version:1},
  floors:[{id:'ground', rooms:[{id:'live',purpose:'streaming'}, {id:'work',purpose:'work'}, {id:'rest',purpose:'rest'}]}]}, catalog, templates);
const [first, second, third] = initial.nodes.filter(n => n.kind === 'room').map(n => n.id);
const area = initial.nodes.find(n => n.publicRole === 'living').id;
const oldSave = await encodeCompanySave(initial, catalog, templates);
assert.equal(await encodeCompanySave(initial, context.catalog, templates), oldSave);
assert.deepEqual(await decodeCompanySave(oldSave, context.catalog, templates), initial);
assert(initial.nodes.every(n => !n.finishes?.baseboard));

const decorated = make(initial, [set(first, wall, 'north'), set(first, a), set(second, b, 'baseboard', {tileMeters:[.3,.4],quarterTurns:2}), set(area, a)]);
const derived = deriveCompany(decorated, context.catalog, templates);
const trims = derived.surfaceFinishes.filter(f => f.surface === 'baseboard');
assert.deepEqual(trims.map(f => f.regionId), [first, second, area]);
assert(trims.every(f => f.id === f.regionId + '#finish:baseboard'));
assert.deepEqual(trims.map(f => f.resource.finish.profile), [square,b.finish.profile,square]);
assert.deepEqual(trims[1].tileMeters,[.3,.4]);
assert.equal(trims[1].quarterTurns,2);
assert.equal(decorated.nodes.find(n => n.id === third).finishes, undefined);
assert.deepEqual(derived.usePoints, deriveCompany(initial, context.catalog, templates).usePoints);
const saved = await encodeCompanySave(decorated, context.catalog, templates);
const pins = bytes => JSON.parse(bytes).dependencies.resources.filter(r => r.id === a.id);
assert.deepEqual(pins(saved).map(ref), [ref(a), ref(b)]);
assert.notEqual(pins(saved)[0].sha256,pins(saved)[1].sha256);
assert.deepEqual(await decodeCompanySave(saved, context.catalog, templates), decorated);

const updated = make(decorated, [set(first, b),set(area, null)]);
const get = (doc,id) => doc.nodes.find(n => n.id === id);
assert.deepEqual(get(updated,second),get(decorated,second));
assert.deepEqual(get(updated,first).finishes.north, get(decorated,first).finishes.north);
assert.equal(get(updated,area).finishes,undefined);
assert.deepEqual(pins(await encodeCompanySave(updated,context.catalog,templates)).map(ref), [ref(b)]);

const malformed = [
  ['missing', undefined], ['two points', square.slice(0,2)], ['repeated closing point', [...square,square[0]]],
  ['repeated nonadjacent point', [...square.slice(0,3), square[0], square[3]]], ['nonfinite', [[0,0],[NaN,0],...square.slice(2)]],
  ['depth beyond envelope', [[0,0],[.020001,0],...square.slice(2)]], ['negative depth', [[-.001,0],...square.slice(1)]],
  ['height beyond envelope', [...square.slice(0,3),[0,.120001]]], ['short',square.map(([x,y])=>[x,y*.9])],
  ['floor point only', [[0,0],[.02,.05],[.02,.12],[0,.12]]],
  ['wall point only', [[.001,0],[.02,0],[.02,.12],[0,.12]]],
  ['crossed edges', [[0,0],[.02,0],[.006,.10],[.02,.08],[.004,.02],[0,.12]]],
  ['edge touches another vertex', [[0,0],[.02,0],[.02,.12],[.01,0],[0,.12]]],
  ['adjacent backtrack', [[0,0],[.02,0],[.01,0],[.02,.12],[0,.12]]],
];
function withCandidate(resource) {return {catalog:{...context.catalog, resources:[...context.catalog.resources,resource]}, templates};}
for (const [description, profile] of malformed) {
  const bad = fixture(3, profile);
  assert.throws(()=>make(decorated,[set(first,b),set(second,bad)],withCandidate(bad)),
    error=>error.code === 'invalid-surface-resource' && error.path.endsWith('.finish.profile'),description);
}
for (const [type,surface] of [['wall','west'],['ceiling','ceiling'],['floor','floor']]) {
  const bad = fixture(3,square);
  bad.finish.allowedSurfaces = [type];
  assert.throws(()=>make(decorated,[set(first,bad,surface)],withCandidate(bad)), {code:'invalid-surface-resource'});
}
for (const op of [set(first,wall),set(area,a,'east'),set(second,b,'floor'),set(first,b,'ceiling')])
  assert.throws(()=>make(decorated,[op]), {code:'incompatible-surface-finish'});
assert.throws(()=>make(decorated,[set(first,a,'baseboard',{profile:square})]), {code:'invalid-surface-finish'});
assert.throws(()=>make(decorated,[set(initial.nodes.find(n=>n.kind==='floor').id,a)]), {code:'invalid-operation'});
assert.equal(await encodeCompanySave(decorated, context.catalog, templates),saved);

const records = new Map();
const storage = {getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)};
const store = createCompanySaveStore({...context, storage});
await store.save(decorated);
const changed = structuredClone(context.catalog);
changed.resources.find(r=>r.id===a.id&&r.version===1).finish.profile = profiled;
const otherStore = createCompanySaveStore({catalog:changed, templates, storage});
await assert.rejects(()=>otherStore.import(saved),{code:'dependency-content-mismatch'});
assert.equal(store.export(decorated.id), saved);
assert.deepEqual(await store.load(decorated.id), decorated);

// When the production collection is present, pass each actual declaration through the same document and save entry points.
const installed = catalog.resources.filter(r=>r.finish?.allowedSurfaces.includes('baseboard'));
for (const r of installed) {
  const actual = make(initial, [set(first,r),set(area,r)], {catalog, templates});
  assert.deepEqual(await decodeCompanySave(await encodeCompanySave(actual,catalog,templates),catalog,templates),actual);
}
console.log(JSON.stringify({status:'passed',regions:[first,second,area],historicalSaveUnchanged:true,versionsPinned:pins(saved),
  rejectedProfiles:malformed.map(([reason])=>reason), storedBytesPreservedOnFailedImport:true,
  installedBaseboards:installed.map(ref), fixtures:'two private in-memory declarations cloned from the wall material'},null,2));
