import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('../../prototype/node_modules/playwright');
const { serve } = require('./serve.cjs');
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [dist, build, inputRoot, outArg] = process.argv.slice(2);
if (!outArg) throw Error('Usage: node qa-style-recipe-preview.mjs DIST BUILD INPUT_ROOT OUT');
const out = path.resolve(outArg);
const report = { status: 'running', build, checks: [], limits: ['SwiftShader browser check only. No real-character C3 or ordinary-PC performance claim.'] };
let server, context, page;
const inputs = (await fs.readdir(inputRoot)).filter(name => name.endsWith('.json') && !name.endsWith('.style.json')).sort();
await fs.mkdir(out, { recursive: true });
server = await serve(dist, build, { manifest: 'company-build-info.json', entry: 'company.html' });
const open = async () => {
  context = await chromium.launchPersistentContext(path.join(out, 'profile'), { headless: true, viewport: { width: 1440, height: 1000 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  page = await context.newPage();
  await page.goto(server.url);
  await page.waitForFunction(() => window.company?.ready && company.buildInfo);
  assert.equal(await page.evaluate(() => company.buildInfo.shortId), build);
};
await open();
for (const name of inputs) {
  const document = JSON.parse(await fs.readFile(path.join(inputRoot, name), 'utf8'));
  await page.evaluate(value => company.load(value), document);
  await page.waitForFunction(() => (company.session?.document?.nodes?.length ?? 0) > 0, null, { timeout: 15000 });
  const before = await page.evaluate(() => ({ document: company.session.document, facilities: company.session.document.nodes.filter(node => node.kind === 'facility').length, loadedAssets: company.assetLibrary.snapshot().loadedAssets }));
  assert.deepEqual(before.document, document);
  assert(before.facilities > 0);
  assert(before.loadedAssets >= 0);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  await page.evaluate(() => company.save());
  const saved = await page.evaluate(() => company.export());
  await context.close();
  await open();
  await page.evaluate(value => company.session.import(value), saved);
  assert.deepEqual(await page.evaluate(() => company.session.document), document);
  report.checks.push({ name: `Preview, save and restart ${name}`, passed: true, facilityCount: before.facilities, loadedAssets: before.loadedAssets });
}
report.status = 'passed';
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await context.close();
await server.close();
console.log(JSON.stringify({ status: report.status, checks: report.checks.length, output: out }));
