const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {createHash} = require('node:crypto');
const {once} = require('node:events');
const fs = require('node:fs/promises');
const {createRequire} = require('node:module');
const path = require('node:path');
const {createInterface} = require('node:readline');

const [packageArg, build, outputArg, dependencyArg, originalArg, ...extra] = process.argv.slice(2);
if (!packageArg || !/^[0-9a-f]{12}$/.test(build) || !outputArg || extra.length)
  throw new Error('Usage: node qa-louvered-wardrobe.cjs PACKAGE BUILD NEW_OUT [PROTOTYPE_WITH_DEPENDENCIES] [ORIGINAL_PACKAGE]');
const delivery = path.resolve(packageArg), output = path.resolve(outputArg);
const original = originalArg ? path.resolve(originalArg) : null;
const dependencies = path.resolve(dependencyArg || path.join(delivery,'source/prototype'));
const localRequire = createRequire(path.join(dependencies,'package.json'));
const {chromium} = localRequire('playwright');
const threeUrl = '/__louvered-wardrobe-proof/three.core.js';
const look = {id:'enclosed-wardrobe-louvered-ash', version:1};
const glassLook = {id:'enclosed-wardrobe-glass', version:1};
const sha = content => createHash('sha256').update(content).digest('hex');
const find = (doc, id) => doc.nodes.find(item => item.id === id);
const near = (value, expected, epsilon = 1e-6) => assert(Math.abs(value - expected) <= epsilon, `${value} != ${expected}`);
const report = {status:'running', build, look, rooms:[], errors:[]};
let manifest, three, server, baseUrl, context, page, responses, stage;

async function pinned(file) {
  const bytes = await fs.readFile(path.join(delivery,file));
  const pin = manifest.files.find(entry => entry.path === file);
  assert.equal(bytes.length,pin?.bytes,file);
  assert.equal(sha(bytes),pin.sha256,file);
  return bytes;
}

async function serve() {
  server = spawn(process.execPath,['serve.mjs','0'],{cwd:delivery,windowsHide:true,stdio:['ignore','pipe','inherit']});
  const lines = createInterface({input:server.stdout});
  try {
    const [line] = await Promise.race([
      once(lines,'line',{signal:AbortSignal.timeout(20000)}),
      once(server,'exit').then(([code]) => { throw new Error('Delivery server exited early: ' + code); }),
    ]);
    const url = new URL(line);
    assert(url.hostname === '127.0.0.1' && url.port && url.pathname === '/company.html');
    url.search = '';
    return url;
  } finally { lines.close(); server.stdout.resume(); }
}

async function open(profile) {
  context = await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:1500,height:950},
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context.setDefaultTimeout(20000);
  await context.route('**' + threeUrl,route => route.fulfill({contentType:'text/javascript',body:three}));
  page = context.pages()[0] || await context.newPage();
  responses = new Map();
  page.on('response',response => responses.set(new URL(response.url()).pathname,response));
  page.on('pageerror',error => report.errors.push({stage,message:error.message}));
  page.on('console',event => { if (event.type() === 'error') report.errors.push({stage,message:event.text()}); });
}

async function close() {
  if (!context) return;
  const browser = context.browser();
  await context.close();
  if (browser) assert.equal(browser.isConnected(),false);
  context = null;
  page = null;
}

async function ready() {
  await page.waitForFunction(() => window.company?.editor && company.buildInfo &&
    document.querySelector('#status').dataset.error !== undefined && !document.querySelector('#mode-room').disabled);
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'),'false',await status.textContent());
}

const current = () => page.evaluate(() => company.session.document);
const saveText = id => page.evaluate(id => company.session.readSavedText(id),id);

async function visit(room, fresh = true) {
  const url = new URL(baseUrl);
  if (fresh) url.searchParams.set('delivery',room.id);
  await page.goto(url.href);
  await ready();
  const identity = await page.evaluate(() => company.buildInfo);
  assert.equal(identity.shortId,build);
  assert.equal(identity.sourceDigest,manifest.sourceDigest);
  if (fresh) {
    const response = responses.get('/delivery-room/' + room.id + '.json');
    assert.equal(response?.status(),200);
    assert(room.bytes.equals(await response.body()));
    assert.deepEqual(await current(),room.document);
  } else {
    assert.equal(await page.locator('#status').textContent(),'已恢复上次保存的方案。');
    assert(![...responses.keys()].some(file => file === '/delivery-save.json' || file.startsWith('/delivery-room/')));
  }
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== room.floor) await page.locator('#floor').selectOption(room.floor);
  if (view.mode !== 'room' || view.roomId !== room.room) await page.locator('#room').selectOption(room.room);
  await page.waitForFunction(id => company.session.scene.view.roomId === id,room.room);
  await page.locator('.view-toolbar [data-view="room"]').click();
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(room.wardrobe);
  assert.equal(await page.locator('#edit-look').inputValue(),`${room.look.id}@${room.look.version}`);
}

async function verifyAsset(asset) {
  assert.equal(asset.format,'glb');
  const bytes = await pinned('viewer' + asset.url);
  assert.equal(bytes.length,asset.bytes);
  assert.equal(sha(bytes),asset.sha256);
  const response = responses.get(asset.url);
  assert.equal(response?.status(),200);
  assert(bytes.equals(await response.body()));
}

async function inspect(room, checkBytes = true) {
  const evidence = await page.evaluate(async ({wardrobeId, childIds, threeUrl, louvered}) => {
    const {Box3,Raycaster,Vector3} = await import(threeUrl);
    const {session:{scene, document:layout}} = company;
    scene.root.updateMatrixWorld(true);
    const wardrobe = scene.root.getObjectByName(wardrobeId);
    const node = id => layout.nodes.find(item => item.id === id);
    const resource = id => company.catalog.resources.find(item => item.id === node(id).resource.id && item.version === node(id).resource.version);
    const spec = resource(wardrobeId);
    const rail = wardrobe.getObjectByName('garment-rail'), ray = new Raycaster();
    const project = (items, origin, direction, length) => {
      ray.set(origin,direction); ray.far=length;
      return ray.intersectObjects(items,true)[0];
    };
    const doors = spec.movingParts.map(part => {
      const pivot = wardrobe.getObjectByName(spec.partNodes[part.id]);
      const panel = pivot.getObjectByName(spec.partPanels[part.id]);
      const inset = pivot.getObjectByName(`wardrobe-${part.id}-inset`);
      const handle = pivot.getObjectByName(`wardrobe-${part.id}-handle`);
      if (!panel || !handle) throw new Error('Missing physical door or handle');
      const anchor = new Box3().setFromObject(handle,true).getCenter(new Vector3()).toArray();
      if (!louvered) {
        const glass = pivot.getObjectByName(`wardrobe-${part.id}-glass`);
        const materials = [];
        glass?.traverseVisible(mesh => { if (mesh.isMesh) for (const m of [mesh.material].flat())
          materials.push({opacity:m.opacity,transparent:m.transparent,castShadow:mesh.castShadow}); });
        return {side:part.id,angle:pivot.rotation.y,materials,anchor};
      }
      if (!inset) throw new Error('Missing genuine louver components');
      const inverse = pivot.matrixWorld.clone().invert(), ranges = [], materials = new Set();
      inset.traverseVisible(mesh => {
        if (!mesh.isMesh) return;
        for (const m of [mesh.material].flat()) if (m.visible && m.opacity === 1) materials.add(m.color.getHexString());
        const {index,attributes:{position}} = mesh.geometry, transform = inverse.clone().multiply(mesh.matrixWorld);
        for (let i=0;i<(index?.count ?? position.count);i+=3) {
          const triangle = [i,i+1,i+2].map(j => new Vector3().fromBufferAttribute(position,index ? index.getX(j) : j).applyMatrix4(transform));
          const heights = triangle.map(v => v.y);
          ranges.push([Math.min(...heights),Math.max(...heights)]);
        }
      });
      const bands = [];
      for (const [min,max] of ranges.sort((a,b) => a[0]-b[0])) {
        const last = bands.at(-1);
        if (last && min <= last.max + 1e-5) Object.assign(last,{max:Math.max(last.max,max),triangles:last.triangles+1});
        else bands.push({min,max,triangles:1});
      }
      const line = new Vector3(0,0,-1).transformDirection(pivot.matrixWorld);
      const sign = part.id === 'left' ? 1 : -1;
      for (const band of bands) {
        const y = (band.min+band.max)/2;
        const origin = pivot.localToWorld(new Vector3(sign*.19,y,.055));
        const blade = project([inset],origin,line,.10), leaf = project([panel],origin,line,.10);
        band.reliefMetres = leaf && blade ? leaf.distance-blade.distance : null;
      }
      return {side:part.id,angle:pivot.rotation.y,bands,colors:[...materials].sort(),anchor};
    });
    const up = new Vector3(0,1,0);
    const clothes = childIds.map(id => {
      const child = wardrobe.getObjectByName(id);
      const hook = child.getObjectByName('hanger-hook');
      const cloth = child.getObjectByName('garment-cloth');
      if (child.parent !== wardrobe || !hook?.isMesh || !cloth?.isMesh || !rail?.isMesh) throw new Error('Missing genuine rail contacts or clothes');
      const bore = child.localToWorld(new Vector3(0,-spec.garmentRail.radius,0));
      const hookHit = project([hook],bore,up,.04), railHit = project([rail],bore.clone().addScaledVector(up,.039),up.clone().negate(),.04);
      if (!hookHit || !railHit) throw new Error('Rail or hook has no contact triangle');
      return {id,slot:node(id).attachment.slotId,resource:node(id).resource,matrix:child.matrixWorld.toArray(),
        gapMetres:hookHit.point.distanceTo(railHit.point),asset:resource(id).asset};
    });
    return {state:node(wardrobeId).state,doors,clothes,asset:spec.asset};
  },{wardrobeId:room.wardrobe,childIds:room.children,threeUrl,louvered:room.look.id === look.id});
  for (const door of evidence.doors) {
    near(door.angle,(door.side === 'left' ? -1 : 1) * Math.PI/2 * (evidence.state?.[door.side+'Open'] ?? 0));
    if (room.look.id === look.id) {
      assert.equal(door.bands.length,6,JSON.stringify(door));
      assert(door.colors.length && door.bands.every(band => band.triangles >= 10 && band.reliefMetres > .002),JSON.stringify(door));
      assert(door.bands.slice(1).every((band,i) => band.min-door.bands[i].max > .015));
    } else assert(door.materials.length && door.materials.every(m => m.transparent && m.opacity > 0 && m.opacity < 1 && !m.castShadow));
  }
  assert.deepEqual(evidence.clothes.map(item => item.slot),['left','right']);
  if (checkBytes) await verifyAsset(evidence.asset);
  for (const garment of evidence.clothes) {
    near(garment.gapMetres,0,.0005);
    if (checkBytes) await verifyAsset(garment.asset);
  }
  return evidence;
}

async function door(room, side, value) {
  const control = page.locator(`#edit-states input[type="range"][aria-label="${side === 'left' ? '左' : '右'}柜门开度"]`);
  if (Number(await control.inputValue()) === value) return;
  const expected = await current();
  expected.revision++;
  (find(expected,room.wardrobe).state ??= {})[side + 'Open'] = value;
  await control.fill(String(value));
  await ready();
  assert.deepEqual(await current(),expected);
}

async function picture(room, file, cameraPosition, focus) {
  await page.evaluate(({id, cameraPosition, focus}) => {
    const {camera,session:{scene}} = company, root = scene.root.getObjectByName(id);
    const world = value => root.localToWorld(camera.position.clone().fromArray(value));
    camera.position.copy(world(cameraPosition));
    camera.lookAt(world(focus));
    camera.updateMatrixWorld(true);
    scene.setWallView({mode:'cutaway',cameraPosition:camera.position.toArray()});
    company.drawHostFrame();
  },{id:room.wardrobe,cameraPosition,focus});
  await page.screenshot({path:path.join(output,file)});
  return file;
}

async function checkRoom(id, floorLabel) {
  const file = `data/rooms/${id}/save.json`, bytes = await pinned(file);
  const {document} = JSON.parse(bytes);
  assert.equal(document.id,id);
  const floor = id + '/' + floorLabel, roomId = floor + '/dressing', wardrobe = roomId + '/wardrobe';
  const expectedLook = id === 'closet-rental' ? look : glassLook;
  const room = {id,floor,room:roomId,wardrobe,look:expectedLook,children:['left','right'].map(side => wardrobe + '/look-' + side),document,bytes};
  assert.deepEqual(find(document,wardrobe)?.resource,expectedLook);
  const entry = {id,wardrobe,fixtureSha256:sha(bytes)};
  if (original) {
    const baseline = await fs.readFile(path.join(original,file));
    if (id === 'closet-floor') assert(bytes.equals(baseline),'Floor must preserve its original sealed save bytes');
    else {
      const {document:expected} = JSON.parse(baseline);
      find(expected,wardrobe).resource = expectedLook;
      assert.deepEqual(document,expected,'The receiver changes only rental wardrobe appearance');
    }
    entry.originalFixtureSha256 = sha(baseline);
  }
  report.rooms.push(entry);
  const profile = await fs.mkdtemp(path.join(output,'profile-'));
  stage = `${id}: pinned room and original assets`;
  await open(profile);
  await visit(room);
  entry.initial = await inspect(room);
  if (id === 'closet-floor') {
    assert.deepEqual(entry.initial.state,{leftOpen:0,rightOpen:.55});
    entry.originalRoom = await picture(room,id + '-retained-glass-room.png',[.65,2.14,4.35],[0,.95,.55]);
    await door(room,'left',1);
    await door(room,'right',1);
    entry.bothOpen = await inspect(room,false);
    assert.deepEqual(entry.bothOpen.clothes,entry.initial.clothes);
    await page.locator('#edit-instance').selectOption('');
    entry.open = await picture(room,id + '-retained-glass-open-room.png',[.55,2.25,4.90],[0,.90,1.20]);
    await close();
    return;
  }
  await door(room,'left',0);
  await door(room,'right',0);
  const closed = await inspect(room,false);
  entry.closed = await picture(room,id + '-louvered-closed-room.png',[.62,1.94,4.25],[.36,.88,.14]);
  entry.detail = await picture(room,id + '-louvered-detail.png',[.54,1.42,2.22],[.025,1.03,.15]);
  stage = `${id}: independent hinges with retained garments`;
  await door(room,'right',.55);
  const right = await inspect(room,false);
  assert.deepEqual(right.clothes,closed.clothes);
  assert.deepEqual(right.doors[0],closed.doors[0]);
  assert(Math.hypot(...right.doors[1].anchor.map((value,i) => value-closed.doors[1].anchor[i])) > .20);
  await door(room,'left',1);
  const both = await inspect(room,false);
  assert.deepEqual(both.clothes,closed.clothes);
  assert.deepEqual(both.doors[1],right.doors[1]);
  assert(Math.hypot(...both.doors[0].anchor.map((value,i) => value-closed.doors[0].anchor[i])) > .30);
  {
    stage = 'rental: save and cold reopen with no query';
    const expected = await current();
    await page.locator('#save').click();
    await ready();
    assert.equal(await page.locator('#save-state').getAttribute('data-dirty'),'false');
    const stored = await saveText(room.id);
    assert.deepEqual(JSON.parse(stored).document,expected);
    await close();
    await open(profile);
    await visit(room,false);
    assert.deepEqual(await current(),expected);
    assert.equal(await saveText(room.id),stored);
    assert.deepEqual(await inspect(room),both);
    entry.coldReopen = {savedSha256:sha(stored),restored:both};
  }
  await door(room,'right',1);
  entry.bothOpen = await inspect(room,false);
  await page.locator('#edit-instance').selectOption('');
  entry.open = await picture(room,id + '-louvered-open-room.png',[.72,2.13,4.55],[.62,.90,.16]);
  await close();
}

async function run() {
  stage = 'delivery manifest and exact runtime lock';
  const bytes = await fs.readFile(path.join(delivery,'transfer-manifest.json'));
  manifest = JSON.parse(bytes);
  assert.equal(manifest.schema,'company-transfer');
  assert.equal(manifest.buildId,build);
  report.manifestSha256 = sha(bytes);
  report.sourceDigest = manifest.sourceDigest;
  const lock = JSON.parse(await pinned('source/prototype/package-lock.json'));
  const threeBuild = path.dirname(localRequire.resolve('three'));
  const threePackage = JSON.parse(await fs.readFile(path.join(threeBuild,'../package.json'),'utf8'));
  assert.equal(threePackage.version,lock.packages['node_modules/three'].version);
  three = await fs.readFile(path.join(threeBuild,'three.core.js'),'utf8');
  baseUrl = await serve();
  await checkRoom('closet-rental','ground');
  await checkRoom('closet-floor','level');
  assert.deepEqual(report.errors,[]);
  report.status = 'passed';
}

(async () => {
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.mkdir(output);
  try { await run(); }
  catch (error) {
    report.status = 'failed';
    report.failure = {stage,message:error.message,stack:error.stack};
    if (page) await page.screenshot({path:path.join(output,'failure.png'),timeout:5000}).catch(() => {});
    process.exitCode = 1;
  } finally {
    try { await close(); }
    finally {
      if (server && server.exitCode === null && server.signalCode === null) {
        const stopped = once(server,'exit');
        server.kill();
        await stopped;
      }
      await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2) + '\n');
      console.log(JSON.stringify({status:report.status,build,output,failure:report.failure}));
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
