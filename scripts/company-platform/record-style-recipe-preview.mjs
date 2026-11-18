import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {chromium} = require('../../prototype/node_modules/playwright');
const {serve} = require('./serve.cjs');
import fs from 'node:fs/promises';
import path from 'node:path';

const [dist, build, inputRoot, outArg] = process.argv.slice(2);
if (!outArg) throw Error('Usage: node record-style-recipe-preview.mjs DIST BUILD INPUT_ROOT OUT');
const out = path.resolve(outArg);
let server, browser, context;
try {
  await fs.mkdir(out, {recursive: true});
  const inputs = (await fs.readdir(inputRoot)).filter(name => name.endsWith('.json') && !name.endsWith('.style.json')).sort();
  server = await serve(dist, build, {manifest: 'company-build-info.json', entry: 'company.html'});
  browser = await chromium.launch({headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  context = await browser.newContext({viewport: {width: 1440, height: 1000}, recordVideo: {dir: path.join(out, 'raw'), size: {width: 1440, height: 1000}}});
  const page = await context.newPage();
  await page.goto(server.url);
  await page.waitForFunction(() => window.company?.ready && company.buildInfo);
  for (const name of inputs) {
    await page.evaluate(value => company.load(value), JSON.parse(await fs.readFile(path.join(inputRoot, name), 'utf8')));
    await page.waitForFunction(() => (company.session?.document?.nodes?.length ?? 0) > 0, null, {timeout: 15000});
    await page.waitForTimeout(1200);
  }
  const video = page.video();
  await context.close();
  await video.saveAs(path.join(out, 'style-recipe-normal1x.webm'));
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify({status: 'passed', build, playbackSpeed: 1, inputs, video: 'style-recipe-normal1x.webm', limits: ['SwiftShader browser check only.', 'No ordinary-PC performance or real-character C3 claim.']}, null, 2) + '\n');
  console.log(JSON.stringify({status: 'passed', inputs: inputs.length, output: out}));
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
}
