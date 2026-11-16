// node scripts/qa-representative-hot-switch.cjs URL BUILD NEW_OUTPUT RUNTIME_INDEX
// Prepared browser QA only. The source author does not run a GPU/browser job.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {verifyCandidate} = require('./qa-m1-common.cjs');
const PLAN = {
  scope: ['One document, UI sex/body switches through all eight exact presets',
    'Female bob and head-reference ponytail, male sidepart must really select',
    'Green iris and rose lips, actual target palette identity and network receipts',
    'Saved draft and downloaded recipe restore after different appearance mutations',
    'Three overlapping common-controller body requests, older responses released last'],
  limits: ['Normal-speed development Chrome recording, no ordinary-PC performance claim',
    'Technical assertions and screenshots require separate continuous visual review',
    'UI serializes body changes while busy. Concurrency probe uses its shared controller command entry.'],
};
if (process.argv.includes('--plan')) {
  console.log(JSON.stringify(PLAN, null, 2));
  process.exit(0);
}
const [url, build, destination, indexPath] = process.argv.slice(2);
assert(url && /^https?:\/\/(127\.0\.0\.1|localhost):\d+\/$/.test(url), 'Explicit local fixed-candidate root URL required');
assert(/^[a-f0-9]{12}$/.test(build || ''), 'Explicit 12-hex fixed build required');
assert(destination && indexPath, 'New output directory and exact runtime-index path required');
const out = path.resolve(destination);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const result = {build, url, status: 'running', plan: PLAN, cases: [], errors: [], network: [], navigationRequests: []};
let page, context, browser;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(result, null, 2)+'\n');

async function ready() {
  await page.waitForFunction(() => {
    const d = window.__debug, s = d?.avatar?.()?.appearance?.getState();
    return d?.ready && document.querySelector('#appearance-form')?.getAttribute('aria-busy') === 'false' &&
      !d.snapshot().bodySelection.loading && s && !s.loading && !s.facialPaletteLoading;
  }, null, {timeout: 90000});
}
async function state() {
  return page.evaluate(() => {
    const a = __debug.avatar(), snapshot = __debug.snapshot();
    return {profile: a.profile, appearance: a.appearance.getState(), outfit: a.getOutfitInfo(),
      recipe: JSON.parse(__debug.exportAppearanceRecipe()), snapshot,
      bodyValue: document.querySelector('#appearance-body').value,
      selectedSex: [...document.querySelectorAll('[data-appearance-group]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.appearanceGroup),
      sameDocument: window.__hotDocument === document,
      status: document.querySelector('#appearance-status').textContent};
  });
}
async function screenshot(name) {
  await page.screenshot({path: path.join(out, name+'.png')});
}
async function choose(selector, value) {
  const supported = await page.locator(selector).evaluate((el, value) =>
    !el.disabled && [...el.options].some(o => o.value === value && !o.disabled), value);
  assert(supported, `${selector} cannot select required value ${value}`);
  await page.selectOption(selector, value);
  await ready();
  assert.equal(await page.locator('#appearance-status').getAttribute('data-error'), 'false');
  assert.equal(await page.locator(selector).inputValue(), value);
}
async function getJSON(resource) {
  const response = await page.request.get(new URL(resource, url).href);
  assert(response.ok(), `HTTP ${response.status()} ${resource}`);
  const bytes = await response.body();
  return {url: response.url(), sha256: hash(bytes), data: JSON.parse(bytes)};
}
async function assertBody(spec) {
  const actual = await state();
  assert(actual.sameDocument, 'Body selection replaced the document');
  assert.equal(actual.profile.bodyType, spec.id);
  assert.equal(actual.profile.sha256, spec.profile.sha256);
  assert.equal(actual.bodyValue, spec.id);
  assert.deepEqual(actual.selectedSex, [spec.sex]);
  assert.equal(actual.recipe.base.sha256, spec.profile.sha256);
  assert.equal(actual.recipe.equipment.manifestUrl, spec.profile.manifestUrl);
  assert.equal(actual.outfit.equipment.avatarSha256, spec.profile.sha256);
  const served = await getJSON(spec.profile.manifestUrl);
  const entries = Object.values(actual.recipe.equipment.resources);
  assert.equal(entries.length, 3, 'Expected actual top, lower and shoes selection');
  for (const entry of entries) {
    assert.equal(entry.compatibleAvatarSha256, spec.profile.sha256);
    assert.deepEqual(entry, served.data.items.find(item => item.id === entry.id));
    assert(Object.values(spec.profile.ids).includes(entry.id));
    const visible = Object.values(actual.outfit.equipment.items).find(item => item.id === entry.id);
    assert.equal(visible?.visible, true, `Selected garment is not actually visible ${entry.id}`);
    assert(Array.isArray(entry.bindings) && entry.bindings.length > 0);
  }
  return {actual, equipmentManifest: served};
}
async function chooseBody(spec) {
  await ready();
  const before = await state();
  if (before.selectedSex[0] !== spec.sex) {
    await page.locator(`[data-appearance-group="${spec.sex}"]`).click();
    await ready();
  }
  await choose('#appearance-body', spec.id);
  await page.waitForFunction(id => __debug.avatar().profile.bodyType === id, spec.id, {timeout: 90000});
  return before;
}
async function verifyHair(style, spec) {
  await choose('#appearance-hair-style', style);
  const actual = await state();
  assert.equal(actual.appearance.hairStyle, style);
  assert.equal(actual.recipe.appearance.hairStyle, style);
  assert.match(actual.appearance.replacementSHA256, /^[a-f0-9]{64}$/);
  assert.equal(actual.appearance.hairFit?.kind, 'explicit-fit-v1');
  await Promise.all([...pendingResponses]);
  const receipt = jsonResponses.find(r => r.sha256 === actual.appearance.hairFit.sha256);
  assert(receipt, 'No actual loaded exact fit response for '+style);
  assert.equal(receipt.data.targetBodySha256, spec.profile.sha256);
  assert.equal(receipt.data.styleId, style);
  assert.equal(receipt.data.assetSha256, actual.appearance.replacementSHA256);
  assert.equal(receipt.data.id, actual.appearance.hairFit.id);
  assert.equal(receipt.data.version, actual.appearance.hairFit.version);
  if (style === 'female-ponytail-headref-v3') {
    assert.equal(receipt.data.dynamics.simulationReference, 'raw-head');
    assert.equal(actual.appearance.hairDynamics.simulationFrame, 'raw-head');
  }
  return {style, fit: actual.appearance.hairFit, assetSha256: actual.appearance.replacementSHA256, responseUrl: receipt.url};
}
async function mutate() {
  await choose('#appearance-eye-color', 'violet');
  await choose('#appearance-lip-color', 'mauve');
  await choose('#appearance-hair-color', 'blonde');
}
async function restoreRecipe(file) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#appearance-read').click();
  await (await chooser).setFiles(file);
  await ready();
  assert.equal(await page.locator('#appearance-status').getAttribute('data-error'), 'false');
}
const pendingResponses = new Set(), jsonResponses = [];

async function main() {
  const indexBytes = await fs.readFile(indexPath), index = JSON.parse(indexBytes);
  assert.equal(index.schema, 'representative-runtime-index-v1');
  assert.equal(index.presets.length, 8);
  assert.equal(new Set(index.presets.map(p => p.id)).size, 8);
  for (const sex of ['female', 'male']) assert.equal(index.presets.filter(p => p.sex === sex).length, 4);
  await fs.mkdir(out, {recursive: false});
  await fs.copyFile(__filename, path.join(out, 'executed-script.cjs'));
  await fs.writeFile(path.join(out, 'executed-runtime-index.json'), indexBytes);
  const {chromium} = require('../prototype/node_modules/playwright');
  try {
    browser = await chromium.launch({channel: 'chrome', headless: true});
    context = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true,
      recordVideo: {dir: path.join(out, 'video'), size: {width: 1440, height: 900}}});
    page = await context.newPage();
    page.on('pageerror', error => result.errors.push(String(error)));
    page.on('request', request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) result.navigationRequests.push(request.url());
      result.network.push({event: 'request', url: request.url(), at: Date.now()});
    });
    page.on('response', response => {
      result.network.push({event: 'response', url: response.url(), status: response.status(), at: Date.now()});
      if (!new URL(response.url()).pathname.endsWith('.json')) return;
      const job = (async () => {
        try {
          const bytes = await response.body();
          jsonResponses.push({url: response.url(), sha256: hash(bytes), data: JSON.parse(bytes)});
        } catch (error) { result.network.push({event: 'unreadable-json-response', url: response.url(), error: String(error)}); }
      })();
      pendingResponses.add(job); job.finally(() => pendingResponses.delete(job));
    });
    const initial = new URL(url); initial.searchParams.set('workbench', 'appearance'); initial.searchParams.set('body', index.presets[0].id);
    await page.goto(initial.href); await ready();
    const servedIndex = await getJSON('/assets/m2-representative-batch-v1/runtime-index.json');
    assert.equal(servedIndex.sha256, hash(indexBytes), 'Served runtime index differs from explicit input');
    result.runtimeIndexSha256 = servedIndex.sha256;
    const palette = await getJSON(index.palette.url);
    assert.equal(palette.sha256, index.palette.sha256);
    result.palette = {url: palette.url, sha256: palette.sha256, version: index.palette.version};
    await page.evaluate(() => {
      window.__hotDocument = document; __debug.setPlaybackRate(1); __debug.setPaused(false);
      window.__hotSamples = []; window.__hotPhase = 'initial';
      window.__hotTimer = setInterval(() => {
        const s = __debug.snapshot();
        __hotSamples.push({at: performance.now(), phase: __hotPhase, profile: __debug.avatar().profile.bodyType,
          sha256: __debug.avatar().profile.sha256, selected: document.querySelector('#appearance-body').value,
          loading: s.bodySelection, appearance: {hairStyle: s.appearance.hairStyle, eyeColor: s.appearance.eyeColor, lipColor: s.appearance.lipColor}});
      }, 100);
    });
    await page.locator('[data-workbench-tab="appearance"]').click();
    for (const spec of index.presets) {
      const row = {id: spec.id, sex: spec.sex, build, status: 'running', checks: [], failures: []};
      result.cases.push(row);
      try {
        await page.evaluate(id => window.__hotPhase = id, spec.id);
        const networkStart = result.network.length;
        row.beforeSwitch = await chooseBody(spec);
        row.identity = await verifyCandidate(page, {build, assetId: spec.profile.id, sha256: spec.profile.sha256});
        row.body = await assertBody(spec);
        row.afterSwitch = await state();
        assert.equal(row.afterSwitch.appearance.eyeColor, row.beforeSwitch.appearance.eyeColor, 'Supported iris selection lost at body switch');
        assert.equal(row.afterSwitch.appearance.lipColor, row.beforeSwitch.appearance.lipColor, 'Supported lip selection lost at body switch');
        row.hair = [];
        for (const style of spec.sex === 'female' ? ['female-bob-v1', 'female-ponytail-headref-v3'] : ['male-sidepart-v1']) {
          try {
            row.hair.push(await verifyHair(style, spec));
            row.checks.push({name: 'required hairstyle '+style, passed: true});
            await page.evaluate(() => __debug.camera('inspect-face-front'));
            await page.waitForTimeout(600); await screenshot(spec.id+'-'+style);
          } catch (error) {
            const reason = String(error.stack || error);
            row.hair.push({style, passed: false, reason}); row.failures.push(reason);
            row.checks.push({name: 'required hairstyle '+style, passed: false, reason});
            await screenshot(spec.id+'-'+style+'-failure');
          }
        }
        await choose('#appearance-eye-color', 'green'); await choose('#appearance-lip-color', 'rose');
        const colored = await state();
        assert.equal(colored.appearance.eyeColor, 'green'); assert.equal(colored.appearance.lipColor, 'rose');
        assert.equal(colored.recipe.paletteVersion, index.palette.version);
        const descriptor = palette.data.variants.find(v => v.avatarSha256 === spec.profile.sha256);
        assert(descriptor, 'Target lacks explicit palette descriptor');
        assert.deepEqual(colored.appearance.facialMaskIdentity, {iris: descriptor.parts.iris.maskSha256, lips: descriptor.parts.lips.maskSha256});
        await Promise.all([...pendingResponses]);
        row.paletteResponses = jsonResponses.filter(r => r.sha256 === index.palette.sha256).map(({data, ...r}) => r);
        row.switchAndColorNetwork = result.network.slice(networkStart).filter(r =>
          [index.palette.url, descriptor.parts.iris.maskUrl, descriptor.parts.iris.neutralMapUrl, descriptor.parts.lips.maskUrl].includes(new URL(r.url).pathname));
        assert(row.switchAndColorNetwork.some(r => r.event === 'request' && new URL(r.url).pathname === index.palette.url), 'No actual actor palette load observed');
        assert(row.paletteResponses.length > 0, 'No hashed actual palette response');
        await page.locator('#appearance-save').click();
        const draft = await page.evaluate(id => JSON.parse(localStorage.getItem('zbgs:appearance-draft:v1:'+id)), spec.id);
        assert.deepEqual(draft, colored.recipe);
        const downloadWait = page.waitForEvent('download'); await page.locator('#appearance-download').click();
        const download = await downloadWait, recipeFile = path.join(out, spec.id+'-recipe.json'); await download.saveAs(recipeFile);
        assert.deepEqual(JSON.parse(await fs.readFile(recipeFile, 'utf8')), colored.recipe);
        await mutate(); assert.notDeepEqual((await state()).recipe, colored.recipe);
        await restoreRecipe(recipeFile); assert.deepEqual((await state()).recipe, colored.recipe);
        await mutate(); assert.notDeepEqual((await state()).recipe, colored.recipe);
        await page.locator('#appearance-restore').click(); await ready();
        assert.deepEqual((await state()).recipe, colored.recipe);
        row.restored = await assertBody(spec); row.recipeFile = path.basename(recipeFile);
        row.checks.push({name: 'UI exact body/clothes', passed: true},
          {name: 'Actual nonoriginal iris/lip palette per exact body', passed: true},
          {name: 'File and saved draft restore after distinct mutations', passed: true});
        await page.evaluate(() => __debug.camera('inspect-full-front'));
        await page.waitForTimeout(800); await screenshot(spec.id+'-restored');
        row.status = row.failures.length ? 'failed' : 'technical-checks-passed-visual-pending';
      } catch (error) {
        row.status = 'failed'; row.error = String(error.stack || error);
        try { row.failureSnapshot = await state(); await screenshot(spec.id+'-failure'); } catch {}
      }
      await save();
    }
    const race = ['female-round-full', 'male-long-lean', 'female-soft-wide'].map(id => index.presets.find(p => p.id === id));
    assert.equal(race.length, 3);
    assert(race.every(Boolean), 'Three explicit race presets required');
    result.race = {ids: race.map(p => p.id), entry: 'shared __debug.command bodySelect; UI busy guard stays intact', status: 'running'};
    const held = new Map(); let releaseAll = false;
    const routeHandler = async route => {
      const spec = race.find(s => new URL(s.profile.url, url).href === route.request().url());
      if (!spec || releaseAll) return route.continue();
      held.set(spec.id, route);
    };
    await page.route('**/assets/m2-representative-batch-v1/*/avatar.vrm', routeHandler);
    try {
      await page.evaluate(ids => {
        window.__hotPhase = 'three-overlapping-loads';
        window.__hotRaceDone = Promise.all(ids.map(async (bodyType, i) => {
          await new Promise(resolve => setTimeout(resolve, i*60));
          const requestedAt = performance.now(), outcome = await __debug.command({type: 'bodySelect', bodyType});
          return {bodyType, requestedAt, completedAt: performance.now(), outcome};
        }));
      }, race.map(s => s.id));
      const deadline = Date.now()+15000;
      while (held.size < 3 && Date.now() < deadline) await page.waitForTimeout(50);
      assert.equal(held.size, 3, 'All three loads must overlap before releasing responses');
      const winner = race.at(-1); await held.get(winner.id).continue(); held.delete(winner.id);
      await page.waitForFunction(id => __debug.avatar().profile.bodyType === id && !__debug.snapshot().bodySelection.loading, winner.id, {timeout: 90000});
      result.race.winnerBeforeOldResponses = await assertBody(winner);
      for (const prior of race.slice(0, -1).reverse()) { await held.get(prior.id).continue(); held.delete(prior.id); }
      result.race.requests = await page.evaluate(() => __hotRaceDone);
      assert.equal(result.race.requests[2].outcome.applied, true);
      for (const prior of result.race.requests.slice(0, -1)) assert.equal(prior.outcome.cancelled, true);
      await ready(); await page.waitForTimeout(1500);
      result.race.final = await assertBody(winner);
      result.race.identity = await verifyCandidate(page, {build, assetId: winner.profile.id, sha256: winner.profile.sha256});
      await screenshot('three-requests-final-winner'); result.race.status = 'technical-checks-passed-visual-pending';
    } catch (error) {
      result.race.status = 'failed'; result.race.error = String(error.stack || error);
      try { result.race.failureSnapshot = await state(); await screenshot('three-requests-failure'); } catch {}
    } finally {
      releaseAll = true;
      for (const route of held.values()) await route.continue().catch(() => {});
      await page.unroute('**/assets/m2-representative-batch-v1/*/avatar.vrm', routeHandler);
    }
    assert.equal(result.navigationRequests.length, 1, 'Unexpected navigation/reload during same-page batch');
    assert.deepEqual(result.errors, []);
    result.status = result.cases.every(r => r.status === 'technical-checks-passed-visual-pending') &&
      result.race.status === 'technical-checks-passed-visual-pending' ? 'technical-checks-passed-visual-pending' : 'failed';
  } catch (error) {
    result.status = 'failed'; result.error = String(error.stack || error);
    if (page) try { result.failureSnapshot = await state(); await screenshot('failure'); } catch {}
  } finally {
    if (page) try { result.samples = await page.evaluate(() => { clearInterval(window.__hotTimer); return window.__hotSamples || []; }); } catch {}
    await Promise.all([...pendingResponses]);
    const video = page?.video();
    try {
      await context?.close();
      if (video) { await video.saveAs(path.join(out, 'normal1x.webm')); await video.delete(); }
    } catch (error) { result.videoError = String(error); result.status = 'failed'; }
    try { await browser?.close(); }
    catch (error) { result.browserCloseError = String(error); result.status = 'failed'; }
    await save();
  }
  if (result.status === 'failed') process.exitCode = 1;
  console.log(JSON.stringify({build, status: result.status, cases: result.cases.map(r => ({id: r.id, status: r.status})), race: result.race?.status}));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
