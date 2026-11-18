const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../../prototype/node_modules/playwright');
const { serve } = require('./serve.cjs');

const [dist, build, outArg, ...options] = process.argv.slice(2);
if (!dist || !build || !outArg || options.some(option => option !== '--record') || options.length > 1) {
  throw new Error('Usage: node qa-workstation-looks.cjs DIST BUILD OUT [--record]');
}

const out = path.resolve(outArg);
const record = options.includes('--record');
const viewport = { width: 1600, height: 1000 };
const partKeys = ['desk', 'monitor', 'keyboard', 'microphone', 'chair', 'fill-light'];
const lookResources = {
  'station-look-1': ['desk-trestle', 'monitor-aurora', 'keyboard-compact', 'desk-microphone-ball', 'chair-cantilever', 'fill-light-orbit'],
  'station-look-2': ['desk-pedestal', 'monitor-ribbon', 'keyboard-split', 'desk-microphone-ribbon', 'chair-pedestal', 'fill-light-wing'],
  'station-look-3': ['desk-cabinet', 'monitor-pillar', 'keyboard-retro', 'desk-microphone-broadcast', 'chair-ladder', 'fill-light-column'],
  'station-look-4': ['desk-frame', 'monitor-slate', 'keyboard-console', 'desk-microphone-capsule', 'chair-crossbeam', 'fill-light-panel'],
};
const looks = Object.keys(lookResources);
const expected = Object.fromEntries(looks.map(look => [
  look,
  Object.fromEntries(partKeys.map((key, i) => [key, { id: lookResources[look][i], version: 1 }])),
]));
const wideStation = 'company-space-v2-parallel/ground/live/station-1';
const otherStation = 'company-space-v2-parallel/ground/live/station-2';
const conceptStation = 'concept-streaming-desk/station';
const secondaryMonitor = conceptStation + '/desk/secondary-monitor';
const report = {
  build,
  status: 'running',
  browser: 'Headless Chromium with SwiftShader',
  checks: [],
  browserErrors: [],
  video: { enabled: record, playbackSpeed: 1 },
};
let server, profile, context, page, glbResponses, stage;

async function idle() {
  await page.waitForFunction(() => (
    window.company?.editor && window.company.buildInfo && !document.querySelector('#mode-room').disabled
  ), null, { timeout: 30000 });
  const status = page.locator('#status');
  assert.notEqual(await status.getAttribute('data-error'), 'true', await status.textContent());
}

async function openBrowser({ recording = false } = {}) {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(recording ? { recordVideo: { dir: path.join(out, 'video'), size: viewport } } : {}),
  });
  context.setDefaultTimeout(15000);
  page = context.pages()[0] || await context.newPage();
  glbResponses = new Map();
  page.on('pageerror', error => report.browserErrors.push({ stage, message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') report.browserErrors.push({ stage, message: message.text() });
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.endsWith('.glb')) glbResponses.set(url.pathname, response.status());
  });
  await page.goto(server.url);
  await idle();
  assert.equal(await page.evaluate(() => company.buildInfo.shortId), build);
}

async function closeBrowser() {
  if (!context) return;
  const browser = context.browser();
  await context.close();
  if (browser) assert.equal(browser.isConnected(), false, 'Chromium must disconnect before reopening the same profile');
  context = null;
  page = null;
}

async function confirmRenderedFrame() {
  const frame = await page.evaluate(() => company.renderStatus().hostFrame);
  await page.waitForFunction(previous => company.renderStatus().hostFrame > previous, frame);
  const status = await page.evaluate(() => company.renderStatus());
  assert.equal(status.lastRenderError, null, JSON.stringify(status.lastRenderError));
}

async function click(id) {
  await page.locator('#' + id).click();
  await idle();
}

async function select(id, value) {
  await page.locator('#' + id).selectOption(value);
  await idle();
}

const document = () => page.evaluate(() => company.session.document);
const node = (doc, id) => doc.nodes.find(item => item.id === id);
const parts = (doc, id) => doc.nodes.filter(item => item.stationId === id);
const ref = entry => entry.id + '@' + entry.version;

async function selectStation(id) {
  await click('tool-selection');
  await select('edit-instance', id);
  assert(await page.locator('#station-look-panel').isVisible(), 'Workstation look panel is hidden for ' + id);
  const values = await page.locator('#station-look option').evaluateAll(nodes => nodes.map(option => option.value));
  assert.deepEqual(values.filter(Boolean), looks, 'The room entry must offer all four complete looks');
}

async function applyLook(station, look) {
  if (await page.locator('#edit-instance').inputValue() !== station) await selectStation(station);
  await select('station-look', look);
  await click('apply-station-look');
  assert.equal(await page.locator('#edit-instance').inputValue(), station);
}

async function captureScene(ids) {
  const entries = await page.evaluate(ids => {
    const root = company.session.scene.root;
    root.updateMatrixWorld(true);
    return ids.map(id => {
      const object = root.getObjectByName(id);
      const visual = object?.children[0];
      if (!visual) return { id, meshes: [] };
      const meshes = [];
      visual.traverse(mesh => {
        if (!mesh.isMesh || !mesh.geometry?.attributes.position?.count) return;
        let visible = true;
        for (let current = mesh; current; current = current.parent) visible &&= current.visible !== false;
        meshes.push({
          name: mesh.userData.name || mesh.name,
          visible,
          points: mesh.geometry.attributes.position.count,
          indices: mesh.geometry.index?.count ?? 0,
          matrix: mesh.matrixWorld.elements.map(value => Number(value.toFixed(6))),
          materials: [mesh.material].flat().map(material => ({
            color: material.color?.getHexString(),
            emissive: material.emissive?.getHexString(),
            emissiveIntensity: material.emissiveIntensity,
            textured: Boolean(material.map),
          })),
        });
      });
      const entry = company.session.document.nodes.find(node => node.id === id);
      const resource = company.catalog.resources.find(resource => (
        resource.id === entry.resource.id && resource.version === entry.resource.version
      ));
      return { id, resource: entry.resource, asset: resource.asset, meshes };
    });
  }, ids);
  return entries.map(({ meshes, ...entry }) => {
    const visible = meshes.filter(mesh => mesh.visible);
    assert(visible.length > 0, 'No visible scene mesh mounted for ' + entry.id);
    return {
      ...entry,
      visibleMeshes: visible.length,
      vertices: visible.reduce((count, mesh) => count + mesh.points, 0),
      signature: createHash('sha256').update(JSON.stringify(meshes)).digest('hex'),
    };
  });
}

function checkApplication(before, after, station, expected, defaults) {
  const required = parts(after, station);
  assert.deepEqual(required.map(item => item.partKey).sort(), [...partKeys].sort());
  assert.equal(after.revision, before.revision + 1, 'One look must commit as one document revision');
  const anticipated = structuredClone(before);
  anticipated.revision = after.revision;
  for (const item of parts(anticipated, station)) {
    const replacement = expected[item.partKey];
    if (ref(item.resource) === ref(replacement)) continue;
    item.state = { ...defaults.get(ref(item.resource)), ...item.state };
    item.resource = replacement;
  }
  assert.deepEqual(after, anticipated, 'Only the six selected workstation resource references may change');
  return required.map(item => item.id);
}

async function saveAndReopen(before, meshes) {
  await click('save');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  const saved = await page.evaluate(() => JSON.parse(company.session.readSavedText(company.session.document.id)));
  assert.deepEqual(saved.document, before);
  for (const mesh of meshes) {
    const pin = saved.dependencies.resources.find(item => ref(item) === ref(mesh.resource));
    assert.match(pin?.sha256 ?? '', /^[a-f0-9]{64}$/, 'Missing pinned resource for ' + mesh.id);
  }
  await closeBrowser();
  await openBrowser();
  assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  assert.deepEqual(await document(), before, 'Starting a new Chromium process must restore the saved document');
  await confirmRenderedFrame();
  assert.deepEqual(await captureScene(meshes.map(mesh => mesh.id)), meshes);
  const requests = [];
  for (const mesh of meshes) {
    if (!mesh.asset) continue;
    assert.match(mesh.asset.sha256, /^[a-f0-9]{64}$/);
    const pathname = new URL(mesh.asset.url, server.url).pathname;
    assert.equal(glbResponses.get(pathname), 200, 'No successful GLB load after restarting: ' + pathname);
    if (!requests.includes(pathname)) requests.push(pathname);
  }
  return { loadedGlbs: requests, dependencies: saved.dependencies.resources };
}

async function check(name, action) {
  stage = name;
  const entry = { name, passed: false };
  report.checks.push(entry);
  entry.evidence = await action();
  entry.passed = true;
}

async function captureLook(station, file) {
  await click('edit-focus');
  const camera = await page.evaluate(id => {
    const object = company.session.scene.root.getObjectByName(id);
    return { position: company.camera.position.toArray(), station: object.name };
  }, station);
  await confirmRenderedFrame();
  await page.screenshot({ path: path.join(out, file) });
  return { file, camera };
}

async function run() {
  await fs.mkdir(out, { recursive: true });
  profile = await fs.mkdtemp(path.join(out, 'profile-'));
  stage = 'fixed build startup';
  server = await serve(dist, build, { manifest: 'company-build-info.json', entry: 'company.html' });
  report.sourceDigest = server.info.sourceDigest;
  await openBrowser();
  const defaults = new Map(await page.evaluate(() => company.catalog.resources.map(resource => [
    resource.id + '@' + resource.version, resource.stateDefaults,
  ])));
  let isolatedMeshes;
  await check('Two distinct workstations are selectable in the same room', async () => {
    await select('layout', 'base');
    const initial = await document();
    assert.equal(node(initial, wideStation)?.parentId, node(initial, otherStation)?.parentId);
    assert(node(initial, wideStation) && node(initial, otherStation));
    await selectStation(otherStation);
    await selectStation(wideStation);
    await select('edit-instance', wideStation + '/monitor');
    const monitorSwitch = page.locator('#edit-states button').first();
    assert(await monitorSwitch.isVisible());
    await monitorSwitch.click();
    await idle();
    const monitor = node(await document(), wideStation + '/monitor');
    const original = node(initial, monitor.id);
    const previous = original.state.on ?? defaults.get(ref(original.resource)).on;
    assert.equal(monitor.state.on, !previous, 'Monitor state was not changed through the room inspector');
    await select('edit-instance', wideStation + '/keyboard');
    await page.locator('#placement-tools > summary').click();
    await page.locator('#placement-tools > details > summary').click();
    await page.locator('#edit-x').fill('0.12');
    await click('edit-position');
    const keyboard = node(await document(), wideStation + '/keyboard');
    assert.equal(keyboard.transform.position[0], 0.12);
    isolatedMeshes = await captureScene(parts(await document(), otherStation).map(item => item.id));
    return { room: node(initial, wideStation).parentId, monitor: monitor.state, keyboard: keyboard.transform };
  });
  if (!record) {
    await selectStation(wideStation);
    await captureLook(wideStation, '00-original.png');
  }
  for (const look of looks) {
    await check('Two workstations: apply, save and automatically restore ' + look, async () => {
      const before = await document();
      await applyLook(wideStation, look);
      const after = await document();
      const ids = checkApplication(before, after, wideStation, expected[look], defaults);
      const meshes = await captureScene(ids);
      assert.deepEqual(await captureScene(isolatedMeshes.map(item => item.id)), isolatedMeshes);
      const screenshot = record ? undefined : await captureLook(wideStation, look + '.png');
      const restore = await saveAndReopen(after, [...meshes, ...isolatedMeshes]);
      return { meshes, otherStation: isolatedMeshes, restore, screenshot };
    });
  }
  await check('Open real conceptStudio room with independent mounted secondary monitor', async () => {
    await select('layout', 'conceptStudio');
    const before = await document();
    assert.equal(before.id, 'concept-streaming-desk');
    const secondary = node(before, secondaryMonitor);
    assert.equal(secondary?.parentId, conceptStation + '/desk');
    assert(!secondary.stationId, 'Secondary monitor should remain an independently mounted device');
    await selectStation(conceptStation);
    return { secondary, scene: await captureScene([secondaryMonitor]) };
  });
  const extraIds = (await document()).nodes.filter(item => item.kind === 'facility' && !item.stationId).map(item => item.id);
  const extras = await captureScene(extraIds);
  for (const look of looks) {
    await check('Concept studio: reuse, save and automatically restore ' + look, async () => {
      const before = await document();
      await applyLook(conceptStation, look);
      const after = await document();
      const ids = checkApplication(before, after, conceptStation, expected[look], defaults);
      const meshes = await captureScene(ids);
      assert.deepEqual(await captureScene(extraIds), extras, 'Secondary monitor or another installed object changed');
      const screenshot = look === looks.at(-1) ? await captureLook(conceptStation, 'concept-dual-monitor.png') : undefined;
      const restore = await saveAndReopen(after, [...meshes, ...extras]);
      return { meshes, extraDevices: extras, restore, screenshot };
    });
  }
  if (record) {
    await check('One normal-speed recording of the four looks in the room', async () => {
      await closeBrowser();
      await openBrowser({ recording: true });
      const video = page.video();
      await select('layout', 'base');
      await selectStation(wideStation);
      await captureLook(wideStation, '00-original.png');
      const screenshots = [];
      for (const look of looks) {
        const before = await document();
        await applyLook(wideStation, look);
        checkApplication(before, await document(), wideStation, expected[look], defaults);
        screenshots.push(await captureLook(wideStation, look + '.png'));
        await page.waitForTimeout(1250);
      }
      await closeBrowser();
      const file = path.join('video', 'workstation-looks-normal.webm');
      await video.saveAs(path.join(out, file));
      await video.delete();
      report.video.file = file;
      return { file, screenshots };
    });
  }
  assert.deepEqual(report.browserErrors, []);
  report.status = 'passed';
}

run().catch(async error => {
  report.status = 'failed';
  report.failure = { stage, message: error.message, stack: error.stack };
  if (page) {
    report.failure.statusText = await page.locator('#status').textContent({ timeout: 2000 }).catch(() => undefined);
    await page.screenshot({ path: path.join(out, 'failure.png'), timeout: 5000 }).catch(() => {});
  }
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  try {
    await closeBrowser();
    await server?.close();
  } catch (error) {
    report.cleanupError = error.message;
    report.status = 'failed';
    process.exitCode = 1;
  }
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, build, output: out, video: report.video.file }));
});
