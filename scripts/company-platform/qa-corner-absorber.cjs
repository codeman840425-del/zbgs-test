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
const revision=flags.includes('--segmented-v2');
const dev=/^[a-f0-9]{12}$/.test(pin);
assert(input&&(dev||/^[a-f0-9]{64}$/.test(pin))&&args.length===(dev?2:1)&&
  flags.length===Number(record)+Number(revision)+overrides.length&&new Set(flags).size===flags.length&&overrides.length<=(revision?1:2)&&
  overrides.every(v=>/^[a-z][a-z0-9-]{0,62}$/.test(v)),
  'Use PACKAGE MANIFEST_SHA NEW_OUT or DIST BUILD BATCH_ROOT NEW_OUT [--record] [--room=KEY] [--segmented-v2]');
assert(!args.at(-1).split(/[\\/]/).includes('..'),'Output path cannot contain traversal');
const source=path.resolve(__dirname,'../..');
const keys=overrides.length?overrides:revision?['corner-studio']:['corner-studio','corner-rental'];
const variants=['triangular','column','segmented','upholstered'].map(name=>'corner-absorber-'+name+'@1');
const viewport={width:1600,height:900},mathModule='/__corner-absorber-qa/three.core.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const execute=promisify(execFile);
const ref=resource=>resource.id+'@'+resource.version;
const report={status:'running',scope:'Physical two-wall contact, native corner editing, and cold recovery.',
  recordingRequested:record,segmentedRevision:revision,rooms:[],files:[],browserErrors:[]};
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
    assert(script.equals(await pinned('source/scripts/company-platform/qa-corner-absorber.cjs')));
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

const node=(doc,id)=>doc.nodes.find(n=>n.id===id);
const optionsOf=selector=>page.locator(selector+' option').evaluateAll(rows=>rows.filter(o=>o.value&&!o.disabled).map(o=>o.value));
const corners=['north-west','south-west','south-east','north-east'];
const edgeOf=yaw=>['north','west','south','east'][((Math.round(yaw/(Math.PI/2))%4)+4)%4];
const anchor=(bounds,corner,bottom=0)=>({
  position:[(corner.endsWith('west')?-1:1)*(bounds.width/2-.1),bottom,(corner.startsWith('north')?-1:1)*(bounds.depth/2-.1)],
  yaw:corners.indexOf(corner)*Math.PI/2,
});
const target=(room,corner)=>room.id+':corner:'+corner;

async function forFile(file){
  const menu=page.locator('details.file-menu');
  if(!await menu.evaluate(el=>el.open))await menu.locator('summary').click();
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#import').click()]);
  await chooser.setFiles(file);
  return menu;
}

async function visit(key,responses,savedId){
  const save='data/rooms/'+key+'/save.json',fixture=dev?path.join(batch,key,'save.json'):path.join(bundle,save);
  const bytes=savedId?null:dev?await fs.readFile(fixture):await pinned(save);
  const url=new URL(base),id=savedId??JSON.parse(bytes).document.id;
  if(!dev&&!savedId)url.searchParams.set('delivery',key);
  await page.goto(url.href);await ready();
  const info=await page.evaluate(()=>company.buildInfo);
  assert.equal(info.shortId,report.build);assert.equal(info.sourceDigest,report.sourceDigest);
  const menu=dev&&!savedId?await forFile(fixture):null;
  await page.waitForFunction(id=>company.session.document.id===id,id);await ready();
  if(menu&&await menu.evaluate(el=>el.open))await menu.locator('summary').click();
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

async function discover(key){
  const doc=await current(),catalog=await page.evaluate(()=>company.catalog.resources);
  const resources=new Map(catalog.map(r=>[ref(r),r]));
  const entries=doc.nodes.filter(n=>n.kind==='facility').map(n=>({node:n,resource:resources.get(ref(n.resource))}));
  const panels=entries.filter(n=>n.resource?.mountRole==='corner-absorber');
  assert.equal(panels.length,1,'Expected one supplied corner absorber in '+doc.id);
  const panel=panels[0].node,area=node(doc,panel.parentId),floor=node(doc,area.parentId);
  assert(corners.includes(panel.attachment?.corner)&&floor.kind==='floor'&&['room','area'].includes(area.kind));
  const doors=[...(floor.exteriorEntrances??[]),...(floor.connections??[]).flatMap(c=>[c.from,c.to].map(s=>({...s,id:c.id})))]
    .filter(side=>side.regionId===area.id).map(side=>({...side,kind:'portal'}));
  const windows=entries.filter(e=>e.node.parentId===area.id&&e.resource?.windowSystem).map(({node,resource})=>{
    const edge=edgeOf(node.transform.yaw),along=['north','south'].includes(edge)?0:2;
    return {kind:'window',id:node.id,edge,offset:node.transform.position[along],width:resource.windowSystem.apertureWidth};
  });
  const blocked=[];
  for(const corner of corners){
    for(const side of [...doors,...windows]){
      if(!corner.split('-').includes(side.edge))continue;
      const horizontal=['north','south'].includes(side.edge),span=area.bounds[horizontal?'width':'depth'];
      const sign=(horizontal?corner.endsWith('west'):corner.startsWith('north'))?-1:1;
      const near=[.12625,.16375].map(distance=>sign*(span/2-.1-distance)).sort((a,b)=>a-b);
      if(Math.min(near[1],side.offset+side.width/2)-Math.max(near[0],side.offset-side.width/2)>.005)blocked.push({...side,corner});
    }
  }
  return {key,company:doc.id,id:area.id,floor:floor.id,bounds:area.bounds,panel,blocked};
}

async function enter(room){
  const view=await page.evaluate(()=>company.session.scene.view);
  if(view.mode==='building'){
    const facade=page.locator('.company-building-view__facade');if(await facade.isVisible())await facade.click();
    await page.locator('button[data-floor-id='+JSON.stringify(room.floor)+']').click();
  }else if(view.floorId!==room.floor)await page.locator('#floor').selectOption(room.floor);
  await page.waitForFunction(floor=>company.session.scene.view.floorId===floor&&!document.querySelector('#room').disabled,room.floor);
  await page.locator('#room').selectOption(room.id);
  await page.waitForFunction(id=>company.session.scene.view.roomId===id&&company.session.scene.view.mode==='room',room.id);
  await ready();
}
async function selectPanel(id,focus=false){
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(id);
  if(focus)await page.locator('#edit-focus').click();
}
const focus=()=>page.locator('#edit-focus').click();

async function inspect(room,id,responses,project=true){
  const data=await page.evaluate(async({id,roomId,mathModule,project})=>{
    const {Vector3,Box3,Raycaster}=await import(mathModule);
    const {session:{scene,document:doc},catalog,camera,renderer}=company;
    company.drawHostFrame();camera.updateMatrixWorld(true);scene.root.updateMatrixWorld(true);
    const node=doc.nodes.find(n=>n.id===id),resource=catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version);
    const object=scene.root.getObjectByName(id);
    if(!object||object.parent?.name!==roomId)throw Error('Corner object has wrong room parent or no live geometry');
    const inverse=object.matrixWorld.clone().invert(),overall=new Box3(),screenBox=new Box3();
    const point=new Vector3(),parts=[],vertices=[],owned=new Set(),named=new Map();
    const clean=v=>v.toArray().map(n=>Number(n.toFixed(8)));
    object.traverse(mesh=>{
      if(!mesh.isMesh||!mesh.geometry.getAttribute('position'))return;
      owned.add(mesh);
      const local=inverse.clone().multiply(mesh.matrixWorld),bounds=new Box3(),geometry=[];
      for(let i=0;i<mesh.geometry.getAttribute('position').count;i++){
        mesh.getVertexPosition(i,point).applyMatrix4(local);
        bounds.expandByPoint(point);
        geometry.push(point.toArray().map(n=>Math.round(n*1e5)).join(','));
        screenBox.expandByPoint(point.applyMatrix4(object.matrixWorld).project(camera));
      }
      overall.union(bounds);vertices.push(geometry.sort().join(';'));
      const name=(mesh.userData.name||mesh.name).toLowerCase().replaceAll(/[^a-z0-9]+/g,'-');
      named.set(name,mesh);
      parts.push({name,min:clean(bounds.min),max:clean(bounds.max),triangles:(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3});
    });
    const wallView=scene.wallPresentation(),rows=wallView.walls.filter(w=>w.region===roomId);
    const walls=rows.map(w=>scene.root.getObjectByName(w.id)).filter(Boolean);
    const ray=new Raycaster(),bearing={};
    for(const axis of [0,2]){
      const side=axis===0?'x':'z',rail=named.get(side+'-rail');
      const fromInward=new Vector3().setComponent(axis,1).transformDirection(object.matrixWorld);
      bearing[side]=[.05,1.05,2.05].map(y=>{
        const origin=axis===0?new Vector3(.025,y,.145):new Vector3(.145,y,.025);
        ray.set(object.localToWorld(origin.clone()),fromInward.clone().negate());
        const hit=ray.intersectObjects(walls,false)[0];
        const wall=hit&&rows.find(w=>w.id===hit.object.name);
        if(!wall||!rail)return null;
        const gap=hit.point.clone().applyMatrix4(inverse).getComponent(axis);
        const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld).dot(fromInward);
        ray.set(object.localToWorld(origin.setComponent(axis,-.015)),fromInward);
        const back=ray.intersectObject(rail,false)[0];
        const railGap=back?.point.distanceTo(hit.point),railNormal=back?.face.normal.clone().transformDirection(rail.matrixWorld).dot(fromInward);
        return {wall:wall.id,edge:wall.edge,visible:wall.visible,gap,normal,railGap,railNormal};
      });
    }
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(vertices.sort().join('|')));
    const asset=resource.asset,shape=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    const visible=object.visible!==false&&[...owned].some(mesh=>{
      for(let n=mesh;n;n=n.parent)if(n.visible===false)return false;
      return true;
    });
    const obstacle=scene.navigation().obstacles.find(o=>o.instanceId===id);
    const result={node,asset,shape,parts,bounds:{min:clean(overall.min),max:clean(overall.max)},bearing,visible,
      mode:wallView.mode,root:scene.root.uuid,view:scene.view,world:object.matrixWorld.toArray(),
      obstacle:obstacle&&{footprint:obstacle.footprint}};
    if(!project)return result;
    const rect=renderer.domElement.getBoundingClientRect(),meshes=[];
    scene.root.traverseVisible(o=>{if(o.isMesh&&[o.material].flat().some(m=>m.visible&&m.opacity>0))meshes.push(o);});
    const {min,max}=screenBox,occluding={};let first=0;
    for(const u of [.1,.26,.42,.58,.74,.9])for(const v of [.1,.26,.42,.58,.74,.9]){
      const p={x:min.x+(max.x-min.x)*u,y:min.y+(max.y-min.y)*v};
      if(Math.abs(p.x)>=1||Math.abs(p.y)>=1)continue;
      ray.setFromCamera(p,camera);
      const hit=ray.intersectObjects(meshes,false)[0]?.object;
      if(owned.has(hit))first++;
      else {const name=hit?.name||'open-space';occluding[name]=(occluding[name]??0)+1;}
    }
    result.projection={first,width:(max.x-min.x)*rect.width/2,height:(max.y-min.y)*rect.height/2,occluding,
      eyeInPanel:camera.position.clone().applyMatrix4(inverse).toArray()};
    return result;
  },{id,roomId:room.id,mathModule,project});
  assert.equal(data.view.roomId,room.id);assert.equal(data.view.floorId,room.floor);
  assert(data.bounds.min.every(v=>v>=-.001),'Body lies behind the two-wall origin');
  assert(data.bounds.max.every((value,i)=>value<=[.351,2.201,.351][i]));
  const surfaces=new Set();
  for(const [index,axis] of ['x','z'].entries()){
    const rail=data.parts.find(p=>p.name===axis+'-rail');
    const coordinate=index*2;
    assert(rail&&Math.abs(rail.min[coordinate])<.001&&rail.max[1]>2.08,'Missing real wall contact rail '+axis);
    for(const hit of data.bearing[axis]){
      assert(hit&&Math.abs(hit.gap)<.001&&hit.normal>.98&&hit.railGap<.001&&hit.railNormal<-.98,JSON.stringify({axis,hit}));
      surfaces.add(hit.edge);
    }
  }
  assert.deepEqual([...surfaces].sort(),data.node.attachment.corner.split('-').sort());
  if(data.node.resource.id==='corner-absorber-segmented'){
    const tiers=data.parts.filter(p=>/^segmented-tier-\d+$/.test(p.name)).sort((a,b)=>a.min[1]-b.min[1]);
    assert.equal(tiers.length,data.node.resource.version===2?5:3);
    const gaps=tiers.slice(1).map((tier,i)=>Number((tier.min[1]-tiers[i].max[1]).toFixed(6)));
    assert(gaps.every(gap=>gap>.005),'Adjacent segmented models must have actual gaps');
    data.segmented={tiers:tiers.length,gapsMetres:gaps};
  }
  const result=responses.get(data.asset.url);assert.equal(result?.status(),200,data.asset.url);
  const bytes=await result.body();
  assert.equal(bytes.length,data.asset.bytes);assert.equal(sha(bytes),data.asset.sha256);
  if(!dev)assert(bytes.equals(await pinned('viewer'+data.asset.url)));
  return data;
}
function inView(state){
  assert(state.visible&&state.projection.first>3&&state.projection.height>150,JSON.stringify({
    visible:state.visible,projection:state.projection,bearing:state.bearing,
  }));
}
function physical({bearing,visible,mode,root,view,projection,...rest}){
  return {...rest,bearing:Object.fromEntries(Object.entries(bearing).map(([axis,hits])=>
    [axis,hits.map(({visible,...hit})=>hit)]))};
}

async function changed(expected){
  await page.waitForFunction(rev=>company.session.document.revision===rev,expected.revision);
  await ready();
  assert.deepEqual(await current(),expected);
}

async function addAndRemove(room,responses){
  const original=await current(),id=room.panel.id;
  await page.locator('#tool-add').click();
  await page.locator('#add-branch').selectOption('corner-absorber');
  await page.locator('#add-look').selectOption(ref(room.panel.resource));
  const options=await optionsOf('#add-target');
  const available=corners.filter(c=>c!==room.panel.attachment.corner&&options.includes(target(room,c)));
  for(const bad of room.blocked)assert(!options.includes(target(room,bad.corner)),'Blocked corner is offered '+bad.corner);
  const destination=available[0];assert(destination,'Room must have a free usable corner');
  await page.locator('#add-target').selectOption(target(room,destination));
  await page.locator('#add-center').click();
  await page.waitForFunction(rev=>company.session.document.revision===rev,original.revision+1);await ready();
  const next=await current(),newNodes=next.nodes.filter(n=>!node(original,n.id));
  assert.equal(newNodes.length,1);
  const [added]=newNodes;
  assert.equal(added.parentId,room.id);assert.equal(added.attachment.corner,destination);
  assert.deepEqual(added.resource,room.panel.resource);
  assert.deepEqual({...next,nodes:next.nodes.filter(n=>n.id!==added.id)},{...original,revision:original.revision+1});
  await selectPanel(added.id,true);
  const actual=await inspect(room,added.id,responses);inView(actual);
  await shot(room.key+'-added.png');await hold(750);
  const placement=page.locator('#placement-tools');
  if(!await placement.evaluate(n=>n.open))await placement.locator(':scope > summary').click();
  await page.locator('#edit-remove').click();
  await changed({...original,revision:original.revision+2});
  await selectPanel(id);
  return {id:added.id,destination,meshEvidence:actual};
}

async function dragToCorner(room,destination){
  const bad=room.blocked.find(row=>row.kind==='portal');assert(bad,'Expected a real exterior door trial');
  const text=await save(room),document=await current(),root=await page.evaluate(()=>company.session.scene.root.uuid);
  await page.locator('#edit-move').click();
  await page.waitForFunction(()=>company.editor.placement.snapshot()?.complete);
  const map=await page.evaluate(()=>company.editor.placement.snapshot());
  assert.equal(map.checked,4);assert.equal(map.total,4);
  const old=node(document,room.panel.id),origin=old.transform.position;
  const locate=corner=>{
    const {position}=anchor(room.bounds,corner,origin[1]);
    const cell=map.cells.find(c=>c.position.every((v,i)=>Math.abs(v-position[i])<.001));
    assert(cell,corner);return cell;
  };
  const red=locate(bad.corner),green=locate(destination);
  assert.equal(red.valid,false);assert.equal(red.error,'corner-bearing-over-opening');
  assert.equal(green.valid,true);
  const camera=()=>page.evaluate(()=>({position:company.camera.position.toArray(),quaternion:company.camera.quaternion.toArray()}));
  const screen=position=>page.evaluate(position=>{
    const {camera,renderer,editor}=company,rect=renderer.domElement.getBoundingClientRect();
    const localToWorld=camera.matrixWorld.clone().fromArray(editor.placement.snapshot().parentMatrix);
    const p=camera.position.clone().fromArray(position).applyMatrix4(localToWorld).project(camera);
    return [rect.left+(p.x+1)*rect.width/2,rect.top+(1-p.y)*rect.height/2];
  },position);
  const [start,end,allowed]=await Promise.all([screen(origin),screen(red.position),screen(green.position)]);
  const locked=await camera();
  await page.mouse.move(...start);await page.mouse.wheel(0,500);
  await page.mouse.down();await page.mouse.move(...end,{steps:8});
  assert.deepEqual(await camera(),locked);
  await page.mouse.up();
  assert.deepEqual(await camera(),locked);
  assert.equal(await page.locator('#placement-status').getAttribute('data-valid'),'false');
  const message=await page.locator('#placement-status').textContent();
  assert(message.includes('有一侧支架落在门窗洞口'),message);
  assert.deepEqual(await current(),document);assert.equal(await saved(room.company),text);
  assert.equal(await page.evaluate(()=>company.session.scene.root.uuid),root);
  await shot(room.key+'-drag-rejected.png');await hold(950);
  await page.mouse.move(...start);await page.mouse.down();await page.mouse.move(...allowed,{steps:8});
  assert.deepEqual(await camera(),locked);
  await page.mouse.up();
  await page.waitForFunction(()=>!company.editor.placement.active);
  return {total:map.total,checked:map.checked,red:{corner:bad.corner,...red,message},green:{corner:destination,...green},
    cameraStayedLocked:true,stayedInSameSceneOnRejection:true,sameDocumentAndSaveOnRejection:true};
}

async function reattach(room,responses,destination,pointer=false){
  const id=room.panel.id,expected=await current(),previous=node(expected,id).attachment.corner;
  assert.notEqual(destination,previous);
  const details=page.locator('#placement-tools');
  if(!await details.evaluate(n=>n.open))await details.locator(':scope > summary').click();
  const options=await optionsOf('#edit-target');
  for(const bad of room.blocked)assert(!options.includes(target(room,bad.corner)),bad.corner);
  assert(options.includes(target(room,destination)),JSON.stringify(options));
  let drag;
  if(pointer)drag=await dragToCorner(room,destination);
  else{
    await page.locator('#edit-target').selectOption(target(room,destination));
    await page.locator('#edit-attach').click();
  }
  await page.waitForFunction(rev=>company.session.document.revision===rev,expected.revision+1);await ready();
  const actual=await current(),placed=node(actual,id);
  assert.deepEqual(placed.attachment,{corner:destination});
  assert.equal(placed.parentId,room.id);
  const pose=anchor(room.bounds,destination,placed.transform.position[1]);
  assert(placed.transform.position.every((value,index)=>Math.abs(value-pose.position[index])<1e-6));
  assert(Math.abs(Math.sin((pose.yaw-placed.transform.yaw)/2))<1e-6);
  const old=node(expected,id);
  old.transform=placed.transform;old.attachment=placed.attachment;
  assert.deepEqual(actual,{...expected,revision:expected.revision+1});
  await focus();
  const panel=await inspect(room,id,responses);inView(panel);
  await shot(room.key+'-attached-corner.png');await hold(800);
  return {from:previous,to:destination,options,method:pointer?'drag':'select',drag,panel};
}

async function replace(room,look){
  const expected=await current(),n=node(expected,room.panel.id),[id,version]=look.split('@');
  if(ref(n.resource)===look)return;
  const state=await page.evaluate(ref=>company.catalog.resources.find(r=>r.id===ref.id&&r.version===ref.version).stateDefaults,n.resource);
  n.state={...state,...n.state};n.resource={id,version:Number(version)};expected.revision++;
  await page.locator('#edit-look').selectOption(look);
  await changed(expected);
}

async function wallModes(room,responses,text){
  const id=room.panel.id,document=await current();
  await page.locator('#wall-view').selectOption('cutaway');await ready();await focus();
  const front=await inspect(room,id,responses);inView(front);
  const canvas=await page.locator('#stage canvas').boundingBox(),x=canvas.x+canvas.width*.21,y=canvas.y+canvas.height*.46;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x+canvas.height*.5,y,{steps:12});await page.mouse.up();
  const cutaway=await inspect(room,id,responses);
  const backed=Object.values(cutaway.bearing).flat();
  assert(backed.some(hit=>!hit.visible),'No physical backing wall was cut away');
  assert.equal(cutaway.visible,backed.some(hit=>hit.visible));
  if(!cutaway.visible)assert.equal(cutaway.projection.first,0);
  assert.deepEqual(physical(cutaway),physical(front));
  await shot(room.key+'-cutaway.png');await hold(850);
  await page.locator('#wall-view').selectOption('full');await ready();
  const full=await inspect(room,id,responses);
  assert.equal(full.mode,'full');assert(full.visible);
  assert(Object.values(full.bearing).flat().every(hit=>hit.visible));
  assert.deepEqual(physical(full),physical(front));
  await shot(room.key+'-full-wall.png');await hold(850);
  await page.locator('#wall-view').selectOption('cutaway');await ready();await focus();
  const restored=await inspect(room,id,responses);inView(restored);
  assert.deepEqual(physical(restored),physical(front));
  assert.deepEqual(await current(),document);assert.equal(await saved(room.company),text);
  return {front,cutaway,full,restored,documentAndSaveUnchanged:true};
}

async function rejectImport(room,bad,text){
  const original=await current(),root=await page.evaluate(()=>company.session.scene.root.uuid);
  const copy=structuredClone(original),previous=node(copy,room.panel.id),id=room.id+'/qa-bad-'+bad.kind;
  assert.notEqual(previous.attachment.corner,bad.corner);assert(!node(copy,id));
  const transform=anchor(room.bounds,bad.corner,previous.transform.position[1]);
  copy.nodes.push({...previous,id,attachment:{corner:bad.corner},transform});
  copy.revision++;
  const buffer=Buffer.from(JSON.stringify(copy,null,2)+'\n'),name=room.key+'-input-'+bad.kind+'.json';
  await fs.writeFile(path.join(output,name),buffer,{flag:'wx'});
  report.files.push({name,bytes:buffer.length,sha256:sha(buffer)});
  const start=report.browserErrors.length;
  const [event,menu]=await Promise.all([page.waitForEvent('console',e=>e.type()==='error'),forFile({name,mimeType:'application/json',buffer})]);
  assert.deepEqual(report.browserErrors.splice(start),[{stage,message:event.text()}]);
  const error=await event.args()[0].evaluate(e=>({code:e.code,path:e.path,details:e.details}));
  assert.equal(error.code,'corner-bearing-over-opening',JSON.stringify(error));
  assert.equal(error.path,id);
  assert.equal(error.details.edge,bad.edge);
  assert.equal(error.details.openingId,bad.id);
  assert.equal(error.details.kind,bad.kind);
  await page.waitForFunction(()=>document.querySelector('#status').dataset.error==='true'&&!document.querySelector('#mode-room').disabled);
  if(await menu.evaluate(el=>el.open))await menu.locator('summary').click();
  const feedback=await page.locator('#status').textContent();
  assert(feedback.includes('已保留'),feedback);
  assert.deepEqual(await current(),original);assert.equal(await saved(room.company),text);
  assert.equal(await page.evaluate(()=>company.session.scene.root.uuid),root);
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'),'false');
  await shot(room.key+'-rejected-'+bad.kind+'.png');await hold(1000);
  return {sourcePortal:bad,invalidTransform:transform,error,feedback,saveUnchanged:true};
}

async function save(room){
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false'&&!document.querySelector('#save').disabled);
  const text=await saved(room.company);
  assert.deepEqual(JSON.parse(text).document,await current());
  return text;
}

async function reopen(room,profile,text,expected,prior){
  const responses=await open(profile);
  await visit(room.key,responses,room.company);
  assert.equal(await saved(room.company),text);
  assert.deepEqual(await current(),JSON.parse(text).document);
  for(const other of prior)assert.equal(await saved(other.id),other.text);
  await enter(room);await selectPanel(room.panel.id,true);
  const actual=await inspect(room,room.panel.id,responses);inView(actual);
  assert.deepEqual(physical(actual),physical(expected));
  const look=ref(actual.node.resource),image=room.key+'-restored-'+look.replace('@','-v')+'.png';
  await shot(image);
  return {responses,receipt:{look,sha256:sha(text),sameBytes:true,withoutDelivery:true,image}};
}

async function exercise(key,index,profile,prior){
  stage=key+'/entry';
  const responses=await open(profile,record);
  if(record)activeVideo={key,video:page.video()};
  const bytes=await visit(key,responses),room=await discover(key),id=room.panel.id;
  const result={room,sourceSha256:sha(bytes),looks:[],cold:[],rejections:[]};report.rooms.push(result);
  await enter(room);await selectPanel(id,true);
  const starting=await inspect(room,id,responses);result.starting=starting;inView(starting);
  if(!revision){
    stage=key+'/add';
    result.added=await addAndRemove(room,responses);
    stage=key+'/attach';
    result.reattached=await reattach(room,responses,result.added.destination,key==='corner-studio');
    assert.equal(starting.shape,result.reattached.panel.shape);
  }
  const first=ref(room.panel.resource),coldPair=index?[variants[1],variants[2]]:[variants[3],variants[0]];
  if(first===coldPair[0])coldPair.reverse();
  const [last,secondCold]=coldPair;
  if(revision)assert.equal(first,'corner-absorber-segmented@1');
  const sequence=revision?[first,'corner-absorber-segmented@2']:[first,...variants.filter(v=>v!==first&&v!==last),last];
  const expectedPlacement=result.reattached?.panel??starting;
  for(const look of new Set(sequence)){
    stage=key+'/'+look;
    await replace(room,look);await focus();
    const panel=await inspect(room,id,responses);inView(panel);
    assert.deepEqual(panel.node.transform,expectedPlacement.node.transform);
    assert.deepEqual(panel.node.attachment,expectedPlacement.node.attachment);
    const image=key+'-'+look.replace('@','-v')+'.png';
    await shot(image);await hold(800);result.looks.push({panel,image});
  }
  const expected=result.looks.at(-1).panel;
  assert.equal(new Set(result.looks.map(row=>row.panel.asset.sha256)).size,revision?2:4);
  assert.equal(new Set(result.looks.map(row=>row.panel.shape)).size,revision?2:4);
  stage=key+'/save';
  const text=await save(room);
  if(!revision){
    stage=key+'/walls';
    result.walls=await wallModes(room,responses,text);
    for(const kind of new Set(room.blocked.map(row=>row.kind))){
      stage=key+'/reject-'+kind;
      result.rejections.push(await rejectImport(room,room.blocked.find(row=>row.kind===kind),text));
    }
    assert.equal(await save(room),text);
  }
  await focus();await shot(key+'-saved.png');await hold(1400);
  await close();
  if(activeVideo){await archive(activeVideo.video,key+'-normal.webm');activeVideo=null;}
  stage=key+'/cold';
  const cold=await reopen(room,profile,text,expected,prior);
  result.cold.push(cold.receipt);
  if(revision||keys.length===1){await close();return {id:room.company,text};}
  stage=key+'/cold-second';
  await replace(room,secondCold);await focus();
  const second=await inspect(room,id,cold.responses),finalText=await save(room);await close();
  result.cold.push((await reopen(room,profile,finalText,second,prior)).receipt);
  await close();return {id:room.company,text:finalText};
}

(async()=>{
  stage='identities';await prepare();base=await serve();
  const profile=await fs.mkdtemp(path.join(temp,'profile-')),prior=[];
  for(const [index,key] of keys.entries())prior.push(await exercise(key,index,profile,prior));
  if(!revision&&keys.length===2){
    assert.deepEqual(report.rooms.flatMap(o=>o.cold.map(c=>c.look)).sort(),[...variants].sort());
    assert.deepEqual([...new Set(report.rooms.flatMap(o=>o.rejections.map(c=>c.sourcePortal.kind)))].sort(),['portal','window']);
  }
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
