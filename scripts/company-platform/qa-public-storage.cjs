const assert=require('node:assert/strict');
const {execFile,spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const {once}=require('node:events');
const fs=require('node:fs/promises');
const {createRequire}=require('node:module');
const path=require('node:path');
const {createInterface}=require('node:readline');
const {promisify}=require('node:util');

const [input,pin,...options]=process.argv.slice(2);
const record=options.includes('--record'),args=options.filter(v=>v!=='--record');
const dev=/^[a-f0-9]{12}$/.test(pin);
assert(input&&(dev||/^[a-f0-9]{64}$/.test(pin))&&args.length===(dev?2:1)&&options.length===args.length+Number(record),
  'Use PACKAGE MANIFEST_SHA NEW_OUT [--record] or DIST BUILD BATCH_ROOT NEW_OUT [--record]');
assert(!args.at(-1).split(/[\\/]/).includes('..'),'Output path cannot contain traversal');
const source=path.resolve(__dirname,'../..');
const keys=['public-storage-floor','public-storage-building'];
const looks=['caddy','open-carton','sealed-carton','linen-tray'].map(name=>'cleaning-load-'+name+'@1');
const viewport={width:1600,height:900},mathModule='/__storage-qa/three.core.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const execute=promisify(execFile);
const ref=resource=>resource.id+'@'+resource.version;
const report={status:'running',scope:'Native stockroom views, separate load appearances, actual hinged cabinet, saved state and recovery.',
  recordingRequested:record,rooms:[],files:[],browserErrors:[]};
let output,bundle,batch,manifest,files,server,devServer,created,temp,chromium,three,base,context,page,stage,activeVideo;
const seenAssets=new Set();

async function pinned(relative){
  const row=files.get(relative);assert(row,'Missing package file '+relative);
  const bytes=await fs.readFile(path.join(bundle,relative));
  assert.equal(bytes.length,row.bytes,relative);assert.equal(sha(bytes),row.sha256,relative);
  return bytes;
}
async function prepare(){
  bundle=await fs.realpath(input);
  const {checkManagedOutput,findManagedProject}=await import('./package-company.mjs');
  const project=await fs.realpath(await findManagedProject(source)??source);
  output=path.resolve(project,args.at(-1));
  await checkManagedOutput(output,source,{allowDelivery:false});
  const relative=path.relative(bundle,output);
  assert(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Evidence cannot overlap input');
  const script=await fs.readFile(__filename);
  report.scriptSha256=sha(script);
  let lock;
  if(dev){
    const info=JSON.parse(await fs.readFile(path.join(bundle,'company-build-info.json')));
    assert.equal(info.shortId,pin);
    report.build=pin;report.sourceDigest=info.sourceDigest;
    batch=await fs.realpath(args[0]);
    lock=await fs.readFile(path.join(source,'prototype/package-lock.json'));
  }else{
    const bytes=await fs.readFile(path.join(bundle,'transfer-manifest.json'));
    assert.equal(sha(bytes),pin);
    manifest=JSON.parse(bytes);
    assert.equal(manifest.schema,'company-transfer');assert.equal(manifest.version,1);
    files=new Map(manifest.files.map(row=>[row.path,row]));assert.equal(files.size,manifest.files.length);
    assert(script.equals(await pinned('source/scripts/company-platform/qa-public-storage.cjs')));
    await pinned('verify.mjs');
    const {stdout}=await execute(process.execPath,[path.join(bundle,'verify.mjs'),bundle,pin],
      {cwd:bundle,windowsHide:true,timeout:60_000,maxBuffer:2*1024*1024});
    report.packageVerification=JSON.parse(stdout);
    assert(report.packageVerification.ok&&report.packageVerification.checkedFiles===files.size);
    report.manifestSha256=pin;report.build=manifest.buildId;report.sourceDigest=manifest.sourceDigest;
    lock=await pinned('source/prototype/package-lock.json');
  }
  let proto;
  for(const owner of new Set([source,project])){
    const candidate=path.join(owner,'prototype');
    const localLock=await fs.readFile(path.join(candidate,'package-lock.json')).catch(e=>{if(e.code!=='ENOENT')throw e;});
    const playwright=await fs.stat(path.join(candidate,'node_modules/playwright')).catch(e=>{if(e.code!=='ENOENT')throw e;});
    if(localLock?.equals(lock)&&playwright?.isDirectory()){proto=candidate;break;}
  }
  assert(proto,'Install the pinned prototype dependencies in an editable working copy for browser QA');
  chromium=createRequire(path.join(proto,'package.json'))('playwright').chromium;
  three=await fs.readFile(path.join(proto,'node_modules/three/build/three.core.js'),'utf8');
  report.dependencyLockSha256=sha(lock);
  await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);created=true;
  temp=await fs.mkdtemp(path.join(output,'browser-temp-'));
  for(const key of ['TEMP','TMP','TMPDIR'])process.env[key]=temp;
}
async function serve(){
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

async function open(profile,video=false){
  context=await chromium.launchPersistentContext(profile,{headless:true,viewport,deviceScaleFactor:1,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-networking',`--disk-cache-dir=${path.join(profile,'cache')}`],
    ...(video?{recordVideo:{dir:temp,size:viewport}}:{})});
  context.setDefaultTimeout(25_000);
  await context.route(`**${mathModule}`,route=>route.fulfill({contentType:'text/javascript',body:three}));
  page=context.pages()[0]??await context.newPage();
  const responses=new Map();
  page.on('response',response=>responses.set(new URL(response.url()).pathname,response));
  page.on('pageerror',error=>report.browserErrors.push({stage,message:error.message}));
  page.on('console',event=>{
    if(event.type()==='error'&&!event.location().url.endsWith('/favicon.ico'))report.browserErrors.push({stage,message:event.text()});
  });
  return responses;
}
async function close(){
  if(!context)return;
  const browser=context.browser();
  await context.close();if(browser)assert.equal(browser.isConnected(),false);
  context=null;page=null;
}
async function ready(){
  await page.waitForFunction(()=>window.company?.editor&&company.buildInfo&&
    document.querySelector('#status').dataset.error!==undefined&&!document.querySelector('#mode-room').disabled);
  const status=page.locator('#status');
  assert.equal(await status.getAttribute('data-error'),'false',await status.textContent());
}
const current=()=>page.evaluate(()=>company.session.document);
const saved=key=>page.evaluate(id=>company.session.readSavedText(id),key);
async function shot(name){
  const bytes=await page.screenshot({path:path.join(output,name)});
  report.files.push({name,bytes:bytes.length,sha256:sha(bytes)});
}
async function hold(ms){if(record)await page.waitForTimeout(ms);}
async function archive(video,name,partial=false){
  const raw=await fs.realpath(await video.path());
  assert.equal(path.dirname(raw),temp);
  const bytes=await fs.readFile(raw);assert(bytes.length>1024);
  await fs.rename(raw,path.join(output,name));
  report.files.push({name,bytes:bytes.length,sha256:sha(bytes),viewport,playbackRate:1,partial});
}

async function fixture(key,index){
  const file=dev?path.join(batch,key,'save.json'):path.join(bundle,'data/rooms',key,'save.json');
  const bytes=dev?await fs.readFile(file):await pinned(`data/rooms/${key}/save.json`);
  const layout=dev?await fs.readFile(path.join(batch,key,'layout.json')):await pinned(`data/rooms/${key}/layout.json`);
  const {schema,document:doc}=JSON.parse(bytes);
  assert.equal(schema,'company-save');assert.equal(doc.id,key);assert.deepEqual(doc,JSON.parse(layout));
  const floorId=key+'/'+(index?'upper':'ground'),areaId=floorId+'/stock';
  const ids={rack:areaId+'/rack',cart:areaId+'/cart',cabinet:areaId+'/cabinet',rackBox:areaId+'/rack/box',cartBox:areaId+'/cart/box'};
  const node=id=>doc.nodes.find(n=>n.id===id);
  const area=node(areaId),floor=node(floorId);
  assert.equal(area.kind,'area');assert.equal(area.publicRole,'storage-cleaning');
  assert.equal(area.parentId,floorId);assert.equal(floor.kind,'floor');
  if(index)assert(!doc.nodes.some(n=>n.parentId===key+'/ground'&&n.publicRole==='storage-cleaning'));
  assert.equal(doc.nodes.filter(n=>n.parentId===floorId&&n.kind==='room').length,16);
  const portal=floor.connections.find(c=>[c.from,c.to].some(side=>side.regionId===areaId));
  const opening=[portal.from,portal.to].find(a=>a.regionId===areaId);
  const adjacent=[portal.from,portal.to].find(a=>a.regionId!==areaId);
  assert.equal(opening.edge,'east');assert.equal(opening.offset,0);assert.equal(opening.width,1.4);
  assert.equal(node(adjacent.regionId).publicRole,index?'restroom-access':'lobby');
  const initialLook=index?['sealed-carton','linen-tray']:['open-carton','caddy'];
  const hostSurfaces=['middle',index?'upper':'lower'];
  assert.equal(doc.publicStorageRooms?.length,1);
  const [rule]=doc.publicStorageRooms;
  assert.equal(rule.regionId,areaId);assert.equal(rule.portalId,portal.id);
  assert.equal(rule.rackId,ids.rack);assert.equal(rule.cartId,ids.cart);assert.equal(rule.cabinetId,ids.cabinet);
  assert.equal(rule.picks.length,2);
  for(const [i,host] of ['rack','cart'].entries()){
    assert.equal(node(ids[host]).parentId,areaId);
    const child=node(ids[host+'Box']);
    assert.equal(child.parentId,ids[host]);
    assert.equal(ref(child.resource),'cleaning-load-'+initialLook[i]+'@1');
    assert.equal(child.attachment.surfaceId,hostSurfaces[i]);
    assert(rule.picks.some(pick=>pick.hostId===ids[host]&&pick.surfaceId===hostSurfaces[i]&&pick.loadId===child.id));
  }
  assert.equal(node(ids.cabinet).parentId,areaId);
  return {key,index,file,bytes,doc,area,ids,portal:portal.id};
}

async function visit(room,responses,named=true,direct=false){
  const url=new URL(base);
  if(named&&!dev)url.searchParams.set('delivery',room.key);
  if(direct)url.searchParams.set('object',room.ids.cart);
  await page.goto(url.href);await ready();
  const info=await page.evaluate(()=>company.buildInfo);
  assert.equal(info.shortId,report.build);assert.equal(info.sourceDigest,report.sourceDigest);
  if(named&&dev){
    const menu=page.locator('details.file-menu');
    await menu.locator('summary').click();
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#import').click()]);
    await chooser.setFiles(room.file);
    if(await menu.evaluate(node=>node.open))await menu.locator('summary').click();
  }
  await page.waitForFunction(id=>company.session.document.id===id,room.key);
  await ready();
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
async function enter(room){
  const floor=room.area.parentId,current=await page.evaluate(()=>company.session.scene.view.floorId);
  if(current!==floor){
    await page.locator('#floor').selectOption(floor);
    await page.waitForFunction(id=>company.session.scene.view.floorId===id&&!document.querySelector('#room').disabled,floor);
  }
  const picker=page.locator('#room');
  assert((await picker.locator('option').evaluateAll(opts=>opts.map(o=>o.value))).includes(room.area.id));
  await picker.selectOption(room.area.id);
  await page.waitForFunction(({floor,id})=>company.session.scene.view.mode==='room'&&company.session.scene.view.roomId===id&&
    company.session.scene.view.floorId===floor,{floor,id:room.area.id});
  assert((await picker.locator('option:checked').textContent()).includes(room.area.name));
  await ready();
}
async function select(id,focus=false){
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(id);
  assert.equal(await page.locator('#edit-instance').inputValue(),id);
  if(focus)await page.locator('#edit-focus').click();
}

async function inspect(room,responses,projections=false){
  const actual=await page.evaluate(async({ids,areaId,mathModule,projections})=>{
    const {Box3,Vector3,Raycaster}=await import(mathModule);
    const {camera,renderer,session:{scene,document:doc}}=company;
    company.drawHostFrame();camera.updateMatrixWorld(true);scene.root.updateMatrixWorld(true);
    const area=scene.root.getObjectByName(areaId);
    const roots=Object.fromEntries(Object.entries(ids).map(([role,id])=>[role,scene.root.getObjectByName(id)]));
    const node=(role)=>doc.nodes.find(n=>n.id===ids[role]);
    const resource=(role)=>company.catalog.resources.find(r=>r.id===node(role).resource.id&&r.version===node(role).resource.version);
    const owns=(item,parent)=>{for(let n=item;n;n=n.parent)if(n===parent)return true;return false;};
    const visible=[];
    if(projections)scene.root.traverseVisible(o=>{if(o.isMesh&&[o.material].flat().some(m=>m.visible&&m.opacity>0))visible.push(o);});
    const clean=v=>v.toArray().map(n=>Number(n.toFixed(8))||0);
    function projection(box,object){
      if(!projections)return undefined;
      const vertices=[];
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])
        vertices.push(new Vector3(x,y,z).project(camera));
      const clipped=x=>Math.max(-1,Math.min(1,x));
      const x=clipped(Math.min(...vertices.map(p=>p.x))),y=clipped(Math.min(...vertices.map(p=>p.y)));
      const w=clipped(Math.max(...vertices.map(p=>p.x)))-x,h=clipped(Math.max(...vertices.map(p=>p.y)))-y;
      let firstHits=0;const ray=new Raycaster();
      for(const u of [.08,.22,.36,.5,.64,.78,.92])for(const v of [.08,.22,.36,.5,.64,.78,.92]){
        ray.setFromCamera({x:x+w*u,y:y+h*v},camera);
        if(owns(ray.intersectObjects(visible,false)[0]?.object,object))firstHits++;
      }
      return {w:Math.round(w*renderer.domElement.width/2),h:Math.round(h*renderer.domElement.height/2),firstHits};
    }
    const items={};
    for(const [role,object] of Object.entries(roots)){
      const host=role.endsWith('Box')?role.slice(0,-3):null;
      if(!object||object.parent!==(host?roots[host]:area))throw Error('Missing actual model or wrong parent: '+role);
      const model=node(role),r=resource(role);
      const bounds=new Box3(),body=[],inverse=object.matrixWorld.clone().invert(),point=new Vector3();
      let count=0;
      object.traverse(mesh=>{
        if(!mesh.isMesh||(['rack','cart'].includes(role)&&owns(mesh,roots[role+'Box'])))return;
        const p=mesh.geometry.attributes.position;
        if(!p)return;
        count+=(mesh.geometry.index?.count??p.count)/3;
        const local=inverse.clone().multiply(mesh.matrixWorld);
        for(let i=0;i<p.count;i++){
          point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);bounds.expandByPoint(point);
          point.fromBufferAttribute(p,i).applyMatrix4(local);body.push(...point.toArray().map(n=>Math.round(n*1e6)));
        }
      });
      if(!count)throw Error('No real triangles in '+role);
      const digest=await crypto.subtle.digest('SHA-256',new Int32Array(body));
      const geometry=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      items[role]={id:model.id,parentId:model.parentId,ref:model.resource,state:model.state,transform:model.transform,
        world:object.matrixWorld.toArray(),triangles:count,asset:r.asset,geometry,projection:projection(bounds,object)};
      if(host){
        const surface=model.attachment?.surfaceId,definition=resource(host);
        const plateNode=definition.supportNodes?.[surface];
        const plate=roots[host].getObjectByName(plateNode);
        if(!surface||!plate||!plate.isMesh||owns(plate,object))throw Error('No independent host support mesh for '+role);
        const b=new Box3().setFromObject(plate,true);
        items[role].support={surface,mesh:plateNode,host:roots[host].name,top:b.max.y,loadBottom:bounds.min.y,
          loadMin:clean(bounds.min),loadMax:clean(bounds.max),visibility:projection(b,plate)};
      }
    }
    const r=resource('cabinet'),p=r.movingParts.find(part=>part.stateField==='openFraction');
    const pivot=roots.cabinet.getObjectByName(r.partNodes[p.id]),panel=pivot?.getObjectByName(r.partPanels[p.id]);
    if(!pivot||!panel?.isMesh||p.axis!=='y')throw Error('Missing real hinged parts');
    items.cabinet.hinge={name:pivot.name,panel:panel.name,rotation:pivot.rotation.y,limits:p.rotationRange,matrix:panel.matrixWorld.toArray()};
    return {items,sceneId:scene.root.uuid,view:scene.view};
  },{ids:room.ids,areaId:room.area.id,mathModule,projections});
  for(const item of Object.values(actual.items)){
    assert(item.asset&&item.triangles>0);
    if(seenAssets.has(item.asset.sha256))continue;
    const response=responses.get(item.asset.url);
    assert.equal(response?.status(),200,'Missing browser GLB response '+item.asset.url);
    const bytes=await response.body();assert.equal(bytes.length,item.asset.bytes);assert.equal(sha(bytes),item.asset.sha256);
    if(!dev)assert((await pinned('viewer'+item.asset.url)).equals(bytes));
    seenAssets.add(item.asset.sha256);
  }
  const {rackBox,cartBox,cabinet}=actual.items;
  assert.notEqual(rackBox.support.host,cartBox.support.host);
  assert.notEqual(rackBox.support.mesh,cartBox.support.mesh);
  for(const load of [rackBox,cartBox])assert(Math.abs(load.support.top-load.support.loadBottom)<.001,
    load.id+' actual load bottom is separated from the declared real shelf');
  const fraction=cabinet.state.openFraction,[closed,opened]=cabinet.hinge.limits;
  assert(Math.abs(cabinet.hinge.rotation-(closed+(opened-closed)*fraction))<1e-6);
  return actual;
}
function fixedGeometry(item){
  const {projection,...copy}=item;
  if(copy.support){const {visibility,...support}=copy.support;copy.support=support;}
  return copy;
}
async function overview(room,responses,filename){
  await page.locator('.view-toolbar [data-view="room"]').click();
  const actual=await inspect(room,responses,true);
  for(const role of ['rackBox','cartBox']){
    const model=actual.items[role],p=model.projection,plate=model.support.visibility;
    assert(p.w>=10&&p.h>=7&&p.firstHits>0,role+' is hidden in the native room view '+JSON.stringify(p));
    assert(plate.firstHits>0,role+' supporting plate is hidden in the native room view '+JSON.stringify(plate));
  }
  await shot(filename);return actual;
}
async function replaceLooks(room,responses,role){
  const id=room.ids[role],other=role==='rackBox'?'cartBox':'rackBox';
  await select(id,true);
  const menu=page.locator('#edit-look');
  assert.deepEqual(await menu.locator('option').evaluateAll(rows=>rows.map(row=>row.value).filter(Boolean).sort()),[...looks].sort());
  const origin=(await inspect(room,responses)).items;
  const first=ref(origin[role].ref);
  const sequence=looks.filter(key=>key!==first).concat(first);
  const finalLooks=room.index
    ? {rackBox:'linen-tray',cartBox:'open-carton'}
    : {rackBox:'caddy',cartBox:'sealed-carton'};
  const savedLook='cleaning-load-'+finalLooks[role]+'@1';
  assert.notEqual(savedLook,first);
  sequence.push(savedLook);
  const records=[];
  for(const [i,key] of sequence.entries()){
    const expected=await current(),next={id:key.split('@')[0],version:1};
    expected.nodes.find(n=>n.id===id).resource=next;expected.revision++;
    await menu.selectOption(key);
    await page.waitForFunction(({id,key,rev})=>{
      const doc=company.session.document,n=doc.nodes.find(n=>n.id===id);
      return doc.revision===rev&&n.resource.id+'@'+n.resource.version===key;
    },{id,key,rev:expected.revision});
    await ready();assert.deepEqual(await current(),expected);
    const now=(await inspect(room,responses)).items;
    assert.deepEqual(fixedGeometry(now[other]),fixedGeometry(origin[other]));
    assert.deepEqual(now[role].world,origin[role].world);
    assert.equal(now[role].support.surface,origin[role].support.surface);
    assert.equal(now[role].support.mesh,origin[role].support.mesh);
    if(i<4){records.push(now[role]);await shot(room.key+'-'+role+'-'+next.id+'.png');}
    await hold(650);
  }
  assert.equal(new Set(records.map(row=>row.geometry)).size,4);
  assert.equal(new Set(records.map(row=>row.asset.sha256)).size,4);
  return {role,id,initial:first,savedLook:sequence.at(-1),records};
}
async function cabinet(room,responses){
  const id=room.ids.cabinet;
  await select(id,true);
  const slider=page.getByRole('slider',{name:'打开程度',exact:true});
  const before=(await inspect(room,responses)).items.cabinet.state.openFraction;
  const stages=before===0?[.5,1,0,.5]:[0,.5,1];
  const results=[];
  for(const fraction of stages){
    const expected=await current();expected.revision++;
    expected.nodes.find(n=>n.id===id).state.openFraction=fraction;
    if(fraction===.5){
      const box=await slider.boundingBox();
      assert(box&&box.width>20);
      await slider.click({position:{x:box.width/2,y:box.height/2}});
    }else await slider.press(fraction===0?'Home':'End');
    await page.waitForFunction(({id,fraction,revision})=>company.session.document.revision===revision&&
      company.session.document.nodes.find(n=>n.id===id).state.openFraction===fraction,{id,fraction,revision:expected.revision});
    await ready();assert.deepEqual(await current(),expected);
    assert.equal(Number(await slider.inputValue()),fraction);
    const currentCabinet=(await inspect(room,responses)).items.cabinet;
    if(!results.some(r=>r.state.openFraction===fraction)){
      results.push(currentCabinet);await shot(room.key+'-cabinet-'+String(fraction).replace('.','-')+'.png');
    }
    await hold(850);
  }
  assert.equal(new Set(results.map(r=>r.hinge.rotation)).size,3);
  assert.equal(new Set(results.map(r=>JSON.stringify(r.hinge.matrix))).size,3);
  return {states:results,final:stages.at(-1)};
}

async function rejectDoor(room,responses,originalSave){
  await select(room.ids.cart,true);
  for(const selector of ['#placement-tools','#placement-tools > details']){
    const details=page.locator(selector);
    if(!await details.evaluate(node=>node.open))await details.locator(':scope > summary').click();
  }
  const before=await current(),rendered=await inspect(room,responses);
  const target=[Number((room.area.bounds.width/2-.36).toFixed(3)),0,0];
  for(const [i,axis] of ['x','y','z'].entries()){
    const field=page.locator('#edit-'+axis);
    if(await field.isEnabled())await field.fill(String(target[i]));
    else assert.equal(Number(await field.inputValue()),target[i]);
  }
  await page.locator('#edit-yaw').selectOption('90');
  const start=report.browserErrors.length;
  const [consoleEvent]=await Promise.all([page.waitForEvent('console',e=>e.type()==='error'),page.locator('#edit-position').click()]);
  const error=await consoleEvent.args()[0].evaluate(e=>({code:e.code,path:e.path,details:e.details}));
  assert.deepEqual(report.browserErrors.splice(start),[{stage,message:consoleEvent.text()}]);
  assert.equal(error.code,'blocked-portal');assert.equal(error.path,room.portal);
  assert.equal(error.details.obstacleId,room.ids.cart);
  await page.waitForFunction(()=>document.querySelector('#status').dataset.error==='true'&&!document.querySelector('#edit-position').disabled);
  const message=await page.locator('#status').textContent();assert(message.includes('已保留'),message);
  const editor=page.locator('#edit-message');
  const editMessage=await editor.textContent();
  assert.equal(await editor.getAttribute('data-error'),'true');
  assert(editMessage.includes('堵住门口')&&editMessage.includes('已保留'),editMessage);
  assert.deepEqual(await current(),before);assert.equal(await saved(room.key),originalSave);
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'),'false');
  const after=await inspect(room,responses);
  assert.equal(after.sceneId,rendered.sceneId);assert.deepEqual(after.items,rendered.items);
  await shot(room.key+'-rejected.png');await hold(1100);
  return {target,error,message,editMessage,saveSha256:sha(originalSave),keptSceneId:after.sceneId};
}

async function exercise(room,profile,prior){
  const item={key:room.key,area:room.area.id,portal:room.portal,sourceSha256:sha(room.bytes)};
  report.rooms.push(item);
  stage=room.key+'/entry';
  let responses=await open(profile,record);
  if(record)activeVideo={key:room.key,video:page.video()};
  await visit(room,responses);await enter(room);
  item.overview=await overview(room,responses,room.key+'-overview.png');await hold(1350);
  item.looks=[];
  for(const role of ['rackBox','cartBox']){
    stage=room.key+'/'+role;item.looks.push(await replaceLooks(room,responses,role));
  }
  stage=room.key+'/cabinet';item.cabinet=await cabinet(room,responses);
  stage=room.key+'/save';
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false'&&!document.querySelector('#save').disabled);
  const bytes=await saved(room.key);assert.deepEqual(JSON.parse(bytes).document,await current());
  item.savedSha256=sha(bytes);
  const before=await inspect(room,responses);
  await shot(room.key+'-saved.png');await hold(1150);
  stage=room.key+'/door-rejection';item.rejected=await rejectDoor(room,responses,bytes);
  await close();
  if(activeVideo){await archive(activeVideo.video,room.key+'-normal.webm');activeVideo=null;}
  stage=room.key+'/cold';
  responses=await open(profile);await visit(room,responses,false);await enter(room);
  assert.deepEqual(await current(),JSON.parse(bytes).document);assert.equal(await saved(room.key),bytes);
  if(prior)assert.equal(await saved(prior.key),prior.text);
  const cold=await overview(room,responses,room.key+'-restored.png');
  for(const [role,state] of Object.entries(cold.items))assert.deepEqual(fixedGeometry(state),fixedGeometry(before.items[role]));
  item.cold={sha256:sha(await saved(room.key)),sameBytes:true,withoutDelivery:true};
  await close();return {key:room.key,text:bytes};
}
async function directUpper(room){
  stage=room.key+'/direct-url';
  const profile=await fs.mkdtemp(path.join(temp,'direct-'));
  const responses=await open(profile);
  await visit(room,responses,true,true);
  const view=await page.evaluate(()=>company.session.scene.view);
  assert.equal(view.floorId,room.area.parentId);assert.equal(view.roomId,room.area.id);assert.equal(view.mode,'room');
  const result=await overview(room,responses,room.key+'-direct-upper.png');
  await close();
  return {object:room.ids.cart,view:result.view,saveSha256:sha(room.bytes)};
}

(async()=>{
  stage='identities';await prepare();
  const rooms=await Promise.all(keys.map(fixture));
  base=await serve();
  const profile=await fs.mkdtemp(path.join(temp,'profile-'));
  const prior=await exercise(rooms[0],profile);
  await exercise(rooms[1],profile,prior);
  if(!dev)report.directUpper=await directUpper(rooms[1]);
  assert.deepEqual(report.browserErrors,[]);report.status='passed';
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
    if(temp){assert.equal(path.dirname(await fs.realpath(temp)),output);await fs.rm(temp,{recursive:true});}
    if(created)await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:report.status,...(created?{report:path.join(output,'report.json')}:{})}));
  }
});
