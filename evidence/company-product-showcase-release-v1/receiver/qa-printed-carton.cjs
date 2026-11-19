const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {createHash} = require('node:crypto');
const {once} = require('node:events');
const fs = require('node:fs/promises');
const {createRequire} = require('node:module');
const path = require('node:path');
const {createInterface} = require('node:readline');

const [packageArg,build,originalArg,prototypeArg,outArg,...extra] = process.argv.slice(2);
if (!packageArg || !/^[a-f0-9]{12}$/.test(build) || !originalArg || !prototypeArg || !outArg || extra.length)
  throw new Error('Usage: node qa-printed-carton.cjs PACKAGE BUILD ORIGINAL_PACKAGE PROTOTYPE_WITH_DEPENDENCIES NEW_OUT');
const delivery = path.resolve(packageArg), original = path.resolve(originalArg), out = path.resolve(outArg);
const resolveTool = createRequire(path.join(path.resolve(prototypeArg),'package.json'));
const {chromium} = resolveTool('playwright');
const {PNG} = resolveTool('pngjs');
const threeUrl = '/__printed-carton-qa/three.core.js';
const printed = {id:'showcase-product-printed-carton',version:1}, regular = {id:'showcase-product-can',version:1};
const key = ({id,version}) => `${id}@${version}`;
const sha = value => createHash('sha256').update(value).digest('hex');
const find = (document,id) => document.nodes.find(item => item.id === id);
const report = {status:'running',build,errors:[],rooms:[]};
let manifest, mother, source, context, server, base, page, responses, stage;

async function pinned(root, index, file) {
  const bytes = await fs.readFile(path.join(root,file));
  const pin = index.files.find(entry => entry.path === file);
  assert.equal(bytes.length,pin?.bytes,file);
  assert.equal(sha(bytes),pin.sha256,file);
  return bytes;
}

async function start() {
  server = spawn(process.execPath,['serve.mjs','0'],{cwd:delivery,windowsHide:true,stdio:['ignore','pipe','inherit']});
  const lines = createInterface({input:server.stdout});
  try {
    const [line] = await Promise.race([
      once(lines,'line',{signal:AbortSignal.timeout(20000)}),
      once(server,'exit').then(([code]) => { throw new Error('Package server stopped before startup: ' + code); }),
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
  await context.route('**' + threeUrl,route => route.fulfill({contentType:'text/javascript',body:source}));
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
const saved = id => page.evaluate(id => company.session.readSavedText(id),id);

async function visit(fixture, initial = true) {
  const url = new URL(base);
  if (initial) url.searchParams.set('delivery',fixture.id);
  await page.goto(url.href);
  await ready();
  const identity = await page.evaluate(() => company.buildInfo);
  assert.equal(identity.shortId,build);
  assert.equal(identity.sourceDigest,manifest.sourceDigest);
  if (initial) {
    const response = responses.get('/delivery-room/' + fixture.id + '.json');
    assert.equal(response?.status(),200);
    assert(fixture.bytes.equals(await response.body()));
    assert.deepEqual(await current(),fixture.document);
  } else {
    assert.equal(await page.locator('#status').textContent(),'已恢复上次保存的方案。');
    assert(![...responses.keys()].some(file => file === '/delivery-save.json' || file.startsWith('/delivery-room/')));
  }
  const view = await page.evaluate(() => company.session.scene.view);
  if (view.floorId !== fixture.floor) await page.locator('#floor').selectOption(fixture.floor);
  if (view.mode !== 'room' || view.roomId !== fixture.room) await page.locator('#room').selectOption(fixture.room);
  await page.waitForFunction(id => company.session.scene.view.roomId === id,fixture.room);
  await page.locator('.view-toolbar [data-view="room"]').click();
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(fixture.featured);
}

async function fixture(id) {
  const file = `data/rooms/${id}/save.json`;
  const bytes = await pinned(delivery,manifest,file);
  const baseline = await pinned(original,mother,file);
  const {document} = JSON.parse(bytes);
  const {document:expected} = JSON.parse(baseline);
  const {roomId:room,members} = document.productShowcases[0];
  const {featured,counter} = members;
  if (id === 'showcase-rental') {
    expected.revision++;
    find(expected,featured).resource = printed;
    assert.deepEqual(document,expected,'The receiver changes only the rental display look and its edit revision');
  } else {
    for (const name of ['layout.json','save.json','batch-result/input.json','batch-result/layout.json','batch-result/save.json','batch-result/report.json']) {
      const file = `data/rooms/${id}/${name}`;
      assert((await pinned(delivery,manifest,file)).equals(await pinned(original,mother,file)),file);
    }
  }
  return {id,room,floor:find(document,room).parentId,bytes,document,featured,counter,baselineSha256:sha(baseline)};
}

async function resource(room) {
  const actual = await page.evaluate(featured => {
    const {document,scene} = company.session;
    const item = document.nodes.find(node => node.id === featured);
    const spec = company.catalog.resources.find(r => r.id === item.resource.id && r.version === item.resource.version);
    const actor = scene.root.getObjectByName(featured);
    return {item,spec,actualParent:actor.parent.name,position:actor.position.toArray()};
  },room.featured);
  assert.equal(actual.actualParent,room.counter);
  assert.equal(actual.item.attachment.surfaceId,'top');
  assert.deepEqual(actual.position,actual.item.transform.position);
  const model = await pinned(delivery,manifest,'viewer' + actual.spec.asset.url);
  const response = responses.get(actual.spec.asset.url);
  assert.equal(response?.status(),200);
  assert.equal(sha(model),actual.spec.asset.sha256);
  assert(model.equals(await response.body()));
  return {...actual,model};
}

async function choose(room,look) {
  const expected = await current();
  assert.notDeepEqual(find(expected,room.featured).resource,look);
  expected.revision++;
  find(expected,room.featured).resource = look;
  await page.locator('#edit-look').selectOption(key(look));
  await ready();
  assert.deepEqual(await current(),expected);
}

async function paint(room, closeUp) {
  await page.evaluate(({id,closeUp}) => {
    const {camera,session:{scene}} = company, root = scene.root.getObjectByName(id);
    const [position,focus] = closeUp ? [[.006,.145,.56],[0,.110,.041]] : [[2.10,2.75,4.45],[-.45,1.08,.14]];
    const world = point => root.localToWorld(camera.position.clone().fromArray(point));
    camera.position.copy(world(position));
    camera.lookAt(world(focus));
    camera.updateMatrixWorld(true);
    scene.setWallView({mode:'cutaway',cameraPosition:camera.position.toArray()});
    company.drawHostFrame();
  },{id:closeUp ? room.featured : room.counter,closeUp});
}

async function picture(room,file,closeUp) {
  await paint(room,closeUp);
  await page.screenshot({path:path.join(out,file)});
  return file;
}

async function labelProof(room,actual) {
  const {model,spec} = actual;
  const jsonLength = model.readUInt32LE(12);
  const gltf = JSON.parse(model.subarray(20,20+jsonLength).toString('utf8'));
  const declaration = spec.provenance.dependencies['sourceTexture-0'];
  const originalPng = await pinned(delivery,manifest,'source/' + declaration.path);
  assert.equal(sha(originalPng),declaration.sha256);
  const image = gltf.images[0], view = gltf.bufferViews[image.bufferView];
  const start = 28 + jsonLength + (view.byteOffset ?? 0);
  assert(model.subarray(start,start+view.byteLength).equals(originalPng));
  const png = PNG.sync.read(originalPng,{checkCRC:true});
  assert.deepEqual([png.width,png.height],[128,192]);
  await paint(room,true);
  const stages = await page.evaluate(async ({featured,threeUrl}) => {
    const {Vector3,Raycaster} = await import(threeUrl);
    const {camera,renderer,session:{scene}} = company;
    const actor = scene.root.getObjectByName(featured), print = actor.getObjectByName('carton-print');
    if (!print?.isMesh || !print.material.map || print.material.map.colorSpace !== 'srgb') throw new Error('Missing actual printed-front mesh and color map');
    scene.root.updateMatrixWorld(true);
    const world = point => actor.localToWorld(new Vector3(...point));
    const forward = new Vector3(0,0,-1).transformDirection(actor.matrixWorld);
    const rays = [[18,36],[64,45],[15,145],[10,164]].map(([column,row]) => {
      const u = (column+.5)/128, v = (row+.5)/192;
      const ray = new Raycaster(world([-.056+u*.112,.168-v*.160,.14]),forward,0,.20);
      const hit = ray.intersectObject(actor,true)[0];
      if (hit?.object !== print || Math.abs(hit.uv.x-u) > 1e-6 || Math.abs(hit.uv.y-v) > 1e-6) throw new Error('Front ray misses the real printed surface');
      return {mesh:hit.object.name,triangle:hit.faceIndex,uv:hit.uv.toArray()};
    });
    const mapped = print.material.map.image;
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = mapped.width; textureCanvas.height = mapped.height;
    const textureContext = textureCanvas.getContext('2d');
    textureContext.drawImage(mapped,0,0);
    const decoded = textureContext.getImageData(0,0,mapped.width,mapped.height).data;
    const decodedSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',decoded))).map(v => v.toString(16).padStart(2,'0')).join('');
    const canvas = document.createElement('canvas');
    canvas.width = renderer.domElement.width; canvas.height = renderer.domElement.height;
    const ctx = canvas.getContext('2d',{willReadFrequently:true});
    const capture = () => {
      company.drawHostFrame();
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(renderer.domElement,0,0);
      return ctx.getImageData(0,0,canvas.width,canvas.height).data;
    };
    const rendered = capture(), material = print.material, substitute = material.clone();
    substitute.map = null;
    let naked;
    try { print.material = substitute; naked = capture(); }
    finally { print.material = material; substitute.dispose(); company.drawHostFrame(); }
    const bands = [['SUNFIELD',16,30],['OAT',113,148],['COCOA',167,188]].map(([word,first,last]) => {
      const screen = (u,row) => {
        const point = world([-.056+u*.112,.168-row/192*.16,.044]).project(camera);
        return [(point.x*.5+.5)*canvas.width,(.5-point.y*.5)*canvas.height];
      };
      const [left,top] = screen(.15,first), [right,bottom] = screen(.85,last);
      let different = 0, total = 0;
      for (let y=Math.ceil(top); y<bottom; y++) for (let x=Math.ceil(left); x<right; x++) {
        const i=(y*canvas.width+x)*4;
        const delta = Math.abs(rendered[i]-naked[i]) + Math.abs(rendered[i+1]-naked[i+1]) + Math.abs(rendered[i+2]-naked[i+2]);
        if (delta > 40) different++;
        total++;
      }
      return {word,different,total};
    });
    return {rays,decodedSha256,bands};
  },{featured:room.featured,threeUrl});
  assert.equal(stages.decodedSha256,sha(png.data));
  assert(stages.bands.every(band => band.total > 300 && band.different > 100 && band.different/band.total > .20),JSON.stringify(stages.bands));
  return {modelSha256:spec.asset.sha256,textureSha256:declaration.sha256,dimensions:[png.width,png.height],...stages};
}

async function run() {
  stage = 'sealed package identities';
  const [bytes,old] = await Promise.all([delivery,original].map(root => fs.readFile(path.join(root,'transfer-manifest.json'))));
  manifest = JSON.parse(bytes); mother = JSON.parse(old);
  assert.equal(manifest.schema,'company-transfer');
  assert.equal(manifest.buildId,build);
  report.manifestSha256 = sha(bytes);
  report.sourceDigest = manifest.sourceDigest;
  report.originalManifestSha256 = sha(old);
  const lock = JSON.parse(await pinned(delivery,manifest,'source/prototype/package-lock.json'));
  const threeDirectory = path.dirname(resolveTool.resolve('three'));
  const installed = JSON.parse(await fs.readFile(path.join(threeDirectory,'../package.json'),'utf8'));
  assert.equal(installed.version,lock.packages['node_modules/three'].version);
  source = await fs.readFile(path.join(threeDirectory,'three.core.js'),'utf8');
  const [rental,studio] = await Promise.all(['showcase-rental','showcase-studio'].map(fixture));
  base = await start();
  const profile = await fs.mkdtemp(path.join(out,'rental-profile-'));
  stage = 'rental initial print and UI appearance changes';
  await open(profile);
  await visit(rental);
  const startLook = await resource(rental);
  assert.deepEqual(startLook.item.resource,printed);
  const proof = await labelProof(rental,startLook);
  const originalFront = await picture(rental,'showcase-rental-printed-front.png',true);
  await choose(rental,regular);
  const alternative = await resource(rental);
  assert.deepEqual(alternative.item.resource,regular);
  await choose(rental,printed);
  const document = await current();
  await page.locator('#save').click();
  await ready();
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'),'false');
  const text = await saved(rental.id);
  assert.deepEqual(JSON.parse(text).document,document);
  stage = 'rental cold reopen without query';
  await close();
  await open(profile);
  await visit(rental,false);
  assert.deepEqual(await current(),document);
  assert.equal(await saved(rental.id),text);
  const restoredProof = await labelProof(rental,await resource(rental));
  for (const key of ['modelSha256','textureSha256','decodedSha256','dimensions','rays']) assert.deepEqual(restoredProof[key],proof[key]);
  const restoredFront = await picture(rental,'showcase-rental-printed-front-restored.png',true);
  const restoredRoom = await picture(rental,'showcase-rental-room-restored.png',false);
  report.rooms.push({id:rental.id,featured:rental.featured,fixtureSha256:sha(rental.bytes),baselineSha256:rental.baselineSha256,
    proof,restoredProof,swap:[key(printed),key(regular),key(printed)],coldSaveSha256:sha(text),originalFront,restoredFront,restoredRoom});
  await close();
  stage = 'unchanged studio entry';
  const studioProfile = await fs.mkdtemp(path.join(out,'studio-profile-'));
  await open(studioProfile);
  await visit(studio);
  const stable = await resource(studio);
  assert.equal(stable.item.resource.id,'showcase-product-carton');
  const studioRoom = await picture(studio,'showcase-studio-unchanged-room.png',false);
  report.rooms.push({id:studio.id,featured:studio.featured,fixtureSha256:sha(studio.bytes),baselineSha256:studio.baselineSha256,
    modelSha256:stable.spec.asset.sha256,byteIdentical:['layout.json','save.json','batch-result/input.json','batch-result/layout.json','batch-result/save.json','batch-result/report.json'],studioRoom});
  assert.deepEqual(report.errors,[]);
  report.status = 'passed';
}

(async () => {
  await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.mkdir(out);
  try { await run(); }
  catch (error) {
    report.status = 'failed';
    report.failure = {stage,message:error.message,stack:error.stack};
    if (page) await page.screenshot({path:path.join(out,'failure.png'),timeout:5000}).catch(() => {});
    process.exitCode = 1;
  } finally {
    try { await close(); }
    finally {
      if (server && server.exitCode === null && server.signalCode === null) {
        const stopped = once(server,'exit');
        server.kill();
        await stopped;
      }
      await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2) + '\n');
      console.log(JSON.stringify({status:report.status,build,output:out,failure:report.failure}));
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
