const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createInterface } = require('node:readline');
const { chromium } = require('../../prototype/node_modules/playwright');

const [rootArg, build, ...options] = process.argv.slice(2);
const flags = options.filter(value => value.startsWith('--'));
const paths = options.filter(value => !value.startsWith('--'));
if (!rootArg || !/^[a-f0-9]{12}$/.test(build) || ![1, 2].includes(paths.length) ||
    flags.length > 1 || flags.some(flag => flag !== '--record')) {
  throw new Error('Usage: node qa-garment-rack-rooms.cjs DIST BUILD BATCH_ROOT NEW_OUT [--record]\n' +
    '   or: node qa-garment-rack-rooms.cjs PACKAGE BUILD NEW_OUT [--record]');
}
const root = path.resolve(rootArg);
const batch = paths.length === 2 ? path.resolve(paths[0]) : null;
const out = path.resolve(paths.at(-1));
const recordRequested = flags.includes('--record');
const viewport = { width: 1500, height: 950 };
const threeUrl = '/__garment-rack-qa/three.core.js';
const rackRole = 'garment-rack-wardrobe';
const garmentRole = 'hanging-garment';
const rackLooks = ['portal', 'a-frame', 'cantilever', 'trestle'].map(name => ({ id: 'garment-rack-' + name, version: 1 }));
const near = (actual, expected, tolerance = 1e-5) => assert(Math.abs(actual - expected) <= tolerance, actual + ' != ' + expected);
const key = ref => ref.id + '@' + ref.version;
const node = (doc, id) => doc.nodes.find(row => row.id === id);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { status: 'running', build, rooms: [], browserErrors: [] };
let manifest, devServer, packageServer, baseUrl, threeSource, context, page, responses, stage, outputCreated, expectedError;

async function pinned(file) {
  const bytes = await fs.readFile(path.join(root, file));
  const pin = manifest.files.find(item => item.path === file);
  assert.equal(bytes.length, pin?.bytes, file);
  assert.equal(sha(bytes), pin.sha256, file);
  return bytes;
}

async function serve() {
  if (batch) {
    devServer = await require('./serve.cjs').serve(root, build, {
      manifest: 'company-build-info.json', entry: 'company.html', port: 0,
    });
    return new URL(devServer.url);
  }
  packageServer = spawn(process.execPath, ['serve.mjs', '0'], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const lines = createInterface({ input: packageServer.stdout });
  try {
    const [line] = await Promise.race([
      once(lines, 'line', { signal: AbortSignal.timeout(20000) }),
      once(packageServer, 'exit').then(([code]) => { throw new Error('Package server stopped before ready: ' + code); }),
    ]);
    const url = new URL(line);
    assert(url.port && url.hostname === '127.0.0.1' && url.pathname === '/company.html');
    url.search = '';
    return url;
  } finally {
    lines.close();
    packageServer.stdout.resume();
  }
}

async function fixture(id) {
  const packagedRoom = 'data/rooms/' + id + '/save.json';
  const file = batch ? path.join(batch, id, 'save.json') : packagedRoom;
  const bytes = batch ? await fs.readFile(file) : await pinned(file);
  const { schema, document } = JSON.parse(bytes);
  assert.equal(schema, 'company-save');
  assert.equal(document.id, id);
  return { id, file, bytes, document };
}

async function open(profile, recording = false) {
  context = await chromium.launchPersistentContext(profile, {
    headless: true, viewport, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(recording ? { recordVideo: { dir: path.join(out, 'video'), size: viewport } } : {}),
  });
  context.setDefaultTimeout(20000);
  await context.route('**' + threeUrl, route => route.fulfill({ contentType: 'text/javascript', body: threeSource }));
  page = context.pages()[0] || await context.newPage();
  responses = new Map();
  page.on('response', response => responses.set(new URL(response.url()).pathname, response));
  page.on('pageerror', error => report.browserErrors.push({ stage, message: error.message }));
  page.on('console', event => {
    if (event.type() !== 'error') return;
    const message = event.text();
    if (expectedError && message.includes(expectedError.code) && message.includes(expectedError.id)) {
      expectedError.messages.push(message);
      return;
    }
    report.browserErrors.push({ stage, message });
  });
}

async function close() {
  if (!context) return;
  const browser = context.browser();
  await context.close();
  if (browser) assert.equal(browser.isConnected(), false);
  context = null;
  page = null;
}

const current = () => page.evaluate(() => company.session.document);
const readSave = id => page.evaluate(id => company.session.readSavedText(id), id);

async function ready(rejected = false) {
  await page.waitForFunction(() => window.company?.editor && company.buildInfo &&
    document.querySelector('#status').dataset.error !== undefined && !document.querySelector('#mode-room').disabled);
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'), String(rejected), await status.textContent());
}

async function visit(url) {
  await page.goto(url.href);
  await ready();
  const runtime = await page.evaluate(() => company.buildInfo);
  assert.equal(runtime.shortId, build);
  if (manifest) assert.equal(runtime.sourceDigest, manifest.sourceDigest);
}

async function load(room) {
  const url = new URL(baseUrl);
  if (!batch) url.searchParams.set('delivery', room.id);
  await visit(url);
  if (batch) {
    const menu = page.locator('.file-menu');
    if (!(await menu.evaluate(element => element.open))) await menu.locator('summary').click();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#import').click()]);
    await chooser.setFiles(room.file);
    await ready();
    if (await menu.evaluate(element => element.open)) await menu.locator('summary').click();
  } else {
    const response = responses.get('/delivery-room/' + room.id + '.json');
    assert.equal(response?.status(), 200);
    assert(room.bytes.equals(await response.body()));
  }
  await page.waitForFunction(id => company.session.document.id === id, room.id);
  assert.deepEqual(await current(), room.document);
}

async function actualAsset(asset) {
  const response = responses.get(asset.url);
  assert.equal(response?.status(), 200, 'Expected actual wardrobe GLB request: ' + asset.url);
  const bytes = manifest ? await pinned('viewer' + asset.url) : await fs.readFile(path.join(root, '.' + asset.url));
  assert.equal(sha(bytes), asset.sha256);
  assert.equal(bytes.length, asset.bytes);
  assert(bytes.equals(await response.body()));
}

async function screenshot(name) {
  await page.evaluate(() => company.drawHostFrame());
  await page.screenshot({ path: path.join(out, name) });
  return name;
}


const rackMoves = {
  'wardrobe-rental': {
    rejected: { position: [-.80, 0, -1.3], yaw: Math.PI },
    accepted: { position: [-.65, 0, -1.1], yaw: Math.PI / 2 },
  },
};

const garments = ['jacket', 'shirt', 'dress', 'hoodie'].map(name => ({ id: 'garment-hanging-' + name, version: 1 }));
const compatibleOptions = locator => locator.locator('option').evaluateAll(options => options.map(option => option.value).filter(Boolean));
const slotTarget = (rack, slot) => rack + ':rail:' + slot;
const xyz = (matrix) => matrix.slice(12, 15);
const short = id => id.split('/').at(-1);

async function discover(fixture) {
  const roles = await page.evaluate(() => company.catalog.resources.map(({ id, version, mountRole, mount }) =>
    ({ id, version, mountRole, mount })));
  const resources = new Map(roles.map(resource => [key(resource), resource]));
  for (const look of rackLooks) assert.equal(resources.get(key(look))?.mountRole, rackRole);
  for (const look of garments) {
    const role = resources.get(key(look));
    assert.equal(role?.mountRole, garmentRole);
    assert.equal(role.mount, 'garment-rail');
  }
  const doc = fixture.document;
  const resource = facility => resources.get(key(facility.resource));
  const hosts = doc.nodes.filter(facility => facility.resource && resource(facility)?.mountRole === rackRole &&
    node(doc, facility.parentId)?.purpose === 'work');
  assert.equal(hosts.length, 1);
  const rack = hosts[0], roomId = rack.parentId, floorId = node(doc, roomId).parentId;
  assert.equal(rack.id, roomId + '/rack');
  const children = doc.nodes.filter(facility => facility.parentId === rack.id && facility.resource &&
    resource(facility)?.mountRole === garmentRole);
  assert.deepEqual(children.map(facility => short(facility.id)).sort(), ['look-left', 'look-right']);
  assert.deepEqual(children.map(facility => facility.attachment?.slotId).sort(), ['left', 'right']);
  assert(children.every(facility => short(facility.id) === 'look-' + facility.attachment.slotId));
  return { ...fixture, roomId, floorId, rackId: rack.id, childIds: children.map(facility => facility.id).sort() };
}

async function camera(room) {
  await page.evaluate(rackId => {
    const { session, camera } = company;
    const rack = session.scene.root.getObjectByName(rackId);
    const world = local => rack.localToWorld(camera.position.clone().fromArray(local));
    camera.position.copy(world([2.20, 2.12, 3.90]));
    camera.lookAt(world([.03, .87, .28]));
    camera.updateMatrixWorld(true);
    session.scene.setWallView({ mode: 'cutaway', cameraPosition: camera.position.toArray() });
    company.drawHostFrame();
  }, room.rackId);
}

async function witnessFrames(room) {
  await page.locator('#edit-instance').selectOption('');
  const neighbor = room.document.nodes.find(item => item.parentId === room.roomId &&
    (item.id === room.roomId + '/mirror' || item.id === room.roomId + '/vanity'));
  assert(neighbor, 'Expected the authored mirror or vanity for room context');
  const overview = await page.evaluate(async ({ rackId, neighborId, threeUrl }) => {
    const { Box3, Vector3 } = await import(threeUrl);
    const { session, camera } = company;
    const { scene } = session;
    const rack = scene.root.getObjectByName(rackId), furniture = scene.root.getObjectByName(neighborId);
    const center = new Box3().setFromObject(furniture.children[0]).getCenter(new Vector3());
    const focus = rack.localToWorld(new Vector3(0,.90,0)).lerp(center,.44);
    const offset = rack.localToWorld(new Vector3(1.9,2.7,4.85)).sub(rack.getWorldPosition(new Vector3()));
    camera.position.copy(focus).add(offset);
    camera.lookAt(focus);
    camera.updateMatrixWorld(true);
    scene.setWallView({ mode:'cutaway', cameraPosition:camera.position.toArray() });
    company.drawHostFrame();
    let included = false;
    scene.root.traverseVisible(node => { if (node === furniture) included = true; });
    return { furniture:neighborId, included, projectedCenter:center.project(camera).toArray() };
  }, { rackId:room.rackId, neighborId:neighbor.id, threeUrl });
  assert(overview.included && overview.projectedCenter.slice(0,2).every(value => Math.abs(value) < 1));
  // Inspect the scene while keeping the surrounding real furniture in frame.
  const whole = await inspect(room,true);
  const wide = await screenshot(room.id + '-rack-and-room.png');
  await page.evaluate(rackId => {
    const { session, camera } = company;
    const rack = session.scene.root.getObjectByName(rackId);
    const local = coords => rack.localToWorld(camera.position.clone().fromArray(coords));
    camera.position.copy(local([.48,1.66,.64]));
    camera.lookAt(local([0,1.50,0]));
    camera.updateMatrixWorld(true);
    session.scene.setWallView({ mode:'cutaway', cameraPosition:camera.position.toArray() });
    company.drawHostFrame();
  }, room.rackId);
  const detail = await screenshot(room.id + '-rail-and-hooks.png');
  await camera(room);
  return { wide, detail, overview, visibleRackAndGarments:whole.pixels };
}

async function chooseInstance(id) {
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(id);
  assert.equal(await page.locator('#edit-instance').inputValue(), id);
}

async function show(room, selected = room.rackId) {
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== room.floorId) await page.locator('#floor').selectOption(room.floorId);
  if (view.mode !== 'room' || view.roomId !== room.roomId) {
    await page.locator('#room').selectOption(room.roomId);
    await page.waitForFunction(id => company.session.scene.view.roomId === id, room.roomId);
  }
  await ready();
  await page.locator('.view-toolbar [data-view="room"]').click();
  await chooseInstance(selected);
  await camera(room);
}

async function chooseLook(id, ref, family) {
  await chooseInstance(id);
  const select = page.locator('#edit-look');
  const options = await compatibleOptions(select);
  for (const alternate of family) assert(options.includes(key(alternate)), 'Expected compatible appearance ' + key(alternate));
  if (await select.inputValue() === key(ref)) return;
  const expected = await current();
  expected.revision++;
  node(expected, id).resource = ref;
  await select.selectOption(key(ref));
  await ready();
  assert.deepEqual(await current(), expected, 'Replacement must preserve instance, parent, slot and transform');
}

async function inspect(room, provePixels = false) {
  const facts = await page.evaluate(async ({ rackId, roomId, threeUrl, provePixels }) => {
    const { Box3, Raycaster, Vector3 } = await import(threeUrl);
    const { session, camera, renderer } = company;
    const { scene, document: layout } = session;
    const lookup = id => layout.nodes.find(item => item.id === id);
    const resource = item => company.catalog.resources.find(entry => entry.id === item.resource.id && entry.version === item.resource.version);
    const rackNode = lookup(rackId), rack = scene.root.getObjectByName(rackId);
    const rackSpec = resource(rackNode);
    scene.root.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const rackLocal = rack.matrixWorld.clone().invert();
    const { centerY, radius, slots } = rackSpec.garmentRail;
    const rail = rack.getObjectByName('garment-rail');
    if (!rail?.isMesh) throw new Error('Missing actual rack rail triangles');
    const ray = new Raycaster();
    const at = (mesh, origin, direction, maximum) => {
      ray.set(origin, direction);
      ray.far = maximum;
      const hit = ray.intersectObject(mesh, false)[0];
      return hit ? { distance: hit.distance, triangle: hit.faceIndex } : null;
    };
    const attach = layout.nodes.filter(item => item.parentId === rackId && item.attachment?.slotId)
      .sort((a, b) => a.attachment.slotId.localeCompare(b.attachment.slotId));
    const assetVisuals = [rack, ...attach.map(item => scene.root.getObjectByName(item.id))].map(group => {
      let visual = group === rack ? rail : group.getObjectByName('garment-cloth');
      if (!visual?.isMesh) throw new Error('Missing named model geometry: ' + group.name);
      // A facility can already have attached child facilities before its GLB is appended.
      while (visual.parent !== group) visual = visual.parent;
      const meshes = [];
      scene.root.traverseVisible(mesh => { if (mesh.isMesh && visual.getObjectById(mesh.id)) meshes.push(mesh); });
      return { group, visual, meshes };
    });
    const physical = visual => {
      const box = new Box3(), screen = new Box3();
      for (const mesh of visual.meshes) {
        const transform = rackLocal.clone().multiply(mesh.matrixWorld);
        const vertices = mesh.geometry.attributes.position;
        for (let i = 0; i < vertices.count; i++) {
          const vertex = new Vector3().fromBufferAttribute(vertices, i);
          box.expandByPoint(vertex.clone().applyMatrix4(transform));
          screen.expandByPoint(vertex.applyMatrix4(mesh.matrixWorld).project(camera));
        }
      }
      return {
        names: visual.meshes.map(mesh => mesh.userData.name || mesh.name),
        localBounds: [box.min.toArray(), box.max.toArray()],
        screenBounds: [screen.min.toArray(), screen.max.toArray()],
      };
    };
    let pixels;
    if (provePixels) {
      const source = renderer.domElement;
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const draw = () => {
        company.drawHostFrame();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const shadows = assetVisuals.flatMap(entry => entry.meshes).map(mesh => [mesh, mesh.castShadow]);
      try {
        for (const [mesh] of shadows) mesh.castShadow = false;
        const intact = draw();
        pixels = {};
        for (const { visual, group } of assetVisuals) {
          const visible = visual.visible;
          let hidden;
          try {
            visual.visible = false;
            hidden = draw();
          } finally {
            visual.visible = visible;
          }
          let count = 0;
          for (let i = 0; i < intact.length; i += 4) {
            if (Math.abs(intact[i] - hidden[i]) + Math.abs(intact[i + 1] - hidden[i + 1]) +
                Math.abs(intact[i + 2] - hidden[i + 2]) > 24) count++;
          }
          pixels[group.name] = count;
        }
      } finally {
        for (const [mesh, castShadow] of shadows) mesh.castShadow = castShadow;
        company.drawHostFrame();
      }
    }
    return {
      host: rackNode, hostAsset: rackSpec.asset, rackPose: rack.matrixWorld.toArray(), roomId,
      hostGeometry: physical(assetVisuals[0]), hostContract: { mount: rackSpec.mount, role:rackSpec.mountRole,
        mounting: rackSpec.mounting, footprint: rackSpec.footprint, rail: rackSpec.garmentRail, clearance: rackSpec.clearance },
      hanging: attach.map((item, index) => {
        const { group } = assetVisuals[index + 1];
        const entry = resource(item);
        const slot = slots.find(slot => slot.id === item.attachment.slotId);
        const center = rack.localToWorld(new Vector3(slot.position[0], centerY, slot.position[2]));
        const hook = group.getObjectByName('hanger-hook');
        if (!hook?.isMesh) throw new Error('Missing actual hanger hook triangles');
        const contacts = [[0,1,0], [0,0,1], [0,0,-1]].map(axis => {
          const direction = new Vector3(...axis).transformDirection(rack.matrixWorld);
          const rod = at(rail, center.clone().addScaledVector(direction, .04), direction.clone().negate(), .04);
          const bore = at(hook, center, direction, .026);
          return { axis, rod, bore, gap: rod && bore ? bore.distance - (.04 - rod.distance) : null };
        });
        return { item, slot, contacts, asset: entry.asset, role:entry.mountRole, mount:entry.mount,
          runtimeParent: group.parent.name, world: group.matrixWorld.toArray(),
          local: rackLocal.clone().multiply(group.matrixWorld).toArray(), geometry: physical(assetVisuals[index + 1]) };
      }),
      camera: camera.matrixWorld.toArray(), ...(provePixels ? { pixels } : {}),
      error: company.renderStatus().lastRenderError,
    };
  }, { rackId: room.rackId, roomId: room.roomId, threeUrl, provePixels });
  assert.equal(facts.error, null);
  assert.equal(facts.host.parentId, room.roomId);
  assert.equal(facts.hostContract.role, rackRole);
  assert.equal(facts.hostContract.mount, 'floor-surface');
  assert(facts.hostGeometry.names.includes('garment-rail'));
  assert.deepEqual(facts.hostContract.clearance.front, { min: [-.44, .25], max: [.44, .85] });
  const { width, height, depth } = facts.hostContract.mounting;
  assert.deepEqual([width, height, depth], [1, 1.8, .50]);
  near(facts.hostGeometry.localBounds[0][1], 0, .001);
  await actualAsset(facts.hostAsset);
  for (const child of facts.hanging) {
    assert.equal(child.runtimeParent, room.rackId);
    assert.equal(child.role, garmentRole);
    assert.equal(child.mount, 'garment-rail');
    assert(child.item.attachment.slotId === 'left' || child.item.attachment.slotId === 'right');
    xyz(child.local).forEach((component, index) => near(component, child.item.transform.position[index]));
    assert.deepEqual(child.item.transform, { position:child.slot.position, yaw:0 });
    assert(['hanger-hook','garment-hanger','garment-cloth'].every(name => child.geometry.names.includes(name)));
    for (const { rod, bore, gap } of child.contacts) {
      assert(rod && bore, 'Actual rail and hanging hook must meet in the mounted instance');
      near(.04 - rod.distance, facts.hostContract.rail.radius, .0006);
      near(bore.distance, facts.hostContract.rail.radius, .0005);
      near(gap, 0, .001);
    }
    await actualAsset(child.asset);
  }
  assert.equal(new Set(facts.hanging.map(child => child.item.attachment.slotId)).size, facts.hanging.length);
  if (provePixels) {
    for (const entry of [facts.host, ...facts.hanging.map(child => child.item)]) {
      assert(facts.pixels[entry.id] >= 400, 'Real frame or garment is not visible: ' + entry.id);
    }
    for (const geometry of [facts.hostGeometry, ...facts.hanging.map(child => child.geometry)]) {
      assert(geometry.screenBounds.every(point => point.slice(0, 2).every(value => Math.abs(value) < .99)),
        'The entire filled rack belongs in the shot: ' + JSON.stringify(geometry.screenBounds));
    }
  }
  return facts;
}

async function save(room) {
  const document = await current();
  await page.locator('#save').click();
  await ready();
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'), 'false');
  const text = await readSave(room.id), envelope = JSON.parse(text);
  assert.deepEqual(envelope.document, document);
  const resources = [node(document, room.rackId), ...document.nodes.filter(item => item.parentId === room.rackId)];
  for (const { resource } of resources) assert(envelope.dependencies.resources.some(pin => key(pin) === key(resource)));
  return { document, text, sha256: sha(text) };
}

async function reopen(room, profile, saved) {
  await close();
  await open(profile);
  await visit(baseUrl);
  assert.equal(await page.locator('#status').textContent(), '已恢复上次保存的方案。');
  assert.deepEqual(await current(), saved.document);
  assert.equal(await readSave(room.id), saved.text);
  assert(![...responses.keys()].some(file => file === '/delivery-save.json' || file.startsWith('/delivery-room/')));
  await show(room);
}

async function selectAdd(room, ref) {
  await page.locator('#tool-add').click();
  await page.locator('#add-branch').selectOption(garmentRole);
  await page.locator('#add-look').selectOption(key(ref));
  return compatibleOptions(page.locator('#add-target'));
}

async function expand(selector) {
  const detail = page.locator(selector);
  if (!(await detail.evaluate(element => element.open))) await detail.locator(':scope > summary').click();
}

async function moveRack(room, transform, rejection = false) {
  await chooseInstance(room.rackId);
  await expand('#placement-tools');
  await expand('#placement-tools > details');
  for (const [index, axis] of ['x','y','z'].entries()) {
    const field = page.locator('#edit-' + axis);
    if (await field.isEnabled()) await field.fill(String(transform.position[index]));
    else near(Number(await field.inputValue()), transform.position[index]);
  }
  await page.locator('#edit-yaw').selectOption(String(Math.round(transform.yaw * 180 / Math.PI) % 360));
  await page.locator('#edit-position').click();
  await ready(rejection);
}

async function removeGarment(id) {
  await chooseInstance(id);
  await expand('#placement-tools');
  await page.locator('#edit-remove').click();
  await ready();
}

async function attachAt(id, target) {
  await chooseInstance(id);
  await expand('#placement-tools');
  const attach = page.locator('#edit-target');
  assert((await compatibleOptions(attach)).includes(target));
  await attach.selectOption(target);
  await page.locator('#edit-attach').click();
  await ready();
}

async function addAt(target) {
  await page.locator('#add-target').selectOption(target);
  await page.locator('#add-center').click();
  await ready();
}

async function fullAndEmpty(room, profile, baseline, prior) {
  stage = room.id + ': full rail has no ordinary add target';
  const [left, right] = room.childIds;
  assert.equal(baseline.hanging.length, 2);
  const fullTargets = await selectAdd(room, garments[0]);
  assert(!['left','right'].some(slot => fullTargets.includes(slotTarget(room.rackId, slot))));
  assert(await page.locator('#add-center').isDisabled());
  assert.match(await page.locator('#add-note').textContent(), /挂位已满/);
  await chooseInstance(right);
  await expand('#placement-tools');
  assert(await page.locator('#edit-attach').isDisabled());
  assert(await page.locator('#edit-copy').isDisabled());
  const duplicate = await page.evaluate(async ({ right, rackId }) => {
    try { await company.apply([{ type:'attach-garment', id:right, parentId:rackId, slotId:'left' }]); }
    catch (error) { return { code:error.code, path:error.path, message:error.message }; }
  }, { right, rackId:room.rackId });
  assert.equal(duplicate?.code, 'garment-slot-occupied');
  assert.deepEqual(await current(), prior.document);
  assert.equal(await readSave(room.id), prior.text);
  assert.deepEqual(await inspect(room), baseline);

  stage = room.id + ': remove and rehang through the ordinary inspector';
  await removeGarment(left);
  const one = await inspect(room);
  assert.equal(one.hanging.length, 1);
  assert.equal(one.hanging[0].item.id, right);
  const candidate = slotTarget(room.rackId, 'left');
  const old = await current();
  await attachAt(right, candidate);
  const rehang = await inspect(room, true);
  assert.equal(rehang.hanging.length, 1);
  const moved = rehang.hanging[0].item;
  const expected = structuredClone(old);
  expected.revision++;
  const exact = node(expected, right);
  exact.attachment = { slotId: 'left' };
  exact.transform = { position:rehang.hostContract.rail.slots.find(slot => slot.id === 'left').position, yaw:0 };
  assert.deepEqual(await current(), expected);
  assert.notDeepEqual(moved.transform, node(old, right).transform);
  const emptyFrame = await screenshot(room.id + '-left-occupied-right-empty.png');

  const free = await selectAdd(room, garments[1]);
  assert(free.includes(slotTarget(room.rackId, 'right')));
  assert(!free.includes(candidate));
  await addAt(slotTarget(room.rackId, 'right'));
  const replacement = await inspect(room, true);
  assert.equal(replacement.hanging.length, 2);
  const filled = replacement.hanging.find(child => child.item.attachment.slotId === 'right').item;
  assert(!node(old, filled.id));
  assert.notEqual(filled.id, right);
  assert.deepEqual(filled.resource, garments[1]);
  assert.deepEqual(replacement.hanging.find(child => child.item.attachment.slotId === 'left').item, moved);
  const filledFrame = await screenshot(room.id + '-both-slots-refilled.png');
  const changed = await save(room);
  await reopen(room, profile, changed);
  const { pixels, ...expectedScene } = replacement;
  assert.deepEqual(await inspect(room), expectedScene);
  return { fullTargets, duplicate, released: left, retained: right, moved, filled, frames: [emptyFrame, filledFrame],
    committedSha256: changed.sha256, saved: changed, snapshot: expectedScene };
}

async function placement(room, profile, before, saved) {
  stage = room.id + ': refuse invalid rack position with two garments';
  const action = rackMoves[room.id];
  const rejection = { code:'outside-garment-clearance', id:room.rackId, messages:[] };
  expectedError = rejection;
  try { await moveRack(room, action.rejected, true); }
  finally { expectedError = undefined; }
  assert(rejection.messages.length > 0, 'Expected an actual rejected front-clearance edit');
  const denied = await page.locator('#edit-message').textContent();
  assert.match(denied, /取衣空间超出房间/);
  assert.match(denied, /原布置已保留/);
  assert.deepEqual(await current(), saved.document);
  assert.equal(await readSave(room.id), saved.text);
  assert.deepEqual(await inspect(room), before);
  const rejectFrame = await screenshot(room.id + '-rejected-rack-move.png');
  await reopen(room, profile, saved);
  assert.deepEqual(await inspect(room), before);

  stage = room.id + ': move the real rack with both original identities and slots';
  const target = action.accepted;
  assert(target && target.yaw !== before.host.transform.yaw);
  const expected = await current();
  expected.revision++;
  node(expected, room.rackId).transform = target;
  await moveRack(room, target);
  assert.deepEqual(await current(), expected);
  await show(room);
  const moved = await inspect(room, true);
  assert.notDeepEqual(moved.rackPose, before.rackPose);
  for (const [index, child] of moved.hanging.entries()) {
    const was = before.hanging[index];
    assert.deepEqual(child.item, was.item);
    assert.notDeepEqual(child.world, was.world);
    child.local.forEach((value, axis) => near(value, was.local[axis]));
  }
  const movedFrame = await screenshot(room.id + '-full-rack-turned.png');
  const nextSaved = await save(room);
  await reopen(room, profile, nextSaved);
  const { pixels, ...expectedScene } = moved;
  assert.deepEqual(await inspect(room), expectedScene);
  return { denied, rejection, rejectFrame, savedBefore: saved.sha256, movedFrame, target, restoredAfter: nextSaved.sha256 };
}

async function roomRun(fixture) {
  stage = fixture.id + ': open a real company layout';
  const profile = await fs.mkdtemp(path.join(out, 'profile-'));
  await open(profile);
  await load(fixture);
  const room = await discover(fixture);
  await show(room);
  const initial = await inspect(room);
  assert.equal(initial.hanging.length, 2);
  const entry = { key: room.id, roomId: room.roomId, initial, source: fixture.file,
    sourceSha256: sha(fixture.bytes), pairings: [] };
  report.rooms.push(entry);
  const [left, right] = room.childIds;
  const hosts = new Set(), clothes = new Set();
  let last, saved;
  for (const [index, rack] of rackLooks.entries()) {
    stage = room.id + ': swap and reopen ' + key(rack);
    const leftRef = garments[index], rightRef = garments[(index + 1) % garments.length];
    await chooseLook(room.rackId, rack, rackLooks);
    await chooseLook(left, leftRef, garments);
    await chooseLook(right, rightRef, garments);
    await chooseInstance(room.rackId);
    const live = await inspect(room, true);
    assert.deepEqual(live.camera, initial.camera);
    assert.deepEqual(live.hostContract, initial.hostContract);
    assert.deepEqual(live.rackPose, initial.rackPose);
    assert.equal(live.hanging.length, 2);
    assert(!hosts.has(live.hostAsset.sha256));
    hosts.add(live.hostAsset.sha256);
    clothes.add(live.hanging[0].asset.sha256);
    assert.deepEqual(live.hanging[0].item.resource, leftRef);
    assert.deepEqual(live.hanging[1].item.resource, rightRef);
    const file = await screenshot(room.id + '-' + rack.id + '.png');
    saved = await save(room);
    await reopen(room, profile, saved);
    last = await inspect(room);
    const { pixels, ...expected } = live;
    assert.deepEqual(last, expected);
    entry.pairings.push({ rack, left: leftRef, right: rightRef, file, live, saved: saved.sha256 });
  }
  assert.equal(clothes.size, 4);
  entry.witnessFrames = await witnessFrames(room);
  if (rackMoves[room.id]) {
    const slots = await fullAndEmpty(room, profile, last, saved);
    entry.slots = { fullTargets: slots.fullTargets, duplicate: slots.duplicate, moved: slots.moved, filled: slots.filled,
      frames: slots.frames, committedSha256: slots.committedSha256 };
    entry.placement = await placement(room, profile, slots.snapshot, slots.saved);
  }
  await close();
  return room;
}

async function record(inputs) {
  stage = 'normal-speed recording';
  const [rental, floor] = inputs;
  const profile = await fs.mkdtemp(path.join(out, 'recording-profile-'));
  await open(profile, true);
  await load(rental);
  await show(rental);
  for (const [index, rack] of rackLooks.entries()) {
    await chooseLook(rental.rackId, rack, rackLooks);
    await chooseLook(rental.childIds[0], garments[index], garments);
    await chooseLook(rental.childIds[1], garments[(index + 1) % garments.length], garments);
    await chooseInstance(rental.rackId);
    await page.waitForTimeout(1450);
  }
  await removeGarment(rental.childIds[0]);
  await attachAt(rental.childIds[1], slotTarget(rental.rackId, 'left'));
  await page.waitForTimeout(1150);
  await selectAdd(rental, garments[1]);
  await addAt(slotTarget(rental.rackId, 'right'));
  await chooseInstance(rental.rackId);
  await page.waitForTimeout(1100);
  await load(floor);
  await show(floor);
  await page.waitForTimeout(2300);
  const raw = await page.video().path();
  await close();
  const file = 'video/garment-rack-rooms-normal.webm';
  await fs.rename(raw, path.join(out, file));
  const { size } = await fs.stat(path.join(out, file));
  assert(size > 0);
  report.video = { file, bytes:size, playbackSpeed:1 };
}

async function run() {
  await fs.mkdir(path.dirname(out), { recursive:true });
  await fs.mkdir(out);
  outputCreated = true;
  stage = 'pinned build and fixture bytes';
  if (!batch) {
    manifest = JSON.parse(await fs.readFile(path.join(root, 'transfer-manifest.json')));
    assert.equal(manifest.schema, 'company-transfer');
    assert.equal(manifest.buildId, build);
    const lock = JSON.parse(await pinned('source/prototype/package-lock.json'));
    assert.equal(require('../../prototype/node_modules/three/package.json').version, lock.packages['node_modules/three'].version);
  }
  threeSource = await fs.readFile(path.join(__dirname, '../../prototype/node_modules/three/build/three.core.js'), 'utf8');
  const fixtures = await Promise.all(['wardrobe-rental','wardrobe-floor'].map(fixture));
  baseUrl = await serve();
  report.sourceDigest = manifest?.sourceDigest ?? devServer.info.sourceDigest;
  const rooms = [];
  for (const entry of fixtures) rooms.push(await roomRun(entry));
  assert(report.rooms.some(item => item.slots && item.placement));
  if (recordRequested) await record(rooms);
  assert.deepEqual(report.browserErrors, []);
  report.status = 'passed';
}

run().catch(async error => {
  report.status = 'failed';
  report.failure = { stage, message:error.message, stack:error.stack };
  if (page) {
    report.failure.statusText = await page.locator('#status').textContent({ timeout:2000 }).catch(() => undefined);
    await page.screenshot({ path:path.join(out, 'failure.png'), timeout:5000 }).catch(() => {});
  }
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  try { await close(); }
  finally {
    await devServer?.close();
    if (packageServer && packageServer.exitCode === null && packageServer.signalCode === null) {
      const exit = once(packageServer, 'exit');
      packageServer.kill();
      await exit;
    }
    if (outputCreated) await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report,null,2) + '\n');
    console.log(JSON.stringify({ status:report.status, build, output:out, video:report.video?.file }));
  }
});
