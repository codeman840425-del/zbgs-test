import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {RoundedBoxGeometry} from '../../prototype/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

globalThis.FileReader ??= class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({target: this}); }).catch(error => this.onerror?.(error)); } };
const root = new URL('../../', import.meta.url);
const sourcePath = 'assets-source/company-laptop-computer-v1/parameters.json';
const contractPath = 'assets-source/company-laptop-computer-v1/contracts/laptop-computer.json';
const branchPath = 'assets-source/company-environment-specs-v1/branches.json';
const generatorPath = 'scripts/company-platform/build-laptop-computer-collection.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = await fs.readFile(new URL(sourcePath, root));
const source = JSON.parse(sourceBytes);
const contractBytes = await fs.readFile(new URL(contractPath, root));
const contract = JSON.parse(contractBytes);
const branchBytes = await fs.readFile(new URL(branchPath, root));
const branches = JSON.parse(branchBytes);
const generatorHash = hash(await fs.readFile(new URL(generatorPath, root)));
const branch = branches.groups.flatMap(group => group.branches ?? []).find(candidate => candidate.id === 'laptop-computer');
assert(branch, 'environment laptop-computer branch is required');
assert.equal(source.designs.length, 4);
assert.equal(contract.mount, 'desk-surface');
assert.equal(contract.parent, 'desk.desktop');
assert.deepEqual(contract.mounting, {width:0.55,height:0.04,depth:0.38,origin:'desk contact plane centred under the asset'});

const material = (color, roughness=0.45, metalness=0.08) => new THREE.MeshStandardMaterial({color, roughness, metalness});
const mesh = (parent, name, geometry, mat, position=[0,0,0], rotation=[0,0,0]) => { const item = new THREE.Mesh(geometry, mat); item.name=name; item.position.fromArray(position); item.rotation.fromArray(rotation); item.castShadow=true; item.receiveShadow=true; parent.add(item); return item; };
const box = (p,n,s,m,pos,rot=[0,0,0]) => mesh(p,n,new THREE.BoxGeometry(...s),m,pos,rot);
const rounded = (p,n,s,m,pos,r=0.008,rot=[0,0,0]) => mesh(p,n,new RoundedBoxGeometry(...s,4,r),m,pos,rot);
function rootGroup(id) { const g=new THREE.Group(); g.name=id; g.userData={units:'metres',up:'+Y',forward:'+Z',branch:'laptop-computer',mount:'desk-surface',origin:'desk contact plane'}; return g; }
function addPorts(g,m) {
  box(g,'power-port-back',[0.08,0.04,0.006],m,[0,0.02,-0.187]);
  box(g,'usb-frame-left',[0.004,0.012,0.002],m,[-0.022,0.014,-0.188]);
  box(g,'usb-frame-right',[0.004,0.012,0.002],m,[0.022,0.014,-0.188]);
  box(g,'usb-frame-top',[0.04,0.003,0.002],m,[0,0.021,-0.188]);
  box(g,'usb-frame-bottom',[0.04,0.003,0.002],m,[0,0.007,-0.188]);
}
function addHinges(g,m) { box(g,'hinge-left',[0.07,0.012,0.018],m,[-0.12,0.027,-0.12]); box(g,'hinge-right',[0.07,0.012,0.018],m,[0.12,0.027,-0.12]); }
function model(design) {
  const g=rootGroup(design.designId), mats={body:material(design.frameColor,0.5,0.12),accent:material(design.accentColor,0.3,0.2),detail:material(design.detailColor,0.3,0.16),screen:material(design.screenColor,0.2,0.35),status:material(design.statusColor,0.22,0.3)};
  rounded(g,'laptop-body',[0.52,0.018,0.34],mats.body,[0,0.009,0.015], design.variant==='rugged-laptop'?0.018:0.009);
  box(g,'laptop-accent',[0.48,0.004,0.028],mats.accent,[0,0.020,0.158]);
  box(g,'laptop-detail',[0.44,0.003,0.02],mats.detail,[0,0.021,-0.145]);
  box(g,'screen-surface',[0.43,0.003,0.205],mats.screen,[0,0.024,-0.015]);
  box(g,'screen-bezel',[0.47,0.002,0.225],mats.detail,[0,0.022,-0.015]);
  box(g,'power-status',[0.018,0.004,0.008],mats.status,[0.18,0.025,0.164]);
  addHinges(g,mats.accent); addPorts(g,mats.detail);
  if (design.variant==='slim-laptop') {
    box(g,'keyboard-deck',[0.31,0.003,0.11],mats.detail,[0,0.023,0.045]);
    for (const x of [-0.11,-0.055,0,0.055,0.11]) box(g,`key-row-${x}`,[0.035,0.002,0.012],mats.accent,[x,0.026,0.045]);
    box(g,'trackpad',[0.11,0.002,0.065],mats.accent,[0,0.026,0.112]);
  } else if (design.variant==='dual-screen-laptop') {
    box(g,'screen-surface-left',[0.205,0.004,0.19],mats.screen,[-0.113,0.029,-0.015]);
    box(g,'screen-surface-right',[0.205,0.004,0.19],mats.screen,[0.113,0.029,-0.015]);
    box(g,'screen-divider',[0.008,0.006,0.2],mats.accent,[0,0.028,-0.015]);
    box(g,'keyboard-deck',[0.34,0.003,0.08],mats.detail,[0,0.026,0.095]);
    box(g,'trackpad',[0.14,0.002,0.04],mats.accent,[0,0.029,0.145]);
  } else if (design.variant==='rugged-laptop') {
    for (const x of [-0.22,-0.11,0,0.11,0.22]) box(g,`rib-${x}`,[0.012,0.004,0.27],mats.accent,[x,0.025,0.01]);
    for (const x of [-0.245,0.245]) for (const z of [-0.135,0.16]) rounded(g,`corner-guard-${x}-${z}`,[0.026,0.01,0.026],mats.accent,[x,0.023,z],0.006);
    box(g,'keyboard-deck',[0.32,0.003,0.09],mats.detail,[0,0.027,0.08]);
    box(g,'trackpad',[0.12,0.002,0.045],mats.accent,[0,0.029,0.145]);
    box(g,'side-status',[0.008,0.006,0.028],mats.status,[0.257,0.027,0.01]);
  } else {
    box(g,'touch-surface',[0.4,0.004,0.22],mats.screen,[0,0.028,-0.012]);
    box(g,'keyboard-strip',[0.43,0.003,0.045],mats.detail,[0,0.028,0.148]);
    box(g,'hinge-rail-left',[0.09,0.006,0.014],mats.accent,[-0.16,0.031,-0.118]);
    box(g,'hinge-rail-right',[0.09,0.006,0.014],mats.accent,[0.16,0.031,-0.118]);
  }
  g.updateMatrixWorld(true); return g;
}
function dispose(object) { const materials=new Set(); object.traverse(node=>{node.geometry?.dispose(); if(node.material) for(const item of [node.material].flat()) materials.add(item);}); materials.forEach(item=>item.dispose()); }
async function exportGlb(object) { try { return Buffer.from(await new GLTFExporter().parseAsync(object,{binary:true,animations:[],copyright:'Project-authored laptop-computer collection.'})); } finally { dispose(object); } }
async function inspectGlb(bytes,design) {
  assert.equal(bytes.readUInt32LE(0),0x46546c67); assert.equal(bytes.readUInt32LE(4),2); assert.equal(bytes.readUInt32LE(8),bytes.length);
  const jsonLength=bytes.readUInt32LE(12), document=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  assert(!document.images?.length); assert(document.buffers.every(item=>item.uri===undefined));
  const loaded=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''); const scene=loaded.scene; scene.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(scene), names=[], geometryHash=createHash('sha256'); let triangles=0;
  scene.traverse(node=>{if(!node.isMesh)return; names.push(node.name); const position=node.geometry.getAttribute('position'); assert(position?.count,`${design.designId} empty mesh ${node.name}`); triangles+=(node.geometry.index?.count??position.count)/3; geometryHash.update(Buffer.from(position.array.buffer,position.array.byteOffset,position.array.byteLength)); for(let i=0;i<position.count;i++) for(const v of [position.getX(i),position.getY(i),position.getZ(i)]) assert(Number.isFinite(v));});
  for(const required of ['laptop-body','laptop-accent','laptop-detail','screen-surface','power-status','hinge-left','hinge-right','power-port-back','usb-frame-left','usb-frame-right','usb-frame-top','usb-frame-bottom']) assert(scene.getObjectByName(required)?.isMesh,`${design.designId} missing ${required}`);
  assert(bounds.min.y>=-0.000001&&bounds.max.y<=0.041); assert(bounds.min.x>=-0.276&&bounds.max.x<=0.276); assert(bounds.min.z>=-0.191&&bounds.max.z<=0.191);
  return {meshCount:names.length,triangles,nodeNames:names,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},geometrySha256:geometryHash.digest('hex')};
}
async function emit(url,bytes,check) { if(check) assert((await fs.readFile(url)).equals(bytes),`Output differs ${url.pathname}`); else {await fs.mkdir(new URL('./',url),{recursive:true}); await fs.writeFile(url,bytes);} }
const checkMode=process.argv.includes('--check'), records=[];
for(const design of source.designs){
  const bytes=await exportGlb(model(design)), repeated=await exportGlb(model(design)); assert(bytes.equals(repeated),`${design.designId} export is not deterministic`); const probe=await inspectGlb(bytes,design);
  const parameter=Buffer.from(JSON.stringify({...design,type:'laptop-computer',productionPrompt:`为公司场景制作 ${design.label}，保持 desk-surface 承载、固定包络、开合铰链和可见显示/电源状态端点。`},null,2)+'\n');
  const resource={id:design.designId,displayName:design.label,version:1,category:contract.category,mountRole:contract.mountRole,productionBranch:contract.productionBranch,mount:contract.mount,parent:contract.parent,mounting:structuredClone(contract.mounting),coordinates:structuredClone(contract.coordinates),footprint:structuredClone(contract.footprint),usePoints:[],stateDefaults:structuredClone(contract.stateDefaults),stateSchema:structuredClone(contract.stateSchema),stateSemantics:structuredClone(contract.stateSemantics),materialSlots:structuredClone(contract.materialSlots),powerStatusEndpoint:structuredClone(contract.powerStatusEndpoint),cablePorts:structuredClone(contract.cablePorts),cablePortNodes:structuredClone(contract.cablePortNodes),provenance:{license:source.license,tools:[`Three.js ${THREE.REVISION}`,'BoxGeometry','RoundedBoxGeometry','GLTFExporter','GLTFLoader readback'],sourceParameters:sourcePath,sourceParametersSha256:hash(sourceBytes),functionalContractSource:contractPath,functionalContractSourceSha256:hash(contractBytes),environmentBranchSource:branchPath,environmentBranch:'laptop-computer',environmentBranchSourceSha256:hash(branchBytes),generator:generatorPath,generatorSha256:generatorHash,designId:design.designId,method:design.style},asset:{format:'glb',url:`/company-assets/laptop-computer-v1/laptop-computer/${design.designId}/v1/model.glb`,sha256:hash(bytes),bytes:bytes.length},checks:{...probe,repeatedExportByteIdentical:true,gltfReadback:true,cpuOnly:true},display:{status:{stateField:'on',nodes:['power-status'],onColor:design.statusColor,offColor:'#20252b',emissive:design.statusColor,onIntensity:1.2},hinge:{stateField:'open',nodes:['hinge-left','hinge-right']}}};
  for(const names of Object.values(resource.materialSlots)) for(const name of names) assert(probe.nodeNames.includes(name));
  const base=`prototype/public/company-assets/laptop-computer-v1/laptop-computer/${design.designId}/v1/`,src=`assets-source/company-laptop-computer-v1/laptop-computer/${design.designId}/`,evidence=`evidence/company-laptop-computer-v1/${design.designId}/`;
  const report={status:'passed',designId:design.designId,displayName:design.label,style:design.style,sourceParameters:`${src}parameters.json`,sourceParametersSha256:hash(parameter),functionalContract:{id:'laptop-computer@1',source:contractPath,sha256:hash(contractBytes),mount:contract.mount,parent:contract.parent,powerStatusEndpoint:resource.powerStatusEndpoint},asset:resource.asset,checks:resource.checks,limitations:['CPU GLB export and GLTFLoader readback only.','No operating-system behavior, live hinge animation, cable routing or character use.','Fixed closed-installation envelope is verified.']};
  await emit(new URL(base+'model.glb',root),bytes,checkMode); await emit(new URL(base+'resource.json',root),Buffer.from(JSON.stringify(resource,null,2)+'\n'),checkMode); await emit(new URL(src+'parameters.json',root),parameter,checkMode); await emit(new URL(evidence+'report.json',root),Buffer.from(JSON.stringify(report,null,2)+'\n'),checkMode);
  records.push({id:resource.id,version:1,type:'laptop-computer',resourcePath:`${base}resource.json`,modelPath:`${base}model.glb`,sourcePath:`${src}parameters.json`,evidencePath:`${evidence}report.json`,sha256:resource.asset.sha256,bytes:resource.asset.bytes,meshCount:probe.meshCount,triangles:probe.triangles,geometrySha256:probe.geometrySha256,contract:'laptop-computer@1'});
}
assert.equal(new Set(records.map(r=>r.geometrySha256)).size,4,'laptop geometries must differ');
const collection={schemaVersion:1,id:'company-laptop-computer-v1',generatedAt:'2026-11-17',generator:generatorPath,generatorSha256:generatorHash,sourceParameters:sourcePath,sourceParametersSha256:hash(sourceBytes),environmentBranchSource:branchPath,environmentBranch:'laptop-computer',environmentBranchMount:contract.mount,environmentBranchSourceSha256:hash(branchBytes),contract:contractPath,contractSha256:hash(contractBytes),resources:records,verification:{cpuOnly:true,glbReadback:true,repeatedExportsByteIdentical:true,geometryHashesDistinct:true,envelopeAndDeskContactChecks:true,visiblePowerStatusEndpoint:true,hingeAndDisplayStateNodes:true,roleBoundary:'No operating-system behavior, cable routing or character use'},limitations:['Static display asset only. Hinge and display state are data contracts for later runtime integration.','No library-catalog.json or facility-catalog.json update is made by this package.']};
const collectionBytes=Buffer.from(JSON.stringify(collection,null,2)+'\n'); await emit(new URL('assets-source/company-laptop-computer-v1/collection.json',root),collectionBytes,checkMode); await emit(new URL('evidence/company-laptop-computer-v1/collection.json',root),collectionBytes,checkMode); console.log(JSON.stringify({status:'passed',mode:checkMode?'check':'build',resources:records.map(r=>({id:r.id,sha256:r.sha256,bytes:r.bytes,meshCount:r.meshCount,triangles:r.triangles,geometrySha256:r.geometrySha256}))}));
