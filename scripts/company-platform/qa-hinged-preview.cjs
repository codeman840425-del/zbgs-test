const { chromium } = require('../../prototype/node_modules/playwright');
const { serve } = require('./serve.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const [dist, build, outArg] = process.argv.slice(2);
if (!dist || !build || !outArg) throw new Error('Usage: node scripts/company-platform/qa-hinged-preview.cjs DIST BUILD OUTPUT_DIR');
const out = path.resolve(outArg);
const report = { build, status: 'running', checks: [], limits: [
  'Software-rendered browser regression only. No ordinary-PC performance or C3 character acceptance claim.',
  'Door blocking is checked through the authored snapshot AABB and one conservative blocking-plant scenario.'
] };
let server, context, page;
const errors = [];

async function open() {
  context = await chromium.launchPersistentContext(path.join(out, 'profile'), {
    headless: true,
    viewport: { width: 1440, height: 1000 },
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.url);
  await page.waitForFunction(() => window.company?.ready && company.buildInfo);
  assert.equal(await page.evaluate(() => company.buildInfo.shortId), build);
}

async function saveProgress() {
  await fs.writeFile(path.join(out, 'progress.json'), JSON.stringify(report, null, 2) + '\n');
}

async function check(name, fn) {
  const result = await fn();
  report.checks.push({ name, passed: true, result });
  await saveProgress();
  console.log(name);
}

async function restart() {
  await context.close();
  context = null;
  await open();
}

async function reject(operations, expectedCode) {
  const result = await page.evaluate(async operations => {
    const before = JSON.stringify(company.session.document);
    const saved = JSON.stringify({ ...localStorage });
    let code;
    try { await company.apply(operations); } catch (error) { code = error.code; }
    return { code, documentUnchanged: before === JSON.stringify(company.session.document), saveUnchanged: saved === JSON.stringify({ ...localStorage }) };
  }, operations);
  assert.equal(result.code, expectedCode);
  assert(result.documentUnchanged && result.saveUnchanged);
  return result;
}

async function stateSnapshot(fraction) {
  return page.evaluate(fraction => {
    const node = company.session.document.nodes.find(candidate => candidate.id === 'hinged/cabinet');
    const prop = company.session.document.nodes.find(candidate => candidate.id === 'hinged/top-prop');
    const facility = company.session.scene.root.getObjectByName('hinged/cabinet');
    const pivot = facility?.getObjectByName('cabinet-door-pivot');
    if (!node || !prop || !facility || !pivot) throw Error('Hinged sample nodes or pivot are missing');
    const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    const visit = object => {
      if (object.isMesh && object.geometry?.attributes?.position) {
        const position = object.geometry.attributes.position, matrix = object.matrixWorld.elements;
        for (let index = 0; index < position.count; index++) {
          const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
          const world = [matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12], matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13], matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]];
          for (let axis = 0; axis < 3; axis++) { bounds.min[axis] = Math.min(bounds.min[axis], world[axis]); bounds.max[axis] = Math.max(bounds.max[axis], world[axis]); }
        }
      }
      for (const child of object.children) visit(child);
    };
    facility.updateMatrixWorld(true); visit(pivot);
    const snapshot = company.snapshot();
    const obstacle = snapshot.navigation.find(candidate => candidate.instanceId === 'hinged/cabinet');
    if (!obstacle) throw Error('Hinged cabinet is absent from snapshot navigation');
    const footprint = obstacle.footprint, matrix = facility.matrixWorld.elements, footprintBounds = { min: [Infinity, Infinity], max: [-Infinity, -Infinity] };
    for (const x of [footprint.center[0] - footprint.halfSize[0], footprint.center[0] + footprint.halfSize[0]]) for (const z of [footprint.center[1] - footprint.halfSize[1], footprint.center[1] + footprint.halfSize[1]]) {
      const worldX = matrix[0] * x + matrix[8] * z + matrix[12], worldZ = matrix[2] * x + matrix[10] * z + matrix[14];
      footprintBounds.min[0] = Math.min(footprintBounds.min[0], worldX); footprintBounds.max[0] = Math.max(footprintBounds.max[0], worldX);
      footprintBounds.min[1] = Math.min(footprintBounds.min[1], worldZ); footprintBounds.max[1] = Math.max(footprintBounds.max[1], worldZ);
    }
    const withinFootprint = bounds.min[0] >= footprintBounds.min[0] - 1e-5 && bounds.max[0] <= footprintBounds.max[0] + 1e-5 && bounds.min[2] >= footprintBounds.min[1] - 1e-5 && bounds.max[2] <= footprintBounds.max[1] + 1e-5;
    const withinNavigation = bounds.min[0] >= obstacle.x - obstacle.hw - 1e-5 && bounds.max[0] <= obstacle.x + obstacle.hw + 1e-5 && bounds.min[2] >= obstacle.z - obstacle.hd - 1e-5 && bounds.max[2] <= obstacle.z + obstacle.hd + 1e-5;
    if (!withinFootprint || !withinNavigation) throw Error('Door vertices exceed the snapshot blocking footprint');
    const propObject = company.session.scene.root.getObjectByName('hinged/top-prop');
    const propWorldMatrix = [...propObject.matrixWorld.elements];
    if (Math.abs(pivot.rotation.y + Math.PI / 2 * fraction) > 1e-6) throw Error('Door pivot rotation does not match openFraction');
    return { fraction, state: node.state, prop: { parentId: prop.parentId, attachment: prop.attachment }, propWorldMatrix: propWorldMatrix, pivot: { name: pivot.name, rotationY: pivot.rotation.y }, doorBounds: bounds, blocking: { x: obstacle.x, z: obstacle.z, hw: obstacle.hw, hd: obstacle.hd, footprint, footprintWorld: footprintBounds, withinFootprint, withinNavigation } };
  }, fraction);
}

(async () => {
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.mkdir(out);
  report.harnessSha256 = createHash('sha256').update(await fs.readFile(__filename)).digest('hex');
  server = await serve(dist, build, { manifest: 'company-build-info.json', entry: 'company.html' });
  await open();

  await check('Four real cabinet GLBs cover 0/0.5/1 opening states, save and recover after restart', async () => {
    const records = [];
    for (let index = 0; index < 4; index++) {
      await page.evaluate(index => company.showAppearanceSample('hinged-cabinet', index), index);
      const controls = await page.evaluate(() => [...document.querySelectorAll('[data-opening]')].map(button => button.dataset.opening));
      assert.deepEqual(controls.sort(), ['0', '0.5', '1']);
      const resource = await page.evaluate(index => company.appearanceCandidates('hinged-cabinet')[index], index);
      const states = [];
      for (const fraction of [0, 0.5, 1]) {
        await page.locator(`[data-opening="${fraction}"]`).click();
        await page.waitForFunction(f => company.session.document.nodes.find(node => node.id === 'hinged/cabinet')?.state?.openFraction === f, fraction);
        await page.evaluate(() => company.view('cabinet'));
        const observed = await stateSnapshot(fraction);
        const screenshot = `hinged-${index + 1}-${String(fraction).replace('.', '_')}.png`;
        await page.screenshot({ path: path.join(out, screenshot) });
        await page.evaluate(() => company.save());
        const saved = await page.evaluate(() => company.session.document);
        await restart();
        assert.deepEqual(await page.evaluate(() => company.session.document), saved);
        states.push({ ...observed, recovered: true, screenshot });
      }
      records.push({ index, resource: { id: resource.id, version: resource.version, sha256: resource.asset.sha256 }, states });
    }
    assert.equal(new Set(records.map(record => record.resource.sha256)).size, 4);
    return records;
  });

  await check('Half-open replacement preserves state, real top prop attachment and cabinet focus', async () => {
    await page.evaluate(() => company.showAppearanceSample('hinged-cabinet', 0));
    await page.evaluate(async () => { await company.apply([{ type: 'set-state', id: 'hinged/cabinet', state: { openFraction: 0.5 } }]); company.view('cabinet'); });
    const before = await stateSnapshot(0.5);
    const replaced = await page.evaluate(async () => {
      const current = company.session.document.nodes.find(node => node.id === 'hinged/cabinet');
      const next = company.appearanceCandidates('hinged-cabinet').find(resource => resource.id !== current.resource.id);
      await company.apply([{ type: 'replace-resource', id: 'hinged/cabinet', resource: { id: next.id, version: next.version } }]);
      company.view('cabinet');
      return { id: next.id, snapshot: company.snapshot(), state: company.session.document.nodes.find(node => node.id === 'hinged/cabinet').state, prop: company.session.document.nodes.find(node => node.id === 'hinged/top-prop') };
    });
    assert.equal(replaced.state.openFraction, 0.5);
    assert.equal(replaced.prop.parentId, 'hinged/cabinet');
    assert.equal(replaced.prop.attachment.surfaceId, 'top');
    const after = await stateSnapshot(0.5);
    assert.equal(after.pivot.rotationY, before.pivot.rotationY);
    assert.deepEqual(after.propWorldMatrix, before.propWorldMatrix);
    return { before, replacement: { id: replaced.id, state: replaced.state, prop: replaced.prop, displayedFacilities: replaced.snapshot.displayedFacilities }, after };
  });

  await check('Parent yaw and alternate layout retain cabinet, top prop and open state', async () => {
    await page.evaluate(async () => { await company.load(company.layouts.hinged); await company.apply([{ type: 'set-state', id: 'hinged/cabinet', state: { openFraction: 0.5 } }]); await company.view('cabinet'); });
    const first = await page.evaluate(() => ({ cabinet: company.session.document.nodes.find(node => node.id === 'hinged/cabinet'), prop: company.session.document.nodes.find(node => node.id === 'hinged/top-prop'), snapshot: company.snapshot() }));
    await page.evaluate(async () => { await company.apply([{ type: 'move', id: 'hinged/cabinet', transform: { position: [1.7, 0, -0.4], yaw: Math.PI / 2 } }]); await company.view('cabinet'); });
    const turned = await page.evaluate(() => ({ cabinet: company.session.document.nodes.find(node => node.id === 'hinged/cabinet'), prop: company.session.document.nodes.find(node => node.id === 'hinged/top-prop'), snapshot: company.snapshot() }));
    assert.equal(turned.cabinet.state.openFraction, 0.5);
    assert.equal(turned.prop.parentId, 'hinged/cabinet');
    assert.equal(turned.prop.attachment.surfaceId, 'top');
    await page.evaluate(async () => { await company.load(company.layouts.hingedAlternate); await company.view('cabinet'); });
    const alternate = await page.evaluate(() => ({ cabinet: company.session.document.nodes.find(node => node.id === 'hinged/cabinet'), prop: company.session.document.nodes.find(node => node.id === 'hinged/top-prop') }));
    assert.equal(alternate.cabinet.transform.yaw, Math.PI / 2);
    assert.equal(alternate.prop.parentId, 'hinged/cabinet');
    return { first: first.cabinet.transform, turned: turned.cabinet.transform, alternate: alternate.cabinet.transform, topProp: alternate.prop.attachment };
  });

  await check('Invalid state and malformed part panel preserve the current document and save', async () => {
    await page.evaluate(() => company.showAppearanceSample('hinged-cabinet', 0));
    const badState = await reject([{ type: 'set-state', id: 'hinged/cabinet', state: { openFraction: 1.5 } }], 'invalid-device-state');
    const unknownState = await reject([{ type: 'set-state', id: 'hinged/cabinet', state: { unexpected: 1 } }], 'invalid-device-state');
    const badPanel = await page.evaluate(async () => {
      const cabinet = company.session.document.nodes.find(node => node.id === 'hinged/cabinet');
      const source = company.catalog.resources.find(resource => resource.id === cabinet.resource.id && resource.version === cabinet.resource.version);
      const bad = structuredClone(source); bad.id = 'qa-bad-part-panel'; bad.partPanels = { door: 'missing-door-panel' }; company.catalog.resources.push(bad);
      const before = JSON.stringify(company.session.document), saved = await company.export(); let code;
      try { await company.apply([{ type: 'replace-resource', id: 'hinged/cabinet', resource: { id: bad.id, version: bad.version } }]); } catch (error) { code = error.code; }
      company.catalog.resources.pop(); return { code, documentUnchanged: before === JSON.stringify(company.session.document), saveUnchanged: saved === await company.export() };
    });
    assert(badPanel.code && badPanel.documentUnchanged && badPanel.saveUnchanged);
    return { badState, unknownState, badPanel };
  });

  await check('HTTP503 cabinet replacement and conservative opening blocker preserve the old state', async () => {
    await page.evaluate(() => company.showAppearanceSample('hinged-cabinet', 0));
    const resourceInfo = await page.evaluate(() => {
      const cabinet = company.session.document.nodes.find(node => node.id === 'hinged/cabinet');
      const replacement = company.appearanceCandidates('hinged-cabinet').find(resource => resource.id !== cabinet.resource.id);
      return { resource: { id: replacement.id, version: replacement.version }, url: replacement.asset.url };
    });
    await page.route(`**${resourceInfo.url}`, route => route.fulfill({ status: 503, body: 'hinged-test-failure' }));
    let badFetch;
    try {
      badFetch = await page.evaluate(async info => {
        const before = JSON.stringify(company.session.document), saved = JSON.stringify({ ...localStorage }); let code;
        try { await company.apply([{ type: 'replace-resource', id: 'hinged/cabinet', resource: info.resource }]); } catch (error) { code = error.code; }
        return { code, documentUnchanged: before === JSON.stringify(company.session.document), saveUnchanged: saved === JSON.stringify({ ...localStorage }) };
      }, resourceInfo);
    } finally { await page.unroute(`**${resourceInfo.url}`); }
    assert.equal(badFetch.code, 'asset-fetch-failed');
    assert(badFetch.documentUnchanged && badFetch.saveUnchanged);

    const blocker = await page.evaluate(async () => {
      const roomId = company.session.document.nodes.find(node => node.kind === 'room').id;
      await company.apply([{ type: 'add-facility', id: 'hinged/blocker', parentId: roomId, resource: { id: 'plant-palm', version: 1 }, transform: { position: [1.48, 0, -0.6], yaw: 0 } }]);
      const before = JSON.stringify(company.session.document), saved = JSON.stringify({ ...localStorage }); let code;
      try { await company.apply([{ type: 'set-state', id: 'hinged/cabinet', state: { openFraction: 1 } }]); } catch (error) { code = error.code; }
      const current = company.session.document.nodes.find(node => node.id === 'hinged/cabinet');
      const afterFailure = JSON.stringify(company.session.document), saveAfterFailure = JSON.stringify({ ...localStorage });
      await company.apply([{ type: 'remove', id: 'hinged/blocker' }]);
      return { code, documentUnchanged: before === afterFailure, state: current.state, saveUnchanged: saved === saveAfterFailure };
    });
    assert(['blocked-moving-part', 'overlapping-facilities'].includes(blocker.code));
    assert.equal(blocker.state.openFraction, 0);
    assert(blocker.documentUnchanged && blocker.saveUnchanged);
    const release = await page.evaluate(async () => {
      const before = company.assetLibrary.snapshot();
      await company.load(company.layouts.smallHome);
      const after = company.assetLibrary.snapshot();
      const cabinetNodes = company.session.document.nodes.filter(node => company.catalog.resources.find(resource => resource.id === node.resource?.id && resource.version === node.resource?.version)?.mountRole === 'hinged-cabinet');
      return { before, after, displayedFacilities: company.snapshot().displayedFacilities, cabinetNodes, cabinetSceneNode: Boolean(company.session.scene.root.getObjectByName('hinged/cabinet')) };
    });
    assert.equal(release.cabinetNodes.length, 0);
    assert.equal(release.cabinetSceneNode, false);
    return { badFetch, blocker, release };
  });

  assert.deepEqual(errors, []);
  report.status = 'passed';
})().catch(error => { report.status = 'failed'; report.error = error.stack; process.exitCode = 1; }).finally(async () => {
  if (context) await context.close();
  if (server) await server.close();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, error: report.error, output: out }));
});
