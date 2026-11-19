const assert = require('node:assert/strict');
const {execFile, spawn} = require('node:child_process');
const {createHash} = require('node:crypto');
const {once} = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createInterface} = require('node:readline');
const {promisify, isDeepStrictEqual} = require('node:util');

const [inputArg,pin,...rest]=process.argv.slice(2);
const record=rest.includes('--record'),paths=rest.filter(arg=>arg!=='--record');
const dev=/^[a-f0-9]{12}$/.test(pin);
assert(inputArg && (dev || /^[a-f0-9]{64}$/.test(pin)) && paths.length===(dev?2:1) && rest.length===paths.length+Number(record),
  'Use DIST BUILD BATCH_ROOT NEW_OUT [--record] or PACKAGE MANIFEST_SHA256 NEW_OUT [--record]');
const source=path.resolve(__dirname,'../..'),output=path.resolve(source,paths.at(-1));
assert(!paths.at(-1).split(/[\\/]/).includes('..'),'Output path cannot contain traversal');
const aliases=['public-washroom-floor','public-washroom-building'];
const styles={basin:['frame-round','cabinet-square','pier-round','shelf-square'].map(id=>'public-washbasin-'+id),
  dispenser:['pump','cartridge','lever','clad'].map(id=>'washroom-dispenser-'+id)};
const roles=['basin','mirror','dispenser','sign'];
const viewport={width:1600,height:900};
const threeUrl='/__washroom-qa/three.core.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),run=promisify(execFile);
const report={status:'running',scope:'Public room and floor controls, appearance menus, rendered GLBs, ordinary save and full browser close/reopen.',rooms:[],files:[],browserErrors:[]};
let bundle,batch,manifest,files,chromium,threeSource,temporary,created,server,devServer,base,context,page,responses,stage,videoFile;
const signPixels=new Map(),artPath='assets-source/company-washroom-sign-v1/art.png';
async function pinned(relative) {
  const row = files.get(relative);
  assert(row, 'Missing package file '+relative);
  const bytes = await fs.readFile(path.join(bundle,relative));
  assert.equal(bytes.length,row.bytes,relative);
  assert.equal(sha(bytes),row.sha256,relative);
  return bytes;
}

async function prepare() {
  bundle = await fs.realpath(inputArg);
  const {checkManagedOutput} = await import('./package-company.mjs');
  await checkManagedOutput(output,source,{allowDelivery:false});
  const relative = path.relative(bundle,output);
  assert(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Evidence cannot overlap the packaged input');
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.mkdir(output);
  created = true;
  temporary = await fs.mkdtemp(path.join(output,'browser-temp-'));
  for(const name of ['TMP','TEMP','TMPDIR']) process.env[name] = temporary;
  chromium=require('../../prototype/node_modules/playwright').chromium;
  threeSource=await fs.readFile(path.join(source,'prototype/node_modules/three/build/three.core.js'),'utf8');
  report.scriptSha256=sha(await fs.readFile(__filename));
  if(dev){
    batch=await fs.realpath(paths[0]);report.build=pin;
    const meta=JSON.parse(await fs.readFile(path.join(bundle,'company-build-info.json')));
    assert.equal(meta.shortId,pin);report.sourceDigest=meta.sourceDigest;
    return;
  }
  const bytes = await fs.readFile(path.join(bundle,'transfer-manifest.json'));
  report.manifestSha256=sha(bytes);
  assert.equal(sha(bytes),pin);
  manifest = JSON.parse(bytes);
  assert.equal(manifest.schema,'company-transfer');
  assert.equal(manifest.version,1);
  files = new Map(manifest.files.map(row=>[row.path,row]));
  assert.equal(files.size,manifest.files.length);
  const script = await fs.readFile(__filename);
  const pinnedScript = await pinned('source/scripts/company-platform/qa-public-washroom.cjs');
  assert(script.equals(pinnedScript),'The operator QA script must match the one packaged with the fixed viewer.');
  report.scriptSha256 = sha(script);
  const {stdout} = await run(process.execPath,[path.join(bundle,'verify.mjs'),bundle,pin],
    {cwd:bundle,windowsHide:true,timeout:60_000,maxBuffer:2*1024*1024});
  report.packageVerification = JSON.parse(stdout);
  assert.equal(report.packageVerification.ok,true);
  assert.equal(report.packageVerification.checkedFiles,files.size);
  report.build = manifest.buildId;report.sourceDigest=manifest.sourceDigest;
  const lock = await pinned('source/prototype/package-lock.json');
  assert(lock.equals(await fs.readFile(path.join(source,'prototype/package-lock.json'))),'Use compatible Playwright and Three.js dependencies.');
  chromium = require('../../prototype/node_modules/playwright').chromium;
  threeSource = await fs.readFile(path.join(source,'prototype/node_modules/three/build/three.core.js'),'utf8');
}

async function serve() {
  if(dev){
    devServer=await require('./serve.cjs').serve(bundle,pin,{manifest:'company-build-info.json',entry:'company.html',port:0});
    return new URL(devServer.url);
  }
  server = spawn(process.execPath,['serve.mjs','0'],{cwd:bundle,windowsHide:true,stdio:['ignore','pipe','inherit']});
  const lines = createInterface({input:server.stdout});
  try {
    const [line] = await Promise.race([
      once(lines,'line',{signal:AbortSignal.timeout(20_000)}),
      once(server,'exit').then(([code])=>{throw Error('The package server exited before readiness: '+code);}),
    ]);
    const url = new URL(line);
    assert(url.hostname==='127.0.0.1'&&url.port&&url.pathname==='/company.html');
    url.search = '';
    return url;
  } finally { lines.close();server.stdout.resume(); }
}

async function open(profile,record=false) {
  context = await chromium.launchPersistentContext(profile,{headless:true,viewport,deviceScaleFactor:1,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-networking',`--disk-cache-dir=${path.join(profile,'cache')}`],
    ...(record?{recordVideo:{dir:temporary,size:viewport}}:{}),
  });
  context.setDefaultTimeout(20_000);
  await context.route(`**${threeUrl}`,route=>route.fulfill({contentType:'text/javascript',body:threeSource}));
  page = context.pages()[0]??await context.newPage();
  responses = new Map();
  page.on('response',response=>responses.set(new URL(response.url()).pathname,response));
  page.on('pageerror',error=>report.browserErrors.push({stage,message:error.message}));
  page.on('console',event=>{
    if(event.type()==='error'&&!event.location().url.endsWith('/favicon.ico')) report.browserErrors.push({stage,message:event.text()});
  });
}

async function close() {
  if(!context)return;
  const browser = context.browser();
  await context.close();
  if(browser)assert.equal(browser.isConnected(),false);
  context = null;
  page = null;
}

async function ready() {
  await page.waitForFunction(()=>window.company?.editor&&company.buildInfo&&
    document.querySelector('#status').dataset.error!==undefined&&!document.querySelector('#mode-room').disabled);
  const status = page.locator('#status');
  assert.equal(await status.getAttribute('data-error'),'false',await status.textContent());
}

async function screenshot(filename) {
  const image = await page.screenshot({path:path.join(output,filename)});
  report.files.push({name:filename,bytes:image.length,sha256:sha(image)});
}

async function save(room) {
  const menu = page.locator('details.file-menu');
  if(!await menu.evaluate(node=>node.open))await menu.locator('summary').click();
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false');
  const saved = await page.evaluate(id=>company.session.readSavedText(id),room.document.id);
  assert.equal(JSON.parse(saved).schema,'company-save');
  return saved;
}

async function archiveVideo(video,filename) {
  const raw = await video.path();
  assert.equal(path.relative(temporary,path.dirname(await fs.realpath(raw))),'','Browser recording escaped the managed temporary folder');
  const bytes = await fs.readFile(raw);
  assert(bytes.length>1024,'Expected a real uncut Playwright video');
  await fs.rename(raw,path.join(output,filename));
  report.files.push({name:filename,bytes:bytes.length,sha256:sha(bytes),playbackRate:1,scope:'Uncut tour through the native public-room selection, focus and appearance menus'});
}

const current=()=>page.evaluate(()=>company.session.document);
const key=ref=>ref.id+'@'+ref.version;
async function fixture(alias){
  const bytes=dev?await fs.readFile(path.join(batch,alias,'save.json')):await pinned('data/rooms/'+alias+'/save.json');
  const {schema,document}=JSON.parse(bytes);assert.equal(schema,'company-save');assert.equal(document.id,alias);
  const [rule]=document.publicWashrooms;assert.deepEqual(Object.keys(rule.roles).sort(),[...roles].sort());
  const area=document.nodes.find(n=>n.id===rule.regionId);assert.equal(area.publicRole,'restroom-access');
  assert.equal(area.kind,'area');assert.equal(area.name,'公共洗手区');
  for(const id of Object.values(rule.roles))assert.equal(document.nodes.find(n=>n.id===id).parentId,area.id);
  const content=document.nodes.find(n=>n.parentId===rule.roles.sign && n.resource.id==='information-content-washroom');
  assert.equal(content?.resource.version,1);
  const portal=document.nodes.find(n=>n.id===area.parentId).connections.find(c=>c.id===rule.portalId);
  const side=[portal.from,portal.to].find(s=>s.regionId===area.id);
  const {width,depth}=area.bounds;
  const threshold={north:[side.offset,1.5,-depth/2],south:[side.offset,1.5,depth/2],east:[width/2,1.5,side.offset],west:[-width/2,1.5,side.offset]}[side.edge];
  return {alias,bytes,document,rule,area:area.id,floor:area.parentId,threshold,content:content.id};
}
async function nativeOpen(room,named){
  const url=new URL(base);
  if(named&&!dev)url.searchParams.set('delivery',room.alias);
  await page.goto(url.href);await ready();
  const id=await page.evaluate(()=>company.buildInfo);
  assert.equal(id.shortId,report.build);assert.equal(id.sourceDigest,report.sourceDigest);
  if(named&&dev){
    const menu=page.locator('.file-menu');
    if(!await menu.evaluate(n=>n.open))await menu.locator('summary').click();
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#import').click()]);
    await chooser.setFiles(path.join(batch,room.alias,'save.json'));
    if(await menu.evaluate(n=>n.open))await menu.locator('summary').click();
  }
  await page.waitForFunction(id=>company.session.document.id===id,room.alias);await ready();
  if(named){
    assert.deepEqual(await current(),room.document);
    if(!dev){
      const reply=responses.get('/delivery-room/'+room.alias+'.json');assert.equal(reply?.status(),200);
      assert((await reply.body()).equals(room.bytes));
    }
  }else{
    assert.equal(await page.locator('#status').textContent(),'已恢复上次保存的方案。');
    assert(![...responses.keys()].some(k=>k==='/delivery-save.json'||k.startsWith('/delivery-room/')));
  }
}
async function enter(room){
  const view=await page.evaluate(()=>company.session.scene.view);
  if(view.floorId!==room.floor){
    await page.locator('#floor').selectOption(room.floor);
    await page.waitForFunction(id=>company.session.scene.view.floorId===id && !document.querySelector('#room').disabled,room.floor);
  }
  const roomSelect=page.locator('#room');
  assert((await roomSelect.locator('option').evaluateAll(opts=>opts.map(o=>o.value))).includes(room.area),'Public restroom is missing from room selector: '+room.area);
  await roomSelect.selectOption(room.area);
  await page.waitForFunction(({area,floor})=>company.session.scene.view.mode==='room'&&company.session.scene.view.roomId===area&&company.session.scene.view.floorId===floor,{area:room.area,floor:room.floor});await ready();
  assert((await roomSelect.locator('option:checked').textContent()).includes('公共洗手区'));
}
async function select(room,role,focus=true){
  await page.locator('#tool-selection').click();
  const locator=page.locator('#edit-instance'),id=role==='content'?room.content:room.rule.roles[role];
  await locator.selectOption(id);
  if(focus)await page.locator('#edit-focus').click();
  assert.equal(await locator.inputValue(),id);
  await ready();
}
async function change(room,role,id){
  await select(room,role,false);
  const chooser=page.locator('#edit-look'),expectedChoices=styles[role].map(s=>s+'@1').sort();
  const actual=await chooser.locator('option').evaluateAll(rows=>rows.map(r=>r.value).filter(Boolean).sort());
  assert.deepEqual(actual,expectedChoices,role+' native compatibility menu');
  const ref={id,version:1},before=await current(),node=before.nodes.find(n=>n.id===room.rule.roles[role]);
  if(key(node.resource)!==key(ref)){
    node.resource=ref;before.revision++;
    await chooser.selectOption(key(ref));
    await page.waitForFunction(({id,ref})=>company.session.document.nodes.find(n=>n.id===id)?.resource.id===ref,{id:node.id,ref:id});
    await ready();assert.deepEqual(await current(),before,'An appearance edit changed an unrelated instance or transform');
  }
  assert.equal(await chooser.inputValue(),key(ref));
}
async function inspect(room){
  const result=await page.evaluate(async({ids,threeUrl})=>{
    const {Box3,Vector3,Raycaster}=await import(threeUrl);
    const {renderer,camera,session:{scene,document:doc}}=company;
    company.drawHostFrame();camera.updateMatrixWorld(true);scene.root.updateMatrixWorld(true);
    const roots=Object.fromEntries(Object.entries(ids).map(([r,id])=>[r,scene.root.getObjectByName(id)]));
    const visible=[];scene.root.traverseVisible(o=>{if(o.isMesh && [o.material].flat().some(m=>m.visible&&m.opacity!==0))visible.push(o);});
    const area=roots.basin.parent;
    const records={},pixelSize=[renderer.domElement.width,renderer.domElement.height];
    const owner=o=>{for(let n=o;n;n=n.parent)for(const [k,r]of Object.entries(roots))if(n===r)return k;return null;};
    for(const [role,r] of Object.entries(roots)){
      if(!r||r.parent!==(role==='content'?roots.sign:area))throw Error('Wrong rendered parent for '+role);
      const docNode=doc.nodes.find(n=>n.id===r.name),resource=company.catalog.resources.find(x=>x.id===docNode.resource.id&&x.version===docNode.resource.version);
      const meshes=[];r.traverse(n=>{if(n.isMesh)meshes.push(n);});
      const bounds=new Box3(),inv=r.matrixWorld.clone().invert(),points=[],point=new Vector3();
      let triangles=0;
      for(const m of meshes){
        const local=inv.clone().multiply(m.matrixWorld),attr=m.geometry.attributes.position;
        for(let i=0;i<attr.count;i++){point.fromBufferAttribute(attr,i).applyMatrix4(local);points.push(Math.round(point.x*1e5),Math.round(point.y*1e5),Math.round(point.z*1e5));}
        bounds.union(new Box3().setFromObject(m,true));triangles+=(m.geometry.index?.count??attr.count)/3;
      }
      const digest=await crypto.subtle.digest('SHA-256',new Int32Array(points));
      const required=role==='basin'?['basin-bowl','basin-faucet','pedestal-foot','wash-countertop']:role==='dispenser'?
        [resource.dispenser?.housingNode,resource.dispenser?.actuatorNode,resource.dispenser?.outletNode]:role==='content'?[resource.informationNodes.face]:[];
      for(const name of required)if(!name||!meshes.some(m=>(m.userData.name||m.name)===name))throw Error('Missing installed '+role+' geometry '+name);
      let signArt;
      if(role==='content'){
        const face=meshes.find(m=>(m.userData.name||m.name)===resource.informationNodes.face);
        const image=[face.material].flat().find(m=>m.map)?.map.image;
        if(!image || image.width!==1100 || image.height!==700)throw Error('Missing 1100 × 700 sign face texture on rendered mesh');
        signArt={pixels:[image.width,image.height],png:resource.provenance.sourceImageSha256};
      }
      const projected=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])projected.push(new Vector3(x,y,z).project(camera));
      const clip=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
      const left=clip(Math.min(...projected.map(v=>v.x)),-1,1),right=clip(Math.max(...projected.map(v=>v.x)),-1,1);
      const bottom=clip(Math.min(...projected.map(v=>v.y)),-1,1),top=clip(Math.max(...projected.map(v=>v.y)),-1,1);
      const examples=new Set();let firstHitSamples=0;
      if(right>left&&top>bottom)for(let j=0;j<8;j++)for(let k=0;k<8;k++){
        const cast=new Raycaster();cast.setFromCamera({x:left+(right-left)*(j+.5)/8,y:bottom+(top-bottom)*(k+.5)/8},camera);
        const hit=cast.intersectObjects(visible,false)[0];
        if(hit && owner(hit.object)===role){firstHitSamples++;examples.add(hit.object.userData.name||hit.object.name);}
      }
      records[role]={id:r.name,parent:r.parent.name,ref:docNode.resource,asset:resource.asset,transform:docNode.transform,world:r.matrixWorld.toArray(),
        geometrySha256:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''),meshes:meshes.length,triangles,...(signArt?{signArt}:{}),
        projection:{widthPx:Math.round((right-left)*pixelSize[0]/2),heightPx:Math.round((top-bottom)*pixelSize[1]/2),sampledFirstHits:firstHitSamples,seenParts:[...examples].sort()}};
    }
    return {view:scene.view,records,camera:camera.matrixWorld.toArray(),pixelSize};
  },{ids:{...room.rule.roles,content:room.content},threeUrl});
  for(const rec of Object.values(result.records)){
    assert(rec.triangles>0&&rec.meshes>0);const reply=responses.get(rec.asset.url);assert.equal(reply?.status(),200,'No GLB response '+rec.asset.url);
    const b=await reply.body();assert.equal(sha(b),rec.asset.sha256);assert.equal(b.length,rec.asset.bytes);
    if(rec.signArt){
      const jsonLength=b.readUInt32LE(12),gltf=JSON.parse(b.subarray(20,20+jsonLength));
      const binary=28+jsonLength,view=gltf.bufferViews[gltf.images[0].bufferView],start=binary+(view.byteOffset||0);
      if(!signPixels.has(rec.asset.sha256)){
        const {PNG}=require('../../prototype/node_modules/pngjs');
        const sourceImage=manifest?await pinned('source/'+artPath):await fs.readFile(path.join(source,artPath));
        assert.equal(sha(sourceImage),rec.signArt.png);
        const image=b.subarray(start,start+view.byteLength);
        const end=image.lastIndexOf(Buffer.from('49454e44ae426082','hex'))+8;
        assert(end>=8 && image.length-end<=3 && image.subarray(end).every(p=>p===0),'Unexpected PNG padding in sign GLB');
        const {data}=PNG.sync.read(image.subarray(0,end));
        assert(data.equals(PNG.sync.read(sourceImage).data),'Sign mesh must carry the original washroom artwork pixels');
        signPixels.set(rec.asset.sha256,sha(data));
      }
      rec.signArt.rgbaSha256=signPixels.get(rec.asset.sha256);
    }
    if(manifest)assert((await pinned('viewer'+rec.asset.url)).equals(b));
  }
  return result;
}
async function view(room,role,name){
  await select(room,role);
  const status=await inspect(room),projection=status.records[role].projection;
  assert(projection.sampledFirstHits>0 && projection.widthPx>20 && projection.heightPx>20,role+' native focus cannot see physical object: '+JSON.stringify(projection));
  await screenshot(name);
  return status;
}
async function orbitFromFocus(room,role){
  await select(room,role==='sign'?'content':role);
  const gesture=await page.evaluate(async({ids,area,threshold,role,threeUrl})=>{
    const {Vector3,Box3}=await import(threeUrl);
    const {camera,renderer,session:{scene}}=company;
    const object=role=>scene.root.getObjectByName(ids[role]);
    const center=new Box3().setFromObject(object(role==='sign'?'content':role)).getCenter(new Vector3());
    const direction=camera.position.clone().sub(center);
    const normal=object('basin').getWorldDirection(new Vector3()).add(object('dispenser').getWorldDirection(new Vector3()));
    const target=role==='sign'?scene.root.getObjectByName(area).localToWorld(new Vector3(...threshold)).sub(center):normal;
    const angle=Math.atan2(direction.x,direction.z)-Math.atan2(target.x,target.z);
    const rect=renderer.domElement.getBoundingClientRect();
    // OrbitControls rotates once per canvas height and scales wheel zoom by 0.95 per 100px.
    const dx=Math.atan2(Math.sin(angle),Math.cos(angle))*rect.height/(2*Math.PI);
    const polar=v=>Math.acos(v.y/v.length());
    const dy=role==='sign'?(polar(direction)-polar(target))*rect.height/(2*Math.PI):0;
    const distance=role==='sign'?target.length():4.8;
    return {x:rect.x+rect.width/2-dx/2,y:rect.y+rect.height/2-dy/2,dx,dy,zoom:100*Math.log(direction.length()/distance)/Math.log(.95)};
  },{ids:{...room.rule.roles,content:room.content},area:room.area,threshold:room.threshold,role,threeUrl});
  await page.mouse.move(gesture.x,gesture.y);await page.mouse.down();
  await page.mouse.move(gesture.x+gesture.dx,gesture.y+gesture.dy,{steps:8});await page.mouse.up();
  await page.mouse.wheel(0,gesture.zoom);
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
}
function stationVisible(state,minWidth,minHeight){
  for(const role of ['basin','mirror','dispenser']){
    const p=state.records[role].projection;
    assert(p.sampledFirstHits>0 && p.widthPx>=minWidth && p.heightPx>=minHeight,'Cannot resolve '+role+' in station view: '+JSON.stringify(p));
  }
}
async function groupView(room){
  await orbitFromFocus(room,'basin');
  const state=await inspect(room);
  stationVisible(state,18,20);
  return state;
}
async function entrance(room){
  await orbitFromFocus(room,'sign');
  const state=await inspect(room);
  const position=await page.evaluate(async({area,threeUrl})=>{
    const {Vector3}=await import(threeUrl);
    return company.session.scene.root.getObjectByName(area).worldToLocal(company.camera.getWorldPosition(new Vector3())).toArray();
  },{area:room.area,threeUrl});
  assert(Math.hypot(...position.map((n,i)=>n-room.threshold[i]))<.035,'Camera did not reach actual doorway: '+JSON.stringify(position)+' vs '+JSON.stringify(room.threshold));
  const p=state.records.content.projection;
  assert(p.sampledFirstHits>=20 && p.widthPx>=140 && p.heightPx>=95,'Need a readable and unobstructed sign front at the doorway: '+JSON.stringify(p));
  await screenshot(room.alias+'-entrance-sign.png');
  return {position,threshold:room.threshold,content:state.records.content,board:state.records.sign};
}
function structure(state){
  return Object.fromEntries(Object.entries(state.records).map(([k,{projection,...rec}])=>[k,rec]));
}
async function ensureSaved(room,profile,control){
  const saved=await save(room);assert.deepEqual(JSON.parse(saved).document,await current());
  await close();await open(profile);await nativeOpen(room,false);
  assert.deepEqual(await current(),JSON.parse(saved).document);
  assert.equal(await page.evaluate(id=>company.session.readSavedText(id),room.alias),saved);
  if(control)assert.equal(await page.evaluate(id=>company.session.readSavedText(id),control.id),control.text,'Editing this company changed the other saved room');
  return saved;
}
async function rejectUnreachable(room,saved){
  stage=room.alias+'/unreachable';
  await select(room,'dispenser');
  const before=await current(),rendered=structure(await inspect(room));
  const modelId=await page.evaluate(()=>company.session.scene.root.uuid);
  const original=before.nodes.find(n=>n.id===room.rule.roles.dispenser).transform;
  const upper=room.document.scale==='building',axis=upper?'z':'x',coordinate=upper?-.96:1.6;
  const target=original.position.slice();target[upper?2:0]=coordinate;
  for(const selector of ['#placement-tools','#placement-tools > details']){
    const details=page.locator(selector);
    if(!await details.evaluate(n=>n.open))await details.locator(':scope > summary').click();
  }
  await page.locator('#edit-'+axis).fill(String(coordinate));
  const start=report.browserErrors.length;
  const [rejection]=await Promise.all([page.waitForEvent('console',e=>e.type()==='error'),page.locator('#edit-position').click()]);
  const code=await rejection.args()[0].evaluate(error=>error.code);
  assert.equal(code,'washroom-dispenser-reach');
  // The application reports rejected user operations to the console as well as the status line.
  assert.deepEqual(report.browserErrors.slice(start),[{stage,message:rejection.text()}]);report.browserErrors.splice(start,1);
  await page.waitForFunction(()=>document.querySelector('#status').dataset.error==='true'&&!document.querySelector('#edit-position').disabled);
  const message=await page.locator('#edit-message').textContent();
  assert.equal(await page.locator('#edit-message').getAttribute('data-error'),'true');
  assert.deepEqual(await current(),before);
  assert.deepEqual(structure(await inspect(room)),rendered);
  assert.equal(await page.evaluate(()=>company.session.scene.root.uuid),modelId);
  assert.equal(await page.evaluate(id=>company.session.readSavedText(id),room.alias),saved);
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'),'false');
  await screenshot(room.alias+'-rejected-reach.png');
  return {code,message,original,target,saveSha256:sha(saved),revision:before.revision,renderedRootRetained:true};
}
async function exercise(room,profile,roomIndex,previous){
  const result={key:room.alias,area:room.area,floor:room.floor,sourceSave:sha(room.bytes),rounds:[]};
  report.rooms.push(result);
  stage=room.alias+'/entry';await open(profile);await nativeOpen(room,true);await enter(room);
  const overview=await inspect(room);
  stationVisible(overview,7,8);
  await screenshot(room.alias+'-area.png');
  await page.locator('#floor-view').click();await page.waitForFunction(()=>company.session.scene.view.mode==='floor');
  await screenshot(room.alias+'-floor.png');await enter(room);
  const mirror=await view(room,'mirror',room.alias+'-mirror.png');
  const sign=await entrance(room);
  result.initial={defaultRoomView:overview,mirror:mirror.records.mirror,sign,group:await groupView(room)};
  await screenshot(room.alias+'-station.png');
  let saved;
  for(let i=0;i<4;i++){
    const j=(roomIndex+i+1)%4,b=styles.basin[j],d=styles.dispenser[(j+roomIndex)%4];
    stage=room.alias+'/'+b;await change(room,'basin',b);await change(room,'dispenser',d);
    const warm=await view(room,'basin',room.alias+'-'+b+'.png');
    const detail=await view(room,'dispenser',room.alias+'-'+d+'.png');
    saved=await ensureSaved(room,profile,previous);
    await enter(room);
    const cold=await view(room,'basin',room.alias+'-'+b+'-cold.png');
    assert.deepEqual(structure(cold),structure(warm));
    await select(room,'dispenser');assert.equal(await page.locator('#edit-look').inputValue(),d+'@1');
    result.rounds.push({basin:b,dispenser:d,warm,cold,detail:detail.records.dispenser,saveSha256:sha(saved)});
    if(i===0){
      result.rejected=await rejectUnreachable(room,saved);
      await close();await open(profile);await nativeOpen(room,false);
      assert.deepEqual(await current(),JSON.parse(saved).document);await enter(room);
    }
  }
  for(const role of ['basin','dispenser'])assert.equal(new Set(result.rounds.map(row=>row.warm.records[role].geometrySha256)).size,4);
  await close();return {id:room.alias,text:saved};
}
async function tour(all){
  const profile=await fs.mkdtemp(path.join(temporary,'tour-'));await open(profile,true);
  const video=page.video();assert(video);
  for(const [i,room] of all.entries()){
    stage=room.alias+'/record';await nativeOpen(room,true);await enter(room);await page.waitForTimeout(900);
    await orbitFromFocus(room,'sign');await page.waitForTimeout(1700);
    await groupView(room);await page.waitForTimeout(1800);
    for(const role of ['basin','mirror','dispenser']){
      await select(room,role);await page.waitForTimeout(1100);
    }
    for(const j of [i*2,(i*2+1)%4]){
      await change(room,'basin',styles.basin[j]);await select(room,'basin');await page.waitForTimeout(1150);
      await change(room,'dispenser',styles.dispenser[j]);await select(room,'dispenser');await page.waitForTimeout(1150);
    }
    await page.locator('.view-toolbar [data-view="room"]').click();await page.waitForTimeout(850);
  }
  await close();await archiveVideo(video,'public-washrooms-normal.webm');
}
(async()=>{
  stage='output and input identities';await prepare();base=await serve();
  const all=await Promise.all(aliases.map(fixture));assert.notEqual(all[0].floor,all[1].floor);
  const profile=await fs.mkdtemp(path.join(temporary,'profile-'));
  const previous=await exercise(all[0],profile,0);
  await exercise(all[1],profile,1,previous);
  if(record)await tour(all);
  assert.deepEqual(report.browserErrors,[]);report.status='passed';
})().catch(async e=>{
  report.status='failed';report.failure={stage,message:e.message,stack:e.stack};
  if(created && page && !page.isClosed()){
    await screenshot('failure.png').catch(()=>{});
    report.failure.statusText=await page.locator('#status').textContent({timeout:1000}).catch(()=>null);
  }
  console.error(e);process.exitCode=1;
}).finally(async()=>{
  try{await close();}finally{
    try{if(server&&server.exitCode===null){const stop=once(server,'exit',{signal:AbortSignal.timeout(10000)});server.kill();await stop;}
      if(devServer)await devServer.close();
    }finally{
      if(temporary){assert.equal(path.dirname(await fs.realpath(temporary)),output);await fs.rm(temporary,{recursive:true,force:true});}
      if(created)await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    }
  }
  console.log(JSON.stringify({status:report.status,report:created?path.join(output,'report.json'):null}));
});
