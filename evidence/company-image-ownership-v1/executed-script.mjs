import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import catalog from '../../src/company/library-catalog.json' with {type:'json'};
import {trackTexture} from '../../src/company/image-ownership.js';
import {applySurfaceFinish} from '../../src/company/surface-finish-render.js';

globalThis.self = globalThis;
const outputArg = process.argv[2];
if (!outputArg) throw new Error('Pass a NEW_OUTPUT_DIR');
const outputDir = path.resolve(outputArg);
const resource = catalog.resources.find(item => item.id === 'wall-fine-stripes' && item.version === 1);
if (!resource) throw new Error('The textured wall-fine-stripes fixture is missing');
const prototypeRoot = fileURLToPath(new URL('../..', import.meta.url));
const assetPath = url => path.join(prototypeRoot, 'public', url.replace(/^\//, ''));
const fetchImpl = async url => new Response(await fs.readFile(assetPath(url)), {status: 200});
const {createCompanyAssetLibrary} = await import('../../src/company/asset-library.js');
const sourceFiles = [
  'src/company/image-ownership.js',
  'src/company/asset-library.js',
  'src/company/surface-finish-render.js',
  'node_modules/three/examples/jsm/loaders/GLTFLoader.js',
  'node_modules/three/src/loaders/ImageBitmapLoader.js',
];
const report = {schema:'company-image-ownership-qa-v1',scope:'CPU Three actual company asset chain plus ownership module',status:'failed',threeVersion:'0.187.0',implementation:{files:['src/company/image-ownership.js','src/company/asset-library.js','src/company/surface-finish-render.js'],behavior:'Module-level decoded-image ownership counts are incremented for every pack, instance, and surface-finish texture. Texture dispose listeners decrement once and close only the final close-capable image. Release registers all discovered textures before disposal.'},sourceIdentity:{},orphanImageAnalysis:{result:'No successful standalone ImageBitmap owner was found in the locked path. ImageBitmapLoader wraps each successful decode in a Texture before resolving, and images without a referenced texture are never requested. Parser cache cleanup still awaits texture dependencies.',evidence:['node_modules/three/examples/jsm/loaders/GLTFLoader.js:3401-3507','node_modules/three/src/loaders/ImageBitmapLoader.js:175-192','src/company/asset-library.js:120-142']},cases:[]};
const pass = (name, details = {}) => report.cases.push({name, passed:true, ...details});
const makeImage = (images, label) => {
  const image = {width:64,height:64,label,closed:0,close(){this.closed++;}};
  images.push(image);
  return image;
};
const texturesIn = root => {
  const textures = new Set();
  root.traverse(object => {
    for (const material of object.material ? [object.material].flat() : []) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  return textures;
};
const disposeRootTextures = root => { for (const texture of texturesIn(root)) texture.dispose(); };

try {
  {
    const images = [], image = makeImage(images, 'shared'), first = new THREE.Texture(image), second = new THREE.Texture(image);
    trackTexture(first); trackTexture(second); first.dispose(); first.dispose();
    assert.equal(image.closed, 0, 'a repeated dispose must not close while another texture owns the image');
    second.dispose(); assert.equal(image.closed, 1, 'the final texture owner must close exactly once');
    pass('one decoded image shared by multiple textures closes once at final dispose');
  }

  {
    const images = [];
    globalThis.createImageBitmap = async blob => makeImage(images, `bitmap-${blob.size}`);
    const library = createCompanyAssetLibrary({fetchImpl});
    await library.preload([resource]);
    const instance = library.instantiate(resource);
    assert.equal(images.length, 1, 'the textured fixture must decode one image');
    library.retainOnly([]);
    assert.deepEqual(images.map(image => image.closed), [0], 'cache eviction must preserve a live clone image');
    disposeRootTextures(instance.root);
    assert.deepEqual(images.map(image => image.closed), [1], 'disposing the final clone must close the image once');
    pass('actual GLB clone survives cache eviction until its final texture owner disposes', {decodedImages:images.length});
  }

  {
    const images = [];
    globalThis.createImageBitmap = async blob => makeImage(images, `surface-${blob.size}`);
    const library = createCompanyAssetLibrary({fetchImpl});
    await library.preload([resource]);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, .1, 2), new THREE.MeshStandardMaterial({color:0xffffff}));
    const material = new Map();
    applySurfaceFinish(mesh, {id:resource.id, resource, surface:'north', tileMeters:[1,1], quarterTurns:0}, {bounds:{width:2,depth:2}}, {position:[0,0,0]}, library, material);
    const finishMaterial = material.get(resource.id), finishTexture = finishMaterial.map;
    library.retainOnly([]);
    assert.deepEqual(images.map(image => image.closed), [0], 'surface material clone must keep the image after pack and source instance release');
    finishTexture.dispose(); finishMaterial.dispose(); mesh.geometry.dispose(); mesh.material.forEach(value => value?.dispose?.());
    assert.deepEqual(images.map(image => image.closed), [1], 'surface clone disposal must close the final image owner');
    pass('surface-finish texture clone is registered and survives source instance release');
  }

  {
    const images = [], bitmapStarted = new Promise(resolve => { globalThis.__imageBitmapStarted = resolve; });
    let releaseDecode;
    const decodeGate = new Promise(resolve => { releaseDecode = resolve; });
    globalThis.createImageBitmap = async blob => {
      globalThis.__imageBitmapStarted();
      await decodeGate;
      return makeImage(images, `late-${blob.size}`);
    };
    const library = createCompanyAssetLibrary({fetchImpl});
    const pending = library.preload([resource]);
    await bitmapStarted;
    library.dispose(); releaseDecode();
    await assert.rejects(pending, error => error?.code === 'asset-library-disposed' || error?.code === 'asset-load-cancelled');
    assert.equal(images.length, 1); assert.deepEqual(images.map(image => image.closed), [1], 'late parser cleanup must close the decoded image once');
    pass('late decode after library disposal is cleaned by parser failure path');
  }

  {
    const images = [];
    globalThis.createImageBitmap = async blob => makeImage(images, `failed-${blob.size}`);
    const invalid = structuredClone(resource);
    invalid.footprint = {blocking:true, center:[0,0], halfSize:[.001,.001]};
    const library = createCompanyAssetLibrary({fetchImpl});
    await assert.rejects(library.preload([invalid]), error => error?.code === 'asset-footprint-mismatch');
    assert.equal(images.length, 1); assert.deepEqual(images.map(image => image.closed), [1], 'validation failure must release decoded parser textures');
    pass('post-decode validation failure releases parser-owned texture');
  }

  {
    const previous = THREE.Cache.enabled;
    THREE.Cache.clear(); THREE.Cache.enabled = true;
    const images = [];
    globalThis.createImageBitmap = async blob => makeImage(images, `cache-${blob.size}`);
    const library = createCompanyAssetLibrary({fetchImpl});
    await library.preload([resource]);
    const bitmapKeys = Object.keys(THREE.Cache.files).filter(key => key.startsWith('image-bitmap:'));
    assert.deepEqual(bitmapKeys, [], 'embedded bufferView images use blob URLs and are excluded from THREE.Cache');
    library.dispose(); THREE.Cache.clear(); THREE.Cache.enabled = previous;
    pass('THREE.Cache enabled does not retain current embedded blob image');
  }

  report.status = 'passed';
} catch (error) {
  report.error = {name:error.name, message:error.message, code:error.code || null, stack:error.stack};
  process.exitCode = 1;
} finally {
  delete globalThis.__imageBitmapStarted;
  report.sourceIdentity.sha256 = Object.fromEntries(await Promise.all(sourceFiles.map(async file => {
    const bytes = await fs.readFile(path.join(prototypeRoot, file));
    return [file, createHash('sha256').update(bytes).digest('hex')];
  })));
  report.limits = ['CPU/Node only with a synthetic close-capable ImageBitmap stand-in', 'No browser or GPU renderer run', 'Current GLB contract uses embedded bufferView images and blob URLs'];
  await fs.mkdir(outputDir, {recursive:true});
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await fs.copyFile(new URL(import.meta.url), path.join(outputDir, 'executed-script.mjs'));
  console.log(JSON.stringify({status:report.status, cases:report.cases.length, error:report.error?.message || null, outputDir}));
}
