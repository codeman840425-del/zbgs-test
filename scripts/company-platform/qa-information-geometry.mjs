import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {validateInformationGeometry} from '../../prototype/src/company/information-geometry.js';

const output = path.resolve(process.argv[2] || 'evidence/company-information-geometry-v1');
await fs.mkdir(output, {recursive: true});
const boardResource = (overrides = {}) => ({id: 'information-board', mountRole: 'information-board', informationSurface: {schema: 'information-face-v1', width: .88, height: .56, position: [0, 0, .031]}, informationNodes: {back: 'information-back'}, ...overrides});
const contentResource = (overrides = {}) => ({id: 'information-content', mountRole: 'information-content', informationContent: {schema: 'information-face-v1', width: .88, height: .56, pixels: [1100, 700]}, informationNodes: {face: 'information-face'}, ...overrides});
function backWithoutBottomGeometry() {
  const source = new THREE.BoxGeometry(.9, .58, .02).toNonIndexed(), position = source.getAttribute('position'), values = [];
  for (let vertex = 0; vertex < position.count; vertex++) if (vertex < 18 || vertex >= 24) values.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex) + .01);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3)); return geometry;
}
function boardScene({wrongBack = false, noBottom = false, occluder = false, tiltOccluder = false, collinear = false, duplicate = false} = {}) {
  const scene = new THREE.Scene(); scene.position.set(2, 0, -3); const wrapper = new THREE.Group(); scene.add(wrapper);
  const back = new THREE.Mesh(noBottom ? backWithoutBottomGeometry() : new THREE.BoxGeometry(wrongBack ? .8 : .9, .58, .02), new THREE.MeshBasicMaterial()); back.name = 'information-back'; if (!noBottom) back.position.z = .01; wrapper.add(back);
  const left = new THREE.Mesh(new THREE.BoxGeometry(.04, .65, .04), new THREE.MeshBasicMaterial()); left.name = 'frame-left'; left.position.set(-.47, 0, .04); wrapper.add(left);
  const right = left.clone(); right.name = 'frame-right'; right.position.x = .47; wrapper.add(right);
  if (occluder) { const blocker = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, .02), new THREE.MeshBasicMaterial()); blocker.name = 'frame-occluder'; blocker.position.set(0, 0, .04); wrapper.add(blocker); }
  if (tiltOccluder) { const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.1, -.1, .02, .1, -.1, .05, .1, .1, .05], 3)); const blocker = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); blocker.name = 'tilted-occluder'; wrapper.add(blocker); }
  if (collinear) { const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([.6, -.28, .04, .7, -.28, .05, .8, -.28, .04], 3)); const blocker = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); blocker.name = 'collinear-frame'; wrapper.add(blocker); }
  if (duplicate) { const extra = back.clone(); extra.name = 'information-back'; wrapper.add(extra); }
  scene.updateMatrixWorld(true); return scene;
}
function contentGeometry({wrongUv = false, reverse = false, repeat = false} = {}) {
  const geometry = new THREE.BufferGeometry(), points = reverse ? [-.44, -.28, 0, .44, .28, 0, .44, -.28, 0, -.44, .28, 0] : [-.44, -.28, 0, .44, -.28, 0, .44, .28, 0, -.44, .28, 0];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geometry.setIndex(repeat ? [0, 1, 2, 0, 1, 2] : [0, 1, 2, 0, 2, 3]);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(wrongUv ? [0, 0, 1, 1, 1, 0, 0, 1] : [0, 1, 1, 1, 1, 0, 0, 0], 2)); return geometry;
}
function contentScene({wrongUv = false, reverse = false, repeat = false, wrongPixels = false, emissive = false, duplicate = false} = {}) {
  const scene = new THREE.Scene(); scene.position.set(2, 0, -3); const geometry = contentGeometry({wrongUv, reverse, repeat}); const image = new Uint8Array(1100 * 700 * 4); const texture = new THREE.DataTexture(image, wrongPixels ? 1000 : 1100, 700, THREE.RGBAFormat); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; const material = new THREE.MeshStandardMaterial({color: 0xffffff, map: texture, emissive: emissive ? 0x111111 : 0}); const face = new THREE.Mesh(geometry, material); face.name = 'information-face'; scene.add(face); if (duplicate) { const extra = face.clone(); extra.name = 'duplicate-face'; scene.add(extra); } scene.updateMatrixWorld(true); return scene;
}
const checks = [];
const invoke = (scene, resource) => validateInformationGeometry(scene, resource, (code, failurePath, message, details) => { const error = new Error(message); error.code = code; error.path = failurePath; error.details = details; throw error; });
function pass(name, observed) { checks.push({name, passed: true, observed}); }
function expectFailure(name, scene, resource, code) { let captured; try { invoke(scene, resource); } catch (error) { captured = error; } assert(captured, `${name} unexpectedly passed`); assert.equal(captured.code, code, `${name} expected ${code}, got ${captured.code}: ${captured.message}`); checks.push({name, passed: true, observed: {code: captured.code, path: captured.path, message: captured.message}}); }

pass('information board back and visible slot pass', invoke(boardScene(), boardResource()));
pass('information content plane and texture pass', invoke(contentScene(), contentResource()));
pass('unrelated resource is ignored', invoke(contentScene(), {mountRole: 'desk-surface'}),);
expectFailure('wrong back geometry is rejected', boardScene({wrongBack: true}), boardResource(), 'information-back-geometry');
expectFailure('missing back face is rejected', boardScene({noBottom: true}), boardResource(), 'information-back-geometry');
expectFailure('front frame occlusion is rejected', boardScene({occluder: true}), boardResource(), 'information-surface-occluded');
pass('nonintersecting collinear frame edge remains allowed', invoke(boardScene({collinear: true}), boardResource()));
expectFailure('tilted frame triangle crossing content plane is rejected', boardScene({tiltOccluder: true}), boardResource(), 'information-surface-occluded');
expectFailure('duplicate back mapping is rejected', boardScene({duplicate: true}), boardResource(), 'information-mapping');
expectFailure('wrong content UV is rejected', contentScene({wrongUv: true}), contentResource(), 'information-face-uv');
expectFailure('reverse content triangles are rejected', contentScene({reverse: true}), contentResource(), 'information-face-geometry');
expectFailure('repeated content triangle is rejected', contentScene({repeat: true}), contentResource(), 'information-face-geometry');
expectFailure('wrong content image dimensions are rejected', contentScene({wrongPixels: true}), contentResource(), 'information-face-texture');
expectFailure('emissive content is rejected', contentScene({emissive: true}), contentResource(), 'information-face-material');
expectFailure('duplicate content mesh is rejected', contentScene({duplicate: true}), contentResource(), 'information-face-geometry');

const realResults = [];
const collection=JSON.parse(await fs.readFile('prototype/public/company-assets/information-v1/collection.json','utf8'));
const {GLTFLoader}=await import('../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
for(const entry of collection.resources) {
  const resource=JSON.parse(await fs.readFile(entry.resourcePath,'utf8')),bytes=await fs.readFile(path.join('prototype/public',resource.asset.url)),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
  if(resource.informationContent&&json.images?.length){realResults.push({id:resource.id,status:'deferred-browser-image-decode',images:json.images.length});continue;}
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  realResults.push({id:resource.id,result:invoke(gltf.scene,resource)});
}

const report = {status: checks.every(check => check.passed) ? 'passed' : 'failed', generatedAt: new Date().toISOString(), configuration: {difficulty: 'complex', requestedModel: 'gpt-6.1-sol', requestedReasoningEffort: 'high', actualProviderConfiguration: 'not independently verified', hostHookInterception: 'not independently verified'}, api: 'validateInformationGeometry(root, resource, fail)', checks, realAssets: realResults, limits: ['CPU-only synthetic Three scenes and optional GLTFLoader readback. No browser, GPU, image decode claim or runtime integration.', 'Board occlusion uses actual triangle projection against the content rectangle. Content checks require one mesh, exact two-triangle geometry, UV orientation, sRGB 1100x700 texture and opaque nonemissive material.', 'Wall installation, parent facility transactions and image lifecycle remain owned by existing runtime validators.']};
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, output, checks: checks.length, realAssets: realResults.length, failures: checks.filter(check => !check.passed)}, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
