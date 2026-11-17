import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { validateCeilingAcousticGeometry } from '../../prototype/src/company/ceiling-acoustic-geometry.js';

globalThis.FileReader ??= class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); }).catch(error => this.onerror?.(error)); } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_PATH = 'assets-source/company-ceiling-acoustic-v1/parameters.json';
const GENERATOR_PATH = 'scripts/company-platform/build-ceiling-acoustic.mjs';
const CONTRACT_PATH = 'docs/COMPANY-CEILING-ACOUSTIC-CONTRACT-v1.txt';
const GEOMETRY_PATH = 'prototype/src/company/ceiling-acoustic-geometry.js';
const DEFAULT_OUTPUT = 'prototype/public/company-assets/ceiling-acoustic-v1';
const IDS = ['ceiling-acoustic-cloud', 'ceiling-acoustic-linear', 'ceiling-acoustic-felt', 'ceiling-acoustic-timber-grid'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const material = (color, roughness = .75) => new THREE.MeshStandardMaterial({ color, roughness, metalness: .04, transparent: false, opacity: 1 });
const box = (root, name, size, mat, position) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat); mesh.name = name; mesh.position.fromArray(position); root.add(mesh); return mesh; };
const dispose = object => { const materials = new Set(); object.traverse(node => { node.geometry?.dispose(); if (node.material) materials.add(node.material); }); materials.forEach(item => item.dispose()); };
const fail = (code, location, message, details) => { throw Object.assign(new Error(`${code} at ${location}: ${message}`), { code, path: location, details }); };

function validateSource(source){
  assert.deepEqual(Object.keys(source).sort(),['id','version','common','designs','promptStandard','dependencyPins'].sort());
  assert.equal(source.id,'company-ceiling-acoustic-v1');assert.equal(source.version,1);
  assert.deepEqual(source.common,{units:'metres',up:'+Y',forward:'+Z',origin:'Ceiling mounting plane centre',
    mounting:{origin:'top',width:1.2,height:.3,depth:.4},footprint:{center:[0,0],halfSize:[.6,.2],blocking:false},
    pads:{x:.42,z:.12,width:.05,height:.02,depth:.05},rod:{width:.025,depth:.025},limits:{maxMeshes:60,maxTriangles:1500,maxMaterials:4}});
  assert.deepEqual(source.designs.map(d=>d.id),IDS);assert(typeof source.promptStandard==='string'&&source.promptStandard.length>100);
  assert.deepEqual(source.dependencyPins,{});
  const ranges=[{width:[.96,1.18],depth:[.3,.38],thickness:[.06,.06]},
    {barWidth:[.96,1.18],barDepth:[.06,.12],barThickness:[.06,.06]},
    {finCount:[4,8],finWidth:[.04,.08],finDepth:[.18,.24],finHeight:[.22,.22],railThickness:[.025,.025]},
    {backWidth:[.96,1.18],backHeight:[.24,.24],backThickness:[.025,.04],slatWidth:[.025,.06],slatDepth:[.025,.05]}];
  source.designs.forEach((d,i)=>{
    assert.deepEqual(Object.keys(d).sort(),['id','label','prompt','parameters'].sort());assert(typeof d.label==='string'&&d.label&&typeof d.prompt==='string'&&d.prompt);
    assert.deepEqual(Object.keys(d.parameters).sort(),Object.keys(ranges[i]).sort());
    for(const [k,v]of Object.entries(d.parameters)){const [lo,hi]=ranges[i][k];assert(Number.isFinite(v)&&v>=lo&&v<=hi,`${d.id}.${k} outside supported range`);}
    if(d.parameters.finCount!==undefined)assert(Number.isInteger(d.parameters.finCount));
  });
}

function rods(root, common, topY, mat) {
  const labels = [['left-front', -.42, .12], ['right-front', .42, .12], ['left-back', -.42, -.12], ['right-back', .42, -.12]];
  for (const [label, x, z] of labels) {
    box(root, `ceiling-rod-${label}`, [common.rod.width, -.02 - topY, common.rod.depth], mat, [x, (topY - .02) / 2, z]);
  }
}
function pads(root, common, mat) {
  for (const [label, x, z] of [['left-front', -.42, .12], ['right-front', .42, .12], ['left-back', -.42, -.12], ['right-back', .42, -.12]]) box(root, `ceiling-pad-${label}`, [common.pads.width, common.pads.height, common.pads.depth], mat, [x, -.01, z]);
}
function create(design, common, override = {}) {
  const root = new THREE.Group(); root.name = design.id; root.userData = { units: 'metres', up: '+Y', forward: '+Z', origin: common.origin, sourceVersion: 1, productionBranch: 'ceiling-acoustic-baffle' };
  const panel = material('#d7d0c3', .86); const frame = material('#6d6559', .74); const wood = material('#996842', .82);
  pads(root, common, frame);
  const p = { ...design.parameters, ...override };
  if (design.id === 'ceiling-acoustic-cloud') {
    box(root, 'cloud-panel', [p.width, p.thickness, p.depth], panel, [0, -.27, 0]); rods(root, common, -.24, frame);
  } else if (design.id === 'ceiling-acoustic-linear') {
    for (const [index, z] of [-.12, .12].entries()) box(root, `linear-bar-${index + 1}`, [p.barWidth, p.barThickness, p.barDepth], panel, [0, -.27, z]); rods(root, common, -.24, frame);
  } else if (design.id === 'ceiling-acoustic-felt') {
    box(root, 'felt-top-rail', [1.0, p.railThickness, .25], frame, [0, -.0925, 0]);
    const start = -(p.finCount - 1) * (p.finWidth + .025) / 2;
    for (let i = 0; i < p.finCount; i++) box(root, `felt-fin-${i + 1}`, [p.finWidth, p.finHeight, p.finDepth], panel, [start + i * (p.finWidth + .025), -.19, 0]);
    rods(root, common, -.08, frame);
  } else if (design.id === 'ceiling-acoustic-timber-grid') {
    box(root, 'timber-backing', [p.backWidth, p.backHeight, p.backThickness], wood, [0, -.18, -.08]);
    box(root, 'timber-top-rail', [1.0, .03, .3], wood, [0, -.045, 0]);
    for (const [index, x] of [-.38, -.19, 0, .19, .38].entries()) box(root, `timber-vertical-${index + 1}`, [p.slatWidth, .24, p.slatDepth], wood, [x, -.18, .02]);
    for (const [index, y] of [-.27, -.18, -.09].entries()) box(root, `timber-horizontal-${index + 1}`, [.96, .03, p.slatDepth], wood, [0, y, .02]);
    rods(root, common, -.06, wood);
  }
  root.updateMatrixWorld(true); return root;
}
async function exportGlb(object, id) { try { return Buffer.from(await new GLTFExporter().parseAsync(object, { binary: true, animations: [], copyright: `Project-authored ceiling acoustic baffle ${id}. No external art assets.` })); } finally { dispose(object); } }
async function parse(bytes) { return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''); }
function resourceFor(design, bytes, hashes, output) {
  return { id: design.id, displayName: design.label, version: 1, category: 'decor', mountRole: 'ceiling-acoustic-baffle', productionBranch: 'ceiling-acoustic-baffle', mount: 'ceiling', mounting: { origin: 'top', width: 1.2, height: .3, depth: .4 }, coordinates: { units: 'metres', up: '+Y', forward: '+Z', origin: 'Ceiling mounting plane centre', scale: 'Identity only' }, footprint: { center: [0, 0], halfSize: [.6, .2], blocking: false }, stateDefaults: {}, usePoints: [], provenance: { license: 'Project-authored procedural geometry and solid-color materials. No external art assets.', sourceDesign: design.id.replace('ceiling-acoustic-', ''), method: design.prompt, sourceParameters: SOURCE_PATH, sourceParametersSha256: hashes.source, generator: GENERATOR_PATH, generatorSha256: hashes.generator, functionalContractSource: CONTRACT_PATH, functionalContractSourceSha256: hashes.contract, dependencies: { geometryValidator: { path: GEOMETRY_PATH, sha256: hashes.geometry } } }, asset: { format: 'glb', url: `/company-assets/ceiling-acoustic-v1/${design.id}/v1/model.glb`, sha256: sha256(bytes), bytes: bytes.length } };
}

async function main() {
  assert(process.argv.slice(2).every(a=>a==='--check'||a.startsWith('--output=')||a.startsWith('--cloud-width=')),'Unsupported production argument');
  const check = process.argv.includes('--check');
  const outputArg = process.argv.find(arg => arg.startsWith('--output='));
  const output = outputArg ? outputArg.slice('--output='.length) : DEFAULT_OUTPUT;
  const cloudArg = process.argv.find(arg => arg.startsWith('--cloud-width='));
  const cloudWidth = cloudArg ? Number(cloudArg.slice('--cloud-width='.length)) : undefined;
  const source = JSON.parse(await fs.readFile(path.join(ROOT, SOURCE_PATH), 'utf8'));
  if(cloudWidth!==undefined)source.designs[0].parameters.width=cloudWidth;
  validateSource(source);
  const hashes = { source: sha256(await fs.readFile(path.join(ROOT, SOURCE_PATH))), generator: sha256(await fs.readFile(path.join(ROOT, GENERATOR_PATH))), contract: sha256(await fs.readFile(path.join(ROOT, CONTRACT_PATH))), geometry: sha256(await fs.readFile(path.join(ROOT, GEOMETRY_PATH))) };
  const resources = [],files=new Map();
  for (const design of source.designs) {
    const override = design.id === 'ceiling-acoustic-cloud' && cloudWidth !== undefined ? { width: cloudWidth } : {};
    const bytes = await exportGlb(create(design, source.common, override), design.id);
    const resource = resourceFor(design, bytes, hashes, output);
    const loaded = await parse(bytes);
    try{validateCeilingAcousticGeometry(loaded.scene, resource, fail);}finally{dispose(loaded.scene);}
    resources.push(resource);
    files.set(`${design.id}/v1/model.glb`,bytes);files.set(`${design.id}/v1/resource.json`,jsonBytes(resource));
  }
  files.set('resources.json',jsonBytes({schemaVersion:1,branch:'ceiling-acoustic-baffle',resources}));
  files.set('collection.json',jsonBytes({id:source.id,version:source.version,category:'decor',provenance:{sourceParameters:SOURCE_PATH,sourceParametersSha256:hashes.source,generator:GENERATOR_PATH,generatorSha256:hashes.generator,functionalContractSource:CONTRACT_PATH,functionalContractSourceSha256:hashes.contract,license:'Project-authored procedural geometry and solid-color materials. No external art assets.'},resources:resources.map(item=>({id:item.id,url:item.asset.url,resourcePath:`${output}/${item.id}/v1/resource.json`,sha256:item.asset.sha256}))}));
  // All source and actual geometry checks complete before any output changes.
  for(const [name,bytes]of files){const file=path.join(ROOT,output,name);if(check)assert((await fs.readFile(file)).equals(bytes),`Stale production output: ${name}`);else{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);}}
  console.log(JSON.stringify({ checked: true, wrote: !check, output, ids: resources.map(item => item.id), assets: resources.map(item => ({ id: item.id, bytes: item.asset.bytes, sha256: item.asset.sha256 })) }, null, 2));
}
main().catch(error => { console.error(error.stack || error, error.details || ''); process.exitCode = 1; });
