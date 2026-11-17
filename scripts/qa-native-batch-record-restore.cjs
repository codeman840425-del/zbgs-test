const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {isDeepStrictEqual} = require('node:util');
const {chromium} = require('../prototype/node_modules/playwright');

const [base, recordsDir, outDir] = process.argv.slice(2);
const recordFiles = ['contour-roundness-a.json', 'contour-cheek-b.json'];
const viewport = {width: 1440, height: 1000};
const filmMs = 8000;
const preservedFields = [
  'schema', 'identity', 'createdAt', 'provenance', 'resourceIdentities',
  'appearanceRecipe', 'liveAccessories', 'equipmentMaterials',
];

async function readRecords() {
  const loaded = await Promise.all(recordFiles.map(async filename => {
    const raw = await fs.readFile(path.join(recordsDir, filename));
    const record = JSON.parse(raw.toString('utf8'));
    assert.equal(record.schema, 'character-record-v1', filename);
    assert(record.liveAccessories.selections.mic.enabled, `${filename} has no microphone`);
    assert(record.liveAccessories.selections.glasses.enabled, `${filename} has no glasses`);
    return {record, filename, fileSha256: createHash('sha256').update(raw).digest('hex')};
  }));
  const [first, second] = loaded.map(item => item.record);
  assert.notEqual(first.identity.id, second.identity.id, 'Expected two stable character IDs');
  assert.notEqual(first.appearanceRecipe.base.sha256, second.appearanceRecipe.base.sha256, 'Expected two produced bodies');
  return loaded;
}

async function readActors(page, inputs) {
  const ids = inputs.map(item => item.record.identity.id);
  const result = await page.evaluate(async ids => {
    const consumer = window.__recordConsumer;
    const instances = ids.map(id => consumer.actors.get(id));
    const [a, b] = instances;
    if (!a || !b || consumer.actors.size !== 2) throw Error('Expected both selected actor identities');

    function materialSet(instance) {
      const materials = new Set();
      instance.avatar.root.traverse(object => {
        if (!object.isMesh) return;
        for (const material of [object.material].flat()) materials.add(material);
      });
      return materials;
    }

    const aMaterials = materialSet(a);
    const bMaterials = materialSet(b);
    const boneKinds = ['getRawBoneNode', 'getNormalizedBoneNode'];
    const bones = ['hips', 'head', 'rightHand'];
    const poses = boneKinds.every(kind => bones.every(name => {
      const x = a.avatar.vrm.humanoid[kind](name);
      const y = b.avatar.vrm.humanoid[kind](name);
      return x && y && x !== y && x.position !== y.position && x.quaternion !== y.quaternion;
    }));
    const isolation = {
      roots: a.avatar.root !== b.avatar.root && instances.every(instance => instance.avatar.root.parent === consumer.scene),
      vrm: a.avatar.vrm !== b.avatar.vrm && a.avatar.vrm.scene !== b.avatar.vrm.scene,
      poses: poses && a.motion !== b.motion && a.avatar.vrm.humanoid !== b.avatar.vrm.humanoid,
      materials: aMaterials.size > 0 && bMaterials.size > 0 &&
        ![...aMaterials].some(material => bMaterials.has(material)),
      materialCounts: [aMaterials.size, bMaterials.size],
    };
    const rows = [];
    for (const actor of instances) {
      const {avatar, identity, revision, recordSha256} = actor;
      rows.push({
        identity, revision, recordSha256,
        rootUuid: avatar.root.uuid,
        vrmUuid: avatar.vrm.scene.uuid,
        rawHeadUuid: avatar.vrm.humanoid.getRawBoneNode('head').uuid,
        normalizedHeadUuid: avatar.vrm.humanoid.getNormalizedBoneNode('head').uuid,
        captured: await actor.capture(),
      });
    }
    // Match the JSON representation used by the record store, including zero.
    return JSON.parse(JSON.stringify({rows, isolation}));
  }, ids);
  for (const field of ['roots', 'vrm', 'poses', 'materials']) {
    assert.equal(result.isolation[field], true, `Actor isolation check failed: ${field}`);
  }
  result.rows.forEach((actor, index) => {
    const expected = inputs[index].record;
    const prefix = inputs[index].filename;
    assert.deepEqual(actor.identity, expected.identity, prefix);
    assert.equal(actor.revision, expected.revision, prefix);
    assert.equal(actor.recordSha256, expected.integrity.recordSha256, prefix);
    assert.equal(actor.captured.revision, expected.revision + 1, `${prefix} readback revision`);
    for (const field of preservedFields) {
      assert(isDeepStrictEqual(actor.captured[field], expected[field]), `${prefix} runtime differs at ${field}`);
    }
    assert.equal(actor.captured.integrity.recipeSha256, expected.integrity.recipeSha256, prefix);
    delete actor.captured;
  });
  return result;
}

async function checkSpeakingIsolation(page, inputs) {
  const ids = inputs.map(item => item.record.identity.id);
  return page.evaluate(async ([first, second]) => {
    const {actors} = window.__recordConsumer;
    const a = actors.get(first);
    const b = actors.get(second);
    function controls(instance) {
      const state = instance.avatar.livePresentation.getState();
      return {
        preset: state.preset, speaking: state.speaking, action: state.action, gaze: state.gaze,
        happyWeight: instance.avatar.vrm.expressionManager.getValue('happy'),
      };
    }
    const aBefore = controls(a);
    const bBefore = controls(b);
    const live = a.avatar.livePresentation;
    let aDuring, bDuring;
    try {
      live.setExpression('happy');
      live.setSpeaking(false);
      await new Promise(resolve => setTimeout(resolve, 250));
      aDuring = controls(a);
      bDuring = controls(b);
    } finally {
      live.setExpression(aBefore.preset);
      live.setSpeaking(aBefore.speaking);
    }
    await new Promise(resolve => setTimeout(resolve, 250));
    return {aBefore, bBefore, aDuring, bDuring, aRestored: controls(a), bAfter: controls(b)};
  }, ids);
}

async function filmPair(page) {
  const film = await page.evaluate(async duration => {
    const canvas = window.__recordConsumer.renderer.domElement;
    const stream = canvas.captureStream(30);
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8']
      .find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw Error('No supported WebM recording codec');
    const recorder = new MediaRecorder(stream, {mimeType, videoBitsPerSecond: 5000000});
    const chunks = [];
    recorder.ondataavailable = event => {
      if (event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = event => reject(event.error);
    });
    try {
      const start = performance.now();
      recorder.start();
      await new Promise(resolve => setTimeout(resolve, duration));
      recorder.stop();
      await stopped;
      const elapsedMs = performance.now() - start;
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(new Blob(chunks, {type: mimeType}));
      });
      return {data, mimeType, elapsedMs};
    } finally {
      for (const track of stream.getTracks()) track.stop();
    }
  }, filmMs);
  const clip = Buffer.from(film.data.split(',')[1], 'base64');
  assert(clip.length > 0, 'Recording returned no video bytes');
  const filename = 'native-batch-pair-1x.webm';
  await fs.writeFile(path.join(outDir, filename), clip, {flag: 'wx'});
  return {filename, mimeType: film.mimeType, requestedMs: filmMs, elapsedMs: film.elapsedMs, bytes: clip.length};
}

async function main() {
  assert(base && recordsDir && outDir, 'Usage: node scripts/qa-native-batch-record-restore.cjs BASE RECORDS_DIR OUT_DIR');
  await fs.mkdir(outDir, {recursive: false});
  const report = {
    status: 'failed', phase: 'setup', errors: [], viewport,
    scope: 'Two native batch records in the shared game consumer. Checks cover the recorded look, pair instance ownership, an expression and speaking control change, and browser restart on the development machine.',
  };
  let browser, page;
  async function open(inputs) {
    browser = await chromium.launch({channel: 'chrome', headless: true});
    const context = await browser.newContext({viewport});
    page = await context.newPage();
    page.on('pageerror', error => report.errors.push({phase: report.phase, message: error.message}));
    await page.goto(new URL('record-consumer.html?production=1', base).href);
    await page.waitForFunction(() => window.__recordConsumer?.ready, null, {timeout: 120000});
    const build = await page.evaluate(() => window.__recordConsumer.buildInfo);
    assert.match(build.shortId, /^[a-f0-9]{12}$/);
    const batch = await page.evaluate(records => window.__recordConsumer.selectGroup(0, records),
      inputs.map(item => item.record));
    return {build, batch, browser: browser.version()};
  }

  try {
    const inputs = await readRecords();
    report.inputs = inputs.map(({filename, fileSha256, record}) => ({
      filename, fileSha256, identity: record.identity, body: record.appearanceRecipe.base,
      recordSha256: record.integrity.recordSha256,
    }));
    report.phase = 'first-load';
    report.first = await open(inputs);
    assert.deepEqual(report.first.batch.items.map(item => item.status), ['completed', 'completed']);
    report.first.readback = await readActors(page, inputs);

    report.phase = 'speaking-isolation';
    report.speakingIsolation = await checkSpeakingIsolation(page, inputs);
    const controls = report.speakingIsolation;
    assert(controls.aBefore.speaking && controls.bBefore.speaking, 'Both characters should start speaking');
    assert.equal(controls.aDuring.preset, 'happy');
    assert(controls.aDuring.happyWeight > 0, 'The first character should show the new expression');
    assert.equal(controls.aDuring.speaking, false);
    assert.deepEqual(controls.bDuring, controls.bBefore);
    assert.deepEqual(controls.bAfter, controls.bBefore);
    assert.deepEqual(controls.aRestored, controls.aBefore);
    await readActors(page, inputs);

    report.phase = 'recording';
    report.film = await filmPair(page);
    await page.screenshot({path: path.join(outDir, 'native-batch-pair.png')});

    report.phase = 'close-and-reopen';
    await browser.close();
    browser = undefined;
    page = undefined;
    const reopenedInputs = await readRecords();
    assert.deepEqual(reopenedInputs, inputs, 'The source records changed on disk between browser sessions');
    report.reopened = await open(reopenedInputs);
    assert.deepEqual(report.reopened.build, report.first.build, 'Build changed between browser sessions');
    assert.deepEqual(report.reopened.batch.items.map(item => item.status), ['completed', 'completed']);
    report.reopened.readback = await readActors(page, reopenedInputs);
    for (const field of ['rootUuid', 'vrmUuid', 'rawHeadUuid', 'normalizedHeadUuid']) {
      const previous = new Set(report.first.readback.rows.map(row => row[field]));
      assert(report.reopened.readback.rows.every(row => !previous.has(row[field])),
        `Reopened actors reused a previous ${field}`);
    }
    await page.screenshot({path: path.join(outDir, 'native-batch-pair-reopened.png')});
    assert.deepEqual(report.errors, []);
    report.phase = 'complete';
    report.status = 'technical-pass';
  } catch (error) {
    report.failure = String(error.stack || error);
    process.exitCode = 1;
    await page?.screenshot({path: path.join(outDir, 'failure.png')}).catch(() => {});
  } finally {
    try {
      await browser?.close();
    } catch (error) {
      report.errors.push({phase: 'cleanup', message: error.message});
      report.status = 'failed';
      process.exitCode = 1;
    }
    await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
    console.log(JSON.stringify({status: report.status, phase: report.phase, build: report.first?.build.shortId,
      failure: report.failure}));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
