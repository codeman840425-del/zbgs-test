// Cross-body runtime-record checks for the fixed browser build.
// The script is driven by scripts/run-fixed-check.cjs and intentionally does
// not reuse the full same-body record regression.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { productionRoot, projectOutput } = require('./project-output.cjs');
const { launchQABrowser } = require('./qa-browser-workspace.cjs');

const [baseURL, outputDir] = process.argv.slice(2);
if (!baseURL || !outputDir) throw Error('Usage: node scripts/qa-character-cross-body.cjs <baseURL> <outputDir>');

const FEMALE_BODY = 'native-female-face-v1';
const MALE_BODY = 'native-male-7586-v1';
const femaleRecordPath = path.resolve('evidence/m2-character-runtime-fixed-v1/native-female-face-v1-record.json');
const maleRecordPath = path.resolve('evidence/m2-character-runtime-fixed-v1/native-male-7586-v1-record.json');
const FEMALE_VRM = '**/assets/native-face-factory-v2/generated/female-geometry-face-unmasked.vrm';
const GLASSES_GLB = '**/assets/m1c/studio-glasses-v1.glb';

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  }
  return value;
}

function canonical(value) {
  return JSON.stringify(sorted(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(canonical(value)).digest('hex');
}

// Mirrors character-record.js hashPayload and keeps the fixture's actual
// schema and integrity fields intact after a deliberate test mutation.
function reseal(record) {
  record.integrity.recipeSha256 = sha256(record.appearanceRecipe);
  const payload = structuredClone(record);
  delete payload.integrity.recordSha256;
  record.integrity.recordSha256 = sha256(payload);
  return record;
}

function clone(value) {
  return structuredClone(value);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function look(record) {
  return {
    appearanceRecipe: record.appearanceRecipe,
    liveAccessories: record.liveAccessories,
    resourceIdentities: record.resourceIdentities,
  };
}

function assertLook(actual, expected, label) {
  assert.equal(canonical(actual), canonical(expected), `${label}: record look changed`);
}

async function waitReady(page) {
  await page.waitForFunction(() => Boolean(window.__debug?.ready) && !window.__debug.snapshot().bodySelection.loading, null, { timeout: 90000 });
}

async function readState(page, identity) {
  return page.evaluate(async identity => {
    const record = await __debug.captureCharacterRecord({ identity });
    const snapshot = __debug.snapshot();
    return {
      actorUuid: __debug.avatar().root.uuid,
      bodyType: __debug.avatar().profile.bodyType,
      look: {
        appearanceRecipe: record.appearanceRecipe,
        liveAccessories: record.liveAccessories,
        resourceIdentities: record.resourceIdentities,
      },
      camera: {position:__debug.cameraObject().position.toArray(),quaternion:__debug.cameraObject().quaternion.toArray()},
      position: __debug.avatar().root.position.toArray(),
      sceneChildren:__debug.scene.children.map(node=>node.uuid).sort(),
    };
  }, identity);
}

function assertPreserved(actual, before, label) {
  assert.equal(actual.actorUuid, before.actorUuid, `${label}: actor replaced`);
  assert.equal(actual.bodyType, before.bodyType, `${label}: body changed`);
  assertLook(actual.look, before.look, label);
  assert.deepEqual(actual.camera, before.camera, `${label}: camera changed`);
  assert.deepEqual(actual.position, before.position, `${label}: position changed`);
  assert.deepEqual(actual.sceneChildren,before.sceneChildren,`${label}: detached candidate leaked into scene`);
}

async function invokeRestore(page, record) {
  return page.evaluate(async record => {
    try {
      return { result: await __debug.restoreCharacterRecord(record) };
    } catch (error) {
      return { error: String(error?.message || error) };
    }
  }, record);
}

function assertFailedResponse(response, label) {
  const failed = response.error || response.result?.applied !== true;
  assert(failed, `${label}: expected restore failure/cancellation`);
  if (response.result?.applied !== true) assert(response.result?.reason || response.result?.cancelled || response.error, `${label}: missing failure reason`);
}

async function routeFailure(page, pattern, body, status = 503) {
  const hit = deferred();
  await page.route(pattern, async route => {
    hit.resolve();
    await route.fulfill({ status, contentType: 'text/plain', body });
  });
  return {
    hit: hit.promise,
    async dispose() { await page.unroute(pattern); },
  };
}

async function holdRoute(page, pattern) {
  const hit = deferred();
  const release = deferred();
  await page.route(pattern, async route => {
    hit.resolve();
    await release.promise;
    await route.continue();
  });
  return {
    hit: hit.promise,
    release: () => release.resolve(),
    async dispose() { await page.unroute(pattern); },
  };
}
async function waitHit(route){
 let timer;
 try{await Promise.race([route.hit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Expected request was not reached')),30000);})]);}
 finally{clearTimeout(timer);}
}

async function main() {
  const out = await projectOutput(outputDir, await productionRoot());
  await fs.mkdir(out, { recursive: false });
  await fs.copyFile(__filename, path.join(out, 'executed-script.cjs'));
  const report = {
    status: 'incomplete',
    scope: 'Cross-body character-record restore and cancellation only; existing same-body full regression is not repeated.',
    fixtures: [femaleRecordPath, maleRecordPath],
    cases: [],
  };
  let session, page;
  try {
    const femaleRecord = JSON.parse(await fs.readFile(femaleRecordPath, 'utf8'));
    const maleRecord = JSON.parse(await fs.readFile(maleRecordPath, 'utf8'));
    session = await launchQABrowser(out, { channel: 'chrome' });
    const { browser } = session;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(`${baseURL}?workbench=appearance&body=${FEMALE_BODY}`);
    await waitReady(page);
    report.build=await page.evaluate(()=>__debug.buildInfo.shortId);
    report.browser=browser.version();
    await page.evaluate(() => { __debug.setPaused(true); __debug.camera('inspect-half-front'); });

    const femaleIdentity = clone(femaleRecord.identity);
    const maleIdentity = clone(maleRecord.identity);
    const femaleResult = await invokeRestore(page, maleRecord);
    assert.equal(femaleResult.result?.applied, true, `female→male restore failed: ${JSON.stringify(femaleResult)}`);
    await waitReady(page);
    const afterMale = await readState(page, maleIdentity);
    assert.equal(afterMale.bodyType, MALE_BODY);
    assertLook(afterMale.look, look(maleRecord), 'female→male');
    report.cases.push({ name: 'female-to-male-complete-record', passed: true, result: femaleResult.result });

    const maleToFemale = await invokeRestore(page, femaleRecord);
    assert.equal(maleToFemale.result?.applied, true, `male→female restore failed: ${JSON.stringify(maleToFemale)}`);
    await waitReady(page);
    const afterFemale = await readState(page, femaleIdentity);
    assert.equal(afterFemale.bodyType, FEMALE_BODY);
    assertLook(afterFemale.look, look(femaleRecord), 'male→female');
    report.cases.push({ name: 'male-to-female-complete-record', passed: true, result: maleToFemale.result });
    const changedBodySameIdentity=await page.evaluate(previous=>__debug.captureCharacterRecord({previous,expectedRevision:previous.revision}),maleRecord);
    assert.deepEqual(changedBodySameIdentity.identity,maleRecord.identity);
    assert.equal(changedBodySameIdentity.revision,maleRecord.revision+1);
    assertLook(look(changedBodySameIdentity),look(femaleRecord),'same identity changed body');
    report.cases.push({name:'same-identity-new-body-save',passed:true});

    // Return to the male fixture. All failure and race checks below start from
    // this same paused male actor and compare its exact record look and view.
    const backToMale = await invokeRestore(page, maleRecord);
    assert.equal(backToMale.result?.applied, true, `return to male failed: ${JSON.stringify(backToMale)}`);
    await waitReady(page);
    await page.evaluate(() => { __debug.setPaused(true); __debug.camera('inspect-half-front'); });
    const maleBaseline = await readState(page, maleIdentity);

    {
      const route = await routeFailure(page, FEMALE_VRM, 'intentional cross-body HTTP 503');
      const responsePromise = invokeRestore(page, femaleRecord);
      await waitHit(route);
      const response = await responsePromise;
      await route.dispose();
      assertFailedResponse(response, 'female-body-http-503');
      assertPreserved(await readState(page, maleIdentity), maleBaseline, 'female-body-http-503');
      report.cases.push({ name: 'female-body-http-503-retains-male', passed: true, response });
    }

    {
      const route = await routeFailure(page, GLASSES_GLB, 'intentional glasses HTTP 503');
      const responsePromise = invokeRestore(page, femaleRecord);
      await waitHit(route);
      const response = await responsePromise;
      await route.dispose();
      assertFailedResponse(response, 'female-glasses-http-503');
      assertPreserved(await readState(page, maleIdentity), maleBaseline, 'female-glasses-http-503');
      report.cases.push({ name: 'female-glasses-http-503-retains-male', passed: true, response });
    }

    {
      const badFit = clone(femaleRecord);
      badFit.liveAccessories.selections.mic.identity.fit.fitVersion = 'cross-body-invalid-fit-v1';
      reseal(badFit);
      const response = await invokeRestore(page, badFit);
      assertFailedResponse(response, 'female-fit-version-tamper');
      assertPreserved(await readState(page, maleIdentity), maleBaseline, 'female-fit-version-tamper');
      report.cases.push({ name: 'female-fit-version-tamper-retains-male', passed: true, response });
    }

    {
      const entered = deferred();
      const responsePromise = page.evaluate(record => {
        const state = { entered: false };
        window.__crossBodyCompileFailure = state;
        const renderer = __debug.renderer;
        const original = renderer.compileAsync;
        renderer.compileAsync = async function () {
          state.entered = true;
          enteredMarker();
          throw Error('intentional cross-body compile failure');
        };
        function enteredMarker() { state.enteredAt = performance.now(); }
        state.promise = __debug.restoreCharacterRecord(record).then(result => ({ result }), error => ({ error: String(error?.message || error) })).finally(() => { renderer.compileAsync = original; });
        return true;
      }, femaleRecord);
      await page.waitForFunction(() => Boolean(window.__crossBodyCompileFailure?.entered), null, { timeout: 60000 });
      const response = await page.evaluate(() => window.__crossBodyCompileFailure.promise);
      await responsePromise;
      assertFailedResponse(response, 'female-compile-failure');
      assertPreserved(await readState(page, maleIdentity), maleBaseline, 'female-compile-failure');
      report.cases.push({ name: 'female-compile-failure-retains-male', passed: true, response });
    }

    {
      const wrongSha = clone(maleRecord);
      wrongSha.appearanceRecipe.base.sha256 = '0'.repeat(64);
      reseal(wrongSha);
      const response = await invokeRestore(page, wrongSha);
      assertFailedResponse(response, 'same-body-wrong-sha');
      assertPreserved(await readState(page, maleIdentity), maleBaseline, 'same-body-wrong-sha');
      report.cases.push({ name: 'same-body-wrong-sha-retains-male', passed: true, response });
    }

    {
      const route = await holdRoute(page, FEMALE_VRM);
      const pending = page.evaluate(record => {
        window.__crossBodyPendingRestore = __debug.restoreCharacterRecord(record).then(result => ({ result }), error => ({ error: String(error?.message || error) }));
        return true;
      }, femaleRecord);
      await waitHit(route);
      const sameBody = await page.evaluate(bodyType => __debug.command({ type: 'bodySelect', bodyType }),MALE_BODY);
      assert.equal(sameBody.applied, true, `same-body cancellation command failed: ${JSON.stringify(sameBody)}`);
      route.release();
      const response = await page.evaluate(() => window.__crossBodyPendingRestore);
      await pending;
      assert.equal(response.result?.cancelled, true, `restore was not cancelled by same-body selection: ${JSON.stringify(response)}`);
      assertPreserved(await readState(page, maleIdentity), maleBaseline, 'cancelled-by-same-body-selection');
      await route.dispose();
      report.cases.push({ name: 'restore-female-cancelled-by-current-male-selection', passed: true, response, sameBody });
    }

    {
      const route = await holdRoute(page, FEMALE_VRM);
      const pending = page.evaluate(record => {
        window.__crossBodyPendingRestore = __debug.restoreCharacterRecord(record).then(result => ({ result }), error => ({ error: String(error?.message || error) }));
        return true;
      }, femaleRecord);
      await waitHit(route);
      const latest = await invokeRestore(page, maleRecord);
      assert.equal(latest.result?.applied, true, `latest male restore failed: ${JSON.stringify(latest)}`);
      route.release();
      const response = await page.evaluate(() => window.__crossBodyPendingRestore);
      await pending;
      assert.equal(response.result?.cancelled, true, `stale female restore was not cancelled: ${JSON.stringify(response)}`);
      assertLook((await readState(page, maleIdentity)).look, look(maleRecord), 'latest-male-wins');
      await route.dispose();
      report.cases.push({ name: 'restore-female-cancelled-by-latest-male-record', passed: true, response, latest: latest.result });
    }

    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join('; ')}`);
    report.status = 'technical-pass-visual-pending';
    await context.close();
  } catch (error) {
    report.status = 'failed';
    report.failure = String(error?.stack || error);
    process.exitCode = 1;
    try { await page?.context()?.close(); } catch {}
  } finally {
    try { await session?.close(); }
    finally {
      await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
      console.log(JSON.stringify({ status: report.status, cases: report.cases.length, failure: report.failure || null }));
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
