const assert = require('node:assert/strict');
const {execFile, spawn} = require('node:child_process');
const {createHash} = require('node:crypto');
const {once} = require('node:events');
const fs = require('node:fs/promises');
const {createRequire} = require('node:module');
const path = require('node:path');
const {createInterface} = require('node:readline');
const {promisify} = require('node:util');

const [input,pin,...options]=process.argv.slice(2);
const record=options.includes('--record'),args=options.filter(item=>item!=='--record');
const dev=/^[a-f0-9]{12}$/.test(pin);
assert(input&&(dev||/^[a-f0-9]{64}$/.test(pin))&&args.length===(dev?2:1)&&options.length===args.length+Number(record),
  'Use PACKAGE MANIFEST_SHA256 NEW_OUT [--record] or DIST BUILD BATCH_ROOT_OR_RECIPE NEW_OUT [--record]');
assert(!args.at(-1).split(/[\\/]/).includes('..'),'Output path cannot contain traversal');
const source=path.resolve(__dirname,'../..');
const rooms=[
  ['public-meeting-boardroom-floor','conference',2,4],
  ['public-meeting-training-floor','classroom',4,4],
  ['public-meeting-u-building','u-shape',3,4],
  ['public-meeting-discussion-building','whiteboard-discussion',1,3],
];
const chairs=['meeting-chair-side-entry','meeting-chair-cantilever-side-entry','meeting-chair-pedestal-side-entry',
  'meeting-chair-crossbeam-side-entry'].map(id=>id+'@1');
const viewport={width:1600,height:900};
const mathModule='/__meeting-qa/three.core.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=promisify(execFile);
const assetKey=ref=>ref.id+'@'+ref.version;
const report={status:'running',scope:'Native room orientation, compatible chair replacement, announcement visibility, saved-state rollback and cold reopen.',
  recordingRequested:record,rooms:[],files:[],browserErrors:[]};
let project,output,bundle,batch,manifest,files,server,devServer,created,temp,chromium,threeSource,base,context,page,stage,activeVideo;
const verifiedModels=new Set();

async function pinned(relative) {
  const row=files.get(relative);
  assert(row,'Missing package member '+relative);
  const bytes=await fs.readFile(path.join(bundle,relative));
  assert.equal(bytes.length,row.bytes,relative);
  assert.equal(hash(bytes),row.sha256,relative);
  return bytes;
}

async function prepare() {
  bundle=await fs.realpath(input);
  const {checkManagedOutput,findManagedProject}=await import('./package-company.mjs');
  project=await fs.realpath(await findManagedProject(source)??source);
  output=path.resolve(project,args.at(-1));
  await checkManagedOutput(output,source,{allowDelivery:false});
  const relative=path.relative(bundle,output);
  assert(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Evidence cannot overlap the input build or package');
  const script=await fs.readFile(__filename);
  report.scriptSha256=hash(script);
  let lock;
  if(dev){
    const meta=JSON.parse(await fs.readFile(path.join(bundle,'company-build-info.json')));
    assert.equal(meta.shortId,pin);
    report.build=meta.shortId;report.sourceDigest=meta.sourceDigest;
    lock=await fs.readFile(path.join(source,'prototype/package-lock.json'));
  }else{
    const bytes=await fs.readFile(path.join(bundle,'transfer-manifest.json'));
    assert.equal(hash(bytes),pin,'Different transfer manifest');
    manifest=JSON.parse(bytes);
    assert.equal(manifest.schema,'company-transfer');assert.equal(manifest.version,1);
    files=new Map(manifest.files.map(row=>[row.path,row]));
    assert.equal(files.size,manifest.files.length);
    assert(script.equals(await pinned('source/scripts/company-platform/qa-meeting-rooms.cjs')));
    await pinned('verify.mjs');
    const {stdout}=await run(process.execPath,[path.join(bundle,'verify.mjs'),bundle,pin],
      {cwd:bundle,windowsHide:true,timeout:60_000,maxBuffer:2*1024*1024});
    report.packageVerification=JSON.parse(stdout);
    assert(report.packageVerification.ok&&report.packageVerification.checkedFiles===files.size);
    report.manifestSha256=pin;report.build=manifest.buildId;report.sourceDigest=manifest.sourceDigest;
    lock=await pinned('source/prototype/package-lock.json');
  }
  let prototypeDir;
  for(const root of new Set([source,project])){
    const candidate=path.join(root,'prototype');
    const candidateLock=await fs.readFile(path.join(candidate,'package-lock.json')).catch(e=>{if(e.code!=='ENOENT')throw e;});
    const playwright=await fs.stat(path.join(candidate,'node_modules/playwright')).catch(e=>{if(e.code!=='ENOENT')throw e;});
    if(candidateLock?.equals(lock)&&playwright?.isDirectory()){prototypeDir=candidate;break;}
  }
  assert(prototypeDir,'Install the pinned prototype dependencies in an editable work copy for browser QA');
  chromium=createRequire(path.join(prototypeDir,'package.json'))('playwright').chromium;
  threeSource=await fs.readFile(path.join(prototypeDir,'node_modules/three/build/three.core.js'),'utf8');
  report.dependencyLockSha256=hash(lock);
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.mkdir(output);created=true;
  temp=await fs.mkdtemp(path.join(output,'browser-temp-'));
  for(const name of ['TMP','TEMP','TMPDIR'])process.env[name]=temp;
  if(!dev)return;
  const recipeInput=await fs.realpath(args[0]);
  const isFolder=(await fs.stat(recipeInput)).isDirectory();
  if(isFolder&&(await fs.stat(path.join(recipeInput,rooms[0][0],'save.json')).catch(e=>{if(e.code!=='ENOENT')throw e;}))?.isFile()){
    batch=recipeInput;
  }else{
    const recipe=isFolder?path.join(recipeInput,'candidates.json'):recipeInput;
    batch=path.join(output,'dev-recipes');
    const {stdout}=await run(process.execPath,[path.join(source,'scripts/company-platform/batch.mjs'),recipe,batch],
      {cwd:source,windowsHide:true,timeout:180_000,maxBuffer:4*1024*1024});
    assert(JSON.parse(stdout).ok);
    report.recipeSha256=hash(await fs.readFile(recipe));
  }
}

async function serve() {
  if(dev){
    devServer=await require('./serve.cjs').serve(bundle,pin,{manifest:'company-build-info.json',entry:'company.html',port:0});
    return new URL(devServer.url);
  }
  await pinned('serve.mjs');
  server=spawn(process.execPath,['serve.mjs','0'],{cwd:bundle,windowsHide:true,stdio:['ignore','pipe','inherit']});
  const lines=createInterface({input:server.stdout});
  try{
    const [line]=await Promise.race([once(lines,'line',{signal:AbortSignal.timeout(20_000)}),
      once(server,'exit').then(([code])=>{throw Error('Package server exited before readiness: '+code);})]);
    const url=new URL(line);
    assert(url.hostname==='127.0.0.1'&&url.port&&url.pathname==='/company.html');
    url.search='';
    return url;
  }finally{lines.close();server.stdout.resume();}
}

async function open(profile,video=false) {
  context=await chromium.launchPersistentContext(profile,{headless:true,viewport,deviceScaleFactor:1,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-networking',`--disk-cache-dir=${path.join(profile,'cache')}`],
    ...(video?{recordVideo:{dir:temp,size:viewport}}:{})});
  context.setDefaultTimeout(30_000);
  await context.route(`**${mathModule}`,route=>route.fulfill({contentType:'text/javascript',body:threeSource}));
  page=context.pages()[0]??await context.newPage();
  const responses=new Map();
  page.on('response',response=>responses.set(new URL(response.url()).pathname,response));
  page.on('pageerror',error=>report.browserErrors.push({stage,message:error.message}));
  page.on('console',event=>{
    if(event.type()==='error'&&!event.location().url.endsWith('/favicon.ico'))report.browserErrors.push({stage,message:event.text()});
  });
  return responses;
}
async function close() {
  if(!context)return;
  const browser=context.browser();
  await context.close();
  if(browser)assert.equal(browser.isConnected(),false);
  context=null;page=null;
}
async function ready() {
  await page.waitForFunction(()=>window.company?.editor&&company.buildInfo&&
    document.querySelector('#status').dataset.error!==undefined&&!document.querySelector('#mode-room').disabled);
  const status=page.locator('#status');
  assert.equal(await status.getAttribute('data-error'),'false',await status.textContent());
}
const current=()=>page.evaluate(()=>company.session.document);
const savedText=id=>page.evaluate(id=>company.session.readSavedText(id),id);
async function shot(filename) {
  const bytes=await page.screenshot({path:path.join(output,filename)});
  report.files.push({name:filename,bytes:bytes.length,sha256:hash(bytes)});
}
async function hold(ms=750){if(record)await page.waitForTimeout(ms);}
async function archive(video,filename,partial=false) {
  const raw=await fs.realpath(await video.path());
  assert.equal(path.dirname(raw),temp,'Playwright recording escaped the project temporary directory');
  const bytes=await fs.readFile(raw);
  assert(bytes.length>1024);
  await fs.rename(raw,path.join(output,filename));
  report.files.push({name:filename,bytes:bytes.length,sha256:hash(bytes),playbackRate:1,viewport,partial});
}

async function fixture([key,layout,tables,seats]) {
  const rel=`data/rooms/${key}/save.json`;
  const file=dev?path.join(batch,key,'save.json'):path.join(bundle,rel);
  const bytes=dev?await fs.readFile(file):await pinned(rel);
  const sealedLayout=dev?await fs.readFile(path.join(batch,key,'layout.json')):await pinned(`data/rooms/${key}/layout.json`);
  const saved=JSON.parse(bytes);
  assert.equal(saved.schema,'company-save');
  const doc=saved.document;
  assert.equal(doc.id,key);assert.deepEqual(doc,JSON.parse(sealedLayout));
  assert.equal(doc.meetingRooms?.length,1);
  const [rule]=doc.meetingRooms;
  assert.equal(rule.layout,layout);
  assert.equal(rule.tables.length,tables);assert.equal(rule.chairs.length,seats);
  const find=id=>doc.nodes.find(node=>node.id===id);
  const area=find(rule.regionId),board=find(rule.boardId),content=find(rule.contentId),floor=find(area.parentId);
  assert.equal(area.kind,'area');assert.equal(area.publicRole,'meeting-training');
  assert.equal(floor.kind,'floor');
  assert.equal(doc.nodes.filter(node=>node.kind==='room'&&node.parentId===floor.id).length,16);
  assert.equal(board.parentId,area.id);assert.equal(content.parentId,board.id);
  const doorway=floor.connections.find(c=>c.id===rule.portalId),others=[doorway.from,doorway.to];
  assert(others.some(side=>side.regionId===area.id&&side.edge==='east'));
  assert(others.some(side=>find(side.regionId).publicRole==='lobby'&&side.edge==='west'));
  const compatible=layout!=='whiteboard-discussion';
  for(const id of [...rule.tables,...rule.chairs])assert.equal(find(id).parentId,area.id);
  for(const id of rule.chairs){
    const ref=assetKey(find(id).resource);
    assert(compatible?chairs.includes(ref):ref==='chair-cantilever@1',key+' has an unexpected seat family');
  }
  return {key,layout,file,doc,bytes,area:area.id,areaName:area.name,floor:floor.id,rule,compatible};
}

async function visit(room,responses,named) {
  const url=new URL(base);
  if(named&&!dev)url.searchParams.set('delivery',room.key);
  await page.goto(url.href);await ready();
  const seen=await page.evaluate(()=>company.buildInfo);
  assert.equal(seen.shortId,report.build);assert.equal(seen.sourceDigest,report.sourceDigest);
  if(named&&dev){
    const menu=page.locator('details.file-menu');
    await menu.locator('summary').click();
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#import').click()]);
    await chooser.setFiles(room.file);
    if(await menu.evaluate(node=>node.open))await menu.locator('summary').click();
  }
  await page.waitForFunction(id=>company.session.document.id===id,room.key);await ready();
  if(named){
    assert.deepEqual(await current(),room.doc);
    if(!dev){
      const response=responses.get('/delivery-room/'+room.key+'.json');
      assert.equal(response?.status(),200);
      assert(room.bytes.equals(await response.body()));
    }
  }else{
    assert.equal(await page.locator('#status').textContent(),'已恢复上次保存的方案。');
    assert(![...responses.keys()].some(url=>url==='/delivery-save.json'||url.startsWith('/delivery-room/')));
  }
}

async function enter(room) {
  const view=await page.evaluate(()=>company.session.scene.view);
  if(view.floorId!==room.floor){
    await page.locator('#floor').selectOption(room.floor);
    await page.waitForFunction(id=>company.session.scene.view.floorId===id&&!document.querySelector('#room').disabled,room.floor);
  }
  const chooser=page.locator('#room');
  assert((await chooser.locator('option').evaluateAll(rows=>rows.map(item=>item.value))).includes(room.area));
  await chooser.selectOption(room.area);
  await page.waitForFunction(({area,floor})=>company.session.scene.view.mode==='room'&&company.session.scene.view.roomId===area&&
    company.session.scene.view.floorId===floor,{area:room.area,floor:room.floor});
  assert((await chooser.locator('option:checked').textContent()).includes(room.areaName));
  await ready();
}

async function choose(id,focus=false) {
  await page.locator('#tool-selection').click();
  const picker=page.locator('#edit-instance');
  await picker.selectOption(id);
  assert.equal(await picker.inputValue(),id);
  if(focus)await page.locator('#edit-focus').click();
}

async function inspect(room,responses,mode) {
  const physical=await page.evaluate(async({areaId,rule,mode,mathModule})=>{
    const {Box3,Vector3,Raycaster}=await import(mathModule);
    const {camera,renderer,session:{document:doc,scene}}=company;
    company.drawHostFrame();scene.root.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const functions=Object.fromEntries(doc.nodes.filter(node=>node.resource).map(node=>[node.id,
      company.catalog.resources.find(resource=>resource.id===node.resource.id&&resource.version===node.resource.version)]));
    const area=scene.root.getObjectByName(areaId),board=scene.root.getObjectByName(rule.boardId);
    const objects=[...rule.tables,...rule.chairs,rule.boardId,rule.contentId];
    const visible=[];
    if(mode==='top'||mode==='sign'){
      scene.root.traverseVisible(o=>{if(o.isMesh&&[o.material].flat().some(m=>m.visible&&m.opacity>0))visible.push(o);});
    }
    const owner=(o,target)=>{for(let n=o;n;n=n.parent)if(n===target)return true;return false;};
    const items={};
    for(const id of objects){
      const node=scene.root.getObjectByName(id), resource=functions[id];
      if(!node||!resource?.asset||node.parent!==(id===rule.contentId?board:area))throw Error('Missing rendered model or wrong parent for '+id);
      const meshes=[];node.traverse(object=>{if(object.isMesh&&object.geometry.attributes.position)meshes.push(object);});
      const bounds=new Box3(),body=[],inverse=node.matrixWorld.clone().invert(),point=new Vector3();
      for(const mesh of meshes){
        if(id===rule.boardId&&owner(mesh,scene.root.getObjectByName(rule.contentId)))continue;
        const matrix=inverse.clone().multiply(mesh.matrixWorld),position=mesh.geometry.attributes.position;
        for(let i=0;i<position.count;i++){
          point.fromBufferAttribute(position,i).applyMatrix4(matrix);
          body.push(...point.toArray().map(value=>Math.round(value*1e6)));
          bounds.expandByPoint(point);
        }
      }
      if(body.length<9)throw Error('Empty rendered model '+id);
      const digest=await crypto.subtle.digest('SHA-256',new Int32Array(body));
      const geometry=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
      const corners=[];
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])
        corners.push(node.localToWorld(new Vector3(x,y,z)).project(camera));
      const limits=axis=>[Math.min(...corners.map(c=>c[axis])),Math.max(...corners.map(c=>c[axis]))];
      const [left,right]=limits('x'),[bottom,top]=limits('y');
      const clip=n=>Math.max(-1,Math.min(1,n));
      const width=Math.round((clip(right)-clip(left))*renderer.domElement.width/2);
      const height=Math.round((clip(top)-clip(bottom))*renderer.domElement.height/2);
      let firstHits=0;
      if(mode==='top'||mode==='sign'&&id===rule.contentId){
        const ray=new Raycaster();
        for(const x of [.15,.5,.85])for(const y of [.15,.5,.85]){
          ray.setFromCamera({x:clip(left)+(clip(right)-clip(left))*x,y:clip(bottom)+(clip(top)-clip(bottom))*y},camera);
          if(owner(ray.intersectObjects(visible,false)[0]?.object,node))firstHits++;
        }
      }
      const record={id,resource:doc.nodes.find(item=>item.id===id).resource,asset:resource.asset,geometry,
        localBounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},world:node.matrixWorld.toArray(),
        projection:{width,height,firstHits}};
      if(rule.chairs.includes(id)){
        const slot=scene.describeUsePoint(id+'#seat'),resolved=scene.resolveUsePoint(id+'#seat');
        if(!slot||!resolved?.chairBack?.isMesh||!resolved?.chairSeat?.isMesh)throw Error('Missing resolved chair use point '+id);
        const {resource:_resource,revision:_revision,...contract}=slot;
        record.slot=contract;
        record.contacts={seat:resolved.chairSeat.name,back:resolved.chairBack.name};
      }
      if(id===rule.contentId){
        const name=resource.informationNodes.face,face=meshes.find(mesh=>(mesh.userData.name||mesh.name)===name);
        const image=[face?.material].flat().find(m=>m?.map)?.map.image;
        if(!face||!image)throw Error('Missing mounted announcement mesh or texture');
        record.content={mesh:name,visible:face.visible,pixels:[image.width,image.height]};
      }
      items[id]=record;
    }
    return {items,view:scene.view,camera:camera.matrixWorld.toArray(),sceneId:scene.root.uuid};
  },{areaId:room.area,rule:room.rule,mode,mathModule});
  for(const item of Object.values(physical.items)){
    if(verifiedModels.has(item.asset.sha256))continue;
    const response=responses.get(item.asset.url);
    assert.equal(response?.status(),200,'No browser model response: '+item.asset.url);
    const bytes=await response.body();
    assert.equal(bytes.length,item.asset.bytes);assert.equal(hash(bytes),item.asset.sha256);
    if(!dev)assert((await pinned('viewer'+item.asset.url)).equals(bytes));
    verifiedModels.add(item.asset.sha256);
  }
  assert.deepEqual(physical.items[room.rule.contentId].content.pixels,[1100,700]);
  return physical;
}

async function overview(room,responses,mode,filename) {
  await page.locator(`.view-toolbar [data-view="${mode}"]`).click();
  const state=await inspect(room,responses,mode);
  for(const id of [...room.rule.tables,...room.rule.chairs,room.rule.boardId]){
    const {projection:p}=state.items[id];
    assert(p.width>=10&&p.height>=7,'Room view does not frame '+id+' '+JSON.stringify(p));
    if(mode==='top'&&id!==room.rule.boardId)assert(p.firstHits>0,'Layout cannot see '+id+' from above');
  }
  await shot(filename);
  return state;
}

async function chairLooks(room,responses) {
  const id=room.rule.chairs[0];
  await choose(id,true);
  const chooser=page.locator('#edit-look');
  const menu=await chooser.locator('option').evaluateAll(options=>options.map(row=>row.value).filter(Boolean).sort());
  assert.deepEqual(menu,[...chairs].sort());
  const original=(await inspect(room,responses,'detail')).items[id], receipts=[];
  const first=assetKey(original.resource);
  const byChoice=chairs.filter(key=>key!==first).concat(first);
  // End on a different appearance, so save and reopen witness a real replacement.
  byChoice.push(byChoice[0]);
  for(const [index,option] of byChoice.entries()){
    const before=await current(),expected=structuredClone(before);
    const resource={id:option.split('@')[0],version:1};
    expected.nodes.find(node=>node.id===id).resource=resource;expected.revision++;
    await chooser.selectOption(option);
    await page.waitForFunction(({id,option,revision})=>company.session.document.revision===revision&&
      company.session.document.nodes.find(node=>node.id===id).resource.id+'@'+company.session.document.nodes.find(node=>node.id===id).resource.version===option,
    {id,option,revision:expected.revision});
    await ready();assert.deepEqual(await current(),expected);
    const asset=(await inspect(room,responses,'detail')).items[id];
    assert.deepEqual(asset.world,original.world);assert.deepEqual(asset.slot,original.slot);
    if(index<4){
      receipts.push(asset);
      await shot(room.key+'-'+resource.id+'.png');
    }
    await hold(700);
  }
  assert.equal(new Set(receipts.map(item=>item.geometry)).size,4);
  assert.equal(new Set(receipts.map(item=>item.asset.sha256)).size,4);
  return {id,menu,original:first,look:byChoice.at(-1),receipts};
}

async function announce(room,responses) {
  const id=room.rule.contentId;
  await choose(id,true);
  const graphic=state=>state.items[id];
  const original=graphic(await inspect(room,responses,'sign'));
  assert.equal(original.content.visible,true);
  assert(original.projection.width>=60&&original.projection.height>=35&&original.projection.firstHits>0,'Announcement face must be visible in the native focus view');
  const states=[];
  for(const target of [false,true]){
    const before=await current(), expected=structuredClone(before);
    expected.revision++;
    const node=expected.nodes.find(n=>n.id===id);node.state={...node.state,visible:target};
    const control=page.getByRole('button',{name:'内容显示：'+(target?'关':'开'),exact:true});
    assert.equal(await control.getAttribute('aria-pressed'),String(!target));
    await control.click();
    await page.waitForFunction(({id,target,revision})=>company.session.document.revision===revision&&
      company.session.document.nodes.find(node=>node.id===id)?.state.visible===target,{id,target,revision:expected.revision});
    await ready();assert.deepEqual(await current(),expected);
    const asset=graphic(await inspect(room,responses,'sign'));
    assert.equal(asset.content.visible,target);
    assert.equal(asset.geometry,original.geometry);assert.deepEqual(asset.world,original.world);
    if(target)assert(asset.projection.firstHits>0);else assert.equal(asset.projection.firstHits,0);
    await shot(room.key+'-announcement-'+(target?'on':'off')+'.png');
    states.push(asset);
    await hold(900);
  }
  return states;
}

async function rejectBoard(room,responses,saved,trial) {
  const id=room.rule.boardId;
  await choose(id,true);
  for(const field of ['#placement-tools','#placement-tools > details']){
    const details=page.locator(field);
    if(!await details.evaluate(node=>node.open))await details.locator(':scope > summary').click();
  }
  const original=await current(),originalState=await inspect(room,responses,'detail');
  const installed=original.nodes.find(node=>node.id===id).transform;
  const target=trial==='door'
    ? {position:[3.55,0,0],yaw:90,code:'blocked-portal',path:room.rule.portalId}
    : {position:installed.position,yaw:(Math.round(installed.yaw*180/Math.PI)+180+360)%360,
      code:'meeting-presenter-position',path:room.area};
  for(const [i,axis] of ['x','y','z'].entries()){
    const input=page.locator('#edit-'+axis);
    if(await input.isEnabled())await input.fill(String(target.position[i]));
    else assert.equal(Number(await input.inputValue()),target.position[i],'Locked board coordinate '+axis);
  }
  await page.locator('#edit-yaw').selectOption(String(target.yaw));
  const before=report.browserErrors.length;
  const [consoleEvent]=await Promise.all([page.waitForEvent('console',event=>event.type()==='error'),page.locator('#edit-position').click()]);
  const error=await consoleEvent.args()[0].evaluate(value=>({code:value.code,path:value.path,details:value.details}));
  assert.equal(error.code,target.code);assert.equal(error.path,target.path);
  if(trial==='door')assert.equal(error.details.obstacleId,id);
  assert.deepEqual(report.browserErrors.splice(before),[{stage,message:consoleEvent.text()}]);
  await page.waitForFunction(()=>document.querySelector('#status').dataset.error==='true'&&!document.querySelector('#edit-position').disabled);
  const message=await page.locator('#status').textContent();
  assert(message.includes('已保留'),message);
  assert.deepEqual(await current(),original);
  assert.equal(await savedText(room.key),saved);
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'),'false');
  const after=await inspect(room,responses,'detail');
  assert.equal(after.sceneId,originalState.sceneId);
  assert.deepEqual(after.items[id],originalState.items[id]);
  await shot(room.key+'-rejected-'+trial+'.png');await hold(1000);
  return {trial,target,error,message,savedSha256:hash(saved),sceneId:after.sceneId};
}

async function exercise(room,profile,prior) {
  const receipt={key:room.key,layout:room.layout,area:room.area,floor:room.floor,originalSha256:hash(room.bytes)};
  report.rooms.push(receipt);
  stage=room.key+'/overview';
  let responses=await open(profile,record);
  if(record)activeVideo={video:page.video(),key:room.key};
  await visit(room,responses,true);await enter(room);
  receipt.perspective=await overview(room,responses,'room',room.key+'-perspective.png');await hold(1100);
  receipt.top=await overview(room,responses,'top',room.key+'-layout.png');await hold(1350);
  await page.locator('.view-toolbar [data-view="room"]').click();
  if(room.compatible){
    stage=room.key+'/chair-looks';
    receipt.chairLooks=await chairLooks(room,responses);
  }else{
    receipt.chairLooks={preserved:room.rule.chairs.map(id=>room.doc.nodes.find(node=>node.id===id).resource)};
  }
  stage=room.key+'/announcement';
  receipt.announcement=await announce(room,responses);
  stage=room.key+'/save';
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false'&&!document.querySelector('#save').disabled);
  const saved=await savedText(room.key);
  assert.deepEqual(JSON.parse(saved).document,await current());
  const savedState=await inspect(room,responses,'detail');
  await shot(room.key+'-saved.png');await hold(1000);
  receipt.savedSha256=hash(saved);
  receipt.rejected=[];
  for(const trial of ['door','reversed']){
    stage=room.key+'/rejected-'+trial;
    receipt.rejected.push(await rejectBoard(room,responses,saved,trial));
  }
  await close();
  if(activeVideo){
    await archive(activeVideo.video,room.key+'-normal.webm');activeVideo=null;
  }
  stage=room.key+'/cold';
  responses=await open(profile);
  await visit(room,responses,false);await enter(room);
  assert.deepEqual(await current(),JSON.parse(saved).document);
  assert.equal(await savedText(room.key),saved);
  for(const older of prior)assert.equal(await savedText(older.key),older.saved,'Another room save changed: '+older.key);
  const cold=await overview(room,responses,'room',room.key+'-restored.png');
  for(const id of Object.keys(cold.items)){
    const {projection:_projection,...actual}=cold.items[id],{projection:_beforeProjection,...expected}=savedState.items[id];
    assert.deepEqual(actual,expected,'Cold reopening changed installed geometry or seat contract: '+id);
  }
  if(room.compatible){
    await choose(receipt.chairLooks.id);
    assert.equal(await page.locator('#edit-look').inputValue(),receipt.chairLooks.look);
  }
  receipt.cold={restoredSameBytes:true,withoutDeliveryQuery:true,savedSha256:hash(await savedText(room.key)),sceneId:cold.sceneId};
  await close();
  return {key:room.key,saved};
}

(async()=>{
  stage='identities';await prepare();
  const fixtures=await Promise.all(rooms.map(fixture));
  base=await serve();
  const profile=await fs.mkdtemp(path.join(temp,'profile-'));
  const prior=[];
  for(const room of fixtures)prior.push(await exercise(room,profile,prior));
  assert.deepEqual(report.browserErrors,[]);
  report.status='passed';
})().catch(async error=>{
  report.status='failed';report.failure={stage,message:error.message,stack:error.stack};
  if(created&&page&&!page.isClosed())await shot('failure.png').catch(()=>{});
  console.error(error);process.exitCode=1;
}).finally(async()=>{
  try{
    await close();
    if(activeVideo)await archive(activeVideo.video,activeVideo.key+'-partial.webm',true).catch(()=>{});
    if(devServer)await devServer.close();
    if(server&&server.exitCode===null){
      const stopped=once(server,'exit',{signal:AbortSignal.timeout(10_000)});server.kill();await stopped;
    }
  }finally{
    if(temp){
      assert.equal(path.dirname(await fs.realpath(temp)),output);
      await fs.rm(temp,{recursive:true});
    }
    if(created)await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:report.status,...(created?{report:path.join(output,'report.json')}:{})}));
  }
});
