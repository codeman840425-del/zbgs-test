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
const revision=flags.includes('--framed-v2');
const dev=/^[a-f0-9]{12}$/.test(pin);
assert(input&&(dev||/^[a-f0-9]{64}$/.test(pin))&&args.length===(dev?2:1)&&
  flags.length===Number(record)+Number(revision)+overrides.length&&new Set(flags).size===flags.length&&overrides.length<=2&&
  overrides.every(v=>/^[a-z][a-z0-9-]{0,62}$/.test(v)),
  'Use PACKAGE MANIFEST_SHA NEW_OUT or DIST BUILD BATCH_ROOT NEW_OUT [--record] [--room=KEY] [--framed-v2]');
assert(!args.at(-1).split(/[\\/]/).includes('..'),'Output path cannot contain traversal');
const source=path.resolve(__dirname,'../..');
const keys=overrides.length?overrides:['glass-studio','glass-rental'];
const variants=['clear','frosted','tinted','framed'].map(name=>'glass-partition-'+name+'@1');
const viewport={width:1600,height:900},mathModule='/__glass-partition-qa/three.core.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const execute=promisify(execFile);
const ref=resource=>resource.id+'@'+resource.version;
const report={status:'running',scope:'Rendered optical contrast through physical partitions, native room editing, and cold recovery.',
  recordingRequested:record,framedRevision:revision,rooms:[],files:[],browserErrors:[]};
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
    assert(script.equals(await pinned('source/scripts/company-platform/qa-glass-partition.cjs')));
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

const find=(doc,id)=>doc.nodes.find(n=>n.id===id);
const floorAngle=yaw=>((Math.round(yaw*180/Math.PI)%360)+360)%360;
const pose=(position,yaw)=>({position,yaw});
const checks={
  'glass-studio':{witnesses:['sofa'],move:pose([0,0,.22],Math.PI/2),
    turn:pose([0,0,1.65],0),reject:pose([1.46,0,2.64],0),door:'entry'},
  'glass-rental':{witnesses:['desk','chair'],move:pose([-.85,0,1.47],0),
    turn:pose([1.65,0,-.12],Math.PI/2),reject:pose([-1.90,0,0],Math.PI/2),door:'portal-work-living'},
};

async function visit(key,responses,savedId){
  const file='data/rooms/'+key+'/save.json',fixture=dev?path.join(batch,key,'save.json'):path.join(bundle,file);
  const bytes=savedId?null:dev?await fs.readFile(fixture):await pinned(file);
  const url=new URL(base),id=savedId??JSON.parse(bytes).document.id;
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
    assert(![...responses.keys()].some(name=>name==='/delivery-save.json'||name.startsWith('/delivery-room/')));
  }else{
    const envelope=JSON.parse(bytes);
    assert.equal(envelope.schema,'company-save');assert.deepEqual(await current(),envelope.document);
    if(!dev){const response=responses.get('/delivery-room/'+key+'.json');assert.equal(response?.status(),200);assert(bytes.equals(await response.body()));}
  }
  return bytes;
}

async function discover(key){
  const doc=await current();
  const ids=await page.evaluate(()=>company.session.document.nodes.filter(n=>n.kind==='facility'&&company.catalog.resources.some(r=>
    r.id===n.resource.id&&r.version===n.resource.version&&r.mountRole==='glass-partition')).map(n=>n.id));
  assert.equal(ids.length,1,'Expected one actual fixed glass partition');
  const screen=find(doc,ids[0]),area=find(doc,screen.parentId),floor=find(doc,area.parentId),plan=checks[key];
  assert(plan&&floor.kind==='floor'&&area.kind==='room',key);
  const door=[...(floor.exteriorEntrances??[]),...(floor.connections??[])].find(p=>p.id===floor.id+'/'+plan.door);
  assert(door&&[door.regionId,door.from?.regionId,door.to?.regionId].includes(area.id),plan.door);
  const targets=plan.witnesses.map(name=>area.id+'/'+name);
  assert(targets.every(id=>find(doc,id)?.parentId===area.id));
  return {key,company:doc.id,id:area.id,floor:floor.id,screen,targets,plan,door:door.id};
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
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(room.screen.id);
}
const focus=()=>page.locator('#edit-focus').click();

async function geometry(room,responses){
  const data=await page.evaluate(async({id,roomId,mathModule})=>{
    const {Vector3,Box3,Raycaster}=await import(mathModule);
    const {session:{scene,document:doc},catalog,camera,renderer}=company;
    company.drawHostFrame();camera.updateMatrixWorld(true);scene.root.updateMatrixWorld(true);
    const n=doc.nodes.find(n=>n.id===id),resource=catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version);
    const root=scene.root,object=root.getObjectByName(id);
    const slab=root.getObjectByName('Floor:'+roomId),ceiling=root.getObjectByName('Ceiling:'+roomId);
    if(object?.parent?.name!==roomId||!slab?.isMesh||!ceiling?.isMesh)throw Error('Missing physical floor/ceiling or installed partition');
    const {object:blocked,...obstacle}=scene.navigation().obstacles.find(o=>o.instanceId===id);
    if(blocked!==object)throw Error('The active partition must remain a physical blocker');
    const inverse=object.matrixWorld.clone().invert(),box=new Box3(),opaque=[],parts=[],shape=[];
    const point=new Vector3(),projected=new Box3(),actualMeshes=new Set();
    const clean=v=>v.toArray().map(value=>Number(value.toFixed(7)));
    object.traverseVisible(mesh=>{
      if(!mesh.isMesh||!mesh.geometry.getAttribute('position'))return;
      const bounds=new Box3(),local=inverse.clone().multiply(mesh.matrixWorld),vertices=[];
      const role=mesh.userData.glazingRole,name=mesh.userData.name||mesh.name;
      if(!['pane','privacy'].includes(role))opaque.push(mesh);
      actualMeshes.add(mesh);
      for(let i=0;i<mesh.geometry.getAttribute('position').count;i++){
        mesh.getVertexPosition(i,point).applyMatrix4(local);bounds.expandByPoint(point);
        vertices.push(point.toArray().map(n=>Math.round(n*1e5)).join(','));
        projected.expandByPoint(point.applyMatrix4(object.matrixWorld).project(camera));
      }
      box.union(bounds);shape.push(vertices.sort().join('/'));
      parts.push({name,role,min:clean(bounds.min),max:clean(bounds.max),
        triangles:(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3,
        materials:[mesh.material].flat().map(m=>({alpha:m.opacity,blends:m.transparent,roughness:m.roughness,depthWrite:m.depthWrite}))});
    });
    const ray=new Raycaster(),up=new Vector3(0,1,0),down=up.clone().negate();
    const bearing=[];
    for(const x of [-1.12,0,1.12]){
      const point=object.localToWorld(new Vector3(x,.08,.03));ray.set(point,down);
      const sill=ray.intersectObject(slab)[0],top=ray.intersectObjects(opaque,false).filter(hit=>hit.point.y<=point.y).at(-1);
      const high=object.localToWorld(new Vector3(x,2.73,.03));ray.set(high,up);
      const roof=ray.intersectObject(ceiling)[0],cap=ray.intersectObjects(opaque,false).filter(hit=>hit.point.y>=high.y).at(-1);
      const origin=object.localToWorld(new Vector3(x,0,.03)),end=object.localToWorld(new Vector3(x,2.8,.03));
      bearing.push({x,lowPlate:top?.object.userData.name||top?.object.name,highPlate:cap?.object.userData.name||cap?.object.name,
        floorGap:sill?sill.point.distanceTo(origin):null,
        ceilingGap:roof?roof.point.distanceTo(end):null});
    }
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(shape.sort().join('|')));
    const geometry=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
    const rect=renderer.domElement.getBoundingClientRect(),meshes=[];
    root.traverseVisible(o=>{if(o.isMesh&&[o.material].flat().some(m=>m.visible&&m.opacity>0))meshes.push(o);});
    let visible=0;
    const {min,max}=projected;
    for(const u of [.12,.28,.44,.56,.72,.88])for(const v of [.12,.28,.44,.56,.72,.88]){
      const p={x:min.x+(max.x-min.x)*u,y:min.y+(max.y-min.y)*v};
      if(Math.abs(p.x)>=1||Math.abs(p.y)>=1)continue;
      ray.setFromCamera(p,camera);if(actualMeshes.has(ray.intersectObjects(meshes,false)[0]?.object))visible++;
    }
    return {node:n,asset:resource.asset,contract:resource.glassPartition,obstacle,bounds:{min:clean(box.min),max:clean(box.max)},
      parts,bearing,geometry,view:scene.view,root:root.uuid,world:object.matrixWorld.toArray(),
      preview:{visible,width:(max.x-min.x)*rect.width/2,height:(max.y-min.y)*rect.height/2}};
  },{id:room.screen.id,roomId:room.id,mathModule});
  assert.equal(data.view.roomId,room.id);assert.equal(data.view.floorId,room.floor);
  assert.deepEqual(data.obstacle.footprint,{center:[0,0],halfSize:[1.2,.04],blocking:true});
  assert(data.bounds.min.every((x,i)=>Math.abs(x-[-1.2,0,-.04][i])<.001));
  assert(data.bounds.max.every((x,i)=>Math.abs(x-[1.2,2.8,.04][i])<.001));
  assert(data.bearing.every(r=>r.lowPlate==='base-web'&&r.highPlate==='head-web'&&
    r.floorGap!==null&&r.floorGap<.001&&r.ceilingGap!==null&&r.ceilingGap<.001),JSON.stringify(data.bearing));
  const panes=data.parts.filter(p=>p.role==='pane'||p.role==='privacy'),frames=data.parts.filter(p=>!panes.includes(p));
  assert(frames.length>=2&&frames.every(p=>p.materials.every(m=>!m.blends&&m.alpha===1)));
  assert(panes.every(p=>p.max[2]-p.min[2]>=.004&&p.materials.every(m=>m.blends&&m.alpha<1&&m.alpha>0)));
  const r=data.node.resource,count={clear:1,frosted:2,tinted:2,framed:r.version===2?9:6}[r.id.replace('glass-partition-','')];
  assert.equal(panes.length,count);
  if(r.id.endsWith('-frosted'))assert(panes.every(p=>p.role==='privacy'));
  if(r.id.endsWith('-tinted'))assert.equal(new Set(panes.map(p=>p.materials[0].alpha)).size,2);
  const response=responses.get(data.asset.url);assert.equal(response?.status(),200,data.asset.url);
  const bytes=await response.body();
  assert.equal(bytes.length,data.asset.bytes);assert.equal(sha(bytes),data.asset.sha256);
  if(!dev)assert(bytes.equals(await pinned('viewer'+data.asset.url)));
  return data;
}

async function optics(room,name){
  const value=await page.evaluate(async({id,roomId,targets,mathModule})=>{
    const {Vector3,Box3}=await import(mathModule);
    const {session:{scene},camera,renderer}=company,root=scene.root;
    const screen=root.getObjectByName(id),objects=targets.map(name=>root.getObjectByName(name));
    if(objects.some(o=>!o?.visible)||!screen?.visible)throw Error('No actual witness behind the rendered screen');
    root.updateMatrixWorld(true);
    const local=screen.matrixWorld.clone().invert(),centres=objects.map(o=>new Box3().setFromObject(o,true).getCenter(new Vector3()).applyMatrix4(local));
    const side=Math.sign(centres[0].z);
    if(!side||centres.some(p=>p.z*side<.30))throw Error('Witness targets must occupy the same, far side of the screen');
    const centre=centres.reduce((sum,p)=>sum.add(p),new Vector3()).multiplyScalar(1/centres.length);
    const eye=new Vector3(Math.max(-.65,Math.min(.65,centre.x*.34)),1.23,0);
    const toRoom=p=>screen.parent.worldToLocal(screen.localToWorld(p.clone()));
    const origin=toRoom(eye),axis=toRoom(eye.clone().setZ(-side)).sub(origin);
    const {width:roomWidth,depth:roomDepth}=company.session.document.nodes.find(n=>n.id===roomId).bounds;
    let reach=1.83;
    for(const [k,half] of [['x',roomWidth/2],['z',roomDepth/2]]){
      if(Math.abs(axis[k])<1e-6)continue;
      reach=Math.min(reach,((half-.16)*Math.sign(axis[k])-origin[k])/axis[k]);
    }
    if(reach<.25)throw Error('Insufficient viewing position inside the near room wall');
    eye.z=-side*reach;
    const aim=eye.clone().lerp(centre,reach/(reach+Math.abs(centre.z))).setZ(0);
    const old={eye:camera.position.clone(),angle:camera.quaternion.clone(),fov:camera.fov,wall:scene.snapshot().wallView,
      screen:screen.visible,objects:objects.map(o=>o.visible)};
    const panes=[],shadow=[];
    screen.traverseVisible(mesh=>{
      if(mesh.isMesh&&['pane','privacy'].includes(mesh.userData.glazingRole))panes.push({mesh,material:mesh.material,visible:mesh.visible,castShadow:mesh.castShadow});
    });
    for(const target of objects)target.traverseVisible(mesh=>{if(mesh.isMesh)shadow.push({mesh,castShadow:mesh.castShadow});});
    if(!panes.length||!shadow.length)throw Error('Missing actual pane or target mesh');
    const canvas=document.createElement('canvas');
    const width=canvas.width=renderer.domElement.width,height=canvas.height=renderer.domElement.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    function frame(image=false){
      company.drawHostFrame();ctx.clearRect(0,0,width,height);ctx.drawImage(renderer.domElement,0,0);
      return image?canvas.toDataURL().split(',')[1]:ctx.getImageData(0,0,width,height).data;
    }
    function pair(){
      objects.forEach(o=>{o.visible=true;});const on=frame();
      objects.forEach(o=>{o.visible=false;});return [on,frame()];
    }
    const materials=[];let present,bare,opaque,empty,image;
    try{
      camera.fov=reach<1?58:old.fov;camera.updateProjectionMatrix();
      camera.position.copy(screen.localToWorld(eye.clone()));camera.lookAt(screen.localToWorld(aim.clone()));camera.updateMatrixWorld(true);
      scene.setWallView({mode:'cutaway',cameraPosition:camera.position.toArray()});
      image=frame(true);
      for(const {mesh} of [...shadow,...panes])mesh.castShadow=false;
      present=pair();
      for(const {mesh} of panes)mesh.visible=false;
      bare=pair();
      screen.visible=false;empty=pair();screen.visible=true;
      for(const {mesh,material} of panes){
        const replacements=[material].flat().map(source=>{
          const control=source.clone();
          control.transparent=false;control.opacity=1;control.depthWrite=true;
          if('transmission' in control)control.transmission=0;
          materials.push(control);return control;
        });
        mesh.material=Array.isArray(material)?replacements:replacements[0];
        mesh.visible=true;
      }
      opaque=pair();
    }finally{
      camera.fov=old.fov;camera.updateProjectionMatrix();
      camera.position.copy(old.eye);camera.quaternion.copy(old.angle);camera.updateMatrixWorld(true);
      scene.setWallView(old.wall);
      screen.visible=old.screen;
      objects.forEach((o,i)=>{o.visible=old.objects[i];});
      for(const {mesh,castShadow} of shadow)mesh.castShadow=castShadow;
      for(const {mesh,material,visible,castShadow} of panes)Object.assign(mesh,{material,visible,castShadow});
      for(const material of materials)material.dispose();
      company.drawHostFrame();
    }
    function distance(a,b,i){
      return Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
    }
    let behindPane=0,visibleThroughPane=0,paneBare=0,paneActual=0,behindFrame=0,frameBare=0,frameActual=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4,uncovered=distance(...empty,i);
      if(uncovered<24)continue;
      const noPane=distance(...bare,i),rendered=distance(...present,i);
      if(noPane<=3&&distance(bare[1],empty[1],i)>=8){
        behindFrame++;frameBare+=uncovered;frameActual+=rendered;
      }
      if(noPane<24||distance(...opaque,i)>3||distance(present[1],bare[1],i)<8)continue;
      behindPane++;paneBare+=noPane;paneActual+=rendered;
      if(rendered>=8)visibleThroughPane++;
    }
    return {image,targets,eye:eye.toArray(),eyeInRoom:toRoom(eye).toArray(),aim:aim.toArray(),witnessCentreInScreen:centres.map(p=>p.toArray()),
      dimensions:[width,height],behindPane,visibleThroughPane,behindFrame,
      retainedSignal:paneBare?paneActual/paneBare:0,frameSignal:frameBare?frameActual/frameBare:null};
  },{id:room.screen.id,roomId:room.id,targets:room.targets,mathModule});
  const {image,...metrics}=value,bytes=Buffer.from(image,'base64');
  assert(bytes.length>1024);
  const filename=room.key+'-'+name+'-optical-view.png';
  await fs.writeFile(path.join(output,filename),bytes,{flag:'wx'});
  report.files.push({name:filename,bytes:bytes.length,sha256:sha(bytes)});
  return {...metrics,image:filename};
}

async function setLook(room,target){
  const expected=await current(),n=find(expected,room.screen.id),[id,version]=target.split('@');
  if(ref(n.resource)===target)return;
  const defaults=await page.evaluate(r=>company.catalog.resources.find(x=>x.id===r.id&&x.version===r.version).stateDefaults,n.resource);
  n.state={...defaults,...n.state};n.resource={id,version:Number(version)};expected.revision++;
  await page.locator('#edit-look').selectOption(target);await updated(expected);
}
async function updated(expected){
  await page.waitForFunction(rev=>company.session.document.revision===rev,expected.revision);await ready();
  assert.deepEqual(await current(),expected);
}
async function fillPose(transform){
  for(const selector of ['#placement-tools','#placement-tools > details']){
    const row=page.locator(selector);
    if(!await row.evaluate(n=>n.open))await row.locator(':scope > summary').click();
  }
  assert(await page.locator('#edit-y').isDisabled()&&transform.position[1]===0);
  for(const [axis,i] of [['x',0],['z',2]])await page.locator('#edit-'+axis).fill(String(transform.position[i]));
  await page.locator('#edit-yaw').selectOption(String(floorAngle(transform.yaw)));
}
async function move(room,transform){
  const expected=await current();find(expected,room.screen.id).transform=transform;expected.revision++;
  await fillPose(transform);await page.locator('#edit-position').click();await updated(expected);await focus();
}
async function save(room){
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false'&&!document.querySelector('#save').disabled);
  const text=await saved(room.company);assert.deepEqual(JSON.parse(text).document,await current());return text;
}
async function rejectDoor(room,text){
  const before=await current(),root=await page.evaluate(()=>company.session.scene.root.uuid);
  await fillPose(room.plan.reject);
  const start=report.browserErrors.length;
  const [event]=await Promise.all([page.waitForEvent('console',e=>e.type()==='error'),page.locator('#edit-position').click()]);
  assert.deepEqual(report.browserErrors.splice(start),[{stage,message:event.text()}]);
  const error=await event.args()[0].evaluate(e=>({code:e.code,path:e.path,details:e.details}));
  assert.equal(error.code,'blocked-portal');assert.equal(error.path,room.door);
  assert.equal(error.details?.obstacleId,room.screen.id);
  await page.waitForFunction(()=>document.querySelector('#status').dataset.error==='true'&&!document.querySelector('#edit-position').disabled);
  const message=await page.locator('#edit-message').textContent();assert(message.includes('门口')&&message.includes('已保留'),message);
  assert.deepEqual(await current(),before);assert.equal(await saved(room.company),text);
  assert.equal(await page.evaluate(()=>company.session.scene.root.uuid),root);
  await shot(room.key+'-rejected-door.png');await hold(1050);
  return {attempt:room.plan.reject,error,message,sameSave:true};
}

const stationary=({root,preview,view,...rest})=>rest;
async function cold(room,profile,text,expected,prior){
  const responses=await open(profile);
  await visit(room.key,responses,room.company);
  assert.deepEqual(await current(),JSON.parse(text).document);
  assert.equal(await saved(room.company),text);
  for(const last of prior)assert.equal(await saved(last.id),last.text);
  await enter(room);await focus();
  const actual=await geometry(room,responses);
  assert.deepEqual(stationary(actual),stationary(expected));
  const look=ref(actual.node.resource),image=room.key+'-restored-'+look.replace('@','-v')+'.png';
  await shot(image);
  return {responses,receipt:{look,sha256:sha(text),sameBytes:true,withoutDelivery:true,image}};
}

async function exercise(key,index,profile,prior){
  stage=key+'/entry';
  const responses=await open(profile,record);
  if(record)activeVideo={key,video:page.video()};
  const bytes=await visit(key,responses),room=await discover(key);
  const receipt={room,sourceSha256:sha(bytes),looks:[],cold:[]};report.rooms.push(receipt);
  await enter(room);
  const first=ref(room.screen.resource),coldPair=index?[variants[3],variants[1]]:[variants[2],variants[0]];
  if(first===coldPair[0])coldPair.reverse();
  const [last,returnLook]=coldPair;
  if(revision)assert.equal(first,'glass-partition-framed@1','Receiver fixture must begin with original framed screen');
  const sequence=revision?[first,'glass-partition-framed@2']:[first,...variants.filter(v=>v!==first&&v!==last),last];
  for(const look of new Set(sequence)){
    stage=key+'/'+look;
    await setLook(room,look);await focus();
    const actual=await geometry(room,responses);
    assert(actual.preview.visible>=4&&actual.preview.height>90,JSON.stringify(actual.preview));
    assert.deepEqual(actual.node.transform,room.screen.transform);assert.equal(actual.node.parentId,room.id);
    const name=look.replace('@','-v');
    if(look===first||look===last||revision)await shot(key+'-'+name+'-native.png');
    const measurements=await optics(room,name);
    receipt.looks.push({panel:actual,measurements});
    assert(measurements.behindPane>=200,JSON.stringify(measurements));
    if(!look.startsWith('glass-partition-frosted'))
      assert(measurements.visibleThroughPane>=100&&measurements.retainedSignal>.12,JSON.stringify(measurements));
    await hold(850);
  }
  const unique=new Set(receipt.looks.map(row=>row.panel.geometry));
  assert.equal(unique.size,revision?2:4);
  assert.equal(new Set(receipt.looks.map(row=>row.panel.asset.sha256)).size,unique.size);
  if(!revision){
    const byName=name=>receipt.looks.find(row=>row.panel.node.resource.id==='glass-partition-'+name).measurements;
    const clear=byName('clear'),frosted=byName('frosted'),framed=byName('framed');
    assert(frosted.retainedSignal<clear.retainedSignal*.85,JSON.stringify({clear,frosted}));
    assert(framed.behindFrame>=35&&framed.frameSignal<.08,JSON.stringify(framed));
  }
  const lastGeometry=receipt.looks.at(-1).panel;
  let fitted=lastGeometry;
  if(!revision){
    stage=key+'/move';
    await move(room,room.plan.move);receipt.moved=await geometry(room,responses);await hold(800);
    stage=key+'/quarter-turn';
    await move(room,room.plan.turn);fitted=receipt.turned=await geometry(room,responses);
    assert.equal(fitted.geometry,lastGeometry.geometry);
    assert(Math.abs(fitted.obstacle.hw-lastGeometry.obstacle.hd)<1e-6&&Math.abs(fitted.obstacle.hd-lastGeometry.obstacle.hw)<1e-6);
    await shot(key+'-quarter-turned.png');await hold(800);
  }
  stage=key+'/save';const text=await save(room);
  if(!revision){stage=key+'/door';receipt.rejected=await rejectDoor(room,text);assert.equal(await save(room),text);}
  await focus();await shot(key+'-saved.png');await hold(1300);
  await close();
  if(activeVideo){await archive(activeVideo.video,key+'-normal.webm');activeVideo=null;}
  stage=key+'/cold';const restored=await cold(room,profile,text,fitted,prior);receipt.cold.push(restored.receipt);
  if(revision||keys.length===1){await close();return {id:room.company,text};}
  stage=key+'/cold-second';
  await setLook(room,returnLook);await focus();
  const other=await geometry(room,restored.responses),finalText=await save(room);
  await close();
  receipt.cold.push((await cold(room,profile,finalText,other,prior)).receipt);
  await close();return {id:room.company,text:finalText};
}

(async()=>{
  stage='identities';await prepare();base=await serve();
  const profile=await fs.mkdtemp(path.join(temp,'profile-')),prior=[];
  for(const [index,key] of keys.entries())prior.push(await exercise(key,index,profile,prior));
  if(!revision&&keys.length===2){
    assert.deepEqual(report.rooms.flatMap(r=>r.cold.map(c=>c.look)).sort(),[...variants].sort());
    assert(report.rooms[0].looks[0].measurements.eye[2]*report.rooms[1].looks[0].measurements.eye[2]<0);
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
