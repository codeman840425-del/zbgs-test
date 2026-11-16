import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {RoundedBoxGeometry} from '../../prototype/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

globalThis.FileReader ??= class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({target:this}); }).catch(error => this.onerror?.(error)); } };
const root = new URL('../../', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePath = 'assets-source/company-device-collection/parameters.json';
const sourceBytes = await fs.readFile(new URL(sourcePath, root));
const source = JSON.parse(sourceBytes);
const generatorSha256 = hash(await fs.readFile(new URL(import.meta.url)));
const baseCatalog = JSON.parse(await fs.readFile(new URL('prototype/src/company/library-catalog.json', root)));
const monitorCatalogReference = baseCatalog.resources.find(resource => resource.id === 'monitor' && resource.version === 1);
const lightCatalogReference = baseCatalog.resources.find(resource => resource.id === 'fill-light' && resource.version === 1);
assert(monitorCatalogReference && lightCatalogReference, 'monitor@1 and fill-light@1 catalog references must exist');
const monitorContractPath = 'assets-source/company-device-collection/contracts/monitor.json';
const lightContractPath = 'assets-source/company-device-collection/contracts/fill-light.json';
const monitorContractBytes = await fs.readFile(new URL(monitorContractPath, root));
const lightContractBytes = await fs.readFile(new URL(lightContractPath, root));
const monitorContract = JSON.parse(monitorContractBytes);
const lightContract = JSON.parse(lightContractBytes);
assert.deepEqual(monitorContract, monitorCatalogReference, 'Frozen monitor contract differs from the original catalog reference');
assert.deepEqual(lightContract, lightCatalogReference, 'Frozen fill-light contract differs from the original catalog reference');
const monitorContractSha256 = hash(monitorContractBytes);
const lightContractSha256 = hash(lightContractBytes);
const monitorCatalogReferenceSha256 = hash(Buffer.from(JSON.stringify(monitorCatalogReference)));
const lightCatalogReferenceSha256 = hash(Buffer.from(JSON.stringify(lightCatalogReference)));

function material(color, roughness = .48, emissive = null, intensity = 0) {
  const value = new THREE.MeshStandardMaterial({color, roughness, metalness: .12});
  if (emissive) { value.emissive.set(emissive); value.emissiveIntensity = intensity; }
  return value;
}
function mesh(rootObject, name, geometry, mat, position, rotation = [0, 0, 0]) {
  const value = new THREE.Mesh(geometry, mat); value.name = name; value.position.fromArray(position); value.rotation.set(...rotation);
  value.castShadow = true; value.receiveShadow = true; rootObject.add(value); return value;
}
function box(rootObject, name, size, mat, position, rotation = [0, 0, 0]) { return mesh(rootObject, name, new THREE.BoxGeometry(...size), mat, position, rotation); }
function rounded(rootObject, name, size, mat, position, radius = .02, rotation = [0, 0, 0]) { return mesh(rootObject, name, new RoundedBoxGeometry(...size, 4, radius), mat, position, rotation); }
function cylinder(rootObject, name, radius, height, mat, position, rotation = [0, 0, 0], radial = 16) { return mesh(rootObject, name, new THREE.CylinderGeometry(radius, radius, height, radial), mat, position, rotation); }
function dispose(object) { const materials = new Set(); object.traverse(node => { node.geometry?.dispose(); if (node.material) for (const value of [node.material].flat()) materials.add(value); }); materials.forEach(value => value.dispose()); }
const promptTemplate = '为公司场景制作一份可运行3D外观资源。designId={{designId}}，造型方向={{styleDirection}}，目标规格={{targetProfileId}}@1。保持使用点、容量、位置、座高、接近/离开点、clearance、footprint、mount、surface 与状态语义。允许改变轮廓、构件、材质和显示节点映射。按米制、Y向上、局部+Z朝前导出GLB，记录可编辑参数、来源许可、工具版本、资源身份、GLB回读、边界/安装检查、节点映射和重复导出一致性。';
function productionPrompt(p) { return promptTemplate.replace('{{designId}}',p.designId).replace('{{styleDirection}}',p.styleDirection).replace('{{targetProfileId}}',p.type); }

function buildMonitor(p) {
  const rootObject = new THREE.Group(); rootObject.name = p.designId; rootObject.userData = {units:'metres', up:'+Y', forward:'+Z', designId:p.designId};
  const frame = material(p.frameColor, .4), trim = material(p.trimColor, .32), screen = material(p.screenColor, .22, p.emissive, p.onIntensity);
  const screenName = 'screen-surface';
  if (p.frame === 'halo') {
    rounded(rootObject,'halo-bezel',[.86,.54,.07],frame,[0,.39,0],.08);
    box(rootObject,screenName,[.74,.40,.012],screen,[0,.39,.041]);
    cylinder(rootObject,'split-stem',.035,.24,trim,[0,.12,0]); box(rootObject,'crescent-foot',[.46,.028,.24,],frame,[0,.014,.05]);
    cylinder(rootObject,'foot-rail',.04,.34,trim,[0,.04,.05],[0,0,Math.PI/2]);
  } else if (p.frame === 'ribbon') {
    box(rootObject,'ribbon-bezel',[.92,.50,.06],frame,[0,.38,0]);
    rounded(rootObject,screenName,[.76,.39,.014],screen,[0,.38,.04],.025);
    for (const x of [-.39,.39]) { cylinder(rootObject,`pylon-${x<0?'left':'right'}`,.032,.28,trim,[x,.14,0]); box(rootObject,`bridge-${x<0?'left':'right'}`,[.08,.04,.18],trim,[x,.03,.04]); }
    box(rootObject,'cable-bridge',[.64,.025,.035],trim,[0,.07,-.01]);
  } else if (p.frame === 'pillar') {
    box(rootObject,'pillar-bezel',[.84,.52,.065],frame,[0,.40,0]);
    box(rootObject,screenName,[.72,.39,.014],screen,[0,.40,.042]);
    for (const x of [-.44,.44]) { box(rootObject,`pillar-${x<0?'left':'right'}`,[.055,.48,.08],trim,[x,.40,0]); box(rootObject,`brace-${x<0?'left':'right'}`,[.12,.035,.08],trim,[x*.75,.13,0]); }
    box(rootObject,'weighted-plinth',[.5,.035,.28],frame,[0,.018,.06]); cylinder(rootObject,'plinth-spine',.045,.22,trim,[0,.13,0]);
  } else {
    box(rootObject,'slate-frame',[.82,.48,.045],frame,[0,.41,0]);
    rounded(rootObject,screenName,[.75,.40,.012],screen,[0,.41,.03],.02);
    box(rootObject,'v-support-left',[.035,.26,.035],trim,[-.17,.14,-.02],[0,0,-.28]);
    box(rootObject,'v-support-right',[.035,.26,.035],trim,[.17,.14,-.02],[0,0,.28]);
    box(rootObject,'v-support-foot',[.42,.028,.18],frame,[0,.014,.02]); cylinder(rootObject,'hinge',.035,.38,trim,[0,.14,-.02],[0,0,Math.PI/2]);
  }
  rootObject.updateMatrixWorld(true); return rootObject;
}

function buildLight(p) {
  const rootObject = new THREE.Group(); rootObject.name = p.designId; rootObject.userData = {units:'metres', up:'+Y', forward:'+Z', designId:p.designId};
  const frame = material(p.frameColor, .46), trim = material(p.trimColor, .34), diffuser = material(p.screenColor, .2, p.emissive, p.onIntensity);
  const d = 'diffuser-panel';
  if (p.frame === 'orbit') {
    cylinder(rootObject,'orbit-base',.18,.05,frame,[0,.025,0],[0,0,0],24); for (const x of [-.12,.12]) { cylinder(rootObject,`tripod-${x<0?'left':'right'}`,.018,1.72,trim,[x,.86,0],[0,0,x<0?.06:-.06]); cylinder(rootObject,`orbit-collar-${x<0?'left':'right'}`,.06,.08,trim,[x,1.70,.05],[0,0,Math.PI/2],16); }
    cylinder(rootObject,'orbit-yoke',.025,.38,trim,[0,1.68,.05],[0,0,Math.PI/2]); cylinder(rootObject,'orbit-ring',.045,.42,frame,[0,1.70,.05],[0,0,Math.PI/2],24);
    cylinder(rootObject,d,.09,.30,diffuser,[0,1.70,.05],[0,0,Math.PI/2],24);
  } else if (p.frame === 'wing') {
    box(rootObject,'wing-base',[.38,.05,.3],frame,[0,.025,0]); for (const x of [-.14,.14]) box(rootObject,`wing-leg-${x<0?'left':'right'}`,[.03,1.65,.03],trim,[x,.84,0],[0,0,x<0?.04:-.04]);
    box(rootObject,'wing-rail',[.36,.04,.04],trim,[0,1.66,-.02]); box(rootObject,'wing-shield',[.42,.36,.06],frame,[0,1.70,0],[.16,0,0]); box(rootObject,d,[.34,.27,.014],diffuser,[0,1.70,.05],[.16,0,0]);
    box(rootObject,'wing-hinge',[.05,.05,.20],trim,[0,1.68,-.08]);
  } else if (p.frame === 'column') {
    box(rootObject,'column-base',[.4,.045,.34],frame,[0,.0225,0]); box(rootObject,'column-body',[.13,1.64,.16],frame,[0,.82,-.04]);
    for (const x of [-.11,.11]) box(rootObject,`slot-rail-${x<0?'left':'right'}`,[.025,1.42,.04],trim,[x,.88,-.02]); box(rootObject,'column-cap',[.24,.06,.16],trim,[0,1.66,-.04]); box(rootObject,d,[.22,.72,.014],diffuser,[0,1.70,.05]);
  } else {
    box(rootObject,'panel-ballast',[.4,.055,.34],frame,[0,.0275,0]); box(rootObject,'panel-arm',[.04,1.64,.04],trim,[0,.82,-.04]);
    box(rootObject,'panel-crossbar',[.34,.05,.06],trim,[0,1.66,-.02]); box(rootObject,'panel-shield',[.42,.34,.07],frame,[0,1.70,-.02],[-.12,0,0]); box(rootObject,d,[.34,.25,.014],diffuser,[0,1.70,.05],[-.12,0,0]);
    box(rootObject,'hinge-left',[.07,.07,.1],trim,[-.16,1.68,-.02]); box(rootObject,'hinge-right',[.07,.07,.1],trim,[.16,1.68,-.02]);
  }
  rootObject.updateMatrixWorld(true); return rootObject;
}
function structuralCheck(object, p) {
  const box = name => { const node = object.getObjectByName(name); assert(node?.isMesh, `${p.designId} missing structural mesh ${name}`); return new THREE.Box3().setFromObject(node); };
  const touches = (left, right) => { const a=box(left).expandByScalar(.006), b=box(right).expandByScalar(.006); assert(a.intersectsBox(b), `${p.designId} structural gap between ${left} and ${right}`); };
  if (p.type === 'monitor') {
    touches('screen-surface', p.frame === 'halo' ? 'halo-bezel' : p.frame === 'ribbon' ? 'ribbon-bezel' : p.frame === 'pillar' ? 'pillar-bezel' : 'slate-frame');
    if (p.frame === 'halo') { touches('halo-bezel', 'split-stem'); touches('split-stem', 'crescent-foot'); }
    if (p.frame === 'ribbon') { touches('ribbon-bezel', 'pylon-left'); touches('ribbon-bezel', 'pylon-right'); }
    if (p.frame === 'pillar') { touches('pillar-bezel', 'pillar-left'); touches('pillar-bezel', 'pillar-right'); touches('pillar-bezel', 'plinth-spine'); touches('plinth-spine', 'weighted-plinth'); }
    if (p.frame === 'slate') { touches('slate-frame', 'v-support-left'); touches('slate-frame', 'v-support-right'); touches('v-support-left', 'v-support-foot'); }
  } else {
    touches('diffuser-panel', p.frame === 'orbit' ? 'orbit-ring' : p.frame === 'wing' ? 'wing-shield' : p.frame === 'column' ? 'column-body' : 'panel-shield');
    if (p.frame === 'orbit') { touches('tripod-left', 'orbit-collar-left'); touches('tripod-right', 'orbit-collar-right'); touches('orbit-collar-left', 'orbit-ring'); touches('orbit-collar-right', 'orbit-ring'); touches('tripod-left', 'orbit-base'); }
    if (p.frame === 'wing') { touches('wing-leg-left', 'wing-rail'); touches('wing-leg-right', 'wing-rail'); touches('wing-rail', 'wing-hinge'); touches('wing-hinge', 'wing-shield'); }
    if (p.frame === 'column') { touches('column-base', 'column-body'); touches('column-body', 'column-cap'); }
    if (p.frame === 'panel') { touches('panel-ballast', 'panel-arm'); touches('panel-arm', 'panel-crossbar'); touches('panel-crossbar', 'hinge-left'); touches('panel-crossbar', 'hinge-right'); touches('hinge-left', 'panel-shield'); }
  }
}
function frontSurfaceCheck(object, p) {
  if (p.type !== 'fill-light') return;
  const diffuser = object.getObjectByName('diffuser-panel'); assert(diffuser?.isMesh, `${p.designId} missing diffuser panel`);
  const bounds = new THREE.Box3().setFromObject(diffuser), hits = [];
  for (const x of [bounds.min.x * .55 + bounds.max.x * .45, (bounds.min.x + bounds.max.x) / 2, bounds.min.x * .45 + bounds.max.x * .55]) {
    for (const y of [bounds.min.y * .55 + bounds.max.y * .45, (bounds.min.y + bounds.max.y) / 2, bounds.min.y * .45 + bounds.max.y * .55]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1));
      const first = ray.intersectObject(object, true).find(hit => hit.object.isMesh);
      assert(first?.object === diffuser, `${p.designId} +Z diffuser sample is occluded by ${first?.object?.name || 'empty space'}`);
      hits.push({x, y, first: first.object.name});
    }
  }
  return hits;
}

function verifyContract(resource, reference, type) {
  for (const key of ['category','mountRole','mount','stateDefaults']) assert.deepEqual(resource[key], reference[key], `${type} ${key} changed`);
  assert.deepEqual(resource.footprint ?? null, reference.footprint ?? null, `${type} footprint changed`);
  assert.deepEqual(resource.coordinates, reference.coordinates, `${type} coordinates changed`);
  if (type === 'monitor') assert.deepEqual(resource.display.screen.nodes, ['screen-surface']);
  if (type === 'fill-light') { assert.deepEqual(resource.light, reference.light); assert.deepEqual(resource.display.screen.nodes, ['diffuser-panel']); }
}
async function exportGlb(object) { try { return Buffer.from(await new GLTFExporter().parseAsync(object,{binary:true,animations:[],copyright:'Project-authored company device collection. No external art assets.'})); } finally { dispose(object); } }
async function readback(bytes, resource, expectedNames) {
  assert.equal(bytes.readUInt32LE(0),0x46546c67); assert.equal(bytes.readUInt32LE(4),2); assert.equal(bytes.readUInt32LE(8),bytes.length);
  const json = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8')); assert.equal(json.asset.version,'2.0'); assert(!json.skins?.length && !json.animations?.length); assert(!json.images?.length); assert(json.buffers.every(item=>item.uri===undefined));
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''); const scene = loaded.scene; scene.updateMatrixWorld(true); const bounds = new THREE.Box3().setFromObject(scene); const names=[]; scene.traverse(node=>{ if(node.isMesh){ names.push(node.name); const pos=node.geometry.getAttribute('position'); assert(pos?.count); for(let i=0;i<pos.count;i++) for(const v of [pos.getX(i),pos.getY(i),pos.getZ(i)]) assert(Number.isFinite(v)); }});
  for(const name of expectedNames) assert(scene.getObjectByName(name)?.isMesh,`Missing mesh ${name}`); assert(bounds.min.y>=-1e-6, 'Model must rest on ground/support plane');
  if(resource.id.startsWith('monitor-')) { assert(bounds.max.x<.6 && bounds.min.x>-.6 && bounds.max.z<.3 && bounds.min.z>-.3, 'Monitor exceeds desk support envelope'); }
  else assert(bounds.max.x<=.22+.001 && bounds.min.x>=-.22-.001 && bounds.max.z<=.2+.001 && bounds.min.z>=-.2-.001, 'Light exceeds blocking footprint');
  let frontSurfaceHits=[];
  if (resource.id.startsWith('fill-light-')) {
    const diffuser=scene.getObjectByName('diffuser-panel'); assert(diffuser?.isMesh); const diffuserBounds=new THREE.Box3().setFromObject(diffuser);
    for(const x of [diffuserBounds.min.x*.55+diffuserBounds.max.x*.45,(diffuserBounds.min.x+diffuserBounds.max.x)/2,diffuserBounds.min.x*.45+diffuserBounds.max.x*.55]) for(const y of [diffuserBounds.min.y*.55+diffuserBounds.max.y*.45,(diffuserBounds.min.y+diffuserBounds.max.y)/2,diffuserBounds.min.y*.45+diffuserBounds.max.y*.55]) { const first=new THREE.Raycaster(new THREE.Vector3(x,y,2),new THREE.Vector3(0,0,-1)).intersectObject(scene,true).find(hit=>hit.object.isMesh); assert(first?.object===diffuser,`${resource.id} readback +Z sample is occluded by ${first?.object?.name||'empty space'}`); frontSurfaceHits.push(first.object.name); }
  }
  return {meshCount:names.length,nodeNames:names,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},externalUris:0,skins:json.skins?.length||0,animations:json.animations?.length||0,frontSurfaceHits};
}

const records=[]; const allCandidates = [...source.screens.map(p=>({...p,type:'monitor',reference:monitorContract})), ...source.lights.map(p=>({...p,type:'fill-light',reference:lightContract}))];
const only = process.argv.find(value => value.startsWith('--only='))?.slice('--only='.length);
const all = only ? allCandidates.filter(candidate => candidate.designId === only) : allCandidates;
if (only) assert(all.length === 1, `Unknown --only designId ${only}`);
const checkMode = process.argv.includes('--check');
async function emit(url, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (checkMode) assert((await fs.readFile(url)).equals(bytes), `Output differs ${url.pathname}`);
  else { await fs.mkdir(new URL('./', url), {recursive:true}); await fs.writeFile(url, bytes); }
}
for(const p of all) {
  const object = p.type==='monitor' ? buildMonitor(p) : buildLight(p); structuralCheck(object,{...p,type:p.type}); const frontHits = frontSurfaceCheck(object,{...p,type:p.type}); const bytes=await exportGlb(object); const repeatObject=p.type==='monitor'?buildMonitor(p):buildLight(p); structuralCheck(repeatObject,{...p,type:p.type}); frontSurfaceCheck(repeatObject,{...p,type:p.type}); const repeat=await exportGlb(repeatObject); assert(bytes.equals(repeat),`${p.designId} export is not deterministic`);
  const names=p.type==='monitor'?['screen-surface']:['diffuser-panel']; const probe = await readback(bytes,{id:p.type==='monitor'?`monitor-${p.designId}`:`fill-light-${p.designId}`},names);
  if (p.type === 'fill-light') probe.frontSurfaceHits = frontHits;
  const id = p.designId; const isMonitor=p.type==='monitor'; const contractPath=isMonitor?monitorContractPath:lightContractPath; const resource={id,version:1,category:p.reference.category,mountRole:p.reference.mountRole,provenance:{license:source.license,tools:[`Three.js ${THREE.REVISION}`,'BoxGeometry','RoundedBoxGeometry','CylinderGeometry','GLTFExporter','GLTFLoader readback'],sourceParameters:sourcePath,sourceParametersSha256:hash(sourceBytes),functionalContractSource:contractPath,functionalContractSourceSha256:isMonitor?monitorContractSha256:lightContractSha256,reference:{catalog:`prototype/src/company/library-catalog.json#${p.type}@1`,catalogResourceSha256:isMonitor?monitorCatalogReferenceSha256:lightCatalogReferenceSha256},generator:'scripts/company-platform/build-device-collection.mjs',generatorSha256,designId:id,method:p.styleDirection},coordinates:p.reference.coordinates,stateDefaults:structuredClone(p.reference.stateDefaults),mount:p.reference.mount,footprint:structuredClone(p.reference.footprint ?? null),materialSlots:p.type==='monitor'?{'screen-surface':['screen-surface']}:{'diffuser-panel':['diffuser-panel']},display:{screen:{nodes:names,onColor:p.screenColor,offColor:p.offColor,emissive:p.emissive,onIntensity:p.onIntensity}},asset:{format:'glb',url:`/company-assets/device-collection/${id}/v1/model.glb`,sha256:hash(bytes),bytes:bytes.length}};
  if(p.type==='fill-light') resource.light=structuredClone(p.reference.light); verifyContract(resource,p.reference,p.type); const parameter={...p}; delete parameter.reference; parameter.type=p.type; parameter.productionPrompt=productionPrompt(p);
  const folder=new URL(`prototype/public/company-assets/device-collection/${id}/v1/`,root), sourceFolder=new URL(`assets-source/company-device-collection/${id}/`,root), evidenceFolder=new URL(`evidence/company-device-collection-v1/${id}/`,root); await Promise.all([fs.mkdir(folder,{recursive:true}),fs.mkdir(sourceFolder,{recursive:true}),fs.mkdir(evidenceFolder,{recursive:true})]);
  const parameterBytes=Buffer.from(JSON.stringify(parameter,null,2)+'\n'); await emit(new URL('parameters.json',sourceFolder),parameterBytes); await emit(new URL('model.glb',folder),bytes); await emit(new URL('resource.json',folder),JSON.stringify(resource,null,2)+'\n');
  const report={status:'passed',designId:id,type:p.type,styleDirection:p.styleDirection,productionPrompt:productionPrompt(p),sourceParameters:`assets-source/company-device-collection/${id}/parameters.json`,sourceParametersSha256:hash(parameterBytes),functionalContract:{reference:`${p.type}@1`,source:contractPath,sourceSha256:p.type==='monitor'?monitorContractSha256:lightContractSha256,compatible:true,stateDefaultsEqual:true,mountEqual:true,footprintEqual:true},displayMapping:resource.display,asset:{url:resource.asset.url,sha256:resource.asset.sha256,bytes:resource.asset.bytes,repeatedExportByteIdentical:true,readback:probe},limitations:['CPU GLB readback only. Browser visual and runtime state mapping await root integration.','Project-authored solid-color geometry with no external art license.']}; await emit(new URL('report.json',evidenceFolder),JSON.stringify(report,null,2)+'\n'); records.push({id,version:1,type:p.type,designId:id,resourcePath:`prototype/public/company-assets/device-collection/${id}/v1/resource.json`,modelPath:`prototype/public/company-assets/device-collection/${id}/v1/model.glb`,sourcePath:`assets-source/company-device-collection/${id}/parameters.json`,evidencePath:`evidence/company-device-collection-v1/${id}/report.json`,sha256:resource.asset.sha256,bytes:resource.asset.bytes,meshCount:probe.meshCount,display:resource.display,contract:`${p.type}@1`});
}
let collectionResources = records;
if (only) {
  try {
    const previous = JSON.parse(await fs.readFile(new URL('assets-source/company-device-collection/collection.json', root)));
    const replacements = new Map(records.map(record => [record.id, record]));
    collectionResources = previous.resources.map(record => replacements.get(record.id) || record);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const collection={schemaVersion:1,generatedAt:'2026-11-16',generator:'scripts/company-platform/build-device-collection.mjs',generatorSha256,sourceParameters:sourcePath,sourceParametersSha256:hash(sourceBytes),productionPromptTemplate:promptTemplate,contracts:{monitor:monitorContractPath,fillLight:lightContractPath},catalogReferences:{monitor:'prototype/src/company/library-catalog.json#monitor@1',fillLight:'prototype/src/company/library-catalog.json#fill-light@1'},resources:collectionResources,verification:{cpuOnly:true,glbReadback:true,repeatedExportsByteIdentical:true,stateMappingProvided:true,publicRuntimeIntegration:'pending root render.js integration'}};
const evidenceRoot=new URL('evidence/company-device-collection-v1/',root); await emit(new URL('collection.json',evidenceRoot),JSON.stringify(collection,null,2)+'\n');
await emit(new URL('assets-source/company-device-collection/collection.json',root),JSON.stringify(collection,null,2)+'\n');
console.log(JSON.stringify({status:'passed',mode:process.argv.includes('--check')?'check':'build',resources:records.map(x=>({id:x.id,sha256:x.sha256,bytes:x.bytes,meshCount:x.meshCount}))}));
