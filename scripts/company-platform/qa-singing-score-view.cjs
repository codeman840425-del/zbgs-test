/* A historical rejected-on-republication layout is replayed in the ordinary viewer.
   Independent of the production singing-room checker and its sampled points. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { createHash } = require('node:crypto');
const { chromium } = require('../../prototype/node_modules/playwright');
const { PNG } = require('../../prototype/node_modules/pngjs');

const [packageArg, build, badArg, outputArg, flag] = process.argv.slice(2);
if (!outputArg || (flag && flag !== '--record')) {
  throw Error('Usage: qa-singing-score-view.cjs PACKAGE BUILD BLOCKED_SAVE NEW_OUTPUT [--record]');
}
const bundle = path.resolve(packageArg), blockedFile = path.resolve(badArg), out = path.resolve(outputArg);
const sha = value => createHash('sha256').update(value).digest('hex');
const threeRoute = '/__score-view-qa/three.core.js';
const report = {build, observations:{}, browserErrors:[]};
let ownsOutput = false;
let browser, page, server, responses, base, stage = 'inputs';

async function open(profile, record) {
  browser = await chromium.launchPersistentContext(path.join(out,profile), {
    headless:true, viewport:{width:1600,height:900},
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
    ...(record ? {recordVideo:{dir:path.join(out,'video'),size:{width:1600,height:900}}} : {})
  });
  await browser.route('**' + threeRoute, route => route.fulfill({
    contentType:'text/javascript',path:path.resolve(__dirname,'../../prototype/node_modules/three/build/three.core.js')
  }));
  page = browser.pages()[0] || await browser.newPage();
  page.setDefaultTimeout(30000);
  responses = new Map();
  page.on('response', r => responses.set(new URL(r.url()).pathname,r));
  page.on('pageerror', e => report.browserErrors.push({stage,message:e.message}));
}
async function close(videoName) {
  if (!browser) return;
  const video = page?.video();
  await browser.close(); browser = null;
  if (video && videoName) await fs.rename(await video.path(),path.join(out,'video',videoName));
}
async function enter(d) {
  const room = d.singingRooms[0].regionId;
  await page.waitForFunction(id => window.company?.editor && company.buildInfo && company.session.document.id === id
    && !document.querySelector('#mode-room').disabled, d.id);
  assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);
  if (await page.evaluate(()=>company.session.scene.view.roomId) !== room) await page.locator('#room').selectOption(room);
  await page.waitForFunction(id=>company.session.scene.view.roomId === id,room);
  await page.locator('.view-toolbar [data-view="room"]').click();
  assert.deepEqual(await page.evaluate(()=>company.session.document),d);
}
async function visit(key, d) {
  await page.goto(base + (key ? '?delivery=' + encodeURIComponent(key) : ''));
  await enter(d);
}
async function measure({rule, threeRoute, blocker}) {
  const T = await import(threeRoute);
  const {session:{scene},camera} = company;
  company.setPreviewClock(32400);
  scene.root.updateMatrixWorld(true);
  const room = scene.root.getObjectByName(rule.regionId), stand = scene.root.getObjectByName(rule.roles.score);
  const resourceId = company.session.document.nodes.find(n=>n.id===stand.name).resource;
  const resources = company.catalog.resources;
  const resource = resources.find(r=>r.id===resourceId.id && r.version===resourceId.version);
  const pageMesh = stand.getObjectByName(resource.musicStand.pageNode);
  const g = pageMesh.geometry, mat = pageMesh.material, texture = mat.map;
  if (!g.attributes.uv || !texture?.isTexture || !pageMesh.isMesh) throw Error('Untextured score pages');
  const img = texture.source.data, atlas = document.createElement('canvas');
  atlas.width = img.width; atlas.height = img.height;
  const ctx = atlas.getContext('2d'); ctx.drawImage(img,0,0);
  const texel = [...ctx.getImageData(392,113,1,1).data];
  const p = rule.performer;
  const eye = room.localToWorld(new T.Vector3(...p.eye).applyAxisAngle(new T.Vector3(0,1,0),p.yaw)
    .add(new T.Vector3(p.position[0],0,p.position[1])));
  const local = point => room.worldToLocal(point.clone()).toArray();
  const bounds = new T.Box3(), attr = g.attributes.position;
  const vertex = i => pageMesh.localToWorld(new T.Vector3().fromBufferAttribute(attr,i));
  for (let i=0;i<attr.count;i++) bounds.expandByPoint(stand.worldToLocal(vertex(i)));
  const facilities = new Set(company.session.document.nodes.filter(n=>n.kind==='facility').map(n=>n.id));
  const meshes = [];
  scene.root.traverseVisible(n=>{if(n.isMesh && n.material?.visible!==false) meshes.push(n);});
  const owner = n => { for(;n;n=n.parent) if(facilities.has(n.name)) return n.name; return null; };
  const ray = new T.Raycaster(), normal = new T.Vector3(0,0,-1).transformDirection(stand.matrixWorld);
  function first(target) {
    const distance = eye.distanceTo(target);
    ray.set(eye,target.clone().sub(eye).normalize()); ray.near=.00001; ray.far=distance+.001;
    const hit = ray.intersectObjects(meshes,false)[0];
    return {visible:hit?.object===pageMesh && hit.point.distanceTo(target)<.004,
      owner:hit ? owner(hit.object) : null, mesh:hit?.object.name, hit:hit ? local(hit.point) : null};
  }
  function sample(u,v) {
    const source = stand.localToWorld(new T.Vector3(
      T.MathUtils.lerp(bounds.min.x,bounds.max.x,u),T.MathUtils.lerp(bounds.min.y,bounds.max.y,v),bounds.max.z+.2));
    ray.set(source,normal); ray.near=0; ray.far=Infinity;
    const h = ray.intersectObject(pageMesh,false)[0];
    if (!h) throw Error('No real score surface at '+[u,v]);
    return {target:local(h.point),...first(h.point)};
  }
  const coverage = {};
  for (const [side,start] of [['left',0],['right',.5]]) {
    const samples=[];
    for(let y=0;y<11;y++) for(let x=0;x<11;x++) samples.push(sample(start+.5*(x+.5)/11,(y+.5)/11));
    coverage[side]={center:sample(start+.25,.5),count:samples.length,hidden:samples.filter(s=>!s.visible).length,
      blockers:[...new Set(samples.filter(s=>!s.visible).map(s=>s.owner || s.mesh))],
      rows:Array.from({length:11},(_,y)=>samples.slice(11*y,11*y+11).map(s=>s.visible?'.':'#').join(''))};
  }
  // Project a specific original base-color texel through the asset's own UV triangles.
  const uvIndex=g.attributes.uv, witness=[], q=new T.Vector3(392.5/img.width,113.5/img.height,0);
  for(let i=0;i<(g.index?.count??attr.count);i+=3) {
    const ids=[0,1,2].map(k=>g.index?g.index.getX(i+k):i+k);
    const tri=new T.Triangle(...ids.map(j=>new T.Vector3(uvIndex.getX(j),uvIndex.getY(j),0)));
    if(tri.getArea()<1e-12) continue;
    const bc=tri.getBarycoord(q,new T.Vector3());
    if(Math.min(bc.x,bc.y,bc.z)<-1e-6) continue;
    const face=new T.Triangle(...ids.map(vertex));
    const target=face.a.clone().multiplyScalar(bc.x).addScaledVector(face.b,bc.y).addScaledVector(face.c,bc.z);
    if(face.getNormal(new T.Vector3()).dot(eye.clone().sub(target))>0) witness.push({target:local(target),...first(target)});
  }
  const centers=Object.values(coverage).map(s=>room.localToWorld(new T.Vector3(...s.center.target)));
  const aim=centers[0].lerp(centers[1],.5);
  camera.position.copy(eye); camera.up.set(0,1,0); camera.fov=32;
  camera.lookAt(aim); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  company.drawHostFrame();
  return {eye:local(eye),aim:local(aim),camera:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray(),
    coverage,witness,asset:resource.asset,node:pageMesh.name,assetId:resourceId,triangles:(g.index?.count??attr.count)/3,
    texture:{width:img.width,height:img.height,texel:[392,113],rgba:texel},blockerPresent:!!scene.root.getObjectByName(blocker),
    png:company.renderer.domElement.toDataURL('image/png')};
}
async function photograph(name,d,blocker,manifest) {
  stage=name;
  const result = await page.evaluate(measure,{rule:d.singingRooms[0],threeRoute,blocker});
  await fs.writeFile(path.join(out,name+'.png'),Buffer.from(result.png.split(',')[1],'base64'));
  delete result.png;
  await page.screenshot({path:path.join(out,name+'-context.png')});
  const response = [...responses.values()].find(r=>new URL(r.url()).pathname.endsWith('/'+result.assetId.id+'/v1/model.glb'));
  assert.equal(response?.status(),200,'Loaded real stand GLB over HTTP');
  const raw=await response.body(), glb=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)).toString());
  const prim=glb.meshes[glb.nodes.find(n=>n.name===result.node).mesh].primitives[0];
  const tex=glb.materials[prim.material].pbrMetallicRoughness.baseColorTexture;
  assert.equal(tex.texCoord??0,0); assert(Number.isInteger(prim.attributes.TEXCOORD_0));
  const image=glb.images[glb.textures[tex.index].source], view=glb.bufferViews[image.bufferView];
  const offset=28+raw.readUInt32LE(12)+(view.byteOffset??0);
  result.network={path:new URL(response.url()).pathname,sha256:sha(raw),atlasMime:image.mimeType,
    atlasSha256:sha(raw.subarray(offset,offset+view.byteLength)),atlasBytes:view.byteLength};
  assert.equal(result.network.sha256,result.asset.sha256);
  assert.equal(manifest.files.find(f=>f.path==='viewer'+result.network.path)?.sha256,result.network.sha256);
  assert.equal(image.mimeType,'image/jpeg');
  assert.deepEqual([result.texture.width,result.texture.height],[512,512]);
  assert(result.witness.length>0);
  report.observations[name]=result;
  await page.waitForTimeout(1600);
  return result;
}
async function run() {
  await fs.mkdir(out); ownsOutput = true; stage='inputs';
  const manifestBytes=await fs.readFile(path.join(bundle,'transfer-manifest.json')), manifest=JSON.parse(manifestBytes);
  assert.equal(manifest.buildId,build); report.manifest=sha(manifestBytes);
  const badBytes=await fs.readFile(blockedFile), bad=JSON.parse(badBytes).document;
  const all=[];
  for(const entry of manifest.files.filter(f=>/^data\/rooms\/[^/]+\/save\.json$/.test(f.path))) {
    const file=path.join(bundle,entry.path), bytes=await fs.readFile(file), d=JSON.parse(bytes).document;
    if(!d.singingRooms?.length) continue;
    assert.equal(sha(bytes),entry.sha256); all.push({key:entry.path.split('/')[2],file,sha256:entry.sha256,d});
  }
  const studio=all.find(r=>r.d.id===bad.id);
  const rental=all.find(r=>r.d.scale!=='single-room' && r.d.id!==bad.id);
  assert(studio && rental,'Both original singing room saves are required');
  const diff=bad.nodes.filter(n=>!studio.d.nodes.some(s=>s.id===n.id));
  assert.equal(diff.length,1); const panel=diff[0];
  assert.deepEqual(panel.resource,{id:'background-brand-panel',version:1});
  assert.deepEqual(panel.transform,{position:[1.62,0,.15],yaw:0});
  assert.deepEqual({...bad,revision:studio.d.revision,nodes:bad.nodes.filter(n=>n.id!==panel.id)},studio.d);
  report.inputs={rooms:[studio,rental].map(({key,sha256})=>({key,sha256})),archivedBlockedSave:sha(badBytes),panel};
  server=spawn(process.execPath,['serve.mjs','0'],{cwd:bundle,windowsHide:true,stdio:['ignore','pipe','inherit']});
  const line=createInterface({input:server.stdout});
  const [address]=await once(line,'line',{signal:AbortSignal.timeout(15000)}); line.close(); server.stdout.resume();
  base=new URL(address).origin+'/'; assert.equal(new URL(base).hostname,'127.0.0.1');
  await open('profile',flag==='--record');
  await visit(rental.key,rental.d);
  await page.screenshot({path:path.join(out,'rental-original.png')});
  assert.equal(sha(await responses.get('/delivery-room/'+rental.key+'.json').body()),rental.sha256);
  await visit(studio.key,studio.d);
  assert.equal(sha(await responses.get('/delivery-room/'+studio.key+'.json').body()),studio.sha256);
  const clean=await photograph('studio-original',studio.d,panel.id,manifest);
  stage='ordinary file import';
  await page.locator('#file').setInputFiles(blockedFile);
  await page.waitForFunction(id=>company.session.document.nodes.some(n=>n.id===id),panel.id);
  await enter(bad);
  const partial=await photograph('studio-obstructed',bad,panel.id,manifest);
  await page.locator('#save').click(); await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false');
  const saved=await page.evaluate(()=>company.session.readSavedText(company.session.document.id));
  assert.deepEqual(JSON.parse(saved).document,bad); report.localSave=sha(saved);
  await close('score-eye-normal.webm');
  await open('profile',false); await visit('',bad);
  assert.equal(await page.evaluate(()=>company.session.readSavedText(company.session.document.id)),saved);
  assert(![...responses.keys()].some(k=>k==='/delivery-save.json'||k.startsWith('/delivery-room/')));
  const cold=await photograph('studio-obstructed-cold',bad,panel.id,manifest);
  for(const result of [clean,partial,cold]) {
    assert.deepEqual(result.camera,clean.camera); assert.deepEqual(result.projection,clean.projection);
    assert.deepEqual(result.network,clean.network); assert.deepEqual(result.texture,clean.texture);
    assert(result.coverage.left.center.visible && result.coverage.right.center.visible);
    assert.equal(result.coverage.left.hidden,0);
    assert.equal(result.coverage.right.hidden,result===clean?0:42);
    if(result!==clean) assert.deepEqual(result.coverage.right.blockers,[panel.id]);
    assert(result.witness.some(w=>result===clean?w.visible:!w.visible&&w.owner===panel.id));
  }
  assert.deepEqual(partial,cold);
  const photos=await Promise.all(['studio-original','studio-obstructed'].map(async n=>PNG.sync.read(await fs.readFile(path.join(out,n+'.png')))));
  assert.equal(photos[0].height,photos[1].height);
  const pair=new PNG({width:photos[0].width+photos[1].width,height:photos[0].height});
  photos.forEach((p,i)=>PNG.bitblt(p,pair,0,0,p.width,p.height,i*p.width,0));
  await fs.writeFile(path.join(out,'original-and-obstructed.png'),PNG.sync.write(pair));
  for (const r of [studio,rental]) assert.equal(sha(await fs.readFile(r.file)),r.sha256);
  assert.deepEqual(report.browserErrors,[]);
  report.status='passed'; report.measurement='11 x 11 physical page hits per page; counts are samples. Camera at authored performer eye, 32 degree vertical FOV, morning clock 09:00.';
  if(flag==='--record') {const bytes=await fs.readFile(path.join(out,'video','score-eye-normal.webm'));report.video={file:'video/score-eye-normal.webm',bytes:bytes.length,sha256:sha(bytes),playbackRate:1};}
}
run().catch(e=>{report.status='failed';report.failure={stage,error:e.stack};process.exitCode=1;console.error(e);}).finally(async()=>{
  await close(); if(server && server.exitCode===null){const end=once(server,'exit');server.kill();await end;}
  if(ownsOutput && report.status) await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
});
