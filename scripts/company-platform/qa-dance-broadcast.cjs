const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {createHash} = require('node:crypto');
const {once} = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createInterface} = require('node:readline');
const {chromium} = require('../../prototype/node_modules/playwright');

const [rootArg, build, ...options] = process.argv.slice(2);
const aliases=[];
for(let i=0;i<options.length;i++) if(options[i]==='--room'){
  const alias=options[i+1];
  assert(/^[a-z0-9][a-z0-9-]*$/.test(alias||''),'Expected --room ALIAS');
  aliases.push(alias);options.splice(i,2);i--;
}
assert(aliases.length<=2 && new Set(aliases).size===aliases.length,'Supply up to two different named aliases');
const flags = options.filter(value => value.startsWith('--')), paths = options.filter(value => !value.startsWith('--'));
if (!rootArg || !/^[0-9a-f]{12}$/.test(build) || ![1,2].includes(paths.length) || flags.length > 1 || flags.some(value => value !== '--record'))
  throw new Error('Usage: node qa-dance-broadcast.cjs DIST BUILD BATCH_ROOMS NEW_OUT [--room ALIAS] [--record]\n' +
    '   or: node qa-dance-broadcast.cjs PACKAGE BUILD NEW_OUT [--room ALIAS] [--record]');
const root = path.resolve(rootArg), batch = paths.length === 2 ? path.resolve(paths[0]) : null, out = path.resolve(paths.at(-1));
const viewport = {width:1816,height:846}, threeUrl = '/__dance-shot-qa/three.core.js';
const sha = value => createHash('sha256').update(value).digest('hex');
const key = ({id,version}) => `${id}@${version}`;
const find = (document,id) => document.nodes.find(node => node.id === id);
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
    const rule=layout.trainingBinding?.trainingClearance;
    if (!rule?.shot) continue;
    const bytes=await file('save.json'), envelope=JSON.parse(bytes), document=envelope.document;
    assert.equal(envelope.schema,'company-save');assert.deepEqual(document,layout);
    const region=find(document,rule.roomId), floor=find(document,region?.parentId);
    assert.equal(region?.purpose,'training');assert.equal(floor?.kind,'floor');
    const camera=find(document,rule.shot.cameraId);
    assert.equal(camera?.kind,'facility');
    const portal=floor.connections?.find(c=>c.id===rule.entry.portalId);
    assert(portal,'Expected a real interior entry for the public-side check: '+rule.entry.portalId);
    const connected=[portal.from.regionId,portal.to.regionId];
    assert(connected.includes(region.id));
    const publicRegion=find(document,connected.find(id=>id!==region.id));
    assert.equal(publicRegion?.kind,'area');
    results.push({alias:name,bytes,document,room:region.id,floor:floor.id,rule,publicId:publicRegion.id,
      assets:envelope.dependencies.resources,camera:camera.id});
  }
  const selected=aliases.map(name=>{
    const fixture=results.find(r=>r.alias===name);
    assert(fixture,'No verified dance shot in --room '+name);return fixture;
  });
  if (selected.length<2) {
    for (const fixture of results) if (!selected.some(r=>r.document.id===fixture.document.id)) selected.push(fixture);
  }
  assert(selected.length===2 && new Set(selected.map(r=>r.document.id)).size===2,
    'Need two distinct companies carrying a dance shot; use two --room aliases in a larger dance collection');
  return selected.sort((a,b)=>Number(a.document.scale!=='rental-home')-Number(b.document.scale!=='rental-home'));
}

async function open(profile, recording = false) {
  const browserSize=recording ? report.opticalViewport : viewport;
  context = await chromium.launchPersistentContext(profile,{headless:true,viewport:browserSize,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
    ...(recording ? {recordVideo:{dir:path.join(out,'video'),size:browserSize}} : {}),
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
  if (view.mode==='building') {
    const facade=page.locator('.company-building-view__facade');
    if (await facade.isVisible()) await facade.click();
    await page.locator('.company-building-view__floor[data-floor-id='+JSON.stringify(room.floor)+']').click();
    await ready();
  } else if (view.floorId !== room.floor) await page.locator('#floor').selectOption(room.floor);
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
      await page.waitForFunction(id=>window.company?.session.document.id===id,room.document.id);
      await ready();
      if (await menu.evaluate(el => el.open)) await menu.locator('summary').click();
    } else {
      await page.waitForFunction(id=>window.company?.session.document.id===id,room.document.id);
      await ready();
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

async function picture(filename) {
  await page.evaluate(()=>company.drawHostFrame());
  await page.screenshot({path:path.join(out,filename)});
  return filename;
}

async function fitBroadcastCanvas() {
  // Layout changes synchronously on the button, then Three updates canvas styles in ResizeObserver.
  // Size from the actual container, and acknowledge both its painted canvas and the camera projection.
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const first=await page.locator('#stage').boundingBox();
  if (first.width!==1280 || first.height!==720) {
    const size=page.viewportSize();
    await page.setViewportSize({width:Math.round(size.width+1280-first.width),height:Math.round(size.height+720-first.height)});
  }
  await page.waitForFunction(()=>{
    const stage=document.querySelector('#stage').getBoundingClientRect(), canvas=company.renderer.domElement,
      rect=canvas.getBoundingClientRect();
    return stage.width===1280 && stage.height===720 && rect.width===1280 && rect.height===720 &&
      canvas.width*9===canvas.height*16 && Math.abs(company.camera.aspect-16/9)<1e-9;
  });
}

async function resources(room) {
  const data=await page.evaluate(({roomId,cameraId,backdropId})=>{
    const {scene,document:doc}=company.session,room=scene.root.getObjectByName(roomId);
    const records=doc.nodes.filter(n=>n.resource && room.getObjectByName(n.id)).map(n=>{
      const r=company.catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version);
      return {id:n.id,ref:n.resource,transform:n.transform,parent:n.parentId,asset:r.asset,role:r.mountRole,
        mirror:Boolean(r.mirrorSurface),lens:r.camera?.lensNode};
    });
    return {mirror:records.find(r=>r.mirror),back:backdropId?records.find(r=>r.id===backdropId):records.find(r=>r.role==='background-panel'),
      camera:records.find(r=>r.id===cameraId)};
  },{roomId:room.room,cameraId:room.camera,backdropId:room.rule.shot.backdropId});
  assert(data.mirror && data.back && data.camera?.lens,'Missing the physical mirror, background or installed lens');
  for (const r of Object.values(data)) await asset(r.asset);
  return data;
}

async function frame(room, tag) {
  const button=page.locator('.view-toolbar [data-view="camera"]');
  assert.equal(await button.textContent(),'机位取景');await button.click();await ready();
  assert.equal(await button.getAttribute('aria-pressed'),'true');
  await fitBroadcastCanvas();
  report.opticalViewport=page.viewportSize();
  const result=await page.evaluate(async ({roomId,shot,threeUrl})=>{
    const {Vector3,Raycaster,Box3}=await import(threeUrl),{scene,document:doc}=company.session;
    const {camera,renderer}=company;scene.root.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const room=scene.root.getObjectByName(roomId), rig=scene.root.getObjectByName(shot.cameraId);
    const ref=doc.nodes.find(n=>n.id===shot.cameraId).resource;
    const r=company.catalog.resources.find(e=>e.id===ref.id&&e.version===ref.version);
    const lens=rig.getObjectByName(r.camera.lensNode),box=new Box3().setFromObject(lens,true);
    if (!lens?.isMesh||!box.getSize(new Vector3()).length()) throw Error('No installed physical lens');
    const forward=new Vector3(0,0,1).transformDirection(rig.matrixWorld);
    const ray=new Raycaster(), center=box.getCenter(new Vector3());
    ray.set(center.clone().addScaledVector(forward,box.getSize(new Vector3()).length()+.001),forward.clone().negate());
    const hit=ray.intersectObject(lens,false)[0];if(!hit)throw Error('No optical axis hit');
    const cameraAt=camera.getWorldPosition(new Vector3());
    const meshes=[];scene.root.traverseVisible(o=>{if(o.isMesh&&o!==lens)meshes.push(o);});
    const dom=renderer.domElement.getBoundingClientRect(),points=[],obstructions=[];
    const overlayNodes=[...document.querySelectorAll('.view-context,.view-toolbar,.scene-caption,#mirror-limit,#region-labels>*')]
      .filter(el=>el.getClientRects().length && getComputedStyle(el).visibility!=='hidden');
    const {start,end,bottom,top}=shot.frame;
    // Grid independently probes the installed browser scene. The batch's CPU checker clips all actual triangles.
    for(let x=0;x<=8;x++)for(let y=0;y<=4;y++){
      const u=x/8,v=y/4;
      const local=new Vector3(start[0]+u*(end[0]-start[0]),bottom+v*(top-bottom),start[1]+u*(end[1]-start[1]));
      const point=room.localToWorld(local.clone()), delta=point.clone().sub(cameraAt), dir=delta.clone().normalize();
      const clip=point.clone().project(camera);
      const px=[(clip.x+1)*dom.width/2,(1-clip.y)*dom.height/2];
      ray.set(cameraAt,dir);ray.near=camera.near/dir.dot(forward);ray.far=delta.length()-.001;
      const blocked=ray.intersectObjects(meshes,false).find(h=>{
        const mat=Array.isArray(h.object.material)?h.object.material[h.face.materialIndex]:h.object.material;
        return mat?.visible && !(mat.transparent && mat.opacity<=0);
      });
      if (blocked){
        const ancestors=[];for(let o=blocked.object;o;o=o.parent)if(o.name)ancestors.push(o.name);
        obstructions.push({uv:[u,v],hit:ancestors,at:blocked.point.toArray(),distance:blocked.distance});
      }
      const hud=overlayNodes.filter(o=>{const b=o.getBoundingClientRect();return px[0]+dom.x>=b.left&&px[0]+dom.x<=b.right&&px[1]+dom.y>=b.top&&px[1]+dom.y<=b.bottom;})
        .map(o=>o.id||o.className);
      points.push({uv:[u,v],local:local.toArray(),world:point.toArray(),ndc:clip.toArray(),px,hud});
    }
    const corners=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>points.find(p=>p.uv[0]===u&&p.uv[1]===v));
    // Projected shot rectangle is convex. SAT also catches a small toolbar lying between all sampled body positions.
    const quad=corners.map(c=>c.px);
    const axes=[[1,0],[0,1],...quad.map((p,i)=>{const q=quad[(i+1)%4];return [p[1]-q[1],q[0]-p[0]];})];
    const overlayIntersections=overlayNodes.flatMap(o=>{
      const b=o.getBoundingClientRect(), left=b.left-dom.left,right=b.right-dom.left,top=b.top-dom.top,bottom=b.bottom-dom.top;
      const rect=[[left,top],[right,top],[right,bottom],[left,bottom]];
      const intersects=axes.every(([x,y])=>{
        const a=quad.map(p=>p[0]*x+p[1]*y), c=rect.map(p=>p[0]*x+p[1]*y);
        return Math.min(Math.max(...a),Math.max(...c))-Math.max(Math.min(...a),Math.min(...c))>1e-5;
      });
      return intersects?[{name:o.id||o.className,rect:[left,top,right,bottom]}]:[];
    });
    const historicalBack=!shot.backdropId && doc.nodes.find(n=>{
      if(!n.resource || !room.getObjectByName(n.id))return false;
      const spec=company.catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version);
      return spec?.mountRole==='background-panel';
    });
    const backdrop=room.getObjectByName(shot.backdropId || historicalBack?.id);
    const backgroundRays=[.4,.5,.6].map(u=>{
      const v=.65,body=room.localToWorld(new Vector3(start[0]+u*(end[0]-start[0]),bottom+v*(top-bottom),start[1]+u*(end[1]-start[1])));
      const dir=body.clone().sub(cameraAt).normalize();
      ray.set(cameraAt,dir);ray.near=camera.near/dir.dot(forward);ray.far=camera.far/dir.dot(forward);
      const first=ray.intersectObjects(meshes,false).find(h=>{
        const mat=Array.isArray(h.object.material)?h.object.material[h.face.materialIndex]:h.object.material;
        return mat?.visible && !(mat.transparent && mat.opacity<=0);
      });
      const chain=[];for(let o=first?.object;o;o=o.parent)if(o.name)chain.push(o.name);
      return {u,v,chain,at:first?.point.toArray()||null,distance:first?.distance??null,
        backdropHit:Boolean(first && backdrop?.getObjectById(first.object.id) && first.distance>body.distanceTo(cameraAt))};
    });
    const docCanvas=document.createElement('canvas');docCanvas.width=renderer.domElement.width;docCanvas.height=renderer.domElement.height;
    company.drawHostFrame();
    const ctx=docCanvas.getContext('2d');ctx.drawImage(renderer.domElement,0,0);
    const feed=docCanvas.toDataURL('image/png');
    ctx.scale(docCanvas.width/dom.width,docCanvas.height/dom.height);
    ctx.lineWidth=2;ctx.strokeStyle='#ffc040';ctx.beginPath();for(const [i,p]of corners.entries())i?ctx.lineTo(...p.px):ctx.moveTo(...p.px);
    ctx.closePath();ctx.stroke();
    return {feed,outline:docCanvas.toDataURL('image/png'),origin:cameraAt.toArray(),lensHit:hit.point.toArray(),
      originError:cameraAt.distanceTo(hit.point),directionErrorDegrees:camera.getWorldDirection(new Vector3()).angleTo(forward)*180/Math.PI,
      cssCanvas:[dom.x,dom.y,dom.width,dom.height],buffer:[docCanvas.width,docCanvas.height],aspect:camera.aspect,fov:camera.fov,
      corners,overlayIntersections,backdrop:shot.backdropId||historicalBack?.id,explicitBackdrop:Boolean(shot.backdropId),backgroundRays,blocked:obstructions,hudSamples:points.filter(p=>p.hud.length).map(({uv,hud})=>({uv,hud})),sampleCount:points.length};
  },{roomId:room.room,shot:room.rule.shot,threeUrl});
  for (const field of ['feed','outline']) {
    const file=room.alias+'-'+tag+'-'+field+'.png';
    await fs.writeFile(path.join(out,file),Buffer.from(result[field].split(',')[1],'base64'));result[field]=file;
  }
  result.controls=await picture(room.alias+'-'+tag+'-controls.png');
  const receipt=room.alias+'-'+tag+'-projection.json';
  await fs.writeFile(path.join(out,receipt),JSON.stringify(result,null,2)+'\n');
  assert(result.originError<.001 && result.directionErrorDegrees<.05,'Button chose another lens: '+receipt);
  const vertical=2*Math.atan(Math.max(Math.tan(22*Math.PI/180),Math.tan(41*Math.PI/180)/(16/9)))*180/Math.PI;
  assert(Math.abs(result.fov-vertical)<.001);
  assert(result.corners.every(p=>p.ndc.every(n=>Math.abs(n)<1)),'Full-height frame clipped: '+receipt);
  assert.equal(result.blocked.length,0,'Actual scene obstructs foreground: '+receipt);
  assert.equal(result.overlayIntersections.length,0,'Ordinary viewer overlays intersect the full-height frame: '+receipt);
  assert(result.backgroundRays[1].backdropHit && result.backgroundRays.filter(r=>r.backdropHit).length>=2,
    'The shot sees another surface behind the central chest/shoulder area: '+receipt);
  assert(result.explicitBackdrop,'The recovered dance shot has no explicit backdrop identity: '+receipt);
  const toolbar=await page.locator('.view-toolbar').boundingBox();
  assert(toolbar.y+toolbar.height<=result.cssCanvas[1]+1,'Optical controls must be outside the photographed canvas');
  return {receipt,...result};
}

async function exitShot() {
  const roomButton=page.locator('.view-toolbar [data-view="room"]');await roomButton.click();await ready();
  assert.equal(await roomButton.getAttribute('aria-pressed'),'true');
  const restored=await page.evaluate(()=>{
    const box=s=>document.querySelector(s).getBoundingClientRect(),stage=box('#stage'),panel=box('.viewport');
    const visible=s=>Boolean(document.querySelector(s).getClientRects().length);
    return {stageOffset:stage.top-panel.top,toolbarPosition:getComputedStyle(document.querySelector('.view-toolbar')).position,
      caption:visible('.scene-caption'),context:visible('.view-context'),regionLabels:getComputedStyle(document.querySelector('#region-labels')).display};
  });
  assert(Math.abs(restored.stageOffset)<1 && restored.toolbarPosition==='absolute' && restored.caption &&
    restored.context && restored.regionLabels!=='none','Room view did not restore its HUD and original stage');
  return restored;
}

async function mirrorEvidence(room,assets,tag) {
  await choose(assets.mirror.id);await page.locator('#edit-focus').click();await ready();
  await page.waitForFunction(id=>{
    company.drawHostFrame();
    const b=company.session.scene.mirrorBindings().find(b=>b.ownerId===id)?.snapshot();
    return b?.active && b.fresh;
  },assets.mirror.id,{timeout:4500});
  const result=await page.evaluate(id=>{
    const {scene}=company.session, binding=scene.mirrorBindings().find(b=>b.ownerId===id), stats=company.mirrorController.snapshot();
    return {owner:stats.activeOwnerId,passes:stats.reflectionPasses,failures:stats.failures,
      fresh:binding.snapshot().fresh,active:binding.snapshot().active};
  },assets.mirror.id);
  assert.equal(result.owner,assets.mirror.id);assert(result.passes>0 && result.failures===0);
  return {...result,file:await picture(room.alias+'-'+tag+'-mirror.png')};
}

async function publicArea(room,tag) {
  await enter(room,room.publicId);
  const snapshot=await page.evaluate(id=>{
    const g=company.session.scene.root.getObjectByName(id),meshes=[];
    g.traverseVisible(o=>{if(o.isMesh)meshes.push(o.name);});
    return {id:company.session.scene.view.roomId,meshes:meshes.sort()};
  },room.publicId);
  assert.equal(snapshot.id,room.publicId);assert(snapshot.meshes.length);
  const file=tag?await picture(room.alias+'-'+tag+'-public.png'):null;
  await enter(room);return {snapshot,file};
}

async function replaceBackground(room,back) {
  await choose(back.id);
  const doc=await current(),n=find(doc,back.id),select=page.locator('#edit-look');
  const choices=await select.locator('option').evaluateAll(options=>options.map(o=>o.value));
  const next=choices.find(id=>id!==key(n.resource));assert(next,'Need a compatible background appearance');
  const [id,ver]=next.split('@');n.resource={id,version:Number(ver)};
  const defaults=await page.evaluate(ref=>company.catalog.resources.find(r=>r.id===ref.id&&r.version===ref.version).stateDefaults,n.resource);
  n.state={...defaults,...n.state};doc.revision++;
  await select.selectOption(next);await ready();assert.deepEqual(await current(),doc);
  return {document:doc,from:key(back.ref),to:next};
}

async function testSecondCamera(room) {
  const doc=await current(),node=find(doc,room.camera), id=node.id+'-qa-secondary',t=structuredClone(node.transform);
  t.position[0]=t.position[0]>.05?t.position[0]-.38:t.position[0]+.38;
  await page.evaluate(op=>company.apply([op]),{type:'add-facility',id,parentId:node.parentId,resource:node.resource,transform:t});
  await choose(id);
  const check=await frame(room,'secondary-selected');
  const distance=await page.evaluate(async({id,pos,threeUrl})=>{
    const {Box3,Vector3,Raycaster}=await import(threeUrl);
    const other=company.session.scene.root.getObjectByName(id);
    const ref=company.session.document.nodes.find(n=>n.id===id).resource;
    const res=company.catalog.resources.find(r=>r.id===ref.id&&r.version===ref.version);
    const o=other.getObjectByName(res.camera.lensNode),box=new Box3().setFromObject(o,true);
    const fwd=new Vector3(0,0,1).transformDirection(other.matrixWorld);
    const start=box.getCenter(new Vector3()).addScaledVector(fwd,box.getSize(new Vector3()).length()+.001);
    const hit=new Raycaster(start,fwd.negate()).intersectObject(o,false)[0];
    return hit.point.distanceTo(new Vector3(...pos));
  },{id,pos:check.origin,threeUrl});
  assert(distance>.20,'Viewer must differ from the selected decoy lens');
  await page.evaluate(op=>company.apply([op]),{type:'remove',id});
  const restored=await current();doc.revision+=2;assert.deepEqual(restored,doc);
  return {id,fromActualLensMetres:check.originError,fromDecoyMetres:distance,projection:check.receipt};
}

async function verify(rooms) {
  const profile=await fs.mkdtemp(path.join(out,'qa-profile-')), states=[];
  await open(profile);
  for(const room of rooms) {
    stage='baseline '+room.alias;await visit(room);await fitBroadcastCanvas();
    const a=await resources(room), publicSpace=await publicArea(room,'initial');
    const roomFile=await picture(room.alias+'-overview.png'),mirror=await mirrorEvidence(room,a,'initial');
    await choose(room.camera);const shot=await frame(room,'initial');
    const restoredHud=await exitShot();
    await page.locator('#save').click();await ready();
    const save=await savedText(room.document.id);assert.deepEqual(JSON.parse(save).document,room.document);
    states.push({alias:room.alias,fixtureSha256:sha(room.bytes),a,publicSpace,roomFile,mirror,shot,restoredHud,save});
  }
  const [first,other]=rooms;
  stage='compatible backdrop replacement';await visit(first);
  const update=await replaceBackground(first,states[0].a.back),after=await resources(first);
  assert.notEqual(after.back.asset.sha256,states[0].a.back.asset.sha256);
  assert.deepEqual(after.camera,states[0].a.camera);assert.deepEqual(after.mirror,states[0].a.mirror);
  await page.locator('#save').click();await ready();const saved=await savedText(first.document.id);
  assert.deepEqual(JSON.parse(saved).document,update.document);assert.equal(await savedText(other.document.id),states[1].save);
  stage='cold reopen';await close();await open(profile);await visit(first,false);
  assert.deepEqual(await current(),update.document);assert.equal(await savedText(first.document.id),saved);
  assert.equal(await savedText(other.document.id),states[1].save);assert.deepEqual(await resources(first),after);
  const cold=await frame(first,'cold');const mirror=await mirrorEvidence(first,after,'cold');
  assert.deepEqual((await publicArea(first)).snapshot,states[0].publicSpace.snapshot);
  stage='independent lens selection';const secondary=await testSecondCamera(first);
  assert.equal(await savedText(first.document.id),saved);
  stage='unchanged second room';await visit(other);assert.deepEqual(await current(),other.document);
  assert.deepEqual(await resources(other),states[1].a);assert.deepEqual((await publicArea(other)).snapshot,states[1].publicSpace.snapshot);
  await frame(other,'unchanged');await mirrorEvidence(other,states[1].a,'unchanged');
  assert.equal(await savedText(first.document.id),saved);
  report.rooms=states.map(({save,...rest})=>({...rest,originalSaveSha256:sha(save)}));
  report.change={from:update.from,to:update.to,savedSha256:sha(saved),cold:cold.receipt,mirror,secondary};
  await close();
}

async function record(rooms) {
  stage='ordinary viewing at normal speed';
  await open(await fs.mkdtemp(path.join(out,'video-profile-')),true);
  for(const room of rooms){
    await visit(room);await page.waitForTimeout(1000);
    await choose(room.camera);await page.locator('.view-toolbar [data-view="camera"]').click();await ready();await fitBroadcastCanvas();
    await page.waitForTimeout(2000);
    const a=await resources(room);await mirrorEvidence(room,a,'record');await page.waitForTimeout(900);
    await enter(room,room.publicId);await page.waitForTimeout(1000);
  }
  const v=page.video();await close();
  const file='video/dance-broadcast-normal.webm';await fs.rename(await v.path(),path.join(out,file));
  const bytes=await fs.readFile(path.join(out,file));report.video={file,bytes:bytes.length,sha256:sha(bytes),playbackSpeed:1};assert(bytes.length>0);
}

async function run() {
  await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.mkdir(out);
  created = true;
  stage = 'inspect dance shot manifests';
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
  await verify(inputs);
  if (flags.includes('--record')) await record(inputs);
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
