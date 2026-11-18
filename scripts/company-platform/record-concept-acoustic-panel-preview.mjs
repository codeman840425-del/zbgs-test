import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('../../prototype/node_modules/playwright');
const { serve } = require('./serve.cjs');
import fs from 'node:fs/promises';
import path from 'node:path';

const [dist, build, input, outArg] = process.argv.slice(2);
if (!outArg) throw new Error('Usage: node record-concept-acoustic-panel-preview.mjs DIST BUILD INPUT OUT');
const out = path.resolve(outArg);
let server;
let browser;
let context;
try {
  await fs.mkdir(out, { recursive: true });
  server = await serve(dist, build, { manifest: 'company-build-info.json', entry: 'company.html' });
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: path.join(out, 'raw'), size: { width: 1440, height: 1000 } } });
  const page = await context.newPage();
  await page.goto(server.url);
  await page.waitForFunction(() => window.company?.ready && company.buildInfo);
  await page.evaluate(value => company.load(value), JSON.parse(await fs.readFile(input, 'utf8')));
  await page.waitForFunction(() => (company.assetLibrary?.snapshot?.().loadedAssets ?? 0) > 0, null, { timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, 'concept-acoustic-panel-normal1x.png') });
  const video = page.video();
  await context.close();
  await video.saveAs(path.join(out, 'concept-acoustic-panel-normal1x.webm'));
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify({ status: 'passed', build, playbackSpeed: 1, steps: ['加载概念图拆分后的独立墙面吸音板', '完成资源加载并保持正常速度预览'], video: 'concept-acoustic-panel-normal1x.webm', limits: ['SwiftShader browser check only.', 'Generated PNG is a wall display plane, not volumetric acoustic geometry.', 'No real-character C3 or ordinary-PC performance claim.'] }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', output: out }));
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
}
