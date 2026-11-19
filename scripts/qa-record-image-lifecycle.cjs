// Observe the ordinary game's real loaders in two fresh browser processes.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {ordinaryInput, parseArgs} = require('./qa-record-budget-runtime.cjs');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');
const {installDecodeProbe} = require('./qa-image-decode-probe.cjs');

function summarize(trace, phases) {
  assert.equal(trace.droppedEvents, 0, 'Decode events were dropped');
  const starts = new Map(trace.events.filter(event => event.type === 'bitmap-start')
    .map(event => [event.operationId, event]));
  const decoded = trace.events.filter(event => event.type === 'bitmap-end');
  assert(decoded.length > 0 && decoded.length === starts.size, 'Incomplete bitmap decode observations');
  const byImage = new Map(decoded.map(event => [event.imageId, event]));
  assert.equal(byImage.size, decoded.length);
  const observed = phases.map(({phase, actors, time}) => {
    const visible = new Set(actors.flatMap(actor => actor.images.map(image => image.id)));
    const closed = new Set(trace.events.filter(event => event.type === 'bitmap-close' && event.atMs <= time)
      .map(event => event.imageId));
    for (const actor of actors) for (const image of actor.images) {
      const event = byImage.get(image.id);
      assert(event && event.atMs <= time, 'Visible actor bitmap has no corresponding completed decode');
      assert.equal(event.width, image.width);
      assert.equal(event.height, image.height);
      assert(!closed.has(image.id), 'A visible actor uses a closed bitmap');
    }
    const finished = decoded.filter(event => event.atMs <= time);
    const phaseImages = decoded.filter(event => starts.get(event.operationId)?.label === phase);
    const elapsed = phaseImages.map(event => event.durationMs).sort((a,b) => a-b);
    return {phase, actors:actors.map(({id}) => id), visibleBitmaps:visible.size,
      completedThroughSample:finished.length, explicitlyClosedThroughSample:finished.filter(e => closed.has(e.imageId)).length,
      decodeStartsCompletedForPhase:elapsed.length,
      decodePromiseMs:elapsed.length ? {median:elapsed[Math.floor(elapsed.length/2)],max:elapsed.at(-1)} : null,
      unclosedRGBA8Equivalent:finished.filter(e => !closed.has(e.imageId)).reduce((n,e) => n+4*e.width*e.height, 0)};
  });
  return {observed, canvas2D:trace.events.filter(e => e.type === 'canvas-2d'),
    explicitImageDecodeCalls:trace.events.filter(e => e.type === 'image-decode-start').length};
}

// Applies to this two-actor outfit path, where every decoded image is used
// by a visible material. A cache of deliberately retained assets would need
// a separate ownership contract before running the same assertion.
function verifyRelease(trace, phases) {
  assert(trace.hooks.createImageBitmap && trace.hooks.imageBitmapClose && trace.droppedEvents === 0);
  assert.equal(trace.counts['bitmap-error'],0);
  const decoded = trace.events.filter(e => e.type === 'bitmap-end');
  const closes = trace.events.filter(e => e.type === 'bitmap-close');
  const observedOwners = new Set(phases.flatMap(phase => phase.actors.flatMap(actor => actor.images.map(image => image.id))));
  assert.deepEqual(new Set(decoded.map(e => e.imageId)), observedOwners, 'Unattributed bitmap ownership');
  for (const e of closes) assert(observedOwners.has(e.imageId) && e.closeCount === 1, 'Unknown or repeated close');
  for (const sample of phases) {
    const inUse = new Set(sample.actors.flatMap(actor => actor.images.map(image => image.id)));
    const finished = decoded.filter(e => e.atMs <= sample.time).map(e => e.imageId);
    const retired = new Set(closes.filter(e => e.atMs <= sample.time).map(e => e.imageId));
    assert.deepEqual(retired,new Set(finished.filter(id => !inUse.has(id))), 'Wrong image release set at '+sample.phase);
  }
  assert.equal(closes.length,decoded.length);
  return {decoded:decoded.length,closedExactlyOnce:closes.length,phases:phases.length};
}

function assessRun(row, requireRelease) {
  row.releaseStatus = row.pixelStatus = requireRelease ? 'unobserved' : 'not-evaluated';
  if (!requireRelease) return;
  const expected = ['remove-first','remove-second-first'];
  if (row.uploadChecks.some(check => check.status === 'failed')) row.pixelStatus = 'failed';
  else if (row.uploadChecks.length === expected.length && row.uploadChecks.every((check,i) =>
    check.phase === expected[i] && check.status === 'verified')) row.pixelStatus = 'verified';
  if (!row.trace || row.phases.at(-1)?.phase !== 'final-empty') return;
  try {
    assert.deepEqual(row.phases.slice(1).map(({phase}) => phase),
      ['remove-first','empty','restore-both','remove-second-first','final-empty']);
    row.release = verifyRelease(row.trace,row.phases);
    row.releaseStatus = 'verified';
  } catch (error) {
    row.releaseFailure = error.message;
    row.releaseStatus = 'failed';
  }
}

async function collectRuns(report, collectOne, requireRelease) {
  const failures = [];
  for (let i=0;i<2;i++) {
    const row = {phases:[],uploadChecks:[]};
    report.runs.push(row);
    try { await collectOne(row); }
    catch (error) { row.collectionFailure = error.stack??String(error); }
    assessRun(row,requireRelease);
    const problems = row.uploadChecks.filter(check=>check.status!=='verified')
      .map(check=>`${check.phase}: ${check.failure??check.status}`);
    if (requireRelease && row.pixelStatus!=='verified' && !problems.length) problems.push('incomplete pixel checks');
    if (requireRelease && row.releaseStatus!=='verified') problems.push(row.releaseFailure??'incomplete image ownership trace');
    if (row.collectionFailure) problems.push(row.collectionFailure);
    if (problems.length) failures.push(`Browser process ${i+1}: ${problems.join('\n')}`);
  }
  for (const key of ['releaseStatus','pixelStatus']) {
    const statuses=report.runs.map(row=>row[key]);
    report[key] = !requireRelease ? 'not-evaluated' : statuses.includes('failed') ? 'failed' :
      statuses.every(status=>status==='verified') ? 'verified' : 'unobserved';
  }
  if (failures.length) throw Error(failures.join('\n'));
}

// Runs in the page. Keep identifiers and dimensions, never a reference to an image.
function readScene(phase) {
  const consumer = window.__recordConsumer, probe = window.__imageDecodeProbe, actors = [];
  for (const actor of consumer.actors.values()) {
    const images = new Map();
    actor.avatar.root.traverseVisible(mesh => {
      if (!mesh.isMesh) return;
      for (const material of [].concat(mesh.material)) {
        const values = [...Object.values(material), ...Object.values(material.uniforms ?? {}).map(u => u?.value)];
        for (const texture of values) {
          if (!texture?.isTexture || !(texture.image instanceof ImageBitmap)) continue;
          const image = texture.image, id = probe.imageId(image);
          images.set(id, {id, width:image.width, height:image.height});
        }
      }
    });
    actors.push({id:actor.identity.id, recordSha:actor.recordSha256, bodySha:actor.avatar.profile.sha256,
      root:actor.avatar.root.uuid, visibleEquipment:Object.values(actor.avatar.getOutfitInfo().equipment.items)
        .filter(item => item.visible).map(item => item.id).sort(), images:[...images.values()].sort((a,b) => a.id-b.id)});
  }
  return {phase, time:performance.now(), actors, rendererTextures:consumer.renderer.info.memory.textures};
}

async function collect(out, options, ordinary, records, requireRelease, row) {
  const session = await launchQABrowser(out, options);
  row.browser = session.receipt;
  let page;
  try {
    const context = await session.browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});
    await context.addInitScript(installDecodeProbe);
    page = await context.newPage();
    const errors = row.errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
    await page.goto(ordinary.entry);
    await page.waitForFunction(() => window.__recordConsumer?.ready, null, {timeout:90000});
    assert.equal(await page.evaluate(() => __recordConsumer.buildInfo.sourceDigest), ordinary.runtime.sourceDigest);
    assert.deepEqual(await page.evaluate(() => __recordConsumer.records), records);
    const phases = row.phases, ids = ordinary.actors.map(actor => actor.id);
    async function capture(phase, expected) {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const sample = await page.evaluate(readScene,phase);
      assert.deepEqual(sample.actors.map(a => a.id).sort(), [...expected].sort());
      for (const actor of sample.actors) {
        const pin = ordinary.actors.find(row => row.id === actor.id);
        assert.equal(actor.recordSha,pin.recordSha256);
        assert.equal(actor.bodySha,pin.bodySha256);
        assert.deepEqual(actor.visibleEquipment,pin.equipment.map(e => e.id).sort());
        assert(actor.images.length > 0);
      }
      phases.push(sample);
    }
    async function remove(id, phase) {
      assert(await page.evaluate(({id,phase}) => {
        __imageDecodeProbe.mark(phase);
        return __recordConsumer.removeActor(id);
      },{id,phase}));
    }
    async function verifyUpload(phase) {
      if (!requireRelease) return;
      const {verifySurvivorUpload} = require('./qa-surviving-actor-upload.cjs');
      const result = await page.evaluate(verifySurvivorUpload).catch(error=>({status:'unobserved',failure:error.message}));
      row.uploadChecks.push({...result,phase});
    }
    const coldPhase = await page.evaluate(() => __imageDecodeProbe.snapshot().events.find(e => e.type === 'bitmap-start')?.label);
    assert(typeof coldPhase === 'string','No cold decode events');
    await capture(coldPhase,ids);
    await remove(ids[0],'remove-first');
    await capture('remove-first',[ids[1]]);
    const peer = phases[0].actors.find(a => a.id === ids[1]);
    assert.deepEqual(phases[1].actors[0],peer,'Removing one actor changed the survivor');
    await verifyUpload('remove-first');
    await remove(ids[1],'empty');
    await capture('empty',[]);
    const states = await page.evaluate(async() => {
      __imageDecodeProbe.mark('restore-both');
      const batch = await __recordConsumer.selectGroup(0);
      return batch.items.map(row => row.status);
    });
    assert.deepEqual(states,['completed','completed']);
    await capture('restore-both',ids);
    assert.equal(new Set([...phases[0].actors,...phases.at(-1).actors].map(a => a.root)).size,4);
    await remove(ids[1],'remove-second-first');
    await capture('remove-second-first',[ids[0]]);
    assert.deepEqual(phases.at(-1).actors[0],phases[3].actors.find(a => a.id === ids[0]));
    await verifyUpload('remove-second-first');
    await remove(ids[0],'final-empty');
    await capture('final-empty',[]);
    row.trace = await page.evaluate(() => __imageDecodeProbe.snapshot());
    row.summary = summarize(row.trace,phases);
    assert.deepEqual(errors,[]);
    await context.close();
  } finally {
    try {
      if (page && !page.isClosed() && !row.trace) {
        row.trace = await page.evaluate(() => window.__imageDecodeProbe?.snapshot()).catch(() => null);
      }
    } finally { await session.close(); }
  }
}

async function main(args) {
  const releaseFlags = args.filter(arg => arg === '--require-release');
  assert(releaseFlags.length <= 1);
  const requireRelease = releaseFlags.length === 1;
  const {base,recordFile,folder,inspectBuild,manifestSha,launchOptions} = parseArgs(args.filter(arg => arg !== '--require-release'));
  assert(manifestSha && launchOptions.browserConfig, 'An exact package and approved browser are required');
  const root = await productionRoot(), out = await projectOutput(folder,root);
  const records = JSON.parse(await fs.readFile(recordFile,'utf8'));
  const ordinary = await ordinaryInput(base,manifestSha,inspectBuild,records);
  const reportPath = path.join(out,'report.json');
  assert.equal(await projectOutput(out,root),out);
  await fs.mkdir(out,{recursive:false});
  const report = {schema:'ordinary-record-image-lifecycle-v1',status:'incomplete',manifestSha,
    runtime:ordinary.runtime, inputs:ordinary.actors, requireRelease, runs:[],
    scope:'Main window, two fresh browser processes. Decoder promises include queueing. Explicit close and logical RGBA8 equivalents do not measure GC or physical memory.'};
  try {
    await collectRuns(report,row=>collect(out,launchOptions,ordinary,records,requireRelease,row),requireRelease);
    assert.deepEqual(report.runs[0].summary.observed.map(r => [r.visibleBitmaps,r.completedThroughSample,r.explicitlyClosedThroughSample]),
      report.runs[1].summary.observed.map(r => [r.visibleBitmaps,r.completedThroughSample,r.explicitlyClosedThroughSample]));
    report.status='measured-development-only';
  } catch (error) {
    report.failure=error.stack;
    throw error;
  } finally { await fs.writeFile(await projectOutput(reportPath,out),JSON.stringify(report,null,2)+'\n',{flag:'wx'}); }
  console.log(JSON.stringify({status:report.status,phases:report.runs[0].summary.observed}));
}

if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error);process.exitCode=1; });
module.exports={summarize,verifyRelease,collectRuns};
