const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {createHash} = require('node:crypto');
const {once} = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createInterface} = require('node:readline');
const {chromium} = require('../../prototype/node_modules/playwright');

const [deliveryArg,build,outArg,...flags] = process.argv.slice(2);
if (!deliveryArg || !/^[a-f0-9]{12}$/.test(build) || !outArg || flags.length > 1 || flags.some(f=>f!=='--record'))
  throw Error('Usage: node qa-published-room-looks.cjs DERIVED_DELIVERY BUILD OUTPUT [--record]');
const delivery = path.resolve(deliveryArg), out = path.resolve(outArg), record = flags.includes('--record');
const room = 'reader-studio/ground/live', lamp = room+'/station-left/reading-light', screen = room+'/screen';
const inventory = [{instance:lamp,id:'desk-lamp-a-frame',version:1},{instance:screen,id:'screen-partition-acoustic-narrow-tiles',version:2}];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = p => fs.readFile(path.join(delivery,p));
const viewport = {width:1600,height:1000};
const report = {status:'running',build,company:'reader-studio',loads:[],errors:[],frames:[]};
let server,profile,context,page,responses;

async function open(url,recording) {
  context = await chromium.launchPersistentContext(profile,{headless:true,viewport,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
    ...(recording?{recordVideo:{dir:out,size:viewport}}:{})});
  page = context.pages()[0] || await context.newPage();
  responses = new Map();
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  page.on('response',r=>responses.set(new URL(r.url()).pathname,r));
  await page.goto(url);
  await page.waitForFunction(() => window.company?.session.document.id==='reader-studio' && company.buildInfo &&
    !document.querySelector('#mode-room').disabled && document.querySelector('#status').dataset.error==='false');
  assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);
  if (await page.evaluate(()=>company.session.scene.view.mode!=='room')) await page.selectOption('#room',room);
  await page.click('#tool-selection');
  await page.selectOption('#edit-instance',lamp);
}

async function close() {
  if (!context) return;
  const browser = context.browser();
  await context.close(); assert(!browser.isConnected(),'Chromium process still connected');
  context = null;
}

async function inspect(on,manifest,stage) {
  const observed = await page.evaluate(({room,lamp,screen})=>{
    const {session,camera,renderer} = company, scene=session.scene;
    const region = scene.root.getObjectByName(room);
    const world = coords => region.localToWorld(camera.position.clone().fromArray(coords));
    camera.position.copy(world([-2.95,2.35,3.65])); camera.lookAt(world([-.42,.96,-.48])); camera.updateMatrixWorld();
    scene.setWallView({mode:'cutaway',cameraPosition:camera.position.toArray()});
    company.drawHostFrame();
    const canvas = document.createElement('canvas');
    canvas.width=renderer.domElement.width; canvas.height=renderer.domElement.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    function pixels() {
      company.drawHostFrame(); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(renderer.domElement,0,0);
      return ctx.getImageData(0,0,canvas.width,canvas.height).data;
    }
    const baseline=pixels();
    return [lamp,screen].map(id=>{
      const node=session.document.nodes.find(n=>n.id===id);
      const resource=company.catalog.resources.find(r=>r.id===node.resource.id && r.version===node.resource.version);
      const object=scene.root.getObjectByName(id), meshes=[];
      // Traverse from the scene root so hidden ancestors and editor proxies never count.
      scene.root.traverseVisible(m=>{if(m.isMesh && object.children[0].getObjectById(m.id))meshes.push(m);});
      const materials=new Map();
      for(const mesh of meshes)for(const m of [mesh.material].flat())if(m.emissive && !materials.has(m))
        materials.set(m,[m.emissive.clone(),m.emissiveIntensity]);
      let changedPixels=0;
      try {
        for(const m of materials.keys()){m.emissive.setRGB(1,0,1); m.emissiveIntensity=4;}
        const marked=pixels();
        for(let i=0;i<marked.length;i+=4)if(Math.abs(marked[i]-baseline[i])+Math.abs(marked[i+1]-baseline[i+1])+Math.abs(marked[i+2]-baseline[i+2])>24)changedPixels++;
      } finally {for(const [m,[color,value]] of materials){m.emissive.copy(color);m.emissiveIntensity=value;} company.drawHostFrame();}
      const obstacle=scene.navigation().obstacles.find(o=>o.instanceId===id);
      const diffuser=resource.light && object.getObjectByName(resource.light.aim.emitter);
      return {instance:id,ref:node.resource,asset:resource.asset,state:node.state,
        meshes:meshes.map(m=>m.userData.name||m.name),changedPixels,
        ...(diffuser?{emission:[diffuser.material].flat()[0].emissiveIntensity}:{}),
        ...(obstacle?{blocking:obstacle.object===object&&obstacle.footprint?.blocking,halfSize:obstacle.footprint?.halfSize}:{}),
      };
    });
  },{room,lamp,screen});
  for(const [i,o] of observed.entries()) {
    const {instance,id,version}=inventory[i];
    assert.equal(o.instance,instance); assert.deepEqual(o.ref,{id,version});
    assert(o.changedPixels>15,'Expected visible pixels from actual model '+id);
    const response=responses.get(o.asset.url), filename='viewer'+o.asset.url;
    assert.equal(response?.status(),200,'Expected a browser request for '+o.asset.url);
    const bytes=await response.body(), packaged=await read(filename), pin=manifest.files.find(p=>p.path===filename);
    assert(pin && pin.sha256===o.asset.sha256); assert.equal(bytes.length,o.asset.bytes);
    assert.equal(sha(bytes),pin.sha256); assert(bytes.equals(packaged));
  }
  const [light,panel]=observed;
  assert(light.meshes.includes('lamp-trestle-left') && light.meshes.includes('lamp-trestle-right'));
  assert.equal(light.state.on,on); assert.equal(light.emission>0,on);
  assert.equal(panel.meshes.filter(n=>/^acoustic-tile-\d+-\d+$/.test(n)).length,15);
  assert.equal(panel.blocking,true); assert.deepEqual(panel.halfSize,[.9,.04]);
  assert.equal(await page.evaluate(()=>company.renderStatus().lastRenderError),null);
  const image=stage+'.png'; await page.screenshot({path:path.join(out,image)});
  report.frames.push(image);report.loads.push({stage,objects:observed});
}

(async()=>{
  await fs.mkdir(out,{recursive:true}); profile=await fs.mkdtemp(path.join(out,'chromium-'));
  const manifest=JSON.parse(await read('transfer-manifest.json')); assert.equal(manifest.buildId,build);
  const bytes=await read('data/save.json'), envelope=JSON.parse(bytes);
  assert.equal(envelope.document.id,'reader-studio'); assert.equal(sha(bytes),manifest.files.find(p=>p.path==='data/save.json').sha256);
  server=spawn(process.execPath,['serve.mjs','0'],{cwd:delivery,stdio:['ignore','pipe','inherit'],windowsHide:true});
  const lines=createInterface({input:server.stdout});
  const connecting=once(lines,'line').then(([line])=>line);
  const terminated=once(server,'exit').then(([code])=>{throw Error('Package server exited before startup: '+code);});
  const url=new URL(await Promise.race([connecting,terminated])); lines.close();
  assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.search,'?delivery=1');
  await open(url.href,record);
  assert((await responses.get('/delivery-save.json').body()).equals(bytes));
  assert.deepEqual(await page.evaluate(()=>company.session.document),envelope.document);
  await inspect(true,manifest,'01-delivered-room');
  const video=page.video();
  await page.click('#edit-states button');
  await page.waitForFunction(id=>company.session.document.nodes.find(n=>n.id===id)?.state.on===false,lamp);
  await page.click('#save');
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false' &&
    localStorage.getItem('company-preview:last-company')==='reader-studio');
  const saved=await page.evaluate(()=>company.session.readSavedText('reader-studio'));
  const expected=structuredClone(envelope.document);expected.revision++;expected.nodes.find(n=>n.id===lamp).state.on=false;
  assert.deepEqual(JSON.parse(saved).document,expected);
  assert.deepEqual(JSON.parse(saved).dependencies,envelope.dependencies);
  await close();
  if(video) {const file='published-room-normal.webm';await fs.rename(await video.path(),path.join(out,file));report.video={file,playbackSpeed:1};}
  url.search=''; await open(url.href,false);
  assert.equal(new URL(page.url()).search,''); assert(!responses.has('/delivery-save.json'));
  assert.deepEqual(await page.evaluate(()=>company.session.document),expected);
  assert.equal(await page.evaluate(()=>company.session.readSavedText('reader-studio')),saved);
  await inspect(false,manifest,'02-restored-room');
  report.savedSha256=sha(saved); report.initialSha256=sha(bytes); report.freshBrowserProcesses=2;
  assert.deepEqual(report.errors,[]); report.status='passed';
})().catch(error=>{report.status='failed'; report.failure=error.stack; console.error(error);process.exitCode=1;}).finally(async()=>{
  try {await close();} finally {
    if(server && server.exitCode===null && !server.killed){const stopped=once(server,'exit');server.kill();await stopped;}
    if(profile && path.dirname(profile)===out && path.basename(profile).startsWith('chromium-')) await fs.rm(profile,{recursive:true,force:true,maxRetries:4});
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({status:report.status,build,frames:report.frames}));
  }
});
