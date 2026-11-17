import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {validateMirrorGeometry} from '../../prototype/src/company/mirror-geometry.js';

const root = new URL('../../',import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const catalog = JSON.parse(await fs.readFile(new URL('prototype/src/company/library-catalog.json',root),'utf8'));
const results = [];
const invoke = (scene,resource) => validateMirrorGeometry(scene,resource,(code,path,message) => {
  throw Object.assign(new Error(message),{code,path});
});
for (const resource of catalog.resources.filter(entry => entry.mountRole === 'floor-mirror')) {
  const bytes = await fs.readFile(new URL(`prototype/public${resource.asset.url}`,root));
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const scene = loaded.scene;
  const originalResult = invoke(scene,resource);
  const frame = scene.getObjectByName('mirror-frame');
  const original = frame.geometry;
  const originalFlat = original.index ? original.toNonIndexed() : original.clone();
  const floating = new THREE.BoxGeometry(.02,.02,.02).translate(.35,.15,-.2).toNonIndexed();
  const first = originalFlat.getAttribute('position').array;
  const second = floating.getAttribute('position').array;
  const positions = new Float32Array(first.length + second.length);
  positions.set(first); positions.set(second,first.length);
  const combined = new THREE.BufferGeometry();
  combined.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  frame.geometry = combined;
  let alteredResult, error;
  try { alteredResult = invoke(scene,resource); }
  catch (caught) { error = {code:caught.code,path:caught.path,message:caught.message}; }
  results.push({id:resource.id,sha256:hash(bytes),actualIdentityMatches:hash(bytes) === resource.asset.sha256,
    originalResult,mutation:'Appended one closed disconnected .02m cube at [.35,.15,-.2] to mirror-frame geometry. Every actual source/resource file stays unchanged.',
    floatingBounds:{min:[.34,.14,-.21],max:[.36,.16,-.19]},accepted:!error,alteredResult,error});
  original.dispose(); originalFlat.dispose(); floating.dispose();
  scene.traverse(object => {object.geometry?.dispose();for(const material of object.material ? [object.material].flat() : [])material.dispose();});
}
const report = {scope:'Read-only CPU mutation probe on actual loaded GLBs',
  geometrySha256:hash(await fs.readFile(new URL('prototype/src/company/mirror-geometry.js',root))),results,
  limits:['No GPU or browser. The malicious geometry exists only in memory. Existing registered assets are unchanged.']};
const output = new URL(process.argv[2] || 'probe-report.json',import.meta.url);
await fs.mkdir(new URL('./',output),{recursive:true});
await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
