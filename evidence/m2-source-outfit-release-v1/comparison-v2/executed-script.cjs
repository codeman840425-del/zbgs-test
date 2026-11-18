const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {seatedContact} = require('./qa-seated-outfit-contact.cjs');

const SOURCE = 'source-male-ab9a-v1';
const RELEASE = 'source-male-ab9a-release-v1';
const SOURCE_SHA = 'ab9af434a229283c192546486f9e6eb9cd855bf7d8d45b5037ac211938cb903c';
const RELEASE_SHA = 'cf1118a2a8d8fca8ccc094e51d051f660ec12ffdbdda4c8ecaad407b55cef9d4';
const RELEASE_BYTES = 14_358_460;
const VIEWPORT = {width: 1600, height: 1000};
const ROLES = ['body', 'top', 'pants', 'shoes'];
const POSE_VIEWS = ['dressed-front', 'dressed-side', 'base-front'];
const TOLERANCE = 1e-7;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function observeNetwork(context, page) {
  const session = await context.newCDPSession(page);
  await session.send('Network.enable', {maxTotalBufferSize: 96 * 1024 * 1024, maxResourceBufferSize: 32 * 1024 * 1024});
  await session.send('Network.setCacheDisabled', {cacheDisabled: true});
  await session.send('Network.setBypassServiceWorker', {bypass: true});
  const responses = [], finished = new Map(), cached = new Set(), failed = [];
  session.on('Network.responseReceived', row => responses.push(row));
  session.on('Network.loadingFinished', row => finished.set(row.requestId, row));
  session.on('Network.requestServedFromCache', row => cached.add(row.requestId));
  session.on('Network.loadingFailed', row => failed.push(row));

  async function read(url) {
    const matches = responses.filter(row => row.response.url === url);
    assert.equal(matches.length, 1, `Expected one cold response for ${url}, got ${matches.length}`);
    const [{requestId, response}] = matches;
    const done = finished.get(requestId);
    assert.equal(response.status, 200, `Unexpected status for ${url}`);
    assert.ok(done && !failed.some(row => row.requestId === requestId), `Incomplete network response for ${url}`);
    assert.ok(!cached.has(requestId) && !response.fromDiskCache && !response.fromServiceWorker && !response.fromPrefetchCache,
      `Cache or service worker served ${url}`);
    const headers = Object.fromEntries(Object.entries(response.headers).map(([name, value]) => [name.toLowerCase(), value]));
    const contentEncoding = headers['content-encoding'] ?? 'identity';
    assert.equal(contentEncoding, 'identity', `Use the uncompressed fixed-build HTTP harness for ${url}`);
    const body = await session.send('Network.getResponseBody', {requestId});
    const bytes = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8');
    if (headers['content-length'] !== undefined) assert.equal(bytes.length, Number(headers['content-length']), url);
    assert.ok(bytes.length > 0 && done.encodedDataLength >= bytes.length, `Missing measured transfer bytes for ${url}`);
    return {bytes, status:response.status, protocol:response.protocol, contentEncoding, transferBytes:done.encodedDataLength};
  }
  return {read, diagnostics: () => ({
    httpErrors:responses.filter(row => row.response.status >= 400).map(({response}) => ({url:response.url, status:response.status})),
    failed:failed.map(({requestId, type, errorText, canceled}) => ({requestId, type, errorText, canceled})),
  })};
}

function readIdentity() {
  const debug = window.__debug, actor = debug.avatar();
  const outfit = actor.getOutfitInfo();
  if (outfit.index !== 0 || outfit.equipment.debugBody) throw Error('Candidate did not open in its default dressed outfit');
  const items = Object.values(actor.getEquipmentRecipe(outfit.index));
  if (items.length !== 3) throw Error('Expected the complete three-piece outfit');
  const manifest = new URL(actor.config.manifestUrl, location.href);
  const {id, bodyType, url, sha256} = actor.profile;
  const resources = {body:{id, url:new URL(url, location.href).href, sha256}};
  for (const [role, slot] of [['top', 'top'], ['pants', 'bottom'], ['shoes', 'shoes']]) {
    const matches = items.filter(item => item.slot === slot);
    if (matches.length !== 1 || matches[0].compatibleAvatarSha256 !== sha256) throw Error(`Wrong ${role} equipment identity`);
    const [entry] = matches;
    resources[role] = {id:entry.id, url:new URL(entry.url, manifest).href, sha256:entry.sha256, declaredBytes:entry.bytes};
  }
  const appearance = actor.appearance.getState();
  const colors = Object.fromEntries(['hairStyle', 'hairColor', 'eyebrowColor', 'skinTone', 'eyeColor', 'lipColor']
    .map(key => [key, appearance[key] ?? null]));
  const gl = debug.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {bodyType, resources, colors, build:debug.buildInfo?.shortId ?? null,
    sourceDigest:debug.buildInfo?.sourceDigest ?? null, development:debug.buildInfo?.development === true,
    environment:{userAgent:navigator.userAgent, platform:navigator.userAgentData?.platform ?? navigator.platform,
      pixelRatio:window.devicePixelRatio, webgl:gl.getParameter(gl.VERSION),
      gpu:ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null}};
}

function setPose(pose) {
  const debug = window.__debug;
  if (pose === 'standing') {
    debug.setPaused(true);
    debug.reset();
    debug.setBodyMode('dressed');
    debug.setDynamics(false);
    debug.command({type:'speaking', value:false});
    const result = debug.advance(0.35);
    if (result.mode !== 'idle' || result.motion.sitProgress !== 0) throw Error('Standing pose did not reach idle');
    return {steps:1, mode:result.mode, simulationTime:result.simulationTime, sitProgress:result.motion.sitProgress};
  }
  const id = 'qa-source-outfit-seated';
  const request = debug.request({requestId:id, kind:'sit'});
  if (request.admission !== 'accepted') throw Error('Sit request rejected: ' + JSON.stringify(request));
  for (let steps = 1; steps <= 48; steps++) {
    const result = debug.advance(0.25);
    const task = debug.tasks().get(id);
    if (['failed','cancelled'].includes(task?.state)) throw Error('Sit request failed: ' + JSON.stringify(task));
    if (task?.state === 'completed' && result.mode === 'sit' && result.motion.sitProgress === 1) {
      const settled = debug.advance(0.15);
      return {steps, mode:settled.mode, simulationTime:settled.simulationTime, sitProgress:settled.motion.sitProgress};
    }
  }
  throw Error('Seat did not settle within 12 simulation seconds');
}

function renderView(view) {
  const debug = window.__debug, actor = debug.avatar();
  const [mode, direction] = view.split('-');
  debug.setBodyMode(mode);
  debug.setDynamics(false);
  debug.view('inspect-full-' + direction);
  const snapshot = debug.advance(0), camera = debug.cameraObject(), renderer = debug.renderer;
  const canvas = renderer.domElement;
  if (!snapshot.paused) throw Error('Pose was not paused');
  // Idle blinking starts with each room load, independently of the reset simulation clock.
  const expressions = actor.vrm.expressionManager;
  if (!expressions?.expressions?.length) throw Error('Raw expression state unavailable');
  for (const expression of expressions.expressions) expressions.setValue(expression.expressionName, 0);
  actor.livePresentation.refreshEyeBlinkCompatibility();
  renderer.render(debug.scene, camera);
  const bones = [];
  actor.vrm.scene.traverse(node => {if (node.isBone) bones.push([node.name, node.matrixWorld.toArray()]);});
  if (!bones.length) throw Error('Raw rig not exposed');
  const joint = name => {
    const node = actor.vrm.humanoid.getRawBoneNode(name);
    if (!node) throw Error('Raw joint unavailable: ' + name);
    const point = node.getWorldPosition(camera.position.clone()).project(camera);
    return [(point.x + 1) * canvas.width / 2, (1 - point.y) * canvas.height / 2];
  };
  const sides = names => ['left', 'right'].flatMap(side => names.map(name => side + name));
  const torso = ['neck', 'spine', 'hips', ...sides(['Shoulder'])];
  const arms = sides(['UpperArm','LowerArm','Hand']);
  const legs = ['hips', ...sides(['UpperLeg','LowerLeg','Foot'])];
  const bounds = (names, pad) => {
    const points = names.map(joint);
    const x0 = Math.max(0, Math.floor(Math.min(...points.map(point => point[0])) - pad));
    const y0 = Math.max(0, Math.floor(Math.min(...points.map(point => point[1])) - pad));
    const x1 = Math.min(canvas.width, Math.ceil(Math.max(...points.map(point => point[0])) + pad));
    const y1 = Math.min(canvas.height, Math.ceil(Math.max(...points.map(point => point[1])) + pad));
    if (x1 <= x0 || y1 <= y0) throw Error('Projected inspection region is empty');
    return [x0,y0,x1,y1];
  };
  return {png:canvas.toDataURL('image/png'), width:canvas.width, height:canvas.height, mode, direction,
    simulationTime:snapshot.simulationTime, modeTime:snapshot.modeTime, pose:snapshot.mode, sitProgress:snapshot.motion.sitProgress,
    camera:{world:camera.matrixWorld.toArray(), projection:camera.projectionMatrix.toArray()}, bones,
    regions:{figure:bounds(['head', ...torso, ...arms, ...legs], 55), clothing:bounds(torso, 45), arms:bounds(arms, 36), legs:bounds(legs, 42)}};
}

function maxDifference(left, right) {
  assert.equal(left.length, right.length);
  let maximum = 0;
  for (let i = 0; i < left.length; i++) {
    assert.ok(Number.isFinite(left[i]) && Number.isFinite(right[i]));
    maximum = Math.max(maximum, Math.abs(left[i] - right[i]));
  }
  return maximum;
}

function verifyMatchedPose(left, right) {
  for (const key of ['width','height','mode','direction','pose','sitProgress']) assert.equal(right[key], left[key], key);
  const clock = maxDifference([left.simulationTime], [right.simulationTime]);
  const camera = Math.max(...Object.keys(left.camera).map(key => maxDifference(left.camera[key], right.camera[key])));
  assert.deepEqual(right.bones.map(row => row[0]), left.bones.map(row => row[0]), 'Raw rig order/name differs');
  const bones = Math.max(...left.bones.map((row, i) => maxDifference(row[1], right.bones[i][1])));
  assert.ok(Math.max(clock, camera, bones) <= TOLERANCE,
    `Cannot attribute pixel differences to the release assets: clock=${clock}, camera=${camera}, bones=${bones}`);
  return {clock, camera, bones, tolerance:TOLERANCE};
}

function comparePixels(left, right, bounds, PNG) {
  assert.equal(left.width, right.width);
  assert.equal(left.height, right.height);
  const [x0,y0,x1,y1] = bounds, width = x1 - x0, height = y1 - y0;
  const pair = new PNG({width:width * 2, height});
  let changed = 0, peak = 0, sum = 0;
  for (let y = y0; y < y1; y++) {
    const line = 4 * (y * left.width + x0), destination = 8 * ((y - y0) * width);
    left.data.copy(pair.data, destination, line, line + width * 4);
    right.data.copy(pair.data, destination + width * 4, line, line + width * 4);
    for (let x = 0; x < width; x++) {
      const index = line + x * 4;
      const deltas = [0,1,2].map(channel => Math.abs(left.data[index + channel] - right.data[index + channel]));
      if (deltas.some(Boolean)) changed++;
      peak = Math.max(peak, ...deltas);
      sum += deltas.reduce((a, b) => a + b);
    }
  }
  const pixels = width * height;
  return {pair, stats:{bounds, pixels, changedPixels:changed, maxRgbDelta:peak, meanAbsoluteRgbDelta:sum / (pixels * 3)}};
}

async function inspect(browser, base, build, out, bodyType, label, report) {
  const context = await browser.newContext({viewport:VIEWPORT, deviceScaleFactor:1, serviceWorkers:'block'});
  const row = {label, bodyType, shots:{}, errors:[]};
  report.cases.push(row);
  let network;
  try {
    const page = await context.newPage();
    page.on('pageerror', error => row.errors.push(error.message));
    network = await observeNetwork(context, page);
    const url = new URL(base);
    url.searchParams.set('workbench', 'appearance');
    url.searchParams.set('view', 'inspect-full-front');
    url.searchParams.set('body', bodyType);
    await page.goto(url.href);
    await page.waitForFunction(build => window.__debug?.ready && window.__debug.buildInfo?.shortId === build,
      build, {timeout:90000});
    row.identity = await page.evaluate(readIdentity);
    assert.equal(row.identity.bodyType, bodyType);
    assert.equal(row.identity.build, build);
    assert.equal(row.identity.development, false);
    assert.ok(Object.values(row.identity.colors).every(value => value === 'original' || value === null), 'Candidate is not in original colors');
    assert.equal(row.identity.resources.body.sha256, bodyType === SOURCE ? SOURCE_SHA : RELEASE_SHA);
    const served = await network.read(new URL('/build-info.json', base).href);
    const buildInfo = JSON.parse(served.bytes);
    assert.equal(buildInfo.shortId, build);
    assert.equal(row.identity.sourceDigest, buildInfo.sourceDigest);
    assert.ok(buildInfo.sourceDigest.startsWith(build));

    row.responses = {};
    for (const role of ROLES) {
      const resource = row.identity.resources[role];
      assert.equal(new URL(resource.url).origin, url.origin, 'Expected a local candidate resource');
      const {bytes, ...transfer} = await network.read(resource.url);
      const hash = sha(bytes);
      assert.equal(hash, resource.sha256, `Actual cold response identity differs for ${role}`);
      if (resource.declaredBytes !== undefined) assert.equal(bytes.length, resource.declaredBytes);
      row.responses[role] = {url:resource.url, sha256:hash, responseBodyBytes:bytes.length, ...transfer};
    }
    assert.equal(new Set(ROLES.map(role => row.responses[role].url)).size, ROLES.length, 'Unexpected aliased wardrobe URLs');
    if (bodyType === RELEASE) assert.equal(row.responses.body.responseBodyBytes, RELEASE_BYTES);
    row.totalResponseBodyBytes = ROLES.reduce((sum, role) => sum + row.responses[role].responseBodyBytes, 0);
    row.totalTransferBytes = ROLES.reduce((sum, role) => sum + row.responses[role].transferBytes, 0);

    row.poses = {};
    for (const pose of ['standing','seated']) {
      row.poses[pose] = await page.evaluate(setPose, pose);
      if (pose === 'seated') {
        row.seatedContact = await page.evaluate(seatedContact);
        const contact = row.seatedContact;
        assert.equal(contact.simulationTime, row.poses.seated.simulationTime);
        assert.equal(contact.body.sha256, row.responses.body.sha256);
        assert.equal(contact.equipment.pants.sha256, row.responses.pants.sha256);
        assert.equal(contact.equipment.shoes.sha256, row.responses.shoes.sha256);
        assert.ok(contact.bottomVerticesOverSeat > 0 && contact.shoeVertices > 0 &&
          Number.isFinite(contact.garmentGapMetres) && Number.isFinite(contact.soleGapMetres), 'Missing seated contact samples');
      }
      for (const view of POSE_VIEWS) {
        const frame = await page.evaluate(renderView, view);
        const shot = `${pose}-${view}`, file = `${label}-${shot}.png`;
        assert.ok(frame.png.startsWith('data:image/png;base64,'));
        const image = Buffer.from(frame.png.slice('data:image/png;base64,'.length), 'base64');
        delete frame.png;
        await fs.writeFile(path.join(out, file), image, {flag:'wx'});
        row.shots[shot] = {...frame, file, sha256:sha(image)};
      }
      // Leave the controller in the normal clothed state before stepping into the next pose.
      await page.evaluate(() => {__debug.setBodyMode('dressed'); __debug.setDynamics(false);});
    }
    assert.deepEqual(row.errors, []);
    return row;
  } finally {
    if (network) row.network = network.diagnostics();
    await context.close();
  }
}

async function main() {
  const [base, build, directory] = process.argv.slice(2);
  if (!directory || process.argv.length !== 5 || !/^[a-f0-9]{12}$/.test(build))
    throw Error('Usage: node scripts/run-fixed-check.cjs FIXED_DIST scripts/qa-source-outfit-release.cjs BUILD_ID NEW_PROJECT_OUTPUT_DIR');
  const address = new URL(base);
  assert.equal(address.protocol, 'http:');
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(address.hostname), 'Use the fixed-build loopback harness');
  const out = await projectOutput(directory, await productionRoot());
  await fs.mkdir(out);
  await fs.copyFile(__filename, path.join(out, 'executed-script.cjs'));
  await fs.copyFile(require.resolve('./qa-seated-outfit-contact.cjs'), path.join(out, 'qa-seated-outfit-contact.cjs'));
  const report = {schema:'ab9a-outfit-release-browser-comparison-v1', build, viewport:VIEWPORT,
    host:{platform:os.platform(), version:os.version(), architecture:os.arch(), cpu:os.cpus()[0]?.model},
    status:'incomplete', cases:[], comparisons:{}, limits:[
      'Headless Chrome on the development machine. This is neither target-device performance nor visual acceptance.',
      'The four HTTP payload totals exclude headers. The separate CDP transfer total includes protocol overhead. No page total, cache hit or static resource estimate is included.',
      'Each case starts in a fresh context with cache disabled and service workers blocked. Response body inspection reuses captured bytes.',
      'Paused deterministic standing and seated poses with secondary dynamics disabled and neutral facial expression. Base inspection may apply the engine diagnostic body material. Dressed views show original in-game materials.',
      'Crop statistics use projected raw joints with padding and can include background or overlapping adjacent parts.',
      'Seated contact is sampled at the same paused pose. Negative distances indicate a vertex below the seat top or room floor plane; this is a vertex diagnostic, not continuous collision clearance.',
    ]};
  let browser;
  try {
    const {chromium} = require('../prototype/node_modules/playwright');
    const {PNG} = require('../prototype/node_modules/playwright-core/lib/utilsBundle.js');
    browser = await chromium.launch({channel:'chrome', headless:true});
    report.browser = browser.version();
    const source = await inspect(browser, base, build, out, SOURCE, 'source', report);
    const release = await inspect(browser, base, build, out, RELEASE, 'release', report);
    assert.equal(release.identity.sourceDigest, source.identity.sourceDigest);
    assert.deepEqual(release.identity.environment, source.identity.environment);
    assert.deepEqual(release.poses, source.poses, 'The same deterministic action did not produce the same pose stage');
    for (const role of ['top', 'pants', 'shoes']) {
      for (const key of ['url', 'sha256', 'responseBodyBytes']) assert.equal(release.responses[role][key], source.responses[role][key], `Shared ${role} ${key}`);
    }
    for (const [shot, left] of Object.entries(source.shots)) {
      const right = release.shots[shot];
      const poseAgreement = verifyMatchedPose(left, right);
      const original = PNG.sync.read(await fs.readFile(path.join(out, left.file)));
      const candidate = PNG.sync.read(await fs.readFile(path.join(out, right.file)));
      const regions = {};
      for (const [region, bounds] of Object.entries(left.regions)) {
        const {pair, stats} = comparePixels(original, candidate, bounds, PNG);
        const file = `${shot}-${region}-source-left-release-right.png`;
        await fs.writeFile(path.join(out, file), PNG.sync.write(pair), {flag:'wx'});
        regions[region] = {...stats, file};
      }
      report.comparisons[shot] = {poseAgreement, regions};
    }
    const a = source.seatedContact, b = release.seatedContact;
    for (const key of ['seatTopY', 'floorY']) assert.ok(Math.abs(a[key] - b[key]) <= TOLERANCE, `Seated reference plane differs: ${key}`);
    for (const row of [source, release]) assert.equal(row.seatedContact.simulationTime, row.shots['seated-dressed-front'].simulationTime);
    report.seatedContactComparison = {
      deltaReleaseMinusSourceMetres:{pantsToSeat:b.garmentGapMetres - a.garmentGapMetres, shoesToFloor:b.soleGapMetres - a.soleGapMetres},
      bottomVerticesOverSeat:{source:a.bottomVerticesOverSeat, release:b.bottomVerticesOverSeat},
      shoeVertices:{source:a.shoeVertices, release:b.shoeVertices},
    };
    report.responseByteComparison = {
      roles: Object.fromEntries(ROLES.map(role => [role, {source:source.responses[role].responseBodyBytes,
        release:release.responses[role].responseBodyBytes}])),
      source:source.totalResponseBodyBytes, release:release.totalResponseBodyBytes,
      savings:source.totalResponseBodyBytes - release.totalResponseBodyBytes,
    };
    report.status = 'technical-comparison-captured-visual-review-pending';
  } catch (error) {
    report.failure = error.stack ?? String(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    const receipt = path.join(out, 'report.json');
    await fs.writeFile(receipt, JSON.stringify(report, null, 2) + '\n', {flag:'wx'});
    console.log(JSON.stringify({status:report.status, build, receipt, responseBytes:report.responseByteComparison,
      seatedContact:report.seatedContactComparison, failure:report.failure}));
  }
}

if (require.main === module) main().catch(error => {console.error(error); process.exitCode = 1;});
module.exports = {comparePixels, verifyMatchedPose};
