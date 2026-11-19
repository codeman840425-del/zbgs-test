import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial} from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompany, prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {validateEnclosedWardrobeGeometry} from '../../prototype/src/company/enclosed-wardrobe-geometry.js';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';

const [outArg] = process.argv.slice(2);
if (!outArg) throw new Error('Usage: node test-enclosed-wardrobe-geometry.mjs NEW_OUTPUT_DIR');
const out = path.resolve(outArg);
await fs.mkdir(path.dirname(out), {recursive:true});
await fs.mkdir(out);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const publicAsset = url => fs.readFile(new URL('../../prototype/public' + url, import.meta.url));
const ref = ({id, version}) => ({id, version});
const models = ['timber','framed','inset','glass'].map(suffix => catalog.resources.find(r => r.id === `enclosed-wardrobe-${suffix}` && r.version === 1));
const report = {status:'running', models:[], adversarial:[], hiddenFloor:[]};
const fail = (code, target, message) => { throw Object.assign(new Error(message), {code, path:target}); };
installNodeImageDecodeShim();

function rewriteGlb(bytes, mutate) {
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const next = 20 + bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, next).toString('utf8'));
  const node = name => {
    const index = json.nodes.findIndex(n => n.name === name);
    assert(index >= 0, name);
    return index;
  };
  mutate(json, node);
  const content = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(content.length / 4) * 4, 0x20);
  content.copy(padded);
  const header = Buffer.from(bytes.subarray(0, 20));
  header.writeUInt32LE(20 + padded.length + bytes.length - next, 8);
  header.writeUInt32LE(padded.length, 12);
  return Buffer.concat([header, padded, bytes.subarray(next)]);
}

function offsetLocal(node, index, amount) {
  if (node.matrix) node.matrix[12 + index] += amount;
  else (node.translation ??= [0, 0, 0])[index] += amount;
}

function badModel(resource, bytes, name, code, mutate) {
  const changed = rewriteGlb(bytes, mutate);
  return {name, code, bytes:changed, resource:{...resource, id:`qa-wardrobe-${name}`,
    asset:{...resource.asset, url:`/company-assets/qa-wardrobe-${name}.glb`, bytes:changed.length, sha256:hash(changed)}}};
}

async function hiddenFloor(library, requests, bad, model) {
  const activeCatalog = {...catalog, resources:[...catalog.resources, ...bad.map(item => item.resource)]};
  const options = {catalog:activeCatalog, templates};
  const doc = createCompany({id:'qa-wardrobe-hidden'}, activeCatalog);
  doc.scale = 'building';
  const [first, ordinaryRoom] = doc.nodes;
  const upper = 'qa-upper', room = 'qa-upper-dressing', rack = 'qa-upper-wardrobe';
  doc.nodes.push({...first, id:upper}, {...ordinaryRoom, id:room, parentId:upper});
  const garments = ['jacket','dress'].map(suffix => catalog.resources.find(r => r.id === `garment-hanging-${suffix}` && r.version === 1));
  const layout = prepareCompanyChange(doc, [
    {type:'add-facility', id:rack, parentId:room, resource:ref(model), transform:{position:[0, 0, 0], yaw:0}},
    ...garments.map((item, i) => ({type:'add-facility', id:`${rack}/${i}`, parentId:rack, resource:ref(item), attachment:{slotId:i ? 'right' : 'left'}})),
  ], options).document;
  const memory = new Map(), storage = {getItem:key => memory.get(key) ?? null, setItem:(key, value) => memory.set(key, value)};
  const author = await createCompanyAuthoring(new Group(), layout, {...options, storage, assetLibrary:library});
  try {
    assert.equal(author.scene.view.floorId, first.id);
    assert(!author.scene.root.getObjectByName(rack), 'The wardrobe must start outside the rendered floor');
    await author.save();
    const previous = author.readSavedText(layout.id);
    assert(previous);
    for (const item of bad) {
      const op = {type:'replace-resource', id:rack, resource:ref(item.resource)};
      const proposed = prepareCompanyChange(layout, [op], options).document;
      const before = requests.length;
      const active = author.scene.root;
      await assert.rejects(author.apply([op]), {code:item.code});
      assert(requests.slice(before).includes(item.resource.asset.url), 'Hidden resource must be fetched and checked');
      await assert.rejects(author.import(JSON.stringify(proposed)), {code:item.code});
      assert.equal(author.scene.root, active);
      assert.deepEqual(author.document, layout);
      assert.equal(author.readSavedText(layout.id), previous);
      report.hiddenFloor.push({variant:item.name, error:item.code, tested:['apply','import'], visibleFloor:first.id,
        hiddenFloor:upper, liveRootAndSavePreserved:true});
    }
    await author.setView({mode:'floor', floorId:upper});
    assert(author.scene.root.getObjectByName(rack)?.getObjectByName('garment-rail')?.isMesh);
  } finally { author.dispose(); }
}

let library;
try {
  assert(models.every(Boolean), 'The four wardrobe @1 resources must already be registered');
  const model = models[0], bytes = await publicAsset(model.asset.url);
  const cases = [
    badModel(model, bytes, 'wrong-parent', 'moving-part-panel-parent', (json, node) => {
      const handle = node('wardrobe-left-handle');
      const parent = json.nodes.find(n => n.children?.includes(handle));
      parent.children = parent.children.filter(child => child !== handle);
      json.nodes[node('wardrobe-right-pivot')].children.push(handle);
    }),
    badModel(model, bytes, 'fake-axis', 'invalid-moving-part-pivot', (json, node) => {
      offsetLocal(json.nodes[node('wardrobe-left-pivot')], 0, .024);
    }),
    badModel(model, bytes, 'panel-through-clothes', 'blocked-garment-slot', (json, node) => {
      offsetLocal(json.nodes[node('wardrobe-left-panel')], 2, -.075);
    }),
    badModel(model, bytes, 'rail-misaligned', 'invalid-garment-rail', (json, node) => {
      offsetLocal(json.nodes[node('garment-rail')], 2, .022);
    }),
  ];
  const glass = models.at(-1);
  const badGlass = badModel(glass, await publicAsset(glass.asset.url), 'opaque-glass', 'wardrobe-glass', (json, node) => {
    for (const side of ['left', 'right']) {
      const glassNode = json.nodes[node(`wardrobe-${side}-glass`)];
      for (const primitive of json.meshes[glassNode.mesh].primitives) json.materials[primitive.material].alphaMode = 'OPAQUE';
    }
  });
  const bad = [...cases, badGlass];
  const altered = new Map(bad.map(item => [item.resource.asset.url, item.bytes]));
  const requests = [];
  library = createCompanyAssetLibrary({fetchImpl:async url => {
    requests.push(url);
    const contents = altered.get(url) ?? await publicAsset(url);
    return {ok:true, arrayBuffer:async () => contents.buffer.slice(contents.byteOffset, contents.byteOffset + contents.byteLength)};
  }});
  await library.preload(models);
  for (const resource of models) {
    const {root, nodes} = library.instantiate(resource);
    const triangles = {};
    for (const name of ['garment-rail', ...Object.values(resource.partPanels), ...Object.values(resource.partNodes)]) {
      assert(nodes.has(name), name);
      let count = 0;
      nodes.get(name).traverse(mesh => { if (mesh.isMesh) count += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3; });
      assert(count > 0);
      triangles[name] = count;
    }
    report.models.push({...ref(resource), sha256:resource.asset.sha256, triangles});
    const geometries = new Set(), materials = new Set();
    root.traverse(mesh => { if (mesh.isMesh) { geometries.add(mesh.geometry); for (const material of [mesh.material].flat()) materials.add(material); } });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }
  for (const item of bad) {
    await assert.rejects(library.preload([item.resource]), {code:item.code});
    report.adversarial.push({variant:item.name, error:item.code, glbSha256:item.resource.asset.sha256});
  }
  const {root} = library.instantiate(model);
  const vertices = [-.43, .9, .03, .43, .9, .03, .43, 1.4, .03];
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3));
  const material = new MeshStandardMaterial();
  const crossing = new Mesh(geometry, material);
  crossing.name = 'qa-triangle-with-all-vertices-outside-both-slots';
  root.add(crossing);
  try { assert.throws(() => validateEnclosedWardrobeGeometry(root, model, fail), {code:'blocked-garment-slot'}); }
  finally { geometry.dispose(); material.dispose(); }
  report.adversarial.push({variant:'fixed-triangle-bridges-two-slots', error:'blocked-garment-slot'});
  await hiddenFloor(library, requests, cases, model);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = {message:error.message, code:error.code, path:error.path, stack:error.stack};
  process.exitCode = 1;
} finally {
  library?.dispose();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({status:report.status, models:report.models.length, adversarial:report.adversarial.length,
    hiddenFloor:report.hiddenFloor.length, failure:report.failure, out}, null, 2));
}
