import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('../../prototype/node_modules/playwright');
const { serve } = require('./serve.cjs');
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [dist, build, input, outArg] = process.argv.slice(2);
if (!outArg) throw new Error('Usage: node qa-concept-acoustic-panel-preview.mjs DIST BUILD INPUT OUT');
const out = path.resolve(outArg);
const document = JSON.parse(await fs.readFile(input, 'utf8'));
const report = { status: 'running', build, checks: [], limits: ['SwiftShader browser check only.', 'Generated PNG is a wall display plane, not volumetric acoustic geometry.', 'No real-character C3 or ordinary-PC performance claim.'] };
let server;
let context;
let page;
try {
  await fs.mkdir(out, { recursive: true });
  server = await serve(dist, build, { manifest: 'company-build-info.json', entry: 'company.html' });
  const open = async () => {
    context = await chromium.launch({ headless: true, viewport: { width: 1440, height: 1000 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    page = await context.newPage();
    await page.goto(server.url);
    await page.waitForFunction(() => window.company?.ready && company.buildInfo);
    assert.equal(await page.evaluate(() => company.buildInfo.shortId), build);
  };
  await open();
  await page.evaluate(value => company.load(value), document);
  await page.waitForFunction(() => (company.assetLibrary?.snapshot?.().loadedAssets ?? 0) > 0, null, { timeout: 15000 });
  const loaded = await page.evaluate(() => ({
    document: company.session.document,
    snapshot: company.assetLibrary.snapshot(),
    target: company.session.document.nodes.find(node => node.resource?.id === 'concept-acoustic-panel'),
  }));
  assert.deepEqual(loaded.document, document);
  assert.equal(loaded.target.resource.id, 'concept-acoustic-panel');
  assert(loaded.snapshot.loadedAssets > 0);
  const modelStatus = await page.evaluate(async () => (await fetch('/company-assets/concept-acoustic-panel-v1/concept-hex-panel/v1/model.glb')).status);
  const resourceStatus = await page.evaluate(async () => (await fetch('/company-assets/concept-acoustic-panel-v1/concept-hex-panel/v1/resource.json')).status);
  assert.equal(modelStatus, 200);
  assert.equal(resourceStatus, 200);
  await page.screenshot({ path: path.join(out, 'concept-acoustic-panel.png') });
  report.checks.push({ name: 'Generated concept asset loads and wall-mounts', passed: true, loadedAssets: loaded.snapshot.loadedAssets, modelStatus, resourceStatus });

  await page.evaluate(() => company.save());
  const saved = await page.evaluate(() => company.export());
  await context.close();
  await open();
  await page.evaluate(value => company.session.import(value), saved);
  assert.deepEqual(await page.evaluate(() => company.session.document), document);
  report.checks.push({ name: 'Save, restart and restore retain concept asset identity', passed: true });

  const bad = structuredClone(document);
  bad.nodes.find(node => node.resource?.id === 'concept-acoustic-panel').resource.id = 'missing-concept-resource';
  const result = await page.evaluate(async value => {
    try { await company.load(value); return { error: null, document: company.session.document }; }
    catch (error) { return { error: String(error.message ?? error), document: company.session.document }; }
  }, bad);
  assert(result.error);
  assert.deepEqual(result.document, document);
  report.checks.push({ name: 'Invalid resource rejects and preserves previous document', passed: true, error: result.error });
  report.status = 'passed';
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, output: out }));
} finally {
  await context?.close().catch(() => {});
  await server?.close().catch(() => {});
}
