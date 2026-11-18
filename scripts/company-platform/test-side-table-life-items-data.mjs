import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createCompany,deriveCompany,prepareCompanyChange,composeTransform} from '../../prototype/src/company/document.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {validateSupportResource} from '../../prototype/src/company/support-data.js';
import {describeFacilityFunction,compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {SIDE_TABLE_LIFE_ITEMS_PROFILE,SIDE_TABLE_LIFE_ITEMS_IDS,SIDE_TABLE_LIFE_ITEMS_DESIGNS,
  SIDE_TABLE_LIFE_ITEMS_MOUNTING,validateSideTableLifeItemsResource} from '../../prototype/src/company/side-table-life-items-data.js';

const clone=structuredClone;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const option=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback;
const synthetic=process.argv.includes('--synthetic');
const resourceFile=option('--resources','prototype/public/company-assets/side-table-life-items-v1/collection.json');
const output=path.resolve(option('--output',`evidence/company-side-table-life-items-data-v1/run-${new Date().toISOString().replaceAll(':','-')}`));
await fs.mkdir(output,{recursive:false});
const sourceCatalog=JSON.parse(await fs.readFile('prototype/src/company/library-catalog.json','utf8'));
const table=sourceCatalog.resources.find(resource=>resource.id==='side-table-round'&&resource.version===1);
assert(table,'Existing real side table must be registered');
const templates={templates:[]};
const fixtures=SIDE_TABLE_LIFE_ITEMS_IDS.map((id,index)=>({id,version:1,category:'decor',mountRole:'side-table-life-items',productionBranch:'side-table-life-items',
  mount:'support-surface',mounting:clone(SIDE_TABLE_LIFE_ITEMS_MOUNTING),coordinates:{units:'metres',up:'+Y',forward:'+Z'},footprint:{blocking:false},usePoints:[],stateDefaults:{},
  provenance:{sourceDesign:SIDE_TABLE_LIFE_ITEMS_DESIGNS[index]},asset:{format:'glb',url:'/synthetic-life-items-never-loaded.glb',sha256:'0'.repeat(64),bytes:20}}));
const collection=synthetic?null:JSON.parse(await fs.readFile(resourceFile,'utf8'));
const resourceFiles={};
const items=synthetic?fixtures:await Promise.all(SIDE_TABLE_LIFE_ITEMS_IDS.map(async id=>{
  const entry=collection.resources.find(entry=>entry.id===id);
  assert(entry&&typeof entry.resourcePath==='string',`Missing resource index entry ${id}`);
  const bytes=await fs.readFile(entry.resourcePath),resource=JSON.parse(bytes);
  assert.equal(resource.id,id);assert.equal(resource.version,1);
  assert.equal(resource.asset.url,entry.url);assert.equal(resource.asset.sha256,entry.sha256);
  resourceFiles[entry.resourcePath]=hash(bytes);
  return resource;
}));
const future={...clone(items[0]),id:'side-table-life-independent-appearance',version:2};
const itemKeys=new Set([...items,future].map(resource=>`${resource.id}@${resource.version}`));
const catalog={...sourceCatalog,resources:[...sourceCatalog.resources.filter(resource=>!itemKeys.has(`${resource.id}@${resource.version}`)),...items,future]};
const options={catalog,templates};
const ref=resource=>({id:resource.id,version:resource.version});
const add=(id,parentId,resource,position,surfaceId,yaw=0)=>({type:'add-facility',id,parentId,resource:ref(resource),transform:{position,yaw},...(surfaceId?{attachment:{surfaceId}}:{})});
const change=(document,operations,overrides={})=>prepareCompanyChange(document,operations,{...options,...overrides}).document;
const checks=[];
const fail=(code,location,message)=>{throw Object.assign(Error(message),{code,path:location});};
async function check(name,action) {
  try {checks.push({name,status:'passed',detail:await action()});}
  catch(error) {checks.push({name,status:'failed',code:error.code,error:error.stack});}
}
function input() {
  const document=createCompany({id:'life-items-data',width:7,depth:5.25},catalog);
  return change(document,[add('table',document.nodes[1].id,table,[0,0,-.5]),add('item','table',items[0],[0,.5,0],'top')]);
}
function near(actual,expected) {
  assert.equal(actual.length,expected.length);
  for(let index=0;index<actual.length;index++)assert(Math.abs(actual[index]-expected[index])<1e-8,`${actual} != ${expected}`);
}

// Scene instances intentionally use synthetic boxes. Real descriptors and GLB
// file hashes are checked separately below. No real image or source mesh loads.
function libraryFixture() {
  const control={beforePreload:null,instantiateFailure:false};
  return {control,async preload(resources){await control.beforePreload?.(resources);},retainOnly(){},instantiate(resource) {
    if(control.instantiateFailure&&resource.mountRole==='side-table-life-items')
      throw Object.assign(Error('Synthetic instance construction failed'),{code:'synthetic-instance-failure'});
    const root=new THREE.Group(),nodes=new Map();
    const isTable=resource.mountRole==='side-table';
    const geometry=isTable?new THREE.BoxGeometry(.3,.04,.22).translate(0,.48,0):
      new THREE.BoxGeometry(resource.mounting.width,resource.mounting.height,resource.mounting.depth).translate(0,resource.mounting.height/2,0);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());
    mesh.name=isTable?'side-table-top':'synthetic-supported-prop';
    root.add(mesh);nodes.set(mesh.name,mesh);return {root,nodes};
  }};
}
function fixture(document=input()) {
  const library=libraryFixture(),world=new THREE.Scene();
  const scene=createCompanyScene(world,document,{...options,assetLibrary:library});
  return {library,scene,apply(operations) {
    let handle;
    try {handle=scene.prepareChange(operations);scene.commit(handle);}
    finally {if(handle)scene.discard(handle);}
  },dispose(){scene.dispose();}};
}
function agree(scene) {
  const derived=deriveCompany(scene.document,catalog,templates);
  scene.root.updateMatrixWorld(true);
  for(const facility of derived.facilities)near(scene.root.getObjectByName(facility.id).getWorldPosition(new THREE.Vector3()).toArray(),facility.world.position);
  return derived;
}

await check('original 153 complete descriptors and functional signatures remain unchanged',async()=>{
  const baseline=JSON.parse(await fs.readFile('evidence/company-side-table-life-items-data-v1/legacy-signatures-before.json','utf8'));
  const original=JSON.parse(await fs.readFile('evidence/company-side-table-life-items-data-v1/legacy-resources-before.json','utf8'));
  assert.equal(baseline.resources,153);assert.equal(original.resources,153);
  const signatures={},descriptors={};
  for(const key of Object.keys(baseline.signatures)) {
    const resource=sourceCatalog.resources.find(resource=>`${resource.id}@${resource.version}`===key);
    assert(resource,`Missing legacy resource ${key}`);
    descriptors[key]=resource;
    assert.deepEqual(resource,original.descriptors[key]);
    signatures[key]=describeFacilityFunction(resource);
    assert.deepEqual(signatures[key],baseline.signatures[key]);
    validateSupportResource(resource,fail);
  }
  assert.equal(hash(JSON.stringify(signatures)),baseline.sha256);
  assert.equal(hash(JSON.stringify(descriptors)),original.sha256);
  return {resources:153,signatureSha256:baseline.sha256,completeDescriptorSha256:original.sha256};
});
await check('four finite designs and ordinary new ID at version 2 share the fixed static function',()=>{
  assert.deepEqual(items.map(resource=>resource.provenance.sourceDesign).sort(),[...SIDE_TABLE_LIFE_ITEMS_DESIGNS].sort());
  for(const resource of [...items,future]) {
    validateSideTableLifeItemsResource(resource,fail);validateSupportResource(resource,fail);
    assert(compareFacilityFunction(items[0],resource).compatible);
  }
  const ordinary=clone(future);ordinary.provenance.sourceDesign='tissue';
  validateSupportResource(ordinary,fail);
  assert(compareFacilityFunction(items[0],ordinary).compatible);
  const vase=sourceCatalog.resources.find(resource=>resource.id==='tabletop-ornament-vase');
  assert(!compareFacilityFunction(vase,items[0]).compatible);
  return {profile:SIDE_TABLE_LIFE_ITEMS_PROFILE,resources:items.map(ref),future:ref(future),designSelectedFromProvenance:true};
});
await check('production descriptors match actual GLB bytes when actual resources are selected',async()=>{
  if(synthetic)return {mode:'synthetic metadata',actualFilesChecked:0};
  const files=[];
  for(const resource of items) {
    const filename=path.resolve('prototype/public',resource.asset.url.replace(/^\//,''));
    const bytes=await fs.readFile(filename);
    assert.equal(bytes.length,resource.asset.bytes);assert.equal(hash(bytes),resource.asset.sha256);
    assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
    files.push({resource:ref(resource),file:filename,sha256:hash(bytes),bytes:bytes.length});
  }
  return {actualFilesChecked:files.length,files,geometryOrImageDecodePerformed:false};
});
await check('unknown fields and accidental state light support or changed installation contracts reject',()=>{
  const mutations=[r=>r.mountRole='tabletop-ornament',r=>r.productionBranch='tabletop-ornament',r=>r.category='dynamic',r=>r.mount='side-table-surface',
    r=>r.mounting.width=.19,r=>r.mounting.height=.26,r=>r.mounting.origin='center',r=>r.footprint.blocking=true,r=>r.footprint.center=[0,0],
    r=>r.usePoints=[{id:'take'}],r=>r.stateDefaults.on=false,r=>r.stateSchema={},r=>r.stateSemantics={},r=>r.movingParts=[],r=>r.movingProfile='static',
    r=>r.supportSurfaces=[],r=>r.supportNodes={},r=>r.supportMotion={},r=>r.light={},r=>r.clockDisplay={},r=>r.mirrorSurface={},r=>r.informationSurface={},
    r=>r.surface={},r=>r.capacity=1,r=>r.unknown=true,r=>r.coordinates.up='+Z',r=>r.coordinates.extra=true,r=>r.asset.extra=true,r=>r.asset.bytes=0,
    r=>r.asset.sha256='bad',r=>r.version=0,r=>r.version=1.5,r=>r.id='',r=>r.provenance.sourceDesign='round',r=>delete r.provenance,
    r=>r.materialSlots={tint:['same','same']},r=>r.materialSlots={tint:[]},r=>r.materialSlots={tint:'mesh'}];
  for(const mutate of mutations) {
    const bad=clone(items[0]);mutate(bad);
    assert.throws(()=>validateSupportResource(bad,fail),error=>Boolean(error));
  }
  const known=clone(items[0]);known.mountRole='other';known.productionBranch='other';
  assert.throws(()=>validateSupportResource(known,fail),error=>Boolean(error));
  return {rejectedDefinitions:mutations.length+1};
});
await check('quarter-turn parents and child local adjustment agree between derived and synthetic rendered hierarchy',()=>{
  const f=fixture();
  try {
    for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2]) {
      const parent={position:[1,0,.3],yaw},local={position:[.04,.5,.01],yaw:Math.PI/2};
      f.apply([{type:'move',id:'table',transform:parent},{type:'move',id:'item',transform:local}]);
      const derived=agree(f.scene);near(derived.worlds.get('item').position,composeTransform(parent,local).position);
      assert.deepEqual(f.scene.document.nodes.find(node=>node.id==='item').transform,local);
    }
    return {parentQuarterTurns:4,restLocal:[.04,.5,.01],sceneMeshes:'synthetic'};
  } finally {f.dispose();}
});
await check('appearance changes preserve local adjustment attachment and identity through pinned saves',async()=>{
  const f=fixture();
  try {
    f.apply([{type:'move',id:'item',transform:{position:[.04,.5,.01],yaw:Math.PI/2}}]);
    const original=clone(f.scene.document.nodes.find(node=>node.id==='item'));
    for(const resource of [...items,future]) {
      f.apply([{type:'replace-resource',id:'item',resource:ref(resource)}]);
      assert.deepEqual(f.scene.document.nodes.find(node=>node.id==='item'),{...original,resource:ref(resource)});
      const text=f.scene.save();f.scene.restore(text);assert.equal(f.scene.save(),text);agree(f.scene);
      const pinned=await encodeCompanySave(f.scene.document,catalog,templates);
      assert.deepEqual(await decodeCompanySave(pinned,catalog,templates),f.scene.document);
    }
    return {appearances:4,futureVersion:2,instanceId:original.id,local:original.transform};
  } finally {f.dispose();}
});
await check('copy-facility creates an independent supported subtree with opaque copied child IDs',()=>{
  const f=fixture();
  try {
    const source=clone(f.scene.document.nodes.find(node=>node.id==='item'));
    f.apply([{type:'copy-facility',id:'table',newId:'table-copy',transform:{position:[1.4,0,.3],yaw:Math.PI/2}}]);
    const copied=f.scene.document.nodes.find(node=>node.parentId==='table-copy');assert(copied);assert.notEqual(copied.id,source.id);
    assert.deepEqual(copied.resource,source.resource);assert.deepEqual(copied.transform,source.transform);assert.deepEqual(copied.attachment,source.attachment);
    f.apply([{type:'move',id:'table-copy',transform:{position:[-1.4,0,.3],yaw:Math.PI}}]);
    assert.deepEqual(f.scene.document.nodes.find(node=>node.id==='item'),source);agree(f.scene);
    const text=f.scene.save();f.scene.restore(text);assert.equal(f.scene.save(),text);
    assert.equal(new Set(f.scene.document.nodes.map(node=>node.id)).size,f.scene.document.nodes.length);
    return {copiedChildFoundByParent:true,opaqueChildId:copied.id,sourceUnaffected:true};
  } finally {f.dispose();}
});
await check('compatible actual shelf surface remains a legal parent and reattachment persists',async()=>{
  const shelf=sourceCatalog.resources.find(resource=>resource.mountRole==='storage-shelf'&&resource.supportSurfaces.some(surface=>
    surface.halfSize[0]>=.09&&surface.halfSize[1]>=.09&&surface.clearanceHeight>=.25));
  assert(shelf);
  const surface=shelf.supportSurfaces.find(surface=>surface.halfSize[0]>=.09&&surface.halfSize[1]>=.09&&surface.clearanceHeight>=.25);
  const d=input();
  const document=change(d,[add('shelf',d.nodes[1].id,shelf,[1.5,0,-.5]),{type:'attach-surface',id:'item',parentId:'shelf',surfaceId:surface.id,
    transform:{position:[surface.center[0],surface.topY,surface.center[1]],yaw:0}}]);
  const pinned=await encodeCompanySave(document,catalog,templates);assert.deepEqual(await decodeCompanySave(pinned,catalog,templates),document);
  return {parent:ref(shelf),surfaceId:surface.id,sideTableOnly:false};
});
await check('bad fit parent state resource copy and replacement changes preserve old scene and document',()=>{
  const f=fixture();
  try {
    const saved=f.scene.save(),root=f.scene.root,codes=[];
    const cases=[
      [{type:'move',id:'item',transform:{position:[.061,.5,0],yaw:0}}],
      [{type:'move',id:'item',transform:{position:[0,.5,.021],yaw:0}}],
      [{type:'move',id:'item',transform:{position:[0,.501,0],yaw:0}}],
      [{type:'move',id:'item',transform:{position:[0,.5,0],yaw:.1}}],
      [{type:'attach-surface',id:'item',parentId:'table',surfaceId:'missing',transform:{position:[0,.5,0],yaw:0}}],
      [{type:'attach-surface',id:'item',parentId:'life-items-data/room-1',surfaceId:'top',transform:{position:[0,.5,0],yaw:0}}],
      [{type:'attach-surface',id:'item',parentId:'missing',surfaceId:'top',transform:{position:[0,.5,0],yaw:0}}],
      [add('overlap','table',items[1],[0,.5,0],'top')],
      [{type:'set-state',id:'item',state:{on:true}}],
      [{type:'replace-resource',id:'item',resource:{id:items[0].id,version:99}}],
      [{type:'replace-resource',id:'item',resource:ref(sourceCatalog.resources.find(resource=>resource.id==='tabletop-ornament-vase'))}],
      [{type:'copy-facility',id:'table',newId:'table'}]
    ];
    for(const operations of cases) {
      assert.throws(()=>f.apply(operations),error=>{codes.push(error.code);return Boolean(error.code);});
      assert.equal(f.scene.root,root);assert.equal(f.scene.save(),saved);
    }
    const missing=input();delete missing.nodes.find(node=>node.id==='item').attachment;
    assert.throws(()=>deriveCompany(missing,catalog,templates),error=>error.code==='invalid-support-attachment');
    return {rejectedTransactions:cases.length,codes,missingAttachmentRejected:true};
  } finally {f.dispose();}
});
await check('surface clearance rejects a full mounting envelope above its declared limit',()=>{
  const shelf=sourceCatalog.resources.find(resource=>resource.mountRole==='storage-shelf'&&resource.supportSurfaces.some(surface=>surface.clearanceHeight<.25&&surface.halfSize[0]>=.09&&surface.halfSize[1]>=.09));
  if(shelf) {
    const surface=shelf.supportSurfaces.find(surface=>surface.clearanceHeight<.25&&surface.halfSize[0]>=.09&&surface.halfSize[1]>=.09);
    const d=input();
    assert.throws(()=>change(d,[add('shelf',d.nodes[1].id,shelf,[1.5,0,-.5]),{type:'attach-surface',id:'item',parentId:'shelf',surfaceId:surface.id,
      transform:{position:[surface.center[0],surface.topY,surface.center[1]],yaw:0}}]),error=>error.code==='invalid-support-fit');
    return {parent:ref(shelf),clearance:surface.clearanceHeight,height:.25};
  }
  // A synthetic generic support fixture tests clearance without weakening the
  // strict side-table or life-item resource definitions.
  const low=clone(sourceCatalog.resources.find(resource=>resource.mountRole==='storage-shelf'));
  low.id='synthetic-low-clearance-shelf';low.supportSurfaces[0].clearanceHeight=.24;
  const lowCatalog={...catalog,resources:[...catalog.resources,low]},d=input(),surface=low.supportSurfaces[0];
  assert.throws(()=>change(d,[add('low',d.nodes[1].id,low,[1.5,0,-.5]),{type:'attach-surface',id:'item',parentId:'low',surfaceId:surface.id,
    transform:{position:[surface.center[0],surface.topY,surface.center[1]],yaw:0}}],{catalog:lowCatalog}),error=>error.code==='invalid-support-fit');
  return {syntheticSupportMetadata:true,clearance:.24,height:.25};
});
await check('instance construction and stale candidates retain previous live owner',()=>{
  const f=fixture();
  try {
    const saved=f.scene.save(),root=f.scene.root;f.library.control.instantiateFailure=true;
    assert.throws(()=>f.apply([{type:'replace-resource',id:'item',resource:ref(items[1])}]),error=>error.code==='synthetic-instance-failure');
    assert.equal(f.scene.root,root);assert.equal(f.scene.save(),saved);f.library.control.instantiateFailure=false;
    const handle=f.scene.prepareChange([{type:'replace-resource',id:'item',resource:ref(items[1])}]);
    f.apply([{type:'replace-resource',id:'item',resource:ref(items[2])}]);const current=f.scene.root;
    assert.throws(()=>f.scene.commit(handle),error=>error.code==='revision-conflict');f.scene.discard(handle);
    assert.equal(f.scene.root,current);agree(f.scene);
    return {syntheticConstructionFailure:true,staleCandidateRejected:true};
  } finally {f.dispose();}
});
await check('dependency-content mismatch rejects restore without changing input or original saved bytes',async()=>{
  const document=input(),original=JSON.stringify(document),saved=await encodeCompanySave(document,catalog,templates);
  const changed=clone(catalog);changed.resources.find(resource=>resource.id===items[0].id).provenance.recipeNote='Changed same-version recipe';
  await assert.rejects(()=>decodeCompanySave(saved,changed,templates),error=>error.code==='dependency-content-mismatch');
  assert.equal(JSON.stringify(document),original);assert.deepEqual(await decodeCompanySave(saved,catalog,templates),document);
  return {sameIdentityDriftRejected:true,usedDefinitionsPinned:true};
});
await check('initial and late asynchronous preload failures preserve prior scene and persisted save',async()=>{
  const memory=new Map(),storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
  const library=libraryFixture();
  const author=await createCompanyAuthoring(new THREE.Scene(),input(),{...options,assetLibrary:library,storage});
  try {
    await author.save();const saved=[...memory.values()][0],root=author.scene.root;
    library.control.beforePreload=async()=>{throw Object.assign(Error('Synthetic source unavailable'),{code:'synthetic-load-failure'});};
    await assert.rejects(()=>author.apply([{type:'replace-resource',id:'item',resource:ref(items[1])}]),error=>error.code==='synthetic-load-failure');
    assert.equal(author.scene.root,root);assert.equal([...memory.values()][0],saved);
    let entered,release,count=0;
    const waiting=new Promise(resolve=>{entered=resolve;});
    library.control.beforePreload=async()=>{
      if(++count===1){entered();await new Promise(resolve=>{release=resolve;});throw Object.assign(Error('Synthetic late failure'),{code:'synthetic-late-load-failure'});}
    };
    const late=author.apply([{type:'replace-resource',id:'item',resource:ref(items[1])}]).catch(error=>error);
    await waiting;await author.apply([{type:'replace-resource',id:'item',resource:ref(items[3])}]);await author.save();
    const finalRoot=author.scene.root,finalSave=[...memory.values()][0];release();
    assert.equal((await late).code,'synthetic-late-load-failure');assert.equal(author.scene.root,finalRoot);assert.equal([...memory.values()][0],finalSave);
    assert.equal(author.document.nodes.find(node=>node.id==='item').resource.id,items[3].id);agree(author.scene);
    return {preloadAndLateFailureSynthetic:true,preservedIdentity:items[3].id,persistedSaveUnchanged:true};
  } finally {author.dispose();}
});

const sourceHashes={};
for(const filename of ['docs/COMPANY-SIDE-TABLE-LIFE-ITEMS-CONTRACT-v1.txt','prototype/src/company/side-table-life-items-data.js',
  'prototype/src/company/support-data.js','prototype/src/company/appearance-contract.js','scripts/company-platform/test-side-table-life-items-data.mjs'])
  sourceHashes[filename]=hash(await fs.readFile(filename));
if(!synthetic) {
  sourceHashes[resourceFile]=hash(await fs.readFile(resourceFile));
  Object.assign(sourceHashes,resourceFiles);
}
const report={status:checks.every(check=>check.status==='passed')?'passed':'failed',resourceMode:synthetic?'synthetic-metadata':'production-descriptors-and-file-sha',
  checks,sourceHashes,limits:[
    'Scene and transaction checks instantiate synthetic boxes, even when resource descriptors and GLB file SHA/bytes are real. They do not load source geometry or decode embedded PNGs.',
    'Actual source/topology/material/UV/image ownership, network fetch failures, image decoding, browser GPU and process close/reopen need independent integration evidence.',
    'The original 153 complete definitions and function signatures are checked against preserved baseline snapshots. No ordinary-computer performance or character-use acceptance is claimed.'
  ]};
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,...report},null,2));
if(report.status!=='passed')process.exitCode=1;
