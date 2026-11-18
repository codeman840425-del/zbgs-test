import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
import {validateResourceProvenance} from './validate-resource-provenance.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const resourcePath = path.join(root, 'prototype/public/company-assets/concept-acoustic-panel-v1/concept-hex-panel/v1/resource.json');
const catalogPath = path.join(root, 'prototype/src/company/library-catalog.json');
const original = JSON.parse(await fs.readFile(resourcePath, 'utf8'));
const catalogBefore = createHash('sha256').update(await fs.readFile(catalogPath)).digest('hex');
const outcomes = [];

async function expectCode(label, resource, code) {
  await assert.rejects(() => preflightLibraryAssets({root, resources: [resource]}), error => {
    assert.equal(error.code, code, `${label}: unexpected error ${error.code}`);
    outcomes.push({label, code: error.code});
    return true;
  });
}

await preflightLibraryAssets({root, resources: [original]});
outcomes.push({label: 'valid-concept-texture', code: 'passed'});

const catalog = JSON.parse(await fs.readFile(catalogPath,'utf8'));
const screens = catalog.resources.filter(resource => resource.asset && resource.display?.screen);
const monitor = screens.find(resource => resource.id === 'monitor-aurora');
assert(monitor);
await preflightLibraryAssets({root,resources:screens});
outcomes.push({label:'registered-screen-bindings',code:'passed',count:screens.length});
const screenWith = patch => ({...monitor,display:{...monitor.display,screen:{...monitor.display.screen,...patch}}});
await expectCode('missing-screen-node',screenWith({nodes:['missing-imported-screen']}),'missing-display-mesh');
await expectCode('duplicate-screen-target',screenWith({nodes:[...monitor.display.screen.nodes,...monitor.display.screen.nodes]}),'invalid-display-mapping');
await expectCode('out-of-range-screen-emission',screenWith({onIntensity:20}),'invalid-display-mapping');

await expectCode('digest-mismatch', {
  ...structuredClone(original),
  asset: {...original.asset, sha256: '0'.repeat(64)},
}, 'asset-digest-mismatch');

await expectCode('mount-envelope', {
  ...structuredClone(original),
  mounting: {...original.mounting, width: 0.01},
}, 'asset-mount-envelope-mismatch');

await assert.rejects(() => validateResourceProvenance({
  root,
  resource: {...structuredClone(original), provenance: {...original.provenance, generatorSha256: '0'.repeat(64)}},
  label: 'concept-acoustic-panel@1',
}), error => {
  assert.match(error.message, /^provenance-hash-mismatch: concept-acoustic-panel@1\.generatorSha256$/);
  outcomes.push({label: 'provenance-hash-mismatch', code: 'provenance-hash-mismatch'});
  return true;
});

const fixtureDir = path.join(root, 'prototype/public/company-assets/_preflight-fixtures');
await fs.mkdir(fixtureDir, {recursive: true});
const goodBytes = await fs.readFile(path.join(root, 'prototype/public', new URL(original.asset.url, 'http://company.local').pathname));
const badBytes = Buffer.from(goodBytes);
badBytes[20] = 0;
const fixturePath = path.join(fixtureDir, 'invalid-json.glb');
await fs.writeFile(fixturePath, badBytes);
try {
  await expectCode('invalid-glb-json', {
    ...structuredClone(original),
    id: 'preflight-fixture-invalid-json',
    asset: {
      ...original.asset,
      url: '/company-assets/_preflight-fixtures/invalid-json.glb',
      bytes: badBytes.length,
      sha256: createHash('sha256').update(badBytes).digest('hex'),
    },
  }, 'invalid-glb-json');
} finally {
  await fs.rm(fixtureDir, {recursive: true, force: true});
}

const catalogAfter = createHash('sha256').update(await fs.readFile(catalogPath)).digest('hex');
assert.equal(catalogAfter, catalogBefore, 'preflight tests must not rewrite the registered catalog');
console.log(JSON.stringify({status: 'passed', groups: outcomes.length, outcomes}));
