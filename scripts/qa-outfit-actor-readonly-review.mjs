import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root = pathToFileURL(resolve(process.env.OUTFIT_REVIEW_SOURCE_ROOT ??
  fileURLToPath(new URL('../',import.meta.url))) + sep);
const [T,{createBodyCoverageSet,completeBodyGeometry},{commitLoadedEquipmentSet},{outfitSelection}] =
  await Promise.all([
    import(new URL('prototype/node_modules/three/build/three.module.js',root)),
    import(new URL('prototype/src/body-coverage.js',root)),
    import(new URL('prototype/src/equipment-set.js',root)),
    import(new URL('prototype/src/outfit-selection.js',root)),
  ]);
const expectFixed = process.argv.includes('--expect-fixed');
const [m1Source, actorSource, mainSource] = await Promise.all([
  fs.readFile(new URL('prototype/src/m1-equipment.js',root), 'utf8'),
  fs.readFile(new URL('prototype/src/foundation-avatar.js',root), 'utf8'),
  fs.readFile(new URL('prototype/src/main.js',root), 'utf8'),
]);
const hash = value => createHash('sha256').update(value).digest('hex');
const geometry = new T.BufferGeometry();
geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,1,0],3));
geometry.setIndex(new T.Uint32BufferAttribute([0,1,2,0,2,3],1));
geometry.addGroup(0,6,0);
const material = new T.MeshBasicMaterial();
material.name = 'M00_000_Body_00_SKIN';
const mesh = new T.SkinnedMesh(geometry, material);
const sourceMaterial = new T.MeshBasicMaterial();
sourceMaterial.name = 'M00_000_Tops_00_CLOTH';
const cloth = new T.SkinnedMesh(new T.BufferGeometry(), sourceMaterial);
const scene = new T.Group();scene.add(mesh,cloth);
const ids = {top:'top',pants:'pants',shoes:'shoes',shorts:'shorts'};
const catalog = Object.values(ids).map(id => ({id,slot:['pants','shorts'].includes(id)?'bottom':id,
  compatibleAvatarSha256:'body',sha256:'sha-'+id}));
const loaded = new Map(catalog.map(entry => [entry.id,{entry,container:{visible:false},
  meshes:[{name:entry.id}],stats:{}}]));
const adapter = {load:async()=>{},get:id=>loaded.get(id),
  applyLoadedSet:selected=>commitLoadedEquipmentSet(loaded,catalog,selected,'body'),dispose(){}};
const fit = {schema:'zbgs-equipment-body-coverage.1',id:'fixture',avatarSha256:'body',
  itemId:'top',itemSha256:'sha-top',bodyMaterial:material.name,bodyFaceCount:2,
  bodyIndexComponentType:5125,bodyIndexAccessorSha256:hash(Buffer.from(geometry.index.array.buffer)),
  selectedFaceIds:[0],selectedTriangles:[[0,1,2]]};
const bytes = Buffer.from(JSON.stringify(fit));
const config = {sha256:'body',ids,bodyCoverage:{url:'fixture',sha256:hash(bytes)},
  outfits:[{index:0,role:'pants'},
    {index:3,role:'configured-shorts',bottomRole:'shorts',equipmentRoles:['top','shoes','shorts']}]};
const fnSource = m1Source.slice(m1Source.indexOf('export async function createM1Equipment'))
  .replace('export async function','async function');
const factory = new Function('createEquipment','createM1Skirt','selectSkirtFit',
  'foundationProfile','createBodyCoverageSet','outfitSelection',fnSource+';return createM1Equipment;')(
  async()=>adapter,()=>null,()=>null,()=>config,createBodyCoverageSet,outfitSelection);
const debugFunction = actorSource.slice(actorSource.indexOf('  function setDebugBody(value)'),
  actorSource.indexOf('  setDebugBody(false);'));
const modeFunction = mainSource.slice(mainSource.indexOf('function setBodyMode(name)'),
  mainSource.indexOf('\nlet helpersVisible'));
const previousFetch = globalThis.fetch;
globalThis.fetch = async()=>new Response(bytes);
let equipment;
const report = {expectFixed,sourceSha256:{m1:hash(m1Source),actor:hash(actorSource),main:hash(mainSource)},
  scope:'Actual M1 factory, actor debug setter, main mode setter and coverage geometry cloning. Synthetic meshes/adapter/appearance fixture. CPU only.'};
try {
  equipment = await factory({vrm:{scene},avatarSha256:'body'});
  const debugMaterial = new T.MeshBasicMaterial();
  let appearanceMode = 'dressed';
  const appearance = {getState:()=>({bodyMode:appearanceMode}),
    setBodyMode(mode){appearanceMode=mode;return{applied:true};}};
  const actor = new Function('appearance','sourceMaterials','bodyMaterials','equipment',
    'let debugBody=false;'+debugFunction+';return{setDebugBody,getDebugState:()=>({debugBody})};')(
    appearance,new Map([[mesh,material]]),new Map([[mesh,debugMaterial]]),equipment);
  const inspection = {bodyMode:'dressed'};
  const calls = {dynamics:0,sync:0};
  const setBodyMode = new Function('avatar','inspection','setDynamics','syncInspectionUI',
    modeFunction+';return setBodyMode;')(actor,inspection,()=>calls.dynamics++,()=>calls.sync++);
  setBodyMode('base');
  const before = {actorDebug:actor.getDebugState().debugBody,appearanceMode,
    equipmentDebug:equipment.getInfo().debugBody,inspectionMode:inspection.bodyMode,
    debugMaterial:mesh.material===debugMaterial,visible:[...loaded].filter(([,x])=>x.container.visible).map(([id])=>id)};
  const originalClone = geometry.clone;
  geometry.clone = ()=>{throw Error('injected coverage clone failure');};
  assert.throws(()=>setBodyMode('dressed'),/injected coverage clone failure/);
  geometry.clone = originalClone;
  const after = {actorDebug:actor.getDebugState().debugBody,appearanceMode,
    equipmentDebug:equipment.getInfo().debugBody,inspectionMode:inspection.bodyMode,
    debugMaterial:mesh.material===debugMaterial,visible:[...loaded].filter(([,x])=>x.container.visible).map(([id])=>id)};
  assert.equal(before.actorDebug,true);assert.equal(before.appearanceMode,'base');
  assert.equal(before.equipmentDebug,true);assert.equal(before.debugMaterial,true);
  assert.equal(after.actorDebug,expectFixed);assert.equal(after.appearanceMode,expectFixed?'base':'dressed');
  assert.equal(after.equipmentDebug,true);assert.equal(after.debugMaterial,expectFixed);
  assert.equal(after.inspectionMode,'base');assert.deepEqual(after.visible,['shoes']);
  assert.equal(mesh.geometry,geometry);assert.equal(completeBodyGeometry(mesh),geometry);
  assert.deepEqual(calls,{dynamics:1,sync:1});
  report.passed=true;report.failureStateConsistent=expectFixed;report.before=before;report.after=after;
  report.mainDidNotCommitAfterActorFailure=true;
  setBodyMode('dressed');
  assert.equal(equipment.getInfo().debugBody,false);
  report.retrySucceeded=true;
  equipment.setOutfit(3);
  assert.equal(equipment.getAssetProfile().pants,loaded.get('shorts').meshes);
  assert.equal(equipment.getInfo().outfit,3);
  report.configuredIndex3UsesActualShortsSurface=true;
  if(expectFixed) {
    const handCallback = actorSource.match(/seatHandSurfaces: ([\s\S]*?\n      }),/)[1];
    const skirtSurfaces = [{name:'skirt-contact-fixture'}];
    const callback = (debug,role) => new Function('debugBody','lowerBodyRole','surfaces',
      'return ('+handCallback+');')(debug,role,{skirt:skirtSurfaces});
    assert.equal(callback(false,'skirt')(false),skirtSurfaces);
    assert.deepEqual(callback(false,'shorts')(false),[]);
    assert.deepEqual(callback(true,'skirt')(false),[]);
    report.contactSurfacesFollowLowerBodyRole=true;
  }
  debugMaterial.dispose();
} finally {equipment?.dispose();globalThis.fetch=previousFetch;}
const out = new URL('../evidence/configured-looks-actor-readonly-review-v1/'+(expectFixed?'fixed/':'baseline/'),import.meta.url);
await fs.mkdir(out,{recursive:true});
await fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
