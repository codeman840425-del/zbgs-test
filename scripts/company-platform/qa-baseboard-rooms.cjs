const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('../../prototype/node_modules/playwright');
const {serve} = require('./serve.cjs');

const [distArg,build,batchArg,outArg,...flags] = process.argv.slice(2);
if (!distArg || !build || !batchArg || !outArg || (flags.length && !(flags.length === 1 && flags[0] === '--record')))
  throw Error('Usage: node qa-baseboard-rooms.cjs DIST BUILD BATCH_DIR NEW_OUTPUT [--record]');
const dist = path.resolve(distArg), batch = path.resolve(batchArg), out = path.resolve(outArg);
const viewport = {width:1440,height:900};
const studio = 'baseboard-studio/ground/live', work = 'baseboard-rental/ground/work', living = 'baseboard-rental/ground/living';
const ids = ['square','reveal','timber','stone'].map(name=>'baseboard-'+name);
const hash = bytes=>createHash('sha256').update(bytes).digest('hex');
const report = {status:'running',build,harness:null,checks:[],reopens:[],errors:[],captures:[]};
let server, context, page, responses, stage = 'start';
const saveReport = ()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
const current = ()=>page.evaluate(()=>company.session.document);
async function idle() {
  await page.waitForFunction(()=>window.company?.editor && company.buildInfo && !document.querySelector('#mode-room').disabled);
  assert.equal(await page.locator('#status').getAttribute('data-error'),'false',await page.locator('#status').textContent());
}
async function open(record=false) {
  context = await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
    ...(record ? {recordVideo:{dir:path.join(out,'video'),size:viewport}} : {})});
  page=context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(25000);
  responses=new Map();
  page.on('response',r=>responses.set(new URL(r.url()).pathname,r));
  page.on('pageerror',error=>report.errors.push({stage,message:error.message}));
  await page.goto(server.url);
  await idle();
  assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);
}
async function close(videoName) {
  const recordingPath=videoName && await page.video().path();
  await context.close();
  context=null;
  if (recordingPath) {
    await fs.rename(recordingPath,path.join(out,videoName));
    report.video=videoName;
  }
}
async function loadBatch(key) {
  const file=path.join(batch,key,'save.json'), text=await fs.readFile(file,'utf8');
  await page.locator('#file').setInputFiles(file);
  await page.waitForFunction(id=>company.session.document.id===id,key);
  await idle();
  assert.deepEqual(await current(),JSON.parse(text).document);
  report.checks.push({imported:key,saveSha256:hash(text)});
}
async function focus(roomId) {
  await page.evaluate(id=>company.showSpace('room',company.session.document.nodes.find(n=>n.id===id).parentId,id),roomId);
  await page.locator('#tool-finish').click();
  await idle();
  assert(await page.locator('#finish-baseboard').isVisible());
}
async function choose(id) {
  await page.locator('#finish-baseboard').selectOption(id ? id+'@1' : '');
  await idle();
  assert.equal(await page.locator('#finish-baseboard').inputValue(),id ? id+'@1' : '');
}
async function wall(mode) {
  await page.locator('#wall-view').selectOption(mode);
  await idle();
}
async function navigation() {
  return page.evaluate(()=>{
    const scene=company.session.scene, n=scene.navigation();
    return {regions:n.regions,obstacles:n.obstacles.map(({object,...o})=>o),connections:n.connections,
      entrances:n.exteriorEntrances,points:scene.describeUsePoints().map(({revision,...p})=>p)};
  });
}

// Measure the section from the actual GPU position buffer relative to its wall face.
// Independently compose the saved ancestors to verify floor rotation and translation.
async function measure(roomId,id) {
  const result=await page.evaluate(({roomId,id})=>{
    const scene=company.session.scene, doc=company.session.document, record=company.catalog.resources.find(r=>r.id===id&&r.version===1);
    const key=(d,h)=>[Math.round(d*1e6),Math.round(h*1e6)].join(',');
    const expect=record?.finish.profile.map(([d,h])=>key(d,h)).sort();
    const ancestry=[];
    for(let n=doc.nodes.find(n=>n.id===roomId);n;n=doc.nodes.find(p=>p.id===n.parentId)) ancestry.push(n.transform);
    scene.root.updateMatrixWorld(true);
    const segments=[];
    scene.root.traverse(mesh=>{
      if(mesh.userData.roomId!==roomId || !mesh.userData.baseboard) return;
      if(mesh.userData.baseboard!==id) throw Error('Unexpected trim '+mesh.name);
      const wall=mesh.parent, edge=mesh.userData.edge, g=mesh.geometry, p=g.getAttribute('position'), uv=g.getAttribute('uv');
      const faceSign=edge==='north'||edge==='west'?1:-1, alongX=edge==='north'||edge==='south';
      const face=(alongX?wall.position.z:wall.position.x) + faceSign*(alongX?wall.geometry.parameters.depth:wall.geometry.parameters.width)/2;
      const found=new Set(), extent=[Infinity,-Infinity];
      let maxWorldError=0;
      for(let i=0;i<p.count;i++) {
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i),u=alongX?x:z;
        found.add(key(((alongX?z:x)-face)*faceSign,y));
        extent[0]=Math.min(extent[0],u);extent[1]=Math.max(extent[1],u);
        let wx=x,wy=y,wz=z;
        for(const t of ancestry) {
          const c=Math.cos(t.yaw),s=Math.sin(t.yaw);
          [wx,wy,wz]=[t.position[0]+c*wx+s*wz,t.position[1]+wy,t.position[2]-s*wx+c*wz];
        }
        const actual=mesh.localToWorld(mesh.position.clone().set(x,y,z));
        maxWorldError=Math.max(maxWorldError,Math.hypot(actual.x-wx,actual.y-wy,actual.z-wz));
      }
      const m=mesh.material, visible=n=>{for(;n;n=n.parent)if(!n.visible)return false;return true;};
      segments.push({name:mesh.name,edge,extent,profile:[...found].sort(),maxWorldError,
        realGeometry:g.isBufferGeometry && Boolean(g.getAttribute('normal')) && p.count>=12 && uv?.count===p.count,
        visible:visible(mesh),wallVisible:visible(wall),ownVisible:mesh.visible,
        boundToWall:wall.userData.physicalBoundary===mesh.userData.physicalBoundary,
        texture:m.map?.isTexture&&[m.map.image.width,m.map.image.height],material:m.name});
    });
    return {expect,segments,asset:record?.asset};
  },{roomId,id});
  if (!id) {assert.equal(result.segments.length,0);return result;}
  assert(result.segments.length>=4);
  for(const s of result.segments) {
    assert(s.realGeometry && s.ownVisible && s.boundToWall && s.maxWorldError<1e-5,s.name);
    assert.equal(s.visible,s.wallVisible);
    assert.equal(s.profile.length,result.expect.length,s.name);
    for (const expected of result.expect) {
      const [depth,height]=expected.split(',').map(Number);
      assert(s.profile.some(point=>{
        const [d,h]=point.split(',').map(Number);
        return Math.abs(d-depth)<=1 && Math.abs(h-height)<=1;
      }),s.name+' missing profile vertex '+expected);
    }
    assert(s.texture?.every(n=>n>1) && s.material==='Surface:'+id+'@1',s.name);
  }
  return result;
}
async function checkAsset(asset) {
  const response=responses.get(asset.url);
  assert(response?.ok(),'Missing GLB response '+asset.url);
  const bytes=await response.body();
  assert.equal(bytes.subarray(0,4).toString(),'glTF');
  assert.equal(hash(bytes),asset.sha256);
  assert.equal(bytes.length,asset.bytes);
  return asset.sha256;
}
async function detail(roomId) {
  // Production inspection viewpoint looking at the right jamb from inside. No scene objects are moved.
  await page.evaluate(id=>{
    const room=company.session.scene.root.getObjectByName(id), cam=company.camera;
    const at=(x,y,z)=>room.localToWorld(cam.position.clone().set(x,y,z));
    cam.position.copy(at(1.18,.41,.76));cam.lookAt(at(.63,.16,1.91));cam.updateMatrixWorld();
    company.drawHostFrame();
  },roomId);
}
async function shot(file,description) {
  await page.evaluate(()=>{company.drawHostFrame();if(company.renderer.getContext().isContextLost())throw Error('WebGL context lost');});
  await page.screenshot({path:path.join(out,file)});
  report.captures.push({file,description});
}
async function saveAndRestart(roomId) {
  await page.locator('#save').click();
  await idle();
  const before=await current(), bytes=await page.evaluate(()=>company.export());
  assert.deepEqual(JSON.parse(bytes).document,before);
  await close();
  await open();
  assert.deepEqual(await current(),before);
  assert.equal(await page.evaluate(()=>company.export()),bytes);
  await focus(roomId);
  report.reopens.push({company:before.id,resource:before.nodes.find(n=>n.id===roomId).finishes.baseboard.resource,saveSha256:hash(bytes)});
}

async function verify() {
  await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.mkdir(out);
  report.harness=hash(await fs.readFile(__filename));
  server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
  await open();
  await loadBatch('baseboard-studio');
  await focus(studio);
  const menu=await page.locator('#finish-baseboard option').evaluateAll(options=>options.map(o=>o.value));
  assert(menu.includes('') && ids.every(id=>menu.includes(id+'@1')));
  const baseline=await navigation();
  assert(baseline.entrances.length);
  await wall('full');
  const full=await measure(studio,'baseboard-timber');
  assert(full.segments.every(s=>s.visible));
  const south=full.segments.filter(s=>s.edge==='south').sort((a,b)=>a.extent[0]-b.extent[0]);
  assert.equal(south.length,2);
  assert(Math.abs(south[0].extent[1]-(-.35-.85))<1e-5 && Math.abs(south[1].extent[0]-(-.35+.85))<1e-5,'door frame foot clearance');
  await wall('cutaway');
  const cut=await measure(studio,'baseboard-timber');
  assert(cut.segments.some(s=>!s.visible) && cut.segments.some(s=>s.visible));
  assert.deepEqual(await navigation(),baseline);
  await shot('studio-cutaway.png','Editor room camera with automatic cutaway');
  report.checks.push({cutawayHidden:cut.segments.filter(s=>!s.visible).map(s=>s.name),doorway:south.map(s=>s.extent)});
  await choose('');
  await measure(studio,null);
  assert(!Object.hasOwn((await current()).nodes.find(n=>n.id===studio).finishes||{},'baseboard'));
  assert.deepEqual(await navigation(),baseline);
  const distinct=new Set();
  for(const id of ids) {
    stage=id;
    await choose(id);
    await wall('full');
    const before=await measure(studio,id);
    distinct.add(JSON.stringify(before.segments[0].profile));
    await detail(studio);
    await shot(id+'.png','Inspection camera inside the studio facing the door jamb, full walls');
    assert.deepEqual(await navigation(),baseline);
    await saveAndRestart(studio);
    const restored=await measure(studio,id);
    assert.deepEqual(restored.expect,before.expect);
    report.checks.push({id,meshCount:restored.segments.length,profileMicrometres:restored.segments[0].profile,
      texture:restored.segments[0].texture,glbSha256:await checkAsset(restored.asset)});
    await saveReport();
  }
  assert.equal(distinct.size,4);
  stage='invalid-wall-selection';
  const failure=await page.evaluate(async id=>{
    const before=JSON.stringify(company.session.document), saved=await company.export();
    const wall=company.catalog.resources.find(r=>r.finish?.allowedSurfaces.includes('wall'));
    let code;
    try {await company.apply([{type:'set-surface-finish',id,surface:'baseboard',finish:{resource:{id:wall.id,version:wall.version}}}]);}
    catch(error) {code=error.code;}
    return {code,preserved:JSON.stringify(company.session.document)===before && await company.export()===saved};
  },studio);
  assert.deepEqual(failure,{code:'incompatible-surface-finish',preserved:true});
  await measure(studio,ids[3]);
  report.checks.push(failure);
  stage='rental';
  await loadBatch('baseboard-rental');
  const original=await current(), floor=original.nodes.find(n=>n.kind==='floor');
  assert.deepEqual(floor.transform,{position:[1.25,0,-.75],yaw:Math.PI/2});
  await focus(work);
  const rentalNav=await navigation();
  await measure(work,'baseboard-reveal');
  await choose('baseboard-timber');
  const converted=await measure(work,'baseboard-timber');
  await focus(living);
  await measure(living,'baseboard-stone');
  assert.deepEqual((await current()).nodes.find(n=>n.id===living),original.nodes.find(n=>n.id===living));
  assert.deepEqual(await navigation(),rentalNav);
  await shot('rental-living.png','Editor room camera in the rotated rental floor');
  await saveAndRestart(work);
  await measure(work,'baseboard-timber');
  await focus(living);
  await measure(living,'baseboard-stone');
  report.checks.push({rentalFloor:floor.transform,work:'baseboard-timber',living:'baseboard-stone',
    maxWorldErrorMeters:Math.max(...converted.segments.map(s=>s.maxWorldError)),navigationUnchanged:true});
  await close();
  if(flags.includes('--record')) {
    stage='normal-speed-recording';
    await open(true);
    await loadBatch('baseboard-studio');
    await focus(studio);
    await wall('full');
    await detail(studio);
    for(const id of ids) {await choose(id);await measure(studio,id);await page.waitForTimeout(1300);}
    await choose('');
    await page.waitForTimeout(750);
    await choose('baseboard-timber');
    await page.waitForTimeout(1200);
    await close('normal-speed.webm');
  }
  assert.deepEqual(report.errors,[]);
  report.status='passed';
  await saveReport();
}
verify().catch(async error=>{
  process.exitCode=1;report.status='failed';report.failure={stage,message:error.message,stack:error.stack};
  console.error(error);
  if(error.code!=='EEXIST') await saveReport().catch(()=>{});
}).finally(async()=>{await context?.close();await server?.close();});
