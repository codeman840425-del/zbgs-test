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
const flags=options.filter(v=>v.startsWith('--')),args=options.filter(v=>!v.startsWith('--'));
const record=flags.includes('--record'),overrides=flags.filter(v=>v.startsWith('--room=')).map(v=>v.slice(7));
const revision=flags.includes('--folding-v2');
const dev=/^[a-f0-9]{12}$/.test(pin);
assert(input&&(dev||/^[a-f0-9]{64}$/.test(pin))&&args.length===(dev?2:1)&&
  flags.length===Number(record)+Number(revision)+overrides.length&&new Set(flags).size===flags.length&&overrides.length<=(revision?1:2)&&
  overrides.every(v=>/^[a-z][a-z0-9-]{0,62}$/.test(v)),
  'Use PACKAGE MANIFEST_SHA NEW_OUT or DIST BUILD BATCH_ROOT NEW_OUT [--record] [--room=KEY] [--folding-v2]');
assert(!args.at(-1).split(/[\\/]/).includes('..'),'Output path cannot contain traversal');
const source=path.resolve(__dirname,'../..');
const keys=overrides.length?overrides:revision?['absorber-studio']:['absorber-studio','absorber-rental'];
const variants=['folding','casters','double-sided','curved'].map(name=>'absorber-'+name+'@1');
const viewport={width:1600,height:900},mathModule='/__movable-absorber-qa/three.core.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const execute=promisify(execFile);
const ref=resource=>resource.id+'@'+resource.version;
const report={status:'running',scope:'Movable acoustic screen geometry, real placement, and cold recovery.',
  recordingRequested:record,foldingRevision:revision,rooms:[],files:[],browserErrors:[]};
let output,bundle,batch,manifest,files,server,devServer,created,temp,chromium,three,base,context,page,stage,activeVideo;


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
    assert(script.equals(await pinned('source/scripts/company-platform/qa-movable-absorber.cjs')));
    await pinned('verify.mjs');
    const {stdout}=await execute(process.execPath,[path.join(bundle,'verify.mjs'),bundle,pin],
      {cwd:bundle,windowsHide:true,timeout:60_000,maxBuffer:2*1024*1024});
    report.packageVerification=JSON.parse(stdout);
    assert(report.packageVerification.ok&&report.packageVerification.checkedFiles===files.size);
    report.manifestSha256=pin;report.build=manifest.buildId;report.sourceDigest=manifest.sourceDigest;
    lock=await pinned('source/prototype/package-lock.json');
  }
  for(const inputPath of [bundle,batch].filter(Boolean)){
    const relative=path.relative(inputPath,output);
    assert(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Evidence cannot overlap input');
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

const node=(doc,id)=>doc.nodes.find(row=>row.id===id);
const lowAngle=yaw=>((Math.round(yaw*180/Math.PI)%360)+360)%360;
const nextTurn=yaw=>(lowAngle(yaw)+90)%360*Math.PI/180;
const round=n=>Number(n.toFixed(4));

async function visit(key,responses,savedId){
  const save='data/rooms/'+key+'/save.json',fixture=dev?path.join(batch,key,'save.json'):path.join(bundle,save);
  const bytes=savedId?null:dev?await fs.readFile(fixture):await pinned(save),url=new URL(base);
  const id=savedId??JSON.parse(bytes).document.id;
  if(!dev&&!savedId)url.searchParams.set('delivery',key);
  await page.goto(url.href);await ready();
  const info=await page.evaluate(()=>company.buildInfo);
  assert.equal(info.shortId,report.build);assert.equal(info.sourceDigest,report.sourceDigest);
  if(dev&&!savedId){
    const menu=page.locator('details.file-menu');await menu.locator('summary').click();
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#import').click()]);
    await chooser.setFiles(fixture);
    if(await menu.evaluate(n=>n.open))await menu.locator('summary').click();
  }
  await page.waitForFunction(id=>company.session.document.id===id,id);await ready();
  if(savedId){
    assert.equal(await page.locator('#status').textContent(),'已恢复上次保存的方案。');
    assert(![...responses.keys()].some(url=>url==='/delivery-save.json'||url.startsWith('/delivery-room/')));
  }else{
    const envelope=JSON.parse(bytes);assert.equal(envelope.schema,'company-save');
    assert.deepEqual(await current(),envelope.document);
    if(!dev){const response=responses.get('/delivery-room/'+key+'.json');assert.equal(response?.status(),200);assert(bytes.equals(await response.body()));}
  }
  return bytes;
}

async function getRoom(key){
  const doc=await current();
  const ids=await page.evaluate(()=>company.session.document.nodes.filter(n=>n.kind==='facility'&&company.catalog.resources.some(r=>
    r.id===n.resource.id&&r.version===n.resource.version&&r.mountRole==='movable-absorber-screen')).map(n=>n.id));
  assert.equal(ids.length,1,'Expected exactly one movable absorber in '+doc.id);
  const screen=node(doc,ids[0]),area=node(doc,screen.parentId),floor=node(doc,area.parentId);
  assert(['room','area'].includes(area.kind)&&floor.kind==='floor');
  const sides=[...(floor.exteriorEntrances??[]),...(floor.connections??[]).flatMap(c=>[c.from,c.to].map(s=>({...s,id:c.id})))];
  const own=sides.filter(s=>s.regionId===area.id);
  assert.equal(own.length,1,'Room needs exactly one actual portal for this fixture '+area.id);
  const portal=own[0],direction=['north','west'].includes(portal.edge)?-1:1;
  const horizontal=['north','south'].includes(portal.edge),depth=horizontal?area.bounds.depth:area.bounds.width;
  const studio=key==='absorber-studio';
  const wall=round(direction*(depth/2-.36)),along=round(portal.offset+.86);
  const doorway=studio?{position:[along,0,wall],yaw:0}:{position:[1.44,0,.46],yaw:0};
  const shift=studio?[0,0,-.18]:[.02,0,.04];
  const rotated={position:screen.transform.position,yaw:nextTurn(screen.transform.yaw)};
  const moved={position:screen.transform.position.map((v,i)=>round(v+shift[i])),yaw:rotated.yaw};
  return {key,company:doc.id,roomId:area.id,floorId:floor.id,screen,portal,doorway,rotated,moved};
}

async function enter(room){
  const view=await page.evaluate(()=>company.session.scene.view);
  if(view.mode==='building'){
    const facade=page.locator('.company-building-view__facade');
    if(await facade.isVisible())await facade.click();
    await page.locator('button[data-floor-id='+JSON.stringify(room.floorId)+']').click();
  }else if(view.floorId!==room.floorId)await page.locator('#floor').selectOption(room.floorId);
  await page.waitForFunction(floor=>company.session.scene.view.floorId===floor&&!document.querySelector('#room').disabled,room.floorId);
  await page.locator('#room').selectOption(room.roomId);
  await page.waitForFunction(room=>company.session.scene.view.roomId===room&&company.session.scene.view.mode==='room',room.roomId);
  await ready();
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(room.screen.id);
}
const focus=()=>page.locator('#edit-focus').click();

async function inspect(room,responses){
  const result=await page.evaluate(async({id,roomId,mathModule})=>{
    const {Vector3,Box3,Raycaster}=await import(mathModule);
    const {session:{scene,document:doc},catalog,camera,renderer}=company;
    company.drawHostFrame();camera.updateMatrixWorld(true);scene.root.updateMatrixWorld(true);
    const node=doc.nodes.find(n=>n.id===id),resource=catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version);
    const screen=scene.root.getObjectByName(id),floor=scene.root.getObjectByName('Floor:'+roomId);
    const {object,...obstacle}=scene.navigation().obstacles.find(o=>o.instanceId===id);
    if(!floor?.isMesh||object!==screen||screen.parent?.name!==roomId)throw Error('Missing actual floor-mounted navigational screen');
    const inverse=screen.matrixWorld.clone().invert(),whole=new Box3(),parts=[],coordinates=[];
    const panelFront=screen.getWorldDirection(new Vector3()),panelOrigin=screen.getWorldPosition(new Vector3());
    const ownVisible=new Set(),visible=[];
    scene.root.traverseVisible(mesh=>{if(mesh.isMesh&&[mesh.material].flat().some(m=>m.visible&&m.opacity>0))visible.push(mesh);});
    const clean=v=>v.toArray().map(n=>Number(n.toFixed(7)));
    const vertex=new Vector3(),bodyBounds=new Box3(),footBounds=new Box3();
    screen.traverseVisible(mesh=>{
      if(!mesh.isMesh||!mesh.geometry.getAttribute('position'))return;
      ownVisible.add(mesh);
      const {attributes,index}=mesh.geometry,local=new Box3(),world=new Box3(),matrix=inverse.clone().multiply(mesh.matrixWorld);
      const group=[];
      for(let i=0;i<attributes.position.count;i++){
        mesh.getVertexPosition(i,vertex).applyMatrix4(mesh.matrixWorld);world.expandByPoint(vertex);
        mesh.getVertexPosition(i,vertex).applyMatrix4(matrix);local.expandByPoint(vertex);
        group.push(vertex.toArray().map(n=>Math.round(n*1e5)).join(','));
      }
      coordinates.push(group.sort().join(';'));whole.union(local);
      const ground=local.min.y<.001&&local.max.y<.40;
      const name=(mesh.userData.name||mesh.name).toLowerCase().replaceAll(/[^a-z0-9]+/g,'-');
      parts.push({name,min:clean(local.min),max:clean(local.max),triangles:(index?.count??attributes.position.count)/3,ground});
      if(ground)footBounds.union(world);
      else bodyBounds.union(world);
    });
    function measure(box){
      const corners=[];
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])
        corners.push(new Vector3(x,y,z).project(camera));
      const x=Math.min(...corners.map(v=>v.x)),y=Math.min(...corners.map(v=>v.y));
      const w=Math.max(...corners.map(v=>v.x))-x,h=Math.max(...corners.map(v=>v.y))-y;
      const ray=new Raycaster(),rect=renderer.domElement.getBoundingClientRect();
      let first=0,framed=0;
      for(const u of [.08,.22,.36,.5,.64,.78,.92])for(const v of [.08,.22,.36,.5,.64,.78,.92]){
        const p={x:x+w*u,y:y+h*v};if(Math.abs(p.x)>=1||Math.abs(p.y)>=1)continue;
        framed++;ray.setFromCamera(p,camera);
        if(ownVisible.has(ray.intersectObjects(visible,false)[0]?.object))first++;
      }
      return {width:w*rect.width/2,height:h*rect.height/2,framed,first};
    }
    const bytes=new TextEncoder().encode(coordinates.sort().join('|'));
    const geometry=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const gap=screen.localToWorld(new Vector3(0,whole.min.y,0)).y-new Box3().setFromObject(floor,true).max.y;
    return {node,asset:resource.asset,acoustic:resource.acoustic,mounting:resource.mounting,obstacle,world:screen.matrixWorld.toArray(),
      gap,geometry,parts,bounds:{min:clean(whole.min),max:clean(whole.max)},root:scene.root.uuid,view:scene.view,
      presentation:{facing:Math.abs(panelFront.dot(camera.position.clone().sub(panelOrigin).normalize())),body:measure(bodyBounds),foot:measure(footBounds)}};
  },{id:room.screen.id,roomId:room.roomId,mathModule});
  assert.equal(result.view.roomId,room.roomId);assert.equal(result.view.floorId,room.floorId);
  assert.deepEqual(result.mounting,{origin:'bottom',width:1.2,height:1.8,depth:.38});
  assert.deepEqual(result.obstacle.footprint,{center:[0,0],halfSize:[.6,.19],blocking:true});
  const {obstacle,world}=result,expected=[
    Math.abs(world[0])*.6+Math.abs(world[8])*.19,Math.abs(world[2])*.6+Math.abs(world[10])*.19,
  ];
  result.navigationPadding=[obstacle.hw-expected[0],obstacle.hd-expected[1]];
  assert(result.navigationPadding.every(value=>Math.abs(value-.22)<1e-6),
    JSON.stringify({physicalHalfExtents:expected,navigationHalfExtents:[obstacle.hw,obstacle.hd]}));
  assert(Math.abs(result.gap)<.001&&result.bounds.max[1]>1.7&&result.bounds.max[1]<1.801);
  assert(result.bounds.min[0]>=-.601&&result.bounds.max[0]<=.601&&result.bounds.min[2]>=-.191&&result.bounds.max[2]<=.191);
  assert(result.parts.filter(part=>part.ground).length>=2,'Missing ground-contact meshes');
  const type=result.node.resource.id.replace('absorber-','');
  assert.deepEqual(result.acoustic,{purpose:'movable-absorber-screen',construction:type,configuration:'fixed-deployed'});
  if(type==='casters')assert.equal(result.parts.filter(part=>/^wheel-/.test(part.name)&&part.ground).length,4);
  if(type==='folding'){
    assert.equal(result.parts.filter(part=>/^folding-leaf-\d+$/.test(part.name)).length,result.node.resource.version===2?4:3);
    assert(result.parts.some(part=>/^hinge-/.test(part.name)));
  }
  if(type==='curved')assert(result.parts.some(part=>part.name==='curved-core'));
  if(type==='double-sided')assert(result.parts.some(part=>/^acoustic-tile-/.test(part.name)&&part.min[2]<0&&part.max[2]>0));
  const response=responses.get(result.asset.url);assert.equal(response?.status(),200,result.asset.url);
  const bytes=await response.body();
  assert.equal(bytes.length,result.asset.bytes);assert.equal(sha(bytes),result.asset.sha256);
  if(!dev)assert(bytes.equals(await pinned('viewer'+result.asset.url)));
  return result;
}

async function flank(){
  const canvas=await page.locator('#stage canvas').boundingBox(),x=canvas.x+canvas.width*.67,y=canvas.y+canvas.height*.55;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x-canvas.height*.14,y,{steps:9});await page.mouse.up();
}
function framing(panel,side){
  const p=panel.presentation;
  assert(p.body.first>=5&&p.body.height>100&&p.foot.first>0,JSON.stringify(p));
  assert(side?p.facing<.5:p.facing>.5,JSON.stringify(p));
}

async function replace(room,target){
  const expected=await current(),n=node(expected,room.screen.id),[id,version]=target.split('@');
  if(ref(n.resource)===target)return;
  const defaults=await page.evaluate(ref=>company.catalog.resources.find(r=>r.id===ref.id&&r.version===ref.version).stateDefaults,n.resource);
  n.state={...defaults,...n.state};n.resource={id,version:Number(version)};expected.revision++;
  await page.locator('#edit-look').selectOption(target);
  await unchangedExcept(expected);
}
async function unchangedExcept(expected){
  await page.waitForFunction(revision=>company.session.document.revision===revision,expected.revision);
  await ready();assert.deepEqual(await current(),expected);
}

async function placement(room,label,target){
  const before=await current();
  await page.locator('#placement-tools > summary').click();
  await page.locator('#edit-move').click();
  await page.waitForFunction(()=>company.editor.placement.active&&document.querySelector('#placement-status').textContent.includes('绿色'));
  const point=await page.evaluate(({roomId,target})=>{
    const {camera,renderer,session:{scene}}=company;
    const box=renderer.domElement.getBoundingClientRect(),room=scene.root.getObjectByName(roomId);
    const screen=room.localToWorld(camera.position.clone().fromArray(target)).project(camera);
    return [box.left+(screen.x+1)*box.width/2,box.top+(1-screen.y)*box.height/2];
  },{roomId:room.roomId,target});
  await page.mouse.move(...point);
  await page.waitForFunction(()=>document.querySelector('#placement-status').dataset.valid==='true');
  const map=await page.evaluate(()=>company.editor.placement.snapshot());
  assert.deepEqual(map.point,target);assert.equal(map.step,.2);
  await shot(label+'-footprint.png');await hold(850);
  await page.locator('#placement-cancel').click();
  assert.deepEqual(await current(),before);
  return {target,step:map.step,checked:map.checked,total:map.total};
}

async function moveFields(transform){
  for(const selector of ['#placement-tools','#placement-tools > details']){
    const details=page.locator(selector);
    if(!await details.evaluate(node=>node.open))await details.locator(':scope > summary').click();
  }
  assert(await page.locator('#edit-y').isDisabled()&&transform.position[1]===0);
  for(const [axis,i] of [['x',0],['z',2]])await page.locator('#edit-'+axis).fill(String(transform.position[i]));
  await page.locator('#edit-yaw').selectOption(String(lowAngle(transform.yaw)));
}

async function rejectDoor(room,text){
  const before=await current(),root=await page.evaluate(()=>company.session.scene.root.uuid);
  await moveFields(room.doorway);
  const start=report.browserErrors.length;
  const [event]=await Promise.all([page.waitForEvent('console',e=>e.type()==='error'),page.locator('#edit-position').click()]);
  assert.deepEqual(report.browserErrors.splice(start),[{stage,message:event.text()}]);
  const error=await event.args()[0].evaluate(e=>({code:e.code,path:e.path,details:e.details}));
  assert.equal(error.code,'blocked-portal');assert.equal(error.path,room.portal.id);
  assert.equal(error.details?.obstacleId,room.screen.id);
  await page.waitForFunction(()=>document.querySelector('#status').dataset.error==='true'&&!document.querySelector('#edit-position').disabled);
  const message=await page.locator('#edit-message').textContent();assert(message.includes('门口')&&message.includes('已保留'),message);
  assert.deepEqual(await current(),before);assert.equal(await saved(room.company),text);
  assert.equal(await page.evaluate(()=>company.session.scene.root.uuid),root);
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'),'false');
  await shot(room.key+'-rejected-door.png');await hold(950);
  return {attempt:room.doorway,error,message,sameSave:true};
}

async function save(room){
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false'&&!document.querySelector('#save').disabled);
  const text=await saved(room.company);
  assert.deepEqual(JSON.parse(text).document,await current());
  return text;
}
const physical=({presentation,view,root,...body})=>body;
async function cold(room,profile,text,expected,prior){
  const responses=await open(profile);
  await visit(room.key,responses,room.company);
  assert.equal(await saved(room.company),text);
  assert.deepEqual(await current(),JSON.parse(text).document);
  for(const previous of prior)assert.equal(await saved(previous.id),previous.text);
  await enter(room);await focus();
  const panel=await inspect(room,responses);
  assert.deepEqual(physical(panel),physical(expected));
  const image=room.key+'-restored-'+ref(panel.node.resource).replace('@','-v')+'.png';
  await shot(image);
  return {ref:ref(panel.node.resource),sha256:sha(text),sameBytes:true,withoutDelivery:true,image,responses};
}

async function exercise(key,index,profile,prior){
  stage=key+'/import';
  const responses=await open(profile,record);
  if(record)activeVideo={key,video:page.video()};
  const bytes=await visit(key,responses),room=await getRoom(key);
  const receipt={room,inputSha256:sha(bytes),looks:[],cold:[]};report.rooms.push(receipt);
  await enter(room);
  const original=ref(room.screen.resource),primary=index?variants[2]:variants[3],secondary=index?variants[1]:variants[0];
  const sequence=revision?[original,'absorber-folding@2']:[original,...variants.filter(v=>v!==original&&v!==primary),primary];
  if(revision)assert.equal(original,'absorber-folding@1','Receiver fixture must start with the original folding resource');
  for(const target of new Set(sequence)){
    stage=key+'/'+target;
    await replace(room,target);await focus();
    const side=index===1;
    if(side)await flank();
    const panel=await inspect(room,responses);framing(panel,side);
    assert.deepEqual(panel.node.transform,room.screen.transform);assert.equal(panel.node.parentId,room.roomId);
    const image=key+'-'+target.replace('@','-v')+'.png';
    await shot(image);await hold(750);
    receipt.looks.push({image,panel});
  }
  assert.equal(new Set(receipt.looks.map(o=>o.panel.geometry)).size,revision?2:4);
  assert.equal(new Set(receipt.looks.map(o=>o.panel.asset.sha256)).size,revision?2:4);
  const last=receipt.looks.at(-1).panel;
  let fitted=last;
  if(!revision){
    stage=key+'/footprint';
    receipt.footprint=await placement(room,key,room.screen.transform.position);
    stage=key+'/rotate';
    const rotated=await current();node(rotated,room.screen.id).transform=room.rotated;rotated.revision++;
    await page.locator('#edit-rotate').click();await unchangedExcept(rotated);
    const turned=await inspect(room,responses);
    assert.equal(turned.geometry,last.geometry);
    assert(Math.abs(turned.obstacle.hw-last.obstacle.hd)<1e-6&&Math.abs(turned.obstacle.hd-last.obstacle.hw)<1e-6);
    receipt.rotated=turned;await hold(700);
    stage=key+'/move';
    const moved=await current();node(moved,room.screen.id).transform=room.moved;moved.revision++;
    await moveFields(room.moved);await page.locator('#edit-position').click();await unchangedExcept(moved);
    await focus();fitted=await inspect(room,responses);
    assert.equal(fitted.geometry,last.geometry);receipt.moved=fitted;await hold(700);
  }
  stage=key+'/save';
  const text=await save(room);
  if(!revision){
    stage=key+'/blocked-portal';
    receipt.rejected=await rejectDoor(room,text);
    assert.equal(await save(room),text);
  }
  await focus();await shot(key+'-saved.png');await hold(1250);
  await close();
  if(activeVideo){await archive(activeVideo.video,key+'-normal.webm');activeVideo=null;}
  stage=key+'/cold1';
  const reopened=await cold(room,profile,text,fitted,prior);
  const {responses:coldResponses,...first}=reopened;receipt.cold.push(first);
  if(revision||keys.length===1){await close();return {id:room.company,text};}
  stage=key+'/cold2';
  await replace(room,secondary);await focus();
  const other=await inspect(room,coldResponses),savedOther=await save(room);
  await close();
  const {responses:ignored,...second}=await cold(room,profile,savedOther,other,prior);
  receipt.cold.push(second);
  await close();return {id:room.company,text:savedOther};
}

(async()=>{
  stage='identities';await prepare();base=await serve();
  const profile=await fs.mkdtemp(path.join(temp,'profile-')),prior=[];
  for(const [index,key] of keys.entries())prior.push(await exercise(key,index,profile,prior));
  if(!revision&&keys.length===2)assert.deepEqual(report.rooms.flatMap(o=>o.cold.map(c=>c.ref)).sort(),[...variants].sort());
  assert.deepEqual(report.browserErrors,[]);report.status='passed';
})().catch(async error=>{
  report.status='failed';report.failure={stage,message:error.message,stack:error.stack};console.error(error);process.exitCode=1;
  if(created&&page&&!page.isClosed())await shot('failure.png').catch(()=>{});
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
