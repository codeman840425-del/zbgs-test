const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {createHash} = require('node:crypto');
const {once} = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createInterface} = require('node:readline');
const {chromium} = require('../../prototype/node_modules/playwright');

const [rootArg, build, ...options] = process.argv.slice(2);
const flags = options.filter(value => value.startsWith('--')), paths = options.filter(value => !value.startsWith('--'));
if (!rootArg || !/^[0-9a-f]{12}$/.test(build) || ![1,2].includes(paths.length) || flags.length > 1 || flags.some(value => value !== '--record'))
  throw new Error('Usage: node qa-interview-rooms.cjs DIST BUILD BATCH_ROOMS NEW_OUT [--record]\n' +
    '   or: node qa-interview-rooms.cjs PACKAGE BUILD NEW_OUT [--record]');
const root = path.resolve(rootArg), batch = paths.length === 2 ? path.resolve(paths[0]) : null, out = path.resolve(paths.at(-1));
const viewport = {width:1600,height:900}, threeUrl = '/__interview-room-qa/three.core.js';
const names = ['hostChair','guestChair','hostMic','guestMic','camera'];
const chairPreferences = ['chair-crossbeam@1','chair-pedestal@1','chair-ladder@1','chair-cantilever@1'];
const sha = value => createHash('sha256').update(value).digest('hex');
const key = ({id,version}) => `${id}@${version}`;
const find = (document,id) => document.nodes.find(node => node.id === id);
const near = (actual,expected,tolerance = 1e-6) => assert(Math.abs(actual-expected) <= tolerance, `${actual} != ${expected}`);
const report = {status:'running',build,rooms:[],browserErrors:[]};
let manifest, devServer, packageServer, base, threeSource, context, page, responses, stage, created;

async function read(file) {
  const data = await fs.readFile(path.join(root,file));
  if (manifest) {
    const declared = manifest.files.find(pin => pin.path === file);
    assert.equal(data.length,declared?.bytes,file);
    assert.equal(sha(data),declared.sha256,file);
  }
  return data;
}

async function serve() {
  if (batch) {
    devServer = await require('./serve.cjs').serve(root,build,{manifest:'company-build-info.json',entry:'company.html',port:0});
    return new URL(devServer.url);
  }
  packageServer = spawn(process.execPath,['serve.mjs','0'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','inherit']});
  const lines = createInterface({input:packageServer.stdout});
  try {
    const [line] = await Promise.race([
      once(lines,'line',{signal:AbortSignal.timeout(20000)}),
      once(packageServer,'exit').then(([code]) => { throw new Error('Delivery server stopped before readiness: ' + code); }),
    ]);
    const url = new URL(line);
    assert(url.hostname === '127.0.0.1' && url.port && url.pathname === '/company.html');
    url.search = '';
    return url;
  } finally { lines.close(); packageServer.stdout.resume(); }
}

async function fixtures() {
  const directory = batch || path.join(root,'data/rooms');
  const results = [];
  for (const entry of await fs.readdir(directory,{withFileTypes:true})) {
    if (!entry.isDirectory()) continue;
    const {name} = entry;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) continue;
    const file = basename => batch ? fs.readFile(path.join(batch,name,basename)) : read(`data/rooms/${name}/${basename}`);
    const layout = JSON.parse(await file('layout.json'));
    if (!layout.interviewRooms?.length) continue;
    const bytes = await file('save.json'), {schema,document} = JSON.parse(bytes);
    assert.equal(schema,'company-save');
    assert.deepEqual(document,layout);
    assert.equal(layout.interviewRooms.length,1);
    const rule = layout.interviewRooms[0], region = find(document,rule.regionId);
    assert.equal(region?.kind,'room');
    const roles = Object.fromEntries(names.map(role => [role,rule.roles?.[role]]));
    assert.equal(new Set(Object.values(roles)).size,names.length);
    assert(Object.values(roles).every(id => find(document,id)?.kind === 'facility'));
    const areas = document.nodes.filter(node => node.kind === 'area' && node.parentId === region.parentId);
    results.push({alias:name,bytes,document,room:region.id,floor:region.parentId,roles,areas});
  }
  assert.equal(results.length,2,'Expected two room layouts with an interviewRooms contract');
  const authored = results.find(room => room.document.scale === 'single-room');
  assert(authored,'Expected one standalone two-seat interview fixture');
  const companion = results.find(room => room !== authored);
  assert(companion.areas.length,'The second delivered floor must have a real public area');
  return [authored,companion];
}

async function open(profile, recording = false) {
  context = await chromium.launchPersistentContext(profile,{headless:true,viewport,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
    ...(recording ? {recordVideo:{dir:path.join(out,'video'),size:viewport}} : {}),
  });
  context.setDefaultTimeout(20000);
  await context.route('**' + threeUrl,route => route.fulfill({contentType:'text/javascript',body:threeSource}));
  page = context.pages()[0] || await context.newPage();
  responses = new Map();
  page.on('response',response => responses.set(new URL(response.url()).pathname,response));
  page.on('pageerror',error => report.browserErrors.push({stage,message:error.message}));
  page.on('console',event => { if (event.type() === 'error') report.browserErrors.push({stage,message:event.text()}); });
}

async function close() {
  if (!context) return;
  const browser = context.browser();
  await context.close();
  if (browser) assert.equal(browser.isConnected(),false);
  context = null;
  page = null;
}

const current = () => page.evaluate(() => company.session.document);
const savedText = id => page.evaluate(id => company.session.readSavedText(id),id);

async function ready() {
  await page.waitForFunction(() => window.company?.editor && company.buildInfo &&
    document.querySelector('#status').dataset.error !== undefined && !document.querySelector('#mode-room').disabled);
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'),'false',await status.textContent());
}

async function enter(room, region = room.room) {
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== room.floor) await page.locator('#floor').selectOption(room.floor);
  if (view.mode !== 'room' || view.roomId !== region || view.floorId !== room.floor) await page.locator('#room').selectOption(region);
  await page.waitForFunction(id => company.session.scene.view.roomId === id,region);
  await ready();
  await page.locator('.view-toolbar [data-view="room"]').click();
}

async function visit(room, initial = true) {
  const url = new URL(base);
  if (initial && !batch) url.searchParams.set('delivery',room.alias);
  await page.goto(url.href);
  await ready();
  const identity = await page.evaluate(() => company.buildInfo);
  assert.equal(identity.shortId,build);
  if (manifest) assert.equal(identity.sourceDigest,manifest.sourceDigest);
  if (initial) {
    if (batch) {
      const menu = page.locator('.file-menu');
      if (!(await menu.evaluate(el => el.open))) await menu.locator('summary').click();
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'),page.locator('#import').click()]);
      await chooser.setFiles(path.join(batch,room.alias,'save.json'));
      await ready();
      if (await menu.evaluate(el => el.open)) await menu.locator('summary').click();
    } else {
      const response = responses.get('/delivery-room/' + room.alias + '.json');
      assert.equal(response?.status(),200);
      assert(room.bytes.equals(await response.body()));
    }
    assert.deepEqual(await current(),room.document);
  } else {
    assert.equal(await page.locator('#status').textContent(),'已恢复上次保存的方案。');
    assert(![...responses.keys()].some(url => url === '/delivery-save.json' || url.startsWith('/delivery-room/')));
  }
  await enter(room);
}

async function choose(id) {
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(id);
  assert.equal(await page.locator('#edit-instance').inputValue(),id);
}

async function asset(value) {
  assert.equal(value?.format,'glb');
  const response = responses.get(value.url);
  assert.equal(response?.status(),200,'Expected browser asset ' + value.url);
  const bytes = await read(manifest ? 'viewer' + value.url : '.' + value.url);
  assert.equal(bytes.length,value.bytes);
  assert.equal(sha(bytes),value.sha256);
  assert(bytes.equals(await response.body()));
}

async function geometry(room, checkAssets = false) {
  const observed = await page.evaluate(async ({roles,threeUrl}) => {
    const {Box3,Raycaster,Vector3} = await import(threeUrl);
    const {scene,document} = company.session;
    const item = id => document.nodes.find(node => node.id === id);
    const spec = id => company.catalog.resources.find(r => r.id === item(id).resource.id && r.version === item(id).resource.version);
    const object = id => {
      const found = scene.root.getObjectByName(id);
      if (!found) throw new Error('Missing actual scene object ' + id);
      return found;
    };
    const ray = new Raycaster(), up = new Vector3(0,1,0), vector = point => new Vector3(...point);
    const cast = (origin,direction,meshes) => {
      ray.set(origin,direction.clone().normalize());
      ray.near = 1e-6; ray.far = 20;
      return ray.intersectObjects(meshes,false)[0];
    };
    const box = o => new Box3().setFromObject(o,true);
    const center = o => box(o).getCenter(new Vector3());
    const triangles = mesh => (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count)/3;
    scene.root.updateMatrixWorld(true);
    const rig = object(roles.camera), cameraSpec = spec(roles.camera);
    const lens = rig.getObjectByName(cameraSpec.camera.lensNode);
    if (!lens?.isMesh) throw new Error('Missing actual lens mesh');
    const axis = new Vector3(0,0,1).transformDirection(rig.matrixWorld);
    const front = cast(center(lens).addScaledVector(axis,.18),axis.clone().negate(),[lens]);
    if (!front) throw new Error('No actual surface on the lens optical axis');
    const meshes = [];
    scene.root.traverseVisible(mesh => { if (mesh.isMesh && mesh !== lens) meshes.push(mesh); });
    const points = scene.describeUsePoints().filter(point => point.facilityId === roles.hostChair || point.facilityId === roles.guestChair);
    const chairs = ['hostChair','guestChair'].map(role => {
      const id = roles[role], chair = object(id), point = points.find(point => point.facilityId === id);
      const seat = scene.resolveUsePoint(point.id)?.chairSeat, back = scene.resolveUsePoint(point.id)?.chairBack;
      if (!seat?.isMesh || !back?.isMesh || chair.getObjectById(seat.id) !== seat || chair.getObjectById(back.id) !== back)
        throw new Error('Missing real seat/back meshes for ' + id);
      const [x,,z] = point.local.position;
      const patch = [[0,0],[-.06,0],[.06,0],[0,-.06],[0,.06]].map(([dx,dz]) => {
        const origin = chair.localToWorld(vector([x+dx,point.seatHeight+.26,z+dz]));
        const hit = cast(origin,up.clone().negate(),[seat]);
        if (!hit) throw new Error('Seat patch misses its actual seat triangles for ' + id);
        return {offset:[dx,dz],triangle:hit.faceIndex,point:hit.point.toArray(),height:chair.worldToLocal(hit.point.clone()).y};
      });
      const contact = vector(patch[0].point), direction = contact.clone().sub(front.point);
      const opticalStart = front.point.clone().addScaledVector(axis,.002);
      const sight = cast(opticalStart,contact.clone().sub(opticalStart),meshes);
      const localDirection = direction.clone().transformDirection(rig.matrixWorld.clone().invert());
      const toOther = object(roles[role === 'hostChair' ? 'guestChair' : 'hostChair']).getWorldPosition(new Vector3())
        .sub(chair.getWorldPosition(new Vector3()));
      const facing = new Vector3(0,0,1).transformDirection(chair.matrixWorld);
      return {id,point,actualParent:chair.parent.name,matrix:chair.matrixWorld.toArray(),seat:seat.name,back:back.name,
        seatTriangles:triangles(seat),backTriangles:triangles(back),patch,firstLensHit:sight?.object.name,
        visibleFromLens:sight?.object === seat,horizontalDegrees:Math.atan2(localDirection.x,localDirection.z)*180/Math.PI,
        verticalDegrees:Math.atan2(localDirection.y,Math.hypot(localDirection.x,localDirection.z))*180/Math.PI,
        facingDegrees:facing.angleTo(toOther)*180/Math.PI, asset:spec(id).asset};
    });
    const microphones = ['hostMic','guestMic'].map(role => {
      const id = roles[role], actor = object(id);
      const head = actor.getObjectByName('head') || actor.getObjectByName('body');
      const base = actor.getObjectByName('base');
      if (!head?.isMesh || !base?.isMesh) throw new Error('Missing actual microphone capsule or base on ' + id);
      const under = object(item(id).parentId), where = center(base);
      const surface = under.getObjectByName('desktop');
      const hit = surface?.isMesh ? cast(where.clone().addScaledVector(up,.08),up.clone().negate(),[surface]) : null;
      return {id,actualParent:actor.parent.name,expectedParent:item(id).parentId,matrix:actor.matrixWorld.toArray(),
        head:head.name,headCenter:center(head).toArray(),headTriangles:triangles(head),base:base.name,
        gap:hit ? box(base).min.y-hit.point.y : null,asset:spec(id).asset};
    });
    return {room:scene.view.roomId,pointCount:points.length,chairs,microphones,optics:{origin:front.point.toArray(),axis:axis.toArray(),
      lens:lens.name,lensTriangle:front.faceIndex,cameraTriangles:triangles(lens),parent:rig.parent.name,asset:cameraSpec.asset}};
  },{roles:room.roles,threeUrl});
  assert.equal(observed.room,room.room);
  assert.equal(observed.pointCount,2);
  assert.notEqual(observed.chairs[0].point.id,observed.chairs[1].point.id);
  assert.notDeepEqual(observed.chairs[0].matrix,observed.chairs[1].matrix);
  for (const row of observed.chairs) {
    assert.equal(row.actualParent,room.room);
    assert.equal(row.point.capacity,1);
    assert(row.point.approachPosition?.length === 3 && row.point.exitPosition?.length === 3 && row.point.clearance);
    assert(row.seatTriangles > 0 && row.backTriangles > 0);
    assert(row.visibleFromLens,'Physical lens direction to seat is obstructed by ' + row.firstLensHit);
    assert(Math.abs(row.horizontalDegrees) < 36 && Math.abs(row.verticalDegrees) < 22 && row.facingDegrees < 45);
    for (const patch of row.patch) near(patch.height,row.point.seatHeight,.001);
  }
  for (const row of observed.microphones) {
    assert(row.headTriangles > 0);
    assert.equal(row.actualParent,row.expectedParent);
    assert(Number.isFinite(row.gap),'The microphone must sit on an actual desktop triangle');
    near(row.gap,0,.002);
  }
  assert.notDeepEqual(observed.microphones[0].headCenter,observed.microphones[1].headCenter);
  assert.equal(observed.optics.parent,find(room.document,room.roles.camera).parentId);
  if (checkAssets) for (const value of [...observed.chairs,...observed.microphones,observed.optics]) await asset(value.asset);
  return observed;
}

async function overview() {
  const button = page.locator('.view-toolbar [data-view="room"]');
  await button.click();
  await ready();
  assert.equal(await button.getAttribute('aria-pressed'),'true');
}

async function lens(room, observed) {
  const button = page.locator('.view-toolbar [data-view="camera"]');
  assert.equal(await button.textContent(),'机位取景');
  assert.equal(await page.locator('#edit-instance').inputValue(),room.roles.camera);
  await button.click();
  await ready();
  assert.equal(await button.getAttribute('aria-pressed'),'true');
  const evidence = await page.evaluate(async ({optics,contacts,threeUrl}) => {
    const {Vector3} = await import(threeUrl);
    const {camera} = company;
    const axis = new Vector3(...optics.axis), origin = new Vector3(...optics.origin);
    camera.updateMatrixWorld(true);
    const position = camera.getWorldPosition(new Vector3()), worldDirection = camera.getWorldDirection(new Vector3());
    const offset = position.clone().sub(origin), alongAxis = offset.dot(axis);
    return {position:position.toArray(),direction:worldDirection.toArray(),verticalFov:camera.fov, alongAxis,
      lateralOffset:offset.addScaledVector(axis,-alongAxis).length(), directionDegrees:worldDirection.angleTo(axis)*180/Math.PI,
      projectedContacts:contacts.map(point => new Vector3(...point).project(camera).toArray())};
  },{optics:observed.optics,contacts:observed.chairs.map(row => row.patch[0].point),threeUrl});
  assert(evidence.alongAxis >= -.001 && evidence.alongAxis <= .025 && evidence.lateralOffset <= .001,
    'The viewer must start at the actual front of the mounted lens: ' + JSON.stringify(evidence));
  near(evidence.directionDegrees,0,.05);
  assert(evidence.projectedContacts.every(([x,y,z]) => Math.abs(x) < .95 && Math.abs(y) < .95 && Math.abs(z) < 1));
  return evidence;
}

async function seatPixels(room) {
  return page.evaluate(ids => {
    const {renderer,session:{scene}} = company;
    const canvas = document.createElement('canvas');
    canvas.width = renderer.domElement.width; canvas.height = renderer.domElement.height;
    const ctx = canvas.getContext('2d',{willReadFrequently:true});
    const capture = () => {
      company.drawHostFrame();
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(renderer.domElement,0,0);
      return ctx.getImageData(0,0,canvas.width,canvas.height).data;
    };
    return ids.map(id => {
      const chair = scene.root.getObjectByName(id), visible = chair.visible, casters = [];
      chair.traverseVisible(mesh => { if (mesh.isMesh && mesh.castShadow) casters.push(mesh); });
      let shown, hidden;
      try {
        for (const mesh of casters) mesh.castShadow = false;
        shown = capture(); chair.visible = false; hidden = capture();
      } finally {
        chair.visible = visible;
        for (const mesh of casters) mesh.castShadow = true;
        company.drawHostFrame();
      }
      let count = 0, left = canvas.width, right = 0, top = canvas.height, bottom = 0;
      for (let i=0;i<shown.length;i+=4) {
        const delta = Math.abs(shown[i]-hidden[i])+Math.abs(shown[i+1]-hidden[i+1])+Math.abs(shown[i+2]-hidden[i+2]);
        if (delta < 24) continue;
        const x = (i/4)%canvas.width, y = Math.floor(i/4/canvas.width);
        count++; left = Math.min(left,x); right = Math.max(right,x); top = Math.min(top,y); bottom = Math.max(bottom,y);
      }
      return {id,count,box:[left,top,right,bottom],canvas:[canvas.width,canvas.height]};
    });
  },[room.roles.hostChair,room.roles.guestChair]);
}

async function picture(file) {
  await page.evaluate(() => company.drawHostFrame());
  await page.screenshot({path:path.join(out,file)});
  return file;
}

async function witness(room, observed, tag) {
  await choose(room.roles.camera);
  await overview();
  const roomView = await picture(`${room.alias}-${tag}-room.png`);
  const lensView = await lens(room,observed);
  const seats = await seatPixels(room);
  assert(seats.every(({count,box,canvas}) => count > 1200 && box[0]>4 && box[2]<canvas[0]-4),JSON.stringify(seats));
  const [a,b] = seats.slice().sort((first,second) => first.box[0]-second.box[0]);
  assert(a.box[2]+5 < b.box[0], 'Two actual chairs must remain distinct in the lens frame');
  const optical = await picture(`${room.alias}-${tag}-actual-lens.png`);
  await overview();
  return {overview:roomView,optical,lensView,seats};
}

async function swapChair(room, replacement) {
  await choose(room.roles.hostChair);
  const target = page.locator('#edit-look');
  const list = await target.locator('option').evaluateAll(options => options.map(option => option.value));
  const document = await current();
  const item = find(document,room.roles.hostChair), guest = find(document,room.roles.guestChair);
  const original = item.resource;
  const selected = replacement ? key(replacement) : chairPreferences.find(value => list.includes(value) && value !== key(original) && value !== key(guest.resource));
  assert(selected && list.includes(selected),'Missing a compatible third single-seat resource in the normal UI');
  const [id,version] = selected.split('@');
  const updated = {id,version:Number(version)};
  document.revision++;
  item.resource = updated;
  await target.selectOption(selected);
  await ready();
  assert.deepEqual(await current(),document,'Chair swap should only change the host appearance and edit revision');
  return {original,replacement:updated,document};
}

function preservedPoints(before, after, change) {
  const expected = before.chairs.map(({point}) => {
    const record = structuredClone(point);
    record.revision = change.document.revision;
    if (record.facilityId === before.chairs[0].id) record.resource = change.replacement;
    return record;
  });
  assert.deepEqual(after.chairs.map(({point}) => point),expected);
  assert.deepEqual(after.microphones,before.microphones);
  assert.deepEqual(after.optics,before.optics);
  assert.notEqual(after.chairs[0].asset.sha256,before.chairs[0].asset.sha256);
  assert.equal(after.chairs[1].asset.sha256,before.chairs[1].asset.sha256);
}

async function publicArea(room, capture = false) {
  const areas = room.areas;
  const area = areas.find(node => node.publicRole === 'lobby') || areas.find(node => node.publicRole === 'living') || areas[0];
  await enter(room,area.id);
  assert(await page.locator('.view-toolbar [data-view="camera"]').isHidden(),'Public area without a camera should hide this view mode');
  const snapshot = await page.evaluate(({id,areaIds}) => {
    const {document,scene} = company.session, root = scene.root.getObjectByName(id);
    if (!root) throw new Error('Missing rendered public area ' + id);
    const display = [];
    root.traverseVisible(mesh => { if (mesh.isMesh) display.push(mesh.name); });
    return {region:scene.view.roomId,areaNodes:document.nodes.filter(node => areaIds.includes(node.id) || areaIds.includes(node.parentId)),display:display.sort()};
  },{id:area.id,areaIds:areas.map(node => node.id)});
  assert.equal(snapshot.region,area.id);
  assert(snapshot.display.length,'Public area needs actual frame geometry');
  const frame = capture ? await picture(`${room.alias}-public-area.png`) : undefined;
  await enter(room);
  return {snapshot,frame,cameraViewHidden:true};
}

async function verify(rooms) {
  const [first,other] = rooms;
  const profile = await fs.mkdtemp(path.join(out,'profile-'));
  stage = 'real companion room and public baseline';
  await open(profile);
  await visit(other);
  const companion = await geometry(other,true);
  const companionViews = await witness(other,companion,'original');
  const shared = await publicArea(other,true);
  stage = 'standalone room and interactive one-chair replacement';
  await visit(first);
  const before = await geometry(first,true);
  const origin = await witness(first,before,'original');
  const change = await swapChair(first);
  const after = await geometry(first,true);
  preservedPoints(before,after,change);
  const edited = await witness(first,after,'edited');
  stage = 'save and cold restart without the delivery query';
  await page.locator('#save').click();
  await ready();
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'),'false');
  const saved = await savedText(first.document.id), envelope = JSON.parse(saved);
  assert.deepEqual(envelope.document,change.document);
  assert(envelope.dependencies.resources.some(ref => key(ref) === key(change.replacement)));
  await close();
  await open(profile);
  await visit(first,false);
  assert.equal(await savedText(first.document.id),saved);
  assert.deepEqual(await current(),change.document);
  const restored = await geometry(first,true);
  assert.deepEqual(restored,after);
  const coldViews = await witness(first,restored,'cold-open');
  report.rooms.push({alias:first.alias,roomId:first.room,roles:first.roles,fixtureSha256:sha(first.bytes),before,after,
    originalViews:origin,editedViews:edited,coldViews,replacement:{from:change.original,to:change.replacement,savedSha256:sha(saved)}});
  stage = 'verify that the companion room and public area stayed intact';
  await visit(other);
  assert.deepEqual(await geometry(other,true),companion);
  assert.deepEqual((await publicArea(other)).snapshot,shared.snapshot);
  assert.deepEqual(await current(),other.document);
  assert.equal(await savedText(first.document.id),saved);
  report.rooms.push({alias:other.alias,roomId:other.room,roles:other.roles,fixtureSha256:sha(other.bytes),
    original:companion,views:companionViews,unchanged:true,publicArea:shared});
  await close();
  return {replacement:change.replacement,companion};
}

async function record(rooms, evidence) {
  const [first,other] = rooms;
  const profile = await fs.mkdtemp(path.join(out,'recording-profile-'));
  stage = 'normal speed recording';
  await open(profile,true);
  await visit(first);
  await choose(first.roles.camera);
  const original = await geometry(first);
  await overview();
  await page.waitForTimeout(1500);
  await lens(first,original);
  await page.waitForTimeout(1500);
  await overview();
  await swapChair(first,evidence.replacement);
  await page.waitForTimeout(1500);
  await visit(other);
  await choose(other.roles.camera);
  await overview();
  await page.waitForTimeout(1500);
  await lens(other,evidence.companion);
  await page.waitForTimeout(2000);
  const raw = await page.video().path();
  await close();
  const file = 'video/interview-rooms-normal.webm';
  await fs.rename(raw,path.join(out,file));
  report.video = {file,playbackSpeed:1,bytes:(await fs.stat(path.join(out,file))).size};
  assert(report.video.bytes > 0);
}

async function run() {
  await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.mkdir(out);
  created = true;
  stage = 'inspect original package room manifests';
  if (!batch) {
    const bytes = await fs.readFile(path.join(root,'transfer-manifest.json'));
    manifest = JSON.parse(bytes);
    assert.equal(manifest.schema,'company-transfer');
    assert.equal(manifest.buildId,build);
    const lock = JSON.parse(await read('source/prototype/package-lock.json'));
    assert.equal(require('../../prototype/node_modules/three/package.json').version,lock.packages['node_modules/three'].version);
    report.manifestSha256 = sha(bytes);
  }
  threeSource = await fs.readFile(path.join(__dirname,'../../prototype/node_modules/three/build/three.core.js'),'utf8');
  const inputs = await fixtures();
  base = await serve();
  report.sourceDigest = manifest?.sourceDigest ?? devServer.info.sourceDigest;
  const evidence = await verify(inputs);
  if (flags.includes('--record')) await record(inputs,evidence);
  assert.deepEqual(report.browserErrors,[]);
  report.status = 'passed';
}

run().catch(async error => {
  report.status = 'failed';
  report.failure = {stage,message:error.message,stack:error.stack};
  if (page) {
    report.failure.statusText = await page.locator('#status').textContent({timeout:2000}).catch(() => undefined);
    await page.screenshot({path:path.join(out,'failure.png'),timeout:5000}).catch(() => {});
  }
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  try { await close(); }
  finally {
    await devServer?.close();
    if (packageServer && packageServer.exitCode === null && packageServer.signalCode === null) {
      const stopped = once(packageServer,'exit');
      packageServer.kill();
      await stopped;
    }
    if (created) await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({status:report.status,build,output:out,video:report.video?.file}));
  }
});
