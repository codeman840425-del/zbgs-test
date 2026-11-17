import fs from 'node:fs/promises';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { validateWindowGeometry } from '../../prototype/src/company/window-geometry.js';

globalThis.ProgressEvent ??= class extends Event { constructor(type, init = {}) { super(type); Object.assign(this, init); } };
globalThis.FileReader ??= class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.({ target: this }); }).catch(error => this.onerror?.(error)); } };

const output = new URL('./', import.meta.url);
const designs = ['square-basic', 'square-detailed', 'wide-square', 'round-detailed'];
const geometryChecks = [];
for (const design of designs) {
  const resource = JSON.parse(await fs.readFile(new URL(`../../prototype/public/company-assets/window-opening-v1/${design}/v1/resource.json`, import.meta.url), 'utf8'));
  const bytes = await fs.readFile(new URL(`../../prototype/public/company-assets/window-opening-v1/${design}/v1/model.glb`, import.meta.url));
  try {
    const pack = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    validateWindowGeometry(pack.scene, resource, (code, path, message) => {
      const error = new Error(message); error.code = code; error.path = path; throw error;
    });
    geometryChecks.push({ design, passed: true });
  } catch (error) {
    geometryChecks.push({ design, passed: false, code: error.code, path: error.path, message: error.message });
  }
}

const sampleSource = await fs.readFile(new URL('../../prototype/src/company/window-samples.js', import.meta.url), 'utf8');
const productionReport = JSON.parse(await fs.readFile(new URL('../../evidence/company-window-production-v1/report.json', import.meta.url), 'utf8'));
const report = {
  schema: 'company-window-contract-independent-check',
  version: 1,
  status: geometryChecks.every(check => check.passed === false) ? 'failed-assets' : 'mixed',
  geometryChecks,
  sampleFloorTransform: {
    sourceContainsYLift: /level\s*\*\s*3\.4/.test(sampleSource),
    finding: 'window-samples.js uses floorTransform.position.y = level * 3.4; document floor transforms are grounded at Y=0 and deriveCompany rejects elevated floor origins.'
  },
  productionReportClaim: productionReport.checks,
  scope: 'CPU GLTFLoader and source contract inspection only. No browser, GPU, service or runtime hook.',
  nextNegativeCases: [
    'Two room sides of one shared wall produce one facility-derived opening identity and reject a duplicate opposite-side facility.',
    'Quarter-turn wall openings preserve canonical physical wall and reject portal overlap after rotation.',
    'Wall finish and wall display overlap reject before candidate publish while navigation keeps the original wall blocker.',
    'Hidden-floor window fetch or geometry failure preserves the current scene, document, view, cache and saved bytes.'
  ]
};
await fs.writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, geometryChecks }));
