import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {decodeCompanySave,encodeCompanySave} from '../../prototype/src/company/persistence.js';
import {runCompanyBatch} from './batch.mjs';
import {checkSingingRooms} from './check-singing-room.mjs';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const receiver = 'company-workspace/production-trials/singing-receiver-v1/r1/derived';
const [output,alternatePackage=path.join(root,receiver),...extra] = process.argv.slice(2);
if (!output || extra.length) throw Error('Usage: node test-singing-score-visibility.mjs NEW_OUTPUT_DIRECTORY [ALTERNATE_PACKAGE]');
const out = path.resolve(output), altSource = path.resolve(alternatePackage,'source');
const loadJson = async name => JSON.parse(await fs.readFile(name,'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const writeJson = (name,value) => fs.writeFile(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const studio = 'singing-studio', rental = 'singing-rental';
const keys = [studio,rental];
const alternateId = 'floor-score-stand-receiver-low-page';
const originalId = 'floor-score-stand-tripod';
const sourceFamily = 'assets-source/company-singing-stage-v1';
const assetPath = resource => 'prototype/public' + resource.asset.url;
const sourceCatalog = path.join('prototype','src','company','library-catalog.json');
const baselineOptions = {catalog,templates,root};
const p = (...args) => new THREE.Vector3(...args);
const round = numeric => Number(numeric.toFixed(7)) || 0;
const tuple = vector => vector.toArray().map(round);
const partName = object => object.userData.name || object.name;
const componentMaterial = hit => Array.isArray(hit.object.material)
  ? hit.object.material[hit.face.materialIndex] : hit.object.material;
const isVisibleMaterial = hit => {
  const material = componentMaterial(hit);
  return material?.visible && (!material.transparent || material.opacity > 0);
};
const decimalNear = (a,b,epsilon=1e-6) => assert(Math.abs(a-b) <= epsilon,a+' differs from '+b);
const originalCatalogRef = catalog.resources.find(r => r.id === originalId && r.version === 1);
const altCatalog = await loadJson(path.join(altSource,sourceCatalog));
const altCatalogRef = altCatalog.resources.find(r => r.id === alternateId && r.version === 1);
assert(altCatalogRef?.asset && altCatalogRef.asset.sha256 !== originalCatalogRef.asset.sha256);
const altOptions = {catalog:altCatalog,templates,root:altSource};
const altManifestPath = path.resolve(alternatePackage,'transfer-manifest.json');
const altManifestBytes = await fs.readFile(altManifestPath);
const altManifest = JSON.parse(altManifestBytes);
const altPin = altManifest.files.find(file => file.path === 'source/'+assetPath(altCatalogRef));
assert.equal(altPin?.sha256,altCatalogRef.asset.sha256);
const req = createRequire(new URL('../../prototype/package.json',import.meta.url));
const jpeg = req('jpeg-js');

function glbAtlas(bytes) {
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const end = 20 + bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8',20,end));
  const material = gltf.materials.find(mat => mat.name==='music-stand_desk_pbr');
  assert(material);
  const materialMap = material.pbrMetallicRoughness.baseColorTexture.index;
  const image = gltf.images[gltf.textures[materialMap].source];
  const view = gltf.bufferViews[image.bufferView];
  assert.equal(image.mimeType,'image/jpeg');
  const start = end+8+(view.byteOffset || 0);
  const bin = bytes.subarray(start,start+view.byteLength);
  const decoded = jpeg.decode(bin,{useTArray:true,formatAsRGBA:false,tolerantDecoding:false});
  const color = (x,y) => [...decoded.data.subarray((y*decoded.width+x)*3,(y*decoded.width+x)*3+3)];
  return {material:material.name,atlasSha256:sha(bin),size:[decoded.width,decoded.height],color};
}
const mainBytes = await fs.readFile(path.join(root,assetPath(originalCatalogRef)));
const alternateBytes = await fs.readFile(path.join(altSource,assetPath(altCatalogRef)));
const sourceBytes = await fs.readFile(path.join(root,sourceFamily,'original','music-stand.glb'));
assert.equal(sha(mainBytes),originalCatalogRef.asset.sha256);
assert.equal(sha(alternateBytes),altCatalogRef.asset.sha256);
const atlas = glbAtlas(mainBytes), alternateAtlas = glbAtlas(alternateBytes), sourceAtlas = glbAtlas(sourceBytes);
assert.deepEqual(atlas.size,[512,512]); assert.deepEqual(alternateAtlas.size,atlas.size);
assert.deepEqual(sourceAtlas.size,[2048,2048]);
assert.equal(atlas.atlasSha256,alternateAtlas.atlasSha256);
const texel = (x,y) => [(x+.5)/atlas.size[0],(y+.5)/atlas.size[1]];
const materialWitnesses = [
  {name:'right-paper-tone-band',side:'right',uv:texel(392,113),texel:[392,113]},
  {name:'left-shallow-staff',side:'left',uv:[.9219064,.0817899],texel:[472,41]},
  {name:'right-shallow-staff',side:'right',uv:[.2433629,.7882094],texel:[124,403]},
];
const materialColors = Object.fromEntries(materialWitnesses.map(x=>[x.name,atlas.color(...x.texel)]));
const paperLuma = materialColors['right-paper-tone-band'].reduce((a,b)=>a+b);
for (const name of ['left-shallow-staff','right-shallow-staff'])
  assert(materialColors[name].reduce((a,b)=>a+b) < paperLuma*.65);
for (const y of [109,117]) assert(atlas.color(392,y).reduce((a,b)=>a+b)>paperLuma);
const originalMetadata = (await loadJson(path.join(root,sourceFamily,'original','sources.json'))).find(r=>r.id==='music-stand');
assert.equal(originalMetadata.sha256,sha(sourceBytes));
assert.equal(originalMetadata.declaredByPublisher,'CC0-1.0');

function uvSurface(object,standInverse,side,uv) {
  const {geometry} = object;
  const {index} = geometry;
  const map = geometry.attributes.uv;
  assert(map);
  const toStand = standInverse.clone().multiply(object.matrixWorld);
  const count = index?.count ?? map.count;
  const target = p(...uv,0);
  const candidates = [];
  for (let i=0;i+2<count;i+=3) {
    const ids = [i,i+1,i+2].map(j=>index ? index.getX(j) : j);
    const uvTri = new THREE.Triangle(...ids.map(j=>p(map.getX(j),map.getY(j),0)));
    const bary = uvTri.getBarycoord(target,p());
    if (!bary) continue;
    if (Math.min(bary.x,bary.y,bary.z)<-1e-6) continue;
    const xyz = ids.map(j=>object.getVertexPosition(j,p()).applyMatrix4(toStand));
    const face = new THREE.Triangle(...xyz);
    if (face.getNormal(p()).z <= .7) continue;
    const local = xyz[0].multiplyScalar(bary.x).addScaledVector(xyz[1],bary.y).addScaledVector(xyz[2],bary.z);
    if ((local.x<0 ? 'left' : 'right') === side) candidates.push(local);
  }
  assert(candidates.length, 'No front triangle for the '+side+' material sample '+uv);
  return candidates.reduce((front,point)=>point.z > front.z ? point : front);
}

async function observe(document,options,diagnosticTarget) {
  const [rule] = document.singingRooms;
  const derived = deriveCompany(document,options.catalog,options.templates), floorId = derived.floorIds.get(rule.regionId);
  const facilities = derived.facilities.filter(f=>f.floorId===floorId);
  const finishes = derived.surfaceFinishes.filter(f=>f.floorId===floorId);
  const score = facilities.find(f=>f.id===rule.roles.score);
  let observation;
  await preflightLibraryAssets({root:options.root,resources:[...facilities,...finishes].map(f=>f.resource),validate:library=>{
    const scene = createCompanyScene(new THREE.Scene(),document,{catalog:options.catalog,templates:options.templates,assetLibrary:library,
      visibleFloorId:floorId,mirrorPreflight:()=>{}});
    try {
      const room = scene.root.getObjectByName(rule.regionId), stand = scene.root.getObjectByName(score.id);
      scene.root.updateMatrixWorld(true);
      const parents = new Map(facilities.map(f=>[scene.root.getObjectByName(f.id),f.id]));
      const names = new Map(), meshes = [];
      function visit(object,parent) {
        if (!object.visible) return;
        const owner = parents.get(object) ?? parent;
        if (object.isMesh) {meshes.push(object); names.set(object,owner ?? object.name);}
        for (const child of object.children) visit(child,owner);
      }
      visit(scene.root,null);
      const pages = meshes.filter(object=>names.get(object)===score.id && partName(object)===score.resource.musicStand.pageNode);
      assert.equal(pages.length,1);
      const [page] = pages;
      const standInverse = stand.matrixWorld.clone().invert(), roomInverse = room.matrixWorld.clone().invert();
      const points = page.geometry.attributes.position;
      const toStand = standInverse.clone().multiply(page.matrixWorld);
      const bounds = new THREE.Box3();
      for (let j=0;j<points.count;j++) bounds.expandByPoint(page.getVertexPosition(j,p()).applyMatrix4(toStand));
      const pose = new THREE.Matrix4().makeRotationY(rule.performer.yaw).setPosition(rule.performer.position[0],0,rule.performer.position[1]);
      const eye = p(...rule.performer.eye).applyMatrix4(pose).applyMatrix4(room.matrixWorld);
      const line = (u,v) => {
        const x = THREE.MathUtils.lerp(bounds.min.x,bounds.max.x,u);
        const y = THREE.MathUtils.lerp(bounds.min.y,bounds.max.y,v);
        const front = p(x,y,bounds.max.z+.15).applyMatrix4(stand.matrixWorld);
        const back = p(x,y,bounds.min.z-.15).applyMatrix4(stand.matrixWorld);
        const hit = new THREE.Raycaster(front,back.clone().sub(front).normalize(),0,front.distanceTo(back)).intersectObject(page,false)[0];
        assert(hit?.uv, 'Missing front paper/line triangle at '+u+','+v);
        return {target:hit.point,uv:hit.uv.toArray().map(round)};
      };
      const fromEye = ({target,uv}) => {
        const dir = target.clone().sub(eye);
        const hit = new THREE.Raycaster(eye,dir.clone().normalize(),1e-6,dir.length()+1e-5)
          .intersectObjects(meshes,false).find(isVisibleMaterial);
        // Nearer shallow staff on the same page is legitimate content of the paper.
        return {target:tuple(target.clone().applyMatrix4(roomInverse)),uv,
          first:hit ? {instance:names.get(hit.object),mesh:partName(hit.object),point:tuple(hit.point.clone().applyMatrix4(roomInverse))} : null,
          visible:hit?.object===page};
      };
      const grid = {};
      for (const [side,start] of [['left',0],['right',.5]]) {
        const cells = [];
        for(let row=0;row<11;row++)for(let col=0;col<11;col++)
          cells.push(fromEye(line(start+.5*(col+.5)/11,(row+.5)/11)));
        const hidden = cells.filter(cell=>!cell.visible);
        grid[side] = {count:cells.length,hidden:hidden.length,center:cells[60],occluded: hidden};
      }
      const edges = Object.fromEntries([['left',.028],['right',.972]].map(([side,u])=>[side,fromEye(line(u,.50))]));
      const materials = Object.fromEntries(materialWitnesses.map(mark=>{
        const local = uvSurface(page,standInverse,mark.side,mark.uv);
        return [mark.name,{...fromEye({target:local.clone().applyMatrix4(stand.matrixWorld),uv:mark.uv}),standPoint:tuple(local),
          texel:mark.texel,rgb:materialColors[mark.name]}];
      }));
      observation = {readings:{resource:score.node.resource,roomLocalEye:tuple(eye.clone().applyMatrix4(roomInverse)),grid,edges,materials},
        diagnosticRay:diagnosticTarget && fromEye({target:p(...diagnosticTarget).applyMatrix4(room.matrixWorld),uv:null})};
    } finally { scene.dispose(); }
  }});
  return observation;
}

const batch = await loadJson(path.join(root,'scripts/company-platform/batch-inputs/singing-rooms.json'));
const published = path.join(out,'published');
const report = {status:'passed',author:{name:'Grab3D',license:'CC0-1.0',site:originalMetadata.site,sourceSha256:sha(sourceBytes),
  originalAtlas:{size:sourceAtlas.size,sha256:sourceAtlas.atlasSha256},gameAtlas:{size:atlas.size,sha256:atlas.atlasSha256},
  alternate:{package:altSource,manifestSha256:sha(altManifestBytes),modelSha256:sha(alternateBytes)}},
  cases:{},productionMismatches:[]};
const fileNames = ['input.json','layout.json','report.json','save.json'];
const pinOutputs = async () => Object.fromEntries(await Promise.all(keys.flatMap(key=>fileNames.map(async filename=>{
  const relative = key+'/'+filename;
  return [relative,sha(await fs.readFile(path.join(published,relative)))];
}))));
const check = async (name,document,options,{expectedBlocker}={}) => {
  let product;
  try {
    const [result] = await checkSingingRooms(document,options);
    product = {ok:true,score:result.score};
  } catch (e) {
    product = {ok:false,code:e.code,path:e.path,details:e.details,message:e.message};
  }
  if (expectedBlocker ? product.ok || product.code!=='singing-score-occluded' || product.path!==expectedBlocker : !product.ok)
    report.productionMismatches.push({name,expectedBlocker,product});
  const validDiagnostic = expectedBlocker && !product.ok &&
    product.code === 'singing-score-occluded' && product.path === expectedBlocker;
  let target;
  if (validDiagnostic) {
    const {page,side,sample,target:sampleTarget,firstHit} = product.details;
    assert.equal(page,2);
    assert.equal(side,'right');
    assert(['page','relief'].includes(sample.feature));
    assert([sample.u,sample.v,...sampleTarget].every(Number.isFinite) && sampleTarget.length===3);
    assert.equal(firstHit.id,expectedBlocker);
    assert.equal(firstHit.mesh,'background-surface');
    target = sampleTarget;
  } else if (product.ok) {
    assert.deepEqual(product.score.map(row=>row.page),['left','right']);
    for (const {visibility} of product.score) {
      if (!visibility || visibility.reliefSamples <= 0 || visibility.samples <= visibility.reliefSamples)
        report.productionMismatches.push({name,missingPaperOrReliefSamples:true,visibility});
    }
  }
  const {readings,diagnosticRay} = await observe(document,options,target);
  if (diagnosticRay) {
    assert(!diagnosticRay.visible);
    assert.equal(diagnosticRay.first.instance,expectedBlocker);
    assert.equal(diagnosticRay.first.mesh,product.details.firstHit.mesh);
    for (const [i,n] of diagnosticRay.first.point.entries()) decimalNear(n,product.details.firstHit.point[i],1e-5);
  }
  report.cases[name] = {readings,product,diagnosticRay};
  return readings;
};
function clearScore(observation) {
  for (const {count,hidden} of Object.values(observation.grid)) assert.deepEqual([count,hidden],[121,0]);
  for (const scenePoint of [...Object.values(observation.edges),...Object.values(observation.materials)]) assert(scenePoint.visible);
}
function wholeFloorTurn(document) {
  const next = structuredClone(document), floorId = document.singingRooms[0].regionId.split('/').slice(0,-1).join('/');
  const floor = next.nodes.find(n=>n.kind==='floor' && n.id===floorId);
  assert(floor);
  floor.transform.position = [3.125,0,-6.25];
  floor.transform.yaw += Math.PI/2;
  return next;
}
const saved = async key => {
  const filename = path.join(published,key,'save.json');
  const document = await decodeCompanySave(await fs.readFile(filename,'utf8'),catalog,templates);
  assert.deepEqual(document,await loadJson(path.join(published,key,'layout.json')));
  return document;
};
const prepare = (document,ops,options=baselineOptions)=>prepareCompanyChange(document,ops,options).document;
await fs.mkdir(out);
const initial = await runCompanyBatch(batch,{outputDirectory:published});
assert(initial.ok,JSON.stringify(initial));
assert.deepEqual(initial.results.map(r=>r.key),keys);
const originalPins = await pinOutputs();
const studioDoc = await saved(studio), rentalDoc = await saved(rental);
const a = await check(studio,studioDoc,baselineOptions), b = await check(rental,rentalDoc,baselineOptions);
clearScore(a); clearScore(b);

const roomId = studioDoc.singingRooms[0].regionId, scoreId = studioDoc.singingRooms[0].roles.score;
const blockerId = roomId+'/edge-sight-panel';
const panel = {type:'add-facility',id:blockerId,parentId:roomId,resource:{id:'background-brand-panel',version:1},
  transform:{position:[1.62,0,.15],yaw:0}};
await writeJson('peripheral-operations.json',[panel]);
const blocked = prepare(studioDoc,[panel]);
const hidden = await check('peripheral',blocked,baselineOptions,{expectedBlocker:blockerId});
assert.deepEqual([hidden.grid.left.hidden,hidden.grid.right.hidden],[0,42]);
assert(hidden.grid.left.center.visible && hidden.grid.right.center.visible);
assert(hidden.edges.left.visible && !hidden.edges.right.visible);
assert(hidden.materials['left-shallow-staff'].visible && !hidden.materials['right-shallow-staff'].visible);
assert.equal(hidden.materials['right-paper-tone-band'].first?.instance,blockerId);
for (const {first} of hidden.grid.right.occluded) assert.equal(first?.instance,blockerId);

const samePanelClear = prepare(blocked,[{type:'move',id:blockerId,transform:{position:[1.62,0,.34],yaw:0}}]);
const moved = await check('nearby-panel-clear',samePanelClear,baselineOptions);
clearScore(moved);
assert.deepEqual(moved,a);
const restored = prepare(blocked,[{type:'remove',id:blockerId}]);
assert.deepEqual({...restored,revision:studioDoc.revision},studioDoc);
const restoredSave = await encodeCompanySave(restored,catalog,templates);
await fs.writeFile(path.join(out,'restored-save.json'),restoredSave,{flag:'wx'});
const reopened = await decodeCompanySave(restoredSave,catalog,templates);
assert.deepEqual(reopened,restored);
assert.deepEqual(await check('restored-and-reopened',reopened,baselineOptions),a);

for (const [name,doc,observation] of [['studio',studioDoc,a],['rental',rentalDoc,b],['peripheral',blocked,hidden]]) {
  const rotated = await check(name+'-whole-floor-90',wholeFloorTurn(doc),baselineOptions,
    name==='peripheral'?{expectedBlocker:blockerId}:undefined);
  assert.deepEqual(rotated,observation);
}

const alt = prepare(studioDoc,[{type:'replace-resource',id:scoreId,resource:{id:alternateId,version:1}}],altOptions);
const other = await check('published-lower-score',alt,altOptions);
clearScore(other);
for (const [name,value] of Object.entries(other.materials)) {
  assert.deepEqual(value.uv,a.materials[name].uv);
  decimalNear(value.standPoint[1]-a.materials[name].standPoint[1],-.045);
}
const altBlocked = await check('lower-score-peripheral',prepare(alt,[panel],altOptions),altOptions,{expectedBlocker:blockerId});
assert(altBlocked.grid.left.hidden===0 && altBlocked.grid.right.hidden>0);
assert(altBlocked.grid.right.center.visible);
assert.equal(altBlocked.materials['right-paper-tone-band'].first?.instance,blockerId);

const regressionBatch = {schema:'company-batch',version:1,items:[{key:studio,document:studioDoc,operations:[panel]}]};
const freshRejected = path.join(out,'fresh-rejection');
const fresh = await runCompanyBatch(regressionBatch,{outputDirectory:freshRejected,only:studio});
const repeated = await runCompanyBatch(regressionBatch,{outputDirectory:published,only:studio});
const publishedPinsAfter = await pinOutputs();
assert.deepEqual(publishedPinsAfter,originalPins);
const freshEntries = await fs.readdir(freshRejected);
if (fresh.ok || fresh.results[0]?.code!=='singing-score-occluded' || freshEntries.length)
  report.productionMismatches.push({name:'fresh-batch-rejection',result:fresh,entries:freshEntries});
if (repeated.ok || repeated.results[0]?.code!=='singing-score-occluded')
  report.productionMismatches.push({name:'existing-batch-rejection',result:repeated});
report.batch = {fresh,repeated,originalPins,originalFilesPreserved:true};
report.status = report.productionMismatches.length ? 'failed' : 'passed';
await writeJson('report.json',report);
assert.equal(report.productionMismatches.length,0,JSON.stringify(report.productionMismatches,null,2));
console.log(JSON.stringify({status:report.status,scenarios:Object.keys(report.cases).length,report:path.join(out,'report.json')}));
