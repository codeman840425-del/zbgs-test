import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import home from '../../prototype/src/company/examples/c2-rental-home.json' with {type:'json'};
import c1 from '../../prototype/src/company/examples/c1-two-stations.json' with {type:'json'};
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';

const output = process.argv[2];
if (!output) throw new Error('Usage: node evidence/company-c3-contact-independent-v1/reproduce.mjs NEW_OUTPUT_DIR');
await fs.mkdir(output, {recursive:false});
const storage = {getItem(){return null;}, setItem(){}};
const floor = document => document.nodes.find(node => node.kind === 'floor').id;
const resourcesFor = document => document.nodes.filter(node => node.kind === 'facility')
  .map(node => catalog.resources.find(resource => resource.id === node.resource.id && resource.version === node.resource.version))
  .filter(resource => resource?.asset);
const fetchImpl = async url => {
  const bytes = await fs.readFile(new URL(`../../prototype/public${url}`, import.meta.url));
  return new Response(bytes, {status:200});
};
const checks = [];
const pass = (name, details={}) => checks.push({name, passed:true, ...details});

// An active retained contact prevents a document replacement, so this verifies
// the intended stale-handle guard rather than manufacturing a second state.
{
  const world = new THREE.Scene();
  const scene = createCompanyScene(world, c1, {catalog, templates});
  const handle = await scene.retainUsePointContact('station-1/chair#seat');
  const changed = structuredClone(c1);
  changed.revision++;
  changed.nodes.find(node => node.id === 'station-1/chair').transform = {position:[0,0,1],yaw:0};
  assert.throws(() => scene.restore(JSON.stringify(changed)), error => error.code === 'facility-busy');
  assert.equal(handle.released, false);
  handle.release(); scene.dispose();
  pass('active contact handle blocks replacement instead of becoming stale');
}

// Use a real GLB-backed asset library and gate the contact preload. Committing
// a real facility move while retain is pending makes the retain fail after the
// asset has loaded, while the authoring session itself remains live.
const library = createCompanyAssetLibrary({fetchImpl});
await library.preload(resourcesFor(home));
const gateState = {blocked:false, release:null};
const gate = new Promise(resolve => { gateState.release = resolve; });
const wrapped = {
  ...library,
  async preload(resources) { if (gateState.blocked) await gate; return library.preload(resources); },
};
const session = await createCompanyAuthoring(new THREE.Scene(), home, {catalog, templates, storage, assetLibrary:wrapped});
await session.setView({mode:'building'});
assert.equal(library.snapshot().loadedAssets, 0);
gateState.blocked = true;
const pending = session.retainUsePointContact('rest/sofa#left');
await Promise.resolve();
const candidate = session.scene.prepareChange([{type:'move',id:'rest/sofa',transform:{position:[1.2,0,-1],yaw:0}}]);
session.scene.commit(candidate);
gateState.release();
await assert.rejects(pending, error => error.code === 'contact-resource-stale');
// The failed retain has no finally-prune path. The real library therefore keeps
// the GLB that was loaded by contactSource.preload even though the session is live.
assert.equal(library.snapshot().loadedAssets, 1);
pass('failed retain after a stale facility move leaves one real GLB cached without prune', {loadedAssetsAfterFailure:library.snapshot().loadedAssets});
session.dispose();
library.dispose();

await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({
  status:'passed', checks,
  sourceScope:{company:'current uncommitted contact-resources/render/authoring workspace',character:'not used'},
  limits:['CPU Three and actual GLB asset-library parsing only. No browser, GPU or character integration.'],
}, null, 2)+'\n');
console.log(JSON.stringify({status:'passed', checks:checks.length, output}));
