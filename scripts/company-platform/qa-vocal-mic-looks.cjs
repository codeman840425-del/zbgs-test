const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {createHash} = require('node:crypto');
const {once} = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createInterface} = require('node:readline');
let chromium;

const [rootArg, build, ...options] = process.argv.slice(2);
const flags = options.filter(value => value.startsWith('--')), paths = options.filter(value => !value.startsWith('--'));
if (!rootArg || !/^[0-9a-f]{12}$/.test(build) || ![1,2].includes(paths.length) || flags.length > 1 || flags.some(value => value !== '--record'))
  throw new Error('Usage: node qa-vocal-mic-looks.cjs DIST BUILD BATCH_ROOMS NEW_OUT [--record]\n' +
    '   or: node qa-vocal-mic-looks.cjs PACKAGE BUILD NEW_OUT [--record]');
const root = path.resolve(rootArg), batch = paths.length === 2 ? path.resolve(paths[0]) : null, out = path.resolve(paths.at(-1));
const viewport = {width:1600,height:900}, threeUrl = '/__vocal-looks-qa/three.core.js';
const names = ['mic','score','camera'];
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
    if (!['singing-rental','singing-studio'].includes(name)) continue;
    const file = basename => batch ? fs.readFile(path.join(batch,name,basename)) : read(`data/rooms/${name}/${basename}`);
    const layout = JSON.parse(await file('layout.json'));
    if (!layout.singingRooms?.length) continue;
    const bytes = await file('save.json'), {schema,document} = JSON.parse(bytes);
    assert.equal(schema,'company-save');
    assert.deepEqual(document,layout);
    assert.equal(layout.singingRooms.length,1);
    const rule = layout.singingRooms[0], region = find(document,rule.regionId);
    assert.equal(region?.kind,'room');
    const roles = Object.fromEntries(names.map(role => [role,rule.roles?.[role]]));
    assert.equal(new Set(Object.values(roles)).size,names.length);
    assert(Object.values(roles).every(id => find(document,id)?.kind === 'facility'));
    const areas = document.nodes.filter(node => node.kind === 'area' && node.parentId === region.parentId);
    const floor = find(document,region.parentId);
    const portal = [...(floor.connections || []),...(floor.exteriorEntrances || [])].find(p=>p.id===rule.portalId);
    assert(portal,'Missing authored entry '+rule.portalId);
    const adjacent = areas.find(a=>portal.from?.regionId===region.id && portal.to?.regionId===a.id ||
      portal.to?.regionId===region.id && portal.from?.regionId===a.id);
    results.push({alias:name,bytes,document,room:region.id,floor:region.parentId,roles,performer:rule.performer,portal,adjacent});
  }
  assert.equal(results.length,2,'Expected two room layouts with a singingRooms contract');
  for(const {performer} of results) {
    assert.equal(performer.coordinateSpace,'facility'); assert.equal(performer.slotId,'vocal');
    for(const name of ['position','approach','exit','mouth','eye']) assert.equal(performer[name].length,3,name);
  }
  const authored = results.find(room => room.document.scale === 'single-room');
  assert(authored,'Expected one standalone single-room singing fixture');
  const companion = results.find(room => room !== authored);
  assert.equal(companion.adjacent?.publicRole,'living','The rental stage must connect to its real public living room');
  assert.equal(authored.portal.regionId,authored.room,'The studio uses its own exterior entry');
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

async function shot(name) {
  await page.evaluate(()=>company.drawHostFrame());
  await page.screenshot({path:path.join(out,name)});
  return name;
}

// Compare two captures in the same JS task. Suppress changed shadows and always restore visibility before display.
async function drawnPixels(id,part) {
  return page.evaluate(({id,part})=>{
    const {renderer,session:{scene}}=company;
    const obj=scene.root.getObjectByName(id), target=part?obj.getObjectByName(part):obj;
    const canvas=document.createElement('canvas'), gl=renderer.domElement;
    canvas.width=gl.width;canvas.height=gl.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const grab=()=>{company.drawHostFrame();ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(gl,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;};
    const visible=target.visible, casters=[];
    target.traverseVisible(o=>{if(o.isMesh&&o.castShadow)casters.push(o);});
    let a,b;
    try {for (const o of casters) o.castShadow=false;
      a=grab();target.visible=false;b=grab();}
    finally {target.visible=visible;for(const o of casters)o.castShadow=true;company.drawHostFrame();}
    let count=0,minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
    for (let i=0;i<a.length;i+=4) {
      if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])<24)continue;
      const x=i/4%canvas.width,y=Math.floor(i/4/canvas.width);
      count++;minX=Math.min(x,minX);minY=Math.min(y,minY);maxX=Math.max(x,maxX);maxY=Math.max(y,maxY);
    }
    const rect=gl.getBoundingClientRect();
    return {id,part,count,bounds:[minX,minY,maxX,maxY],canvas:[canvas.width,canvas.height],canvasRect:[rect.left,rect.top,rect.width,rect.height]};
  },{id,part});
}

async function focus(room,role) {
  await choose(room.roles[role]);
  await page.locator('#edit-focus').click();
  await ready();
}

async function ordinaryCloseup(room,role,part) {
  await focus(room,role);
  const pixels=await drawnPixels(room.roles[role],part);
  assert(pixels.count>12,'Ordinary item focus must reveal '+part+' immediately: '+JSON.stringify(pixels));
  return {firstPixels:pixels.count,pixels};
}


const near=(a,b,label)=>assert(Math.abs(a-b)<1e-6,label+' '+a+' != '+b);
function vector(actual,expected,label) {
  assert.equal(actual.length,expected.length,label);
  actual.forEach((value,i)=>near(value,expected[i],label));
}
function yaw(actual,expected,label) { near(Math.atan2(Math.sin(actual-expected),Math.cos(actual-expected)),0,label); }

async function observe(room) {
  const raw=await page.evaluate(async ({id,roomId,threeUrl})=>{
    const {Vector3,Matrix4,Quaternion,Raycaster,Box3}=await import(threeUrl);
    const {scene,document:doc}=company.session;
    const rule=doc.singingRooms.find(r=>r.regionId===roomId), p=rule.performer;
    const slot=scene.describeUsePoint(id+'#vocal');
    if(!slot)throw Error('Missing runtime descriptor '+id+'#vocal');
    scene.root.updateMatrixWorld(true);
    const host=scene.root.getObjectByName(id),region=scene.root.getObjectByName(roomId);
    if(!host||!region.getObjectById(host.id))throw Error('Microphone is outside authored region');
    const ref=doc.nodes.find(n=>n.id===id).resource;
    const res=company.catalog.resources.find(r=>r.id===ref.id&&r.version===ref.version);
    if(res.productionBranch!=='floor-vocal-microphone' || res.mountRole!=='floor-vocal-microphone')throw Error('Unexpected microphone resource contract '+res.id);
    const pickup=host.getObjectByName(res.microphone.pickupNode);
    if(!pickup?.isMesh||!pickup.geometry?.attributes.position?.count)throw Error('Absent physical grille');
    const vertices=[],names=[],inverse=host.matrixWorld.clone().invert();
    host.traverseVisible(m=>{
      if(!m.isMesh)return;
      names.push(m.name);const attr=m.geometry.attributes.position,matrix=inverse.clone().multiply(m.matrixWorld);
      const local=new Vector3();for(let i=0;i<attr.count;i++){
        local.fromBufferAttribute(attr,i).applyMatrix4(matrix);
        vertices.push(Math.round(local.x*1e5),Math.round(local.y*1e5),Math.round(local.z*1e5));
      }
    });
    const digest=await crypto.subtle.digest('SHA-256',new Int32Array(vertices));
    const physicalShape=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    const stand=host.matrixWorld.clone().multiply(new Matrix4().makeRotationY(p.yaw).setPosition(new Vector3(...p.position)));
    const toPoint=(a,m)=>new Vector3(...a).applyMatrix4(m), origin=m=>new Vector3().setFromMatrixPosition(m).toArray();
    const heading=m=>{const front=new Vector3(0,0,1).transformDirection(m);return Math.atan2(front.x,front.z);};
    const mouth=toPoint(p.mouth,stand),eye=toPoint(p.eye,stand),center=new Box3().setFromObject(pickup,true).getCenter(new Vector3());
    const meshes=[];scene.root.traverseVisible(o=>{if(o.isMesh)meshes.push(o);});
    const ray=new Raycaster(mouth,center.clone().sub(mouth).normalize(),.00001,mouth.distanceTo(center)+.002);
    const hit=ray.intersectObjects(meshes,false)[0];
    if(hit?.object!==pickup)throw Error('Mouth to pickup first hit '+(hit?.object.name??'none')+'; expected '+pickup.name);
    return {slot,ref,meshNames:names,physicalShape,grille:pickup.name,triangles:(pickup.geometry.index?.count??pickup.geometry.attributes.position.count)/3,
      glb:res.asset,world:{position:origin(stand),yaw:heading(stand),hostPosition:origin(host.matrixWorld),
        hostYaw:heading(host.matrixWorld),approach:toPoint(p.approach,host.matrixWorld).toArray(),
        exit:toPoint(p.exit,host.matrixWorld).toArray(),mouth:mouth.toArray(),eye:eye.toArray(),
        pickupCenter:center.toArray(),pickupSurface:hit.point.toArray(),mouthToGrille:hit.distance},
      localGrille:host.worldToLocal(hit.point.clone()).toArray(),
      masterCount:scene.describeUsePoints().filter(s=>s.id===slot.id).length};
  },{id:room.roles.mic,roomId:room.room,threeUrl});
  const {slot,world:w}=raw;
  assert.equal(raw.masterCount,1);assert.equal(slot.id,room.roles.mic+'#vocal');
  assert.equal(slot.slotId,'vocal');assert.equal(slot.kind,'standing-vocal');
  assert.equal(slot.facilityId,room.roles.mic);assert.equal(slot.roomId,room.room);assert.equal(slot.floorId,room.floor);
  assert.equal(slot.companyId,room.document.id);assert.deepEqual(slot.resource,raw.ref);
  assert.equal(slot.contact.pickupNodeId,raw.grille);assert.equal(slot.local.coordinateSpace,'facility');
  for(const field of ['position','approach','exit'])vector(slot.local[field],room.performer[field],'local '+field);
  yaw(slot.local.yaw,room.performer.yaw,'local orientation');
  vector(slot.transform.position,w.position,'world stand');yaw(slot.transform.yaw,w.yaw,'world orientation');
  vector(slot.facilityTransform.position,w.hostPosition,'facility position');yaw(slot.facilityTransform.yaw,w.hostYaw,'facility orientation');
  vector(slot.approachPosition,w.approach,'world approach');vector(slot.exitPosition,w.exit,'world exit');
  assert(w.mouthToGrille>.02 && w.mouthToGrille<.4,'Mouth to actual grille distance '+w.mouthToGrille);
  assert(raw.triangles>0);await asset(raw.glb);
  return raw;
}
async function outputDirectory() {
  const source=await fs.realpath(path.resolve(__dirname,'../..'));
  const hasFile=async file=>{try{return (await fs.stat(file)).isFile();}
    catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;return false;}};
  const localMarker=p=>hasFile(path.join(p,'scripts/company-platform/local-workspace.ps1'));
  let managed;
  for(let p=source;p!==path.dirname(p);p=path.dirname(p)){
    if(['company-workspace','output'].includes(path.basename(p).toLowerCase()) && await localMarker(path.dirname(p))) {
      managed=path.dirname(p);break;
    }
  }
  if(!managed && await localMarker(source))managed=source;
  // A receiver invoking the tool from their own work area can put evidence anywhere
  // inside that area, even when the sealed package and the installed tool are siblings.
  const cwd=await fs.realpath(process.cwd());
  const owners=managed?[managed]:[source,cwd].filter(p=>p!==path.dirname(p));
  const inside=(base,target)=>{const rel=path.relative(base,target);return rel.length>0 && rel!=='..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel);};
  const owner=owners.find(p=>inside(p,out));
  assert(owner,'Output must belong to the QA project: '+owners.join(' or '));
  let existing=path.dirname(out);
  while(true) {
    try {await fs.lstat(existing);break;}
    catch(e){if(e.code!=='ENOENT')throw e;existing=path.dirname(existing);}
  }
  const resolved=path.resolve(await fs.realpath(existing),path.relative(existing,out));
  assert(inside(owner,resolved),'Output resolves outside the QA project');
  assert(!inside(await fs.realpath(root),resolved) && resolved!==await fs.realpath(root),'Keep the input untouched');
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);created=true;
  const temp=path.join(out,'process-temp');await fs.mkdir(temp);
  for(const name of ['TMP','TEMP','TMPDIR'])process.env[name]=temp;
  chromium=require('../../prototype/node_modules/playwright').chromium;
}
async function cameraView(room, geometry) {
  await choose(room.roles.camera);
  const button=page.locator('.view-toolbar [data-view="camera"]');
  assert.equal(await button.textContent(),'机位取景');
  await button.click(); await ready();
  assert.equal(await button.getAttribute('aria-pressed'),'true');
  const observation=await page.evaluate(async ({threeUrl,g})=>{
    const {Vector3}=await import(threeUrl), camera=company.camera, vec=p=>new Vector3(...p);
    camera.updateMatrixWorld(true);
    const actual=camera.getWorldPosition(new Vector3()), direction=camera.getWorldDirection(new Vector3());
    const axis=vec(g.axis), delta=actual.clone().sub(vec(g.lens)), along=delta.dot(axis);
    return {origin:actual.toArray(),along,lateral:delta.addScaledVector(axis,-along).length(),
      degrees:direction.angleTo(axis)*180/Math.PI,referenceNdc:[g.mouth,g.eye].map(pt=>vec(pt).project(camera).toArray())};
  },{threeUrl,g:geometry});
  assert(observation.along>=-.001 && observation.along<=.025 && observation.lateral<.001 && observation.degrees<.05,
    'Selected ordinary view must use the installed physical lens');
  assert(observation.referenceNdc.every(([x,y,z])=>Math.abs(x)<1 && Math.abs(y)<1 && Math.abs(z)<1),'Performer outside lens frame');
  return observation;
}

const looks=['boom','disc','suspension','broadcast'].map(style=>({id:'floor-vocal-mic-'+style,version:1}));

async function roomOptics(room,observation) {
  const result=await page.evaluate(async ({roles,world,threeUrl})=>{
    const {Vector3,Box3,Raycaster}=await import(threeUrl);
    const {scene,document:doc}=company.session;scene.root.updateMatrixWorld(true);
    const info=(id,field)=>{
      const facility=doc.nodes.find(n=>n.id===id), r=company.catalog.resources.find(r=>r.id===facility.resource.id&&r.version===facility.resource.version);
      const root=scene.root.getObjectByName(id), part=field==='camera'?r.camera.lensNode:r.musicStand.pageNode;
      const mesh=root.getObjectByName(part);if(!mesh?.isMesh)throw Error('Expected actual optical mesh '+part);
      return {asset:r.asset,root,mesh,part};
    };
    const score=info(roles.score,'score'),camera=info(roles.camera,'camera'),axis=new Vector3(0,0,1).transformDirection(camera.root.matrixWorld);
    const center=new Box3().setFromObject(camera.mesh,true).getCenter(new Vector3()),ray=new Raycaster();
    const meshes=[];scene.root.traverseVisible(o=>{if(o.isMesh) meshes.push(o);});
    function hit(from,to,objects,extra=.001) {
      const dir=to.clone().sub(from);ray.near=.00001;ray.far=dir.length()+extra;ray.set(from,dir.normalize());
      return ray.intersectObjects(objects,false)[0];
    }
    const lens=hit(center.clone().addScaledVector(axis,.15),center,[camera.mesh]);
    if(!lens)throw Error('Real optical axis missed lens');
    const face=lens.point.clone().addScaledVector(axis,.002);
    const blockers=meshes.filter(m=>m!==camera.mesh);
    for(const end of [world.eye,world.mouth]){
      const obstacle=hit(face,new Vector3(...end),blockers,0);
      if(obstacle)throw Error('Live camera obstructed by '+obstacle.object.name);
    }
    const g=score.mesh.geometry,pos=g.attributes.position,inverse=score.root.matrixWorld.clone().invert();
    const frame=inverse.clone().multiply(score.mesh.matrixWorld);
    const bounds=new Box3(),v=new Vector3();
    for(let i=0;i<pos.count;i++) bounds.expandByPoint(v.fromBufferAttribute(pos,i).applyMatrix4(frame));
    const eye=new Vector3(...world.eye), pages=[];
    for(const side of [0,1]){
      let hits=0;
      for(let col=0;col<11;col++) for(let row=0;row<11;row++){
        const x=bounds.min.x+(bounds.max.x-bounds.min.x)*(side+(col+.5)/11)/2;
        const y=bounds.min.y+(bounds.max.y-bounds.min.y)*(row+.5)/11;
        const front=score.root.localToWorld(new Vector3(x,y,bounds.max.z+.15));
        const behind=score.root.localToWorld(new Vector3(x,y,bounds.min.z-.15));
        const sample=hit(front,behind,[score.mesh]);
        if(!sample)throw Error('Missing physical page sample '+[side,row,col]);
        const sight=hit(eye,sample.point,meshes);
        if(sight?.object!==score.mesh || sight.point.distanceTo(sample.point)>.004)
          throw Error('Score page sample blocked at '+[side,row,col]+' by '+sight?.object.name);
        hits++;
      }
      pages.push(hits);
    }
    return {axis:axis.toArray(),lens:lens.point.toArray(),mouth:world.mouth,eye:world.eye,
      pages,pageNode:score.part,texture:!!score.mesh.material.map,cameraAsset:camera.asset,scoreAsset:score.asset};
  },{roles:room.roles,world:observation.world,threeUrl});
  assert.deepEqual(result.pages,[121,121]);assert(result.texture);
  await asset(result.cameraAsset);await asset(result.scoreAsset);return result;
}
async function picker(room,ref) {
  await choose(room.roles.mic);
  const list=page.locator('#edit-look');
  const options=await list.locator('option').evaluateAll(os=>os.map(o=>o.value).filter(Boolean));
  for(const look of looks)assert(options.includes(key(look)),'Ordinary look menu lacks '+key(look)+'; available '+options);
  assert(await list.isEnabled());
  assert.notEqual(await list.inputValue(),key(ref),'Each verification must exercise a real appearance change');
  const expected=await current();expected.revision++;find(expected,room.roles.mic).resource=ref;
  await list.selectOption(key(ref));await ready();assert.deepEqual(await current(),expected);
  return expected;
}
function stableSlot(sample){
  const {revision,resource,contact,...slot}=sample.slot;return slot;
}
async function detail(room,measured,file) {
  // A supplemental close-up uses the actual grille centre and a repeatable direction
  // in the mic's own frame. Both the ordinary viewer photograph and this real geometry
  // are used, and no target, lighting or material is substituted.
  const pose=await page.evaluate(async ({id,name,threeUrl})=>{
    const {Vector3,Box3}=await import(threeUrl);
    const {session:{scene},camera}=company, host=scene.root.getObjectByName(id), head=host.getObjectByName(name);
    const center=new Box3().setFromObject(head,true).getCenter(new Vector3());
    const direction=new Vector3(.77,.23,1).transformDirection(host.matrixWorld).normalize();
    camera.position.copy(center).addScaledVector(direction,.45);camera.lookAt(center);camera.updateMatrixWorld(true);
    scene.setWallView({mode:'cutaway',cameraPosition:camera.position.toArray()});company.drawHostFrame();
    return {distance:.45,center:center.toArray(),worldPosition:camera.position.toArray(),fov:camera.fov};
  },{id:room.roles.mic,name:measured.grille,threeUrl});
  const pixels=await drawnPixels(room.roles.mic,measured.grille);assert(pixels.count>100,'Pickup detail is occluded');
  if(file)await shot(file);
  return {file,pose,pixels};
}
async function stockProbe(room) {
  const sample=await observe(room);const optics=await roomOptics(room,sample);
  const closeup=await ordinaryCloseup(room,'mic',sample.grille);
  const options=await page.locator('#edit-look option').evaluateAll(os=>os.map(o=>o.value));
  return {sample,optics,closeup,options};
}
async function verify(rooms) {
  const profile=path.join(out,'cold-profile'),previous=new Map();
  for(const room of rooms){
    stage=room.alias+' named import';await open(profile);await visit(room);
    const initial=await stockProbe(room);
    const source=initial.sample.ref, refs=looks.filter(r=>key(r)!==key(source)).concat(source);
    assert.equal(new Set(refs.map(key)).size,4,'Fixture must start with an offered look');
    const log={alias:room.alias,instance:room.roles.mic,inputSaveSha256:sha(room.bytes),source,initialMenu:initial.options,initialPickupPixels:initial.closeup.pixels.count,initialGrille:initial.sample.grille,initialPages:initial.optics.pages,looks:[]};report.rooms.push(log);
    for(const ref of refs) {
      stage=room.alias+' '+key(ref);const expected=await picker(room,ref);
      const warm=await observe(room);assert.deepEqual(warm.ref,ref);assert.deepEqual(stableSlot(warm),stableSlot(initial.sample));
      const optics=await roomOptics(room,warm);
      assert.deepEqual(optics,initial.optics,'Eye, mouth, camera and both visible score pages are unchanged');
      const lens=await cameraView(room,optics),prefix=room.alias+'-'+ref.id;
      const broadcast=await shot(prefix+'-camera.png');
      await page.locator('.view-toolbar [data-view="room"]').click();
      const visible=await ordinaryCloseup(room,'mic',warm.grille);
      const silhouette=await drawnPixels(room.roles.mic);assert(silhouette.count>visible.pixels.count);
      const whole=await shot(prefix+'-whole.png'), head=await detail(room,warm,prefix+'-pickup.png');
      await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false');
      const text=await savedText(room.document.id);assert.deepEqual(JSON.parse(text).document,expected);
      for(const [otherId,otherText] of previous)assert.equal(await savedText(otherId),otherText,'Adjacent named room storage changed');
      await close();stage=prefix+' cold';await open(profile);await visit(room,false);
      assert.equal(await savedText(room.document.id),text);assert.deepEqual(await current(),expected);
      const cold=await observe(room);assert.deepEqual(cold,warm);assert.deepEqual(await roomOptics(room,cold),optics);
      const coldVisible=await ordinaryCloseup(room,'mic',cold.grille);await shot(prefix+'-cold.png');
      log.looks.push({ref,warm,visible,silhouette,optics,lens,whole,broadcast,head,coldVisible,coldFile:prefix+'-cold.png',savedSha256:sha(text)});
    }
    previous.set(room.document.id,await savedText(room.document.id));await close();
    assert.equal(new Set(log.looks.map(row=>row.warm.physicalShape)).size,4,'Expected four actual geometries');
    assert.equal(new Set(log.looks.map(row=>row.warm.glb.sha256)).size,4);
  }
  const [studio,rental]=report.rooms;
  assert.notEqual(studio.instance,rental.instance);
  assert(Math.abs(Math.sin(studio.looks[0].warm.world.hostYaw-rental.looks[0].warm.world.hostYaw))>.999);
  for(const row of studio.looks){
    const other=rental.looks.find(l=>key(l.ref)===key(row.ref));assert.deepEqual(other.warm.glb,row.warm.glb);
  }
}
async function recordTour(rooms) {
  stage='ordinary recording';await open(path.join(out,'record-profile'),true);
  for(const [i,room] of rooms.entries()){
    const refs=looks.filter(r=>key(r)!==key(find(room.document,room.roles.mic).resource)).concat(find(room.document,room.roles.mic).resource);
    await visit(room);await page.waitForTimeout(800);
    for(const ref of refs){
      await picker(room,ref);await focus(room,'mic');await page.waitForTimeout(850);
      const data=report.rooms[i].looks.find(v=>key(v.ref)===key(ref));
      await detail(room,data.warm);await page.waitForTimeout(700);
    }
    await cameraView(room,report.rooms[i].looks[0].optics);await page.waitForTimeout(900);
    await page.locator('.view-toolbar [data-view="room"]').click();
    await focus(room,'score');await page.waitForTimeout(700);
  }
  const video=page.video();await close();const file='video/vocal-mic-looks-normal.webm';
  await fs.rename(await video.path(),path.join(out,file));const bytes=await fs.readFile(path.join(out,file));
  report.video={file,bytes:bytes.length,sha256:sha(bytes),playbackSpeed:1};
}
async function run() {
  await outputDirectory();
  stage = 'inspect singing room manifests';
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
  if (flags.includes('--record')) await recordTour(inputs);
  for(const room of inputs){const bytes=batch?await fs.readFile(path.join(batch,room.alias,'save.json')):await read('data/rooms/'+room.alias+'/save.json');assert(bytes.equals(room.bytes));}
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
