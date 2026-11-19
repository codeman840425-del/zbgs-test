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
const dev=/^[a-f0-9]{12}$/.test(pin);
assert(input&&(dev||/^[a-f0-9]{64}$/.test(pin))&&args.length===(dev?2:1)&&
  flags.length===Number(record)+overrides.length&&new Set(flags).size===flags.length&&overrides.length<=2&&
  overrides.every(v=>/^[a-z][a-z0-9-]{0,62}$/.test(v)),
  'Use PACKAGE MANIFEST_SHA NEW_OUT or DIST BUILD BATCH_ROOT NEW_OUT, with optional --record and --room=KEY (up to twice)');
assert(!args.at(-1).split(/[\\/]/).includes('..'),'Output path cannot contain traversal');
const source=path.resolve(__dirname,'../..');
const keys=overrides.length?overrides:['rental-lounge','cool-studios'];
const viewport={width:1600,height:900},mathModule='/__studio-lounge-qa/three.core.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const execute=promisify(execFile);
const ref=resource=>resource.id+'@'+resource.version;
const report={status:'running',scope:'Live station and waiting-area assembly, real support geometry, native edits, and cold recovery.',
  recordingRequested:record,rooms:[],files:[],browserErrors:[],viewIssues:[]};
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
    assert(script.equals(await pinned('source/scripts/company-platform/qa-studio-lounge-set.cjs')));
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

function unique(items,label){
  assert.equal(items.length,1,label+' expected one match, got '+JSON.stringify(items.map(item=>item.id)));
  return items[0];
}

async function fixture(key){
  const file=dev?path.join(batch,key,'save.json'):path.join(bundle,'data/rooms',key,'save.json');
  const bytes=dev?await fs.readFile(file):await pinned('data/rooms/'+key+'/save.json');
  const envelope=JSON.parse(bytes);
  const layout=dev?await fs.readFile(path.join(batch,key,'layout.json')):await pinned('data/rooms/'+key+'/layout.json');
  assert.equal(envelope.schema,'company-save');
  assert.deepEqual(envelope.document,JSON.parse(layout));
  return {key,file,bytes,doc:envelope.document};
}

async function load(fixture,responses,cold=false){
  const url=new URL(base);
  if(!dev&&!cold)url.searchParams.set('delivery',fixture.key);
  await page.goto(url.href);await ready();
  const build=await page.evaluate(()=>company.buildInfo);
  assert.equal(build.shortId,report.build);assert.equal(build.sourceDigest,report.sourceDigest);
  if(dev&&!cold){
    const menu=page.locator('details.file-menu');
    await menu.locator('summary').click();
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#import').click()]);
    await chooser.setFiles(fixture.file);
    if(await menu.evaluate(node=>node.open))await menu.locator('summary').click();
  }
  await page.waitForFunction(id=>company.session.document.id===id,fixture.doc.id);await ready();
  if(cold){
    assert.equal(await page.locator('#status').textContent(),'已恢复上次保存的方案。');
    assert(![...responses.keys()].some(name=>name==='/delivery-save.json'||name.startsWith('/delivery-room/')));
  }else{
    assert.deepEqual(await current(),fixture.doc);
    if(!dev){
      const response=responses.get('/delivery-room/'+fixture.key+'.json');
      assert.equal(response?.status(),200);assert(fixture.bytes.equals(await response.body()));
    }
  }
}

async function discover(doc){
  const catalog=await page.evaluate(()=>company.catalog.resources);
  const resources=new Map(catalog.map(r=>[ref(r),r]));
  const resource=n=>n.resource&&resources.get(ref(n.resource));
  const {nodes}=doc;
  const children=id=>nodes.filter(n=>n.parentId===id);
  const branch=(n,role)=>resource(n)?.productionBranch===role;
  const isCup=n=>branch(n,'side-table-life-items')&&resource(n).provenance?.sourceDesign==='cup';
  const studio=n=>n.kind==='room'&&n.purpose==='streaming';
  const hosts=nodes.filter(studio).flatMap(live=>children(live.id).filter(n=>branch(n,'wall-shelf')&&
    children(n.id).length===2&&children(n.id).every(child=>child.attachment?.surfaceId&&resource(child)?.mount==='support-surface'))
    .map(shelf=>({id:shelf.id,shelf,live})));
  const {live,shelf}=unique(hosts,'Live room with populated wall shelf');
  const shelves=children(shelf.id);
  assert.equal(new Set(shelves.map(n=>n.attachment.surfaceId)).size,2,shelf.id);
  const stations=children(live.id).filter(n=>n.kind==='workstation');
  const equipped=stations.flatMap(station=>children(station.id).filter(n=>resource(n)?.mountRole==='desk')
    .map(desk=>({id:desk.id,station,desk,screens:children(desk.id).filter(n=>resource(n)?.mountRole==='monitor')}))
    .filter(pair=>pair.screens.length===2));
  const {station,desk,screens}=unique(equipped,'Dual-screen desk in the fitted live room');
  const main=unique(screens.filter(n=>n.stationId===station.id&&n.partKey==='monitor'),'Template monitor');
  const secondary=unique(screens.filter(n=>n.id!==main.id),'Second monitor on the same desk');
  for(const screen of screens)assert.equal(screen.state?.on??resource(screen).stateDefaults?.on,true,screen.id);
  const waiting=nodes.filter(n=>n.kind==='room'&&n.purpose==='rest'&&n.parentId===live.parentId)
    .flatMap(lounge=>children(lounge.id).filter(n=>branch(n,'side-table')).flatMap(table=>
      children(table.id).filter(n=>isCup(n)&&n.attachment?.surfaceId).map(cup=>({id:table.id,lounge,table,cup}))));
  const {lounge,table,cup}=unique(waiting,'Waiting room with purpose-built table and cup');
  const sofa=unique(children(lounge.id).filter(n=>resource(n)?.mountRole==='sofa'),'Waiting sofa');
  const areas={live:{room:live.id,floor:live.parentId,ids:{desk:desk.id,main:main.id,secondary:secondary.id,
    shelf:shelf.id,shelfItem1:shelves[0].id,shelfItem2:shelves[1].id}},
  lounge:{room:lounge.id,floor:lounge.parentId,ids:{sofa:sofa.id,table:table.id,cup:cup.id}}};
  return {station:station.id,areas};
}

async function enter(area){
  const view=()=>page.evaluate(()=>company.session.scene.view);
  const initial=await view();
  if(initial.mode==='building'){
    const facade=page.locator('.company-building-view__facade');
    if(await facade.isVisible())await facade.click();
    await page.locator('button[data-floor-id='+JSON.stringify(area.floor)+']').click();
  }else if(initial.floorId!==area.floor){
    await page.locator('#floor').selectOption(area.floor);
  }
  await page.waitForFunction(floor=>company.session.scene.view.floorId===floor&&!document.querySelector('#room').disabled,area.floor);
  await page.locator('#room').selectOption(area.room);
  await page.waitForFunction(room=>company.session.scene.view.mode==='room'&&company.session.scene.view.roomId===room,area.room);
  await ready();
  await page.locator('.view-toolbar [data-view="room"]').click();
  await page.locator('#wall-view').selectOption('cutaway');
  await ready();
}

async function select(id,focus=false){
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(id);
  assert.equal(await page.locator('#edit-instance').inputValue(),id);
  if(focus)await page.locator('#edit-focus').click();
}

async function inspect(area,responses){
  const evidence=await page.evaluate(async({area,mathModule})=>{
    const {Vector3,Box3,Raycaster}=await import(mathModule);
    const {session:{scene,document:doc},camera,renderer,catalog}=company;
    company.drawHostFrame();camera.updateMatrixWorld(true);scene.root.updateMatrixWorld(true);
    const root=scene.root,view=scene.view;
    const nodes=new Map(doc.nodes.map(n=>[n.id,n]));
    const resources=new Map(catalog.resources.map(r=>[r.id+'@'+r.version,r]));
    const resource=n=>resources.get(n.resource.id+'@'+n.resource.version);
    const objects=Object.fromEntries(Object.entries(area.ids).map(([role,id])=>[role,root.getObjectByName(id)]));
    const drawables=[];
    root.traverseVisible(mesh=>{if(mesh.isMesh&&[mesh.material].flat().some(m=>m.visible&&m.opacity>0))drawables.push(mesh);});
    const rect=renderer.domElement.getBoundingClientRect(),ray=new Raycaster();
    const ownMeshes=object=>{
      const nested=new Set(doc.nodes.filter(n=>n.kind==='facility'&&n.parentId===object.name).map(n=>root.getObjectByName(n.id)));
      const meshes=[];
      function visit(part){
        if(nested.has(part))return;
        if(part.isMesh&&part.geometry.getAttribute('position'))meshes.push(part);
        for(const child of part.children)visit(child);
      }
      visit(object);return meshes;
    };
    const owns=(object,mesh)=>{for(let part=mesh;part;part=part.parent)if(part===object)return true;return false;};
    const enclosing=parts=>{
      const box=new Box3(),sample=new Vector3();
      for(const mesh of parts){
        const count=mesh.geometry.getAttribute('position').count;
        for(let index=0;index<count;index++)
          box.expandByPoint(mesh.getVertexPosition(index,sample).applyMatrix4(mesh.matrixWorld));
      }
      return box;
    };
    const projection=(box,contains)=>{
      const corners=[];
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])
        corners.push(new Vector3(x,y,z).project(camera));
      const minimum=(axis)=>Math.min(...corners.map(p=>p[axis])),maximum=(axis)=>Math.max(...corners.map(p=>p[axis]));
      const x=minimum('x'),y=minimum('y'),width=maximum('x')-x,height=maximum('y')-y,hitNames={};
      let first=0,framed=0;
      for(const u of [.08,.22,.36,.50,.64,.78,.92])for(const v of [.08,.22,.36,.50,.64,.78,.92]){
        const p={x:x+u*width,y:y+v*height};
        if(Math.abs(p.x)>=1||Math.abs(p.y)>=1)continue;
        framed++;
        ray.setFromCamera(p,camera);
        const hit=ray.intersectObjects(drawables,false)[0]?.object;
        if(contains(hit))first++;
        else { const part=hit?.userData.name||hit?.name||'empty';hitNames[part]=(hitNames[part]??0)+1; }
      }
      return {first,framed,width:width*rect.width/2,height:height*rect.height/2,firstOccluders:hitNames};
    };
    const supported={main:'desk',secondary:'desk',shelfItem1:'shelf',shelfItem2:'shelf',cup:'table'};
    const items={};
    for(const [role,object] of Object.entries(objects)){
      const id=area.ids[role],node=nodes.get(id),r=resource(node);
      if(!object||object.parent?.name!==node.parentId)throw Error('Actual parent differs from saved mount for '+id);
      const meshes=ownMeshes(object),box=enclosing(meshes);
      if(box.isEmpty())throw Error('Missing real model for '+id);
      const part={id,node,asset:r.asset,role:r.mountRole,world:object.matrixWorld.toArray(),bottom:box.min.y,
        meshes:meshes.map(m=>m.userData.name||m.name),projection:projection(box,hit=>owns(object,hit))};
      const hostKey=supported[role],host=objects[hostKey];
      if(host){
        const spec=resource(nodes.get(host.name)),surfaceId=node.attachment?.surfaceId;
        const deck=surfaceId?spec.supportSurfaces?.find(s=>s.id===surfaceId):spec.surface;
        const plate=surfaceId&&host.getObjectByName(spec.supportNodes?.[surfaceId]);
        if(host!==object.parent||!deck||(surfaceId&&!plate?.isMesh))throw Error('Missing named carrying surface for '+id);
        const anchor=object.getWorldPosition(new Vector3());
        const down=new Vector3(0,-1,0);
        ray.set(new Vector3(anchor.x,box.min.y+.025,anchor.z),down);
        const hit=ray.intersectObjects(plate?[plate]:ownMeshes(host),false)[0];
        const normalY=hit?.face?.normal.clone().transformDirection(hit.object.matrixWorld).y;
        const declaredY=host.localToWorld(new Vector3(0,deck.topY,0)).y;
        const childInHost=host.worldToLocal(anchor).toArray();
        part.support={id:host.name,surfaceId:surfaceId??'desktop',mesh:hit?.object.name,
          top:hit?.point.y,declaredY,normalY,offset:childInHost,assetGap:hit?box.min.y-hit.point.y:null};
      }
      if(r.mountRole==='monitor'){
        const faces=r.display?.screen?.nodes.map(name=>meshes.find(mesh=>mesh.name===name||mesh.userData.name===name));
        if(!faces?.length||faces.some(mesh=>!mesh))throw Error('Missing actual screen surface for '+id);
        const faceObjects=new Set(faces),materials=faces.flatMap(mesh=>[mesh.material].flat());
        part.screen={on:node.state?.on??r.stateDefaults?.on,parts:faces.map(mesh=>mesh.name),
          emissive:materials.map(material=>({
            color:material.emissive?.getHexString(),intensity:material.emissiveIntensity,
          })),
          projection:projection(enclosing(faces),hit=>faceObjects.has(hit))};
      }
      items[role]=part;
    }
    return {view,items,renderError:company.renderStatus().lastRenderError};
  },{area,mathModule});
  assert.equal(evidence.renderError,null);
  assert.equal(evidence.view.roomId,area.room);assert.equal(evidence.view.floorId,area.floor);
  for(const part of Object.values(evidence.items)){
    assert(part.asset,part.id+' expected a routed GLB');
    if(part.support){
      const s=part.support;
      assert(s.normalY>.98&&Math.abs(s.top-s.declaredY)<.001&&Math.abs(s.assetGap)<.001,JSON.stringify({id:part.id,support:s}));
    }
    const response=responses.get(part.asset.url);
    assert.equal(response?.status(),200,'Missing actual GLB request '+part.asset.url);
    const bytes=await response.body();
    assert.equal(bytes.length,part.asset.bytes);assert.equal(sha(bytes),part.asset.sha256);
    if(!dev)assert(bytes.equals(await pinned('viewer'+part.asset.url)));
    if(part.screen){
      assert(part.screen.on&&part.screen.emissive.some(m=>m.intensity>0&&m.color!=='000000'),part.id);
    }
  }
  return evidence;
}

const visible=(p,minimum)=>p.first>=minimum[0]&&p.width>=minimum[1]&&p.height>=minimum[2];
function presentation(key,view,actual,needed){
  for(const [role,min] of Object.entries(needed)){
    const obj=actual.items[role],p=obj.screen?.projection??obj.projection;
    if(!visible(p,min))report.viewIssues.push({key,view,role,id:obj.id,wanted:min,observed:p});
  }
}
const stationNeeds={main:[6,40,22],secondary:[6,40,22]};
const shelfNeeds={shelf:[6,55,60],shelfItem1:[3,8,8],shelfItem2:[3,8,8]};
const loungeNeeds={sofa:[5,42,24],table:[4,25,15],cup:[2,5,5]};
const cupNeeds={table:[5,40,30],cup:[4,12,12]};

async function capture(fixture,area,responses,label,needed={},pause=0){
  const result=await inspect(area,responses),image=fixture.key+'-'+label+'.png';
  await shot(image);
  presentation(fixture.key,label,result,needed);
  if(pause)await hold(pause);
  return {...result,image};
}

function stateWithoutProjection(state){
  return Object.fromEntries(Object.entries(state.items).map(([key,item])=>{
    const {projection,screen,...physical}=item;
    if(screen){const {projection:screenProjection,...panel}=screen;physical.screen=panel;}
    return [key,physical];
  }));
}

async function replaceSecondary(id){
  const expected=await current(),node=expected.nodes.find(n=>n.id===id),old=node.resource;
  const {stateDefaults,eligible}=await page.evaluate(old=>{
    const rows=company.catalog.resources;
    return {stateDefaults:rows.find(r=>r.id===old.id&&r.version===old.version)?.stateDefaults,
      eligible:rows.filter(r=>r.asset&&r.mountRole==='monitor'&&r.display?.screen).map(r=>r.id+'@'+r.version)};
  },old);
  await select(id);
  const menu=page.locator('#edit-look');
  const before=await menu.inputValue();
  assert.equal(before,ref(old));
  const options=await menu.locator('option').evaluateAll(rows=>rows.map(o=>o.value));
  const available=options.filter(key=>key!==before&&eligible.includes(key));
  const target=available.includes('monitor-aurora@1')?'monitor-aurora@1':available[0];
  assert(target,id+' has no ordinary compatible monitor alternative');
  const [name,version]=target.split('@');
  node.resource={id:name,version:Number(version)};
  node.state={...stateDefaults,...node.state};expected.revision++;
  await menu.selectOption(target);
  await page.waitForFunction(({id,target,revision})=>{
    const doc=company.session.document,n=doc.nodes.find(n=>n.id===id);
    return doc.revision===revision&&n.resource.id+'@'+n.resource.version===target;
  },{id,target,revision:expected.revision});await ready();
  assert.equal(await menu.inputValue(),target);
  assert.deepEqual(await current(),expected);
  return {id,before,target,unchangedBeyondRevisionAndInstance:true};
}

async function save(fixture){
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false'&&!document.querySelector('#save').disabled);
  const bytes=await saved(fixture.doc.id);
  assert(bytes);
  assert.deepEqual(JSON.parse(bytes).document,await current());
  return bytes;
}

async function exercise(fixture,profile,prior){
  stage=fixture.key+'/entry';
  let responses=await open(profile,record);
  if(record)activeVideo={key:fixture.key,video:page.video()};
  await load(fixture,responses);
  const {station,areas:{live,lounge}}=await discover(fixture.doc);
  const receipt={key:fixture.key,company:fixture.doc.id,sourceSha256:sha(fixture.bytes),station,live,lounge};
  report.rooms.push(receipt);

  stage=fixture.key+'/live';
  await enter(live);
  receipt.liveOverview=await capture(fixture,live,responses,'live-overview',{},650);
  await select(station,true);
  receipt.monitors=await capture(fixture,live,responses,'dual-monitor',stationNeeds,1050);
  await select(live.ids.shelf,true);
  receipt.shelf=await capture(fixture,live,responses,'wall-shelf',shelfNeeds,1000);

  stage=fixture.key+'/waiting';
  await enter(lounge);
  receipt.waiting=await capture(fixture,lounge,responses,'waiting-overview',loungeNeeds,1100);
  await select(lounge.ids.table,true);
  receipt.cup=await capture(fixture,lounge,responses,'cup-on-table',cupNeeds,950);

  stage=fixture.key+'/replace';
  await enter(live);
  receipt.edit=await replaceSecondary(live.ids.secondary);await hold(850);
  await select(station,true);
  receipt.edited=await capture(fixture,live,responses,'dual-monitor-edited',stationNeeds,850);
  const original=stateWithoutProjection(receipt.monitors),now=stateWithoutProjection(receipt.edited);
  assert.notEqual(now.secondary.asset.sha256,original.secondary.asset.sha256);
  const {secondary:old,...other}=original, {secondary:changed,...preserved}=now;
  assert.deepEqual(preserved,other);
  assert.deepEqual(changed.world,old.world);
  assert.deepEqual(changed.node.transform,old.node.transform);
  assert.equal(changed.node.parentId,old.node.parentId);

  stage=fixture.key+'/save';
  const text=await save(fixture);
  receipt.savedSha256=sha(text);
  await shot(fixture.key+'-saved.png');await hold(1500);
  await close();
  if(activeVideo){await archive(activeVideo.video,fixture.key+'-normal.webm');activeVideo=null;}

  stage=fixture.key+'/cold';
  responses=await open(profile);
  await load(fixture,responses,true);
  assert.equal(await saved(fixture.doc.id),text);
  assert.deepEqual(await current(),JSON.parse(text).document);
  for(const previous of prior)assert.equal(await saved(previous.id),previous.text);
  await enter(live);await select(station,true);
  const coldLive=await capture(fixture,live,responses,'live-restored',stationNeeds);
  assert.deepEqual(stateWithoutProjection(coldLive),now);
  await select(live.ids.shelf,true);
  const coldShelf=await capture(fixture,live,responses,'shelf-restored',shelfNeeds);
  assert.deepEqual(stateWithoutProjection(coldShelf),now);
  await enter(lounge);await select(lounge.ids.table,true);
  const coldLounge=await capture(fixture,lounge,responses,'cup-restored',cupNeeds);
  assert.deepEqual(stateWithoutProjection(coldLounge),stateWithoutProjection(receipt.cup));
  receipt.cold={savedSha256:sha(await saved(fixture.doc.id)),sameBytes:true,withoutDelivery:true,
    previousCompanySavesUnchanged:prior.map(previous=>previous.id),live:coldLive,shelf:coldShelf,lounge:coldLounge};
  await close();
  return {id:fixture.doc.id,text};
}

(async()=>{
  stage='identities';await prepare();
  const fixtures=await Promise.all(keys.map(fixture));
  assert.equal(new Set(fixtures.map(f=>f.doc.id)).size,fixtures.length,'Select at most one revision of any company per run');
  base=await serve();
  const profile=await fs.mkdtemp(path.join(temp,'profile-'));
  const prior=[];
  for(const layout of fixtures)prior.push(await exercise(layout,profile,prior));
  assert.deepEqual(report.browserErrors,[]);
  assert.equal(report.viewIssues.length,0,'Requested items are obscured in a native view. Details are in viewIssues.');
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
    if(temp){assert.equal(path.dirname(await fs.realpath(temp)),output);await fs.rm(temp,{recursive:true});}
    if(created)await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:report.status,...(created?{report:path.join(output,'report.json')}:{})}));
  }
});

