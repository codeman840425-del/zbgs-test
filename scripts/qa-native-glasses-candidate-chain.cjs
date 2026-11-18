// Candidate-only glasses lifecycle chain. It never writes a formal admission report.
const {chromium} = require('../prototype/node_modules/playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

const [base, outputDir] = process.argv.slice(2);
if (!base || !outputDir) throw new Error('usage: node qa-native-glasses-candidate-chain.cjs BASE OUTPUT_DIR');

const cases = [
  ['native-contour-roundness-a-v1', '825a82c944636971304ce50b7526b1410ea6f1c6b58bd36f166515295696a547'],
  ['native-contour-cheek-b-v1', '9592933507b3290100d82ac315e5ddac7b6e284f372a1368de9f424643846ddb'],
];

(async () => {
  const out = path.resolve(outputDir);
  await fs.mkdir(out, {recursive: false});
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const report = {
    schema: 'native-glasses-candidate-lifecycle-v1',
    status: 'candidate-only',
    scope: 'Exact-body glasses candidate identity, normal-speed room chain, reload, unload preservation and transaction rollback',
    cases: [],
    errors: [],
    limits: ['No human visual admission', 'No ordinary-PC performance admission', 'No formal runtime registry write', 'Candidate fit remains verified=false'],
  };
  try {
    for (const [body, bodySHA256] of cases) {
      const context = await browser.newContext({
        viewport: {width: 1440, height: 1000},
        recordVideo: {dir: out, size: {width: 1440, height: 1000}},
      });
      let page;
      const row = {bodyType: body, bodySHA256, accessorySHA256: null, fitSHA256: null,
        errors: [], snapshots: [], closeReopen: false, lifecycle: {}};
      try {
        page = await context.newPage();
        page.on('pageerror', error => { row.errors.push(String(error)); report.errors.push(`${body}: ${error}`); });
        page.on('console', message => {
          if (message.type() === 'error') { row.errors.push(message.text()); report.errors.push(`${body}: ${message.text()}`); }
        });
        const url = `${base}?workbench=appearance&glassesFit=candidate&body=${encodeURIComponent(body)}`;
        await page.goto(url);
        await page.waitForFunction(() => window.__debug?.ready, null, {timeout: 60000});
        const expected = await page.evaluate(async bodyType => {
          const [accessories, candidates] = await Promise.all([
            fetch('/assets/m1c/accessories.json', {cache: 'no-store'}).then(response => response.json()),
            fetch('/assets/native-glasses-candidate-v2/manifest.json', {cache: 'no-store'}).then(response => response.json()),
          ]);
          const accessory = accessories.items.find(item => item.id === 'studio-glasses-v1');
          const fit = candidates.profiles.find(item => item.bodyType === bodyType);
          return {accessorySHA256: accessory?.sha256, fitSHA256: fit?.sha256, candidateStatus: candidates.status};
        }, body);
        assert.match(expected.accessorySHA256 || '', /^[a-f0-9]{64}$/);
        assert.match(expected.fitSHA256 || '', /^[a-f0-9]{64}$/);
        assert.equal(expected.candidateStatus, 'candidate-only');
        row.accessorySHA256 = expected.accessorySHA256;
        row.fitSHA256 = expected.fitSHA256;
        const apply = await page.evaluate(async () => {
          const result = await __debug.avatar().livePresentation.setAccessory('glasses', true);
          return {result, state: __debug.avatar().livePresentation.getState(), build: __debug.buildInfo};
        });
        assert.equal(apply.result.applied, true, JSON.stringify(apply.result));
        assert.equal(apply.state.accessories.glasses.loaded, true);
        assert.equal(apply.state.bodyType, body);
        assert.equal(apply.state.avatarSha256, bodySHA256);
        assert.equal(apply.result.identity.bodySHA256, bodySHA256);
        assert.equal(apply.result.identity.accessorySHA256, expected.accessorySHA256);
        assert.equal(apply.result.identity.fit.bodySHA256, bodySHA256);
        assert.equal(apply.result.identity.fit.accessorySHA256, expected.accessorySHA256);
        assert.equal(apply.result.identity.fit.sha256, expected.fitSHA256);
        assert.equal(apply.result.identity.fit.status, 'fitted-candidate');
        assert.equal(apply.result.identity.fit.verified, false);
        assert.equal(apply.result.identity.fit.sourceGeometryUnmodified, true);
        const assertAttached = sample => {
          assert.equal(sample.accessories.glasses.loaded, true);
          assert.equal(sample.accessories.glasses.status, 'on');
          assert.equal(sample.accessories.glasses.sha256, expected.accessorySHA256);
          assert.equal(sample.accessories.glasses.identity.bodySHA256, bodySHA256);
          assert.equal(sample.accessories.glasses.identity.accessorySHA256, expected.accessorySHA256);
          assert.equal(sample.accessories.glasses.identity.fit.sha256, expected.fitSHA256);
          assert.equal(sample.accessories.glasses.identity.fit.verified, false);
        };
        row.build = apply.build;
        row.fit = apply.result.identity?.fit;
        row.snapshots.push({name: 'glasses-on', state: apply.state});
        await page.evaluate(() => { __debug.camera('room'); __debug.setPlaybackRate(1); __debug.setPaused(false); });
        await page.evaluate(() => __debug.walkTo(-0.5, 1.8));
        await page.waitForTimeout(2600);
        const capture = () => page.evaluate(() => ({
          snapshot: __debug.snapshot(),
          accessories: __debug.avatar().livePresentation.getState().accessories,
        }));
        const walking = await capture();
        assertAttached(walking);
        row.snapshots.push({name: 'walking', state: walking});
        row.lifecycle.walkingAttached = true;
        await page.evaluate(() => __debug.action('sit'));
        await page.waitForFunction(() => __debug.snapshot().mode === 'sit' && __debug.snapshot().motion.sitProgress > .99, null, {timeout: 30000});
        const seated = await capture();
        assertAttached(seated);
        row.snapshots.push({name: 'seated', state: seated});
        row.lifecycle.seatedAttached = true;
        await page.evaluate(() => __debug.action('stand'));
        await page.waitForFunction(() => __debug.snapshot().motion.sitProgress < .01 && __debug.snapshot().motion.transitionComplete, null, {timeout: 20000});
        const standingAgain = await capture();
        assertAttached(standingAgain);
        row.snapshots.push({name: 'standing-again', state: standingAgain});
        row.lifecycle.standingAgainAttached = true;
        const video = page.video();
        await page.close();
        if (video) await video.saveAs(path.join(out, `${body}-normal1x.webm`));

        page = await context.newPage();
        page.on('pageerror', error => { row.errors.push(String(error)); report.errors.push(`${body} reload: ${error}`); });
        await page.goto(url);
        await page.waitForFunction(() => window.__debug?.ready, null, {timeout: 60000});
        const reload = await page.evaluate(async () => {
          const result = await __debug.avatar().livePresentation.setAccessory('glasses', true);
          return {result, state: __debug.avatar().livePresentation.getState()};
        });
        assert.equal(reload.result.applied, true, JSON.stringify(reload.result));
        assert.equal(reload.state.accessories.glasses.loaded, true);
        assert.equal(reload.state.bodyType, body);
        assert.equal(reload.state.avatarSha256, bodySHA256);
        assert.equal(reload.result.identity.bodySHA256, bodySHA256);
        assert.equal(reload.result.identity.accessorySHA256, expected.accessorySHA256);
        assert.equal(reload.result.identity.fit.sha256, expected.fitSHA256);
        assert.equal(reload.result.identity.fit.verified, false);
        row.closeReopen = true;
        row.lifecycle.reloadedAttached = true;
        row.reload = {fit: reload.result.identity?.fit, state: reload.state};

        // A canceled unload must leave the currently committed accessory intact.
        const canceledUnload = await page.evaluate(async () => {
          const presentation = __debug.avatar().livePresentation;
          const before = presentation.getState().accessories.glasses;
          const update = await presentation.prepareAccessory('glasses', false);
          update.release();
          return {before, after: presentation.getState().accessories.glasses};
        });
        assert.equal(canceledUnload.before.loaded, true);
        assert.equal(canceledUnload.after.loaded, true);
        assert.deepEqual(canceledUnload.after.identity, canceledUnload.before.identity);
        row.lifecycle.canceledUnloadPreservesPrevious = true;

        // A committed unload can still be rolled back before finalization.
        const unloadRollback = await page.evaluate(async () => {
          const presentation = __debug.avatar().livePresentation;
          const before = presentation.getState().accessories.glasses;
          const update = await presentation.prepareAccessory('glasses', false);
          const committed = update.commit();
          const during = presentation.getState().accessories.glasses;
          update.rollback();
          return {before, committed, during, after: presentation.getState().accessories.glasses};
        });
        assert.equal(unloadRollback.committed.applied, true);
        assert.equal(unloadRollback.during.loaded, false);
        assert.equal(unloadRollback.after.loaded, true);
        assert.deepEqual(unloadRollback.after.identity, unloadRollback.before.identity);
        row.lifecycle.committedUnloadRollbackPreservesPrevious = true;

        // An identity error during commit must not clear or replace the old prop.
        const errorRollback = await page.evaluate(async () => {
          const presentation = __debug.avatar().livePresentation;
          const before = presentation.getState().accessories.glasses;
          const update = await presentation.prepareAccessory('glasses', true);
          update.identity = {...update.identity, bodySHA256: '0'.repeat(64)};
          let error = null;
          try { update.commit(); } catch (caught) { error = String(caught.message || caught); }
          const after = presentation.getState().accessories.glasses;
          update.release();
          return {before, after, error};
        });
        assert.match(errorRollback.error || '', /body\/resource identity mismatch/);
        assert.equal(errorRollback.after.loaded, true);
        assert.deepEqual(errorRollback.after.identity, errorRollback.before.identity);
        row.lifecycle.identityErrorRollbackPreservesPrevious = true;

        const removed = await page.evaluate(async () => {
          const result = await __debug.avatar().livePresentation.setAccessory('glasses', false);
          return {result, state: __debug.avatar().livePresentation.getState()};
        });
        assert.equal(removed.result.applied, true);
        assert.equal(removed.state.accessories.glasses.loaded, false);
        row.lifecycle.unloaded = true;
        const restored = await page.evaluate(async () => {
          const result = await __debug.avatar().livePresentation.setAccessory('glasses', true);
          return {result, state: __debug.avatar().livePresentation.getState()};
        });
        assert.equal(restored.result.applied, true);
        assert.equal(restored.result.identity.fit.sha256, expected.fitSHA256);
        assert.equal(restored.state.accessories.glasses.loaded, true);
        row.lifecycle.restoredAfterUnload = true;
      } catch (error) {
        row.status = 'failed';
        row.failure = String(error.stack || error);
        report.status = 'failed';
        process.exitCode = 1;
      } finally {
        await page?.close().catch(() => {});
        await context.close();
      }
      report.cases.push(row);
    }
  } finally {
    await browser.close();
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  }
  if (report.errors.length || report.status === 'failed') process.exitCode = 1;
  console.log(JSON.stringify({status: report.status, cases: report.cases.length, errors: report.errors.length, out}));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
