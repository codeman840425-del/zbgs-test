const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('../../prototype/node_modules/playwright');
const {serve} = require('./serve.cjs');

const [dist, build, target] = process.argv.slice(2);
if (!dist || !build || !target) throw Error('Usage: record-camera-mount-preview.cjs DIST BUILD OUTPUT');
const out = path.resolve(target);
const report = {build, playbackSpeed: 1, renderer: 'Chromium SwiftShader', candidates: []};
let server, browser, context;
async function run() {
  await fs.mkdir(out, {recursive: true});
  server = await serve(dist, build, {manifest: 'company-build-info.json', entry: 'company.html'});
  browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const size = {width: 1440, height: 1000};
  context = await browser.newContext({viewport: size, recordVideo: {dir: path.join(out, 'raw'), size}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const ready = () => page.waitForFunction(() => window.company?.editor && company.buildInfo
    && !document.querySelector('#save').disabled, null, {timeout: 60000});
  async function still(file) {
    await page.evaluate(() => company.drawHostFrame());
    await page.waitForTimeout(750);
    await page.locator('.viewport').screenshot({path: path.join(out, file)});
  }
  await page.goto(server.url + '?layout=conceptStudio');
  await ready();
  await page.waitForFunction(() => company.session.document.id === 'concept-streaming-desk');
  assert.equal(await page.evaluate(() => company.editor.mode), 'room');
  assert.equal(await page.evaluate(() => company.buildInfo.shortId), build);
  await page.evaluate(() => company.view('station'));
  await still('concept-desk.png');
  const original = await page.evaluate(() => company.session.document);
  const monitors = original.nodes.filter(n => n.resource?.id.includes('monitor'));
  assert.equal(monitors.length, 2);
  // The second monitor is an independent instance of the same appearance.
  const secondary = monitors[1].id;
  await page.evaluate(id => company.apply([{type:'set-state', id, state:{on:false}}]), secondary);
  const edited = await page.evaluate(() => company.session.document);
  assert.equal(edited.nodes.find(n => n.id === secondary).state.on, false);
  assert.deepEqual(edited.nodes.find(n => n.id === monitors[0].id), monitors[0]);
  await page.locator('#save').click();
  await ready();
  await page.goto(server.url);
  await ready();
  assert.deepEqual(await page.evaluate(() => company.session.document), edited);
  report.restored = {company: edited.id, secondary, revision: edited.revision};
  const looks = await page.evaluate(() => company.appearanceCandidates('camera-mount').map(r=>r.id));
  assert.equal(looks.length, 4);
  for (const [index, id] of looks.entries()) {
    const loaded = await page.evaluate(async i => {
      const sample = await company.showAppearanceSample('camera-mount', i);
      return company.session.document.nodes.find(n => n.id === sample.target)?.resource?.id;
    }, index);
    assert.equal(loaded, id);
    await still(id + '.png');
    report.candidates.push(id);
  }
  assert.deepEqual(errors, []);
  const video = page.video();
  await context.close();
  context = null;
  await video.saveAs(path.join(out, 'camera-mount-normal1x.webm'));
  report.status='passed';
}
run().catch(error => {report.status='failed'; report.error=error.stack; process.exitCode=1;})
  .finally(async () => {
    await context?.close(); await browser?.close(); await server?.close();
    await fs.writeFile(path.join(out,'report.json'), JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report));
  });
