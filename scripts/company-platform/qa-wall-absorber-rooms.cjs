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
const record=options.includes('--record'),requireDcc=options.includes('--require-dcc');
const args=options.filter(v=>v!=='--record'&&v!=='--require-dcc');
const dev=/^[a-f0-9]{12}$/.test(pin);
assert(input&&(dev||/^[a-f0-9]{64}$/.test(pin))&&args.length===(dev?2:1)&&
  options.length===args.length+Number(record)+Number(requireDcc),
  'Use PACKAGE MANIFEST_SHA NEW_OUT or DIST BUILD BATCH_ROOT NEW_OUT, with optional --record and --require-dcc');
assert(!args.at(-1).split(/[\\/]/).includes('..'),'Output path cannot contain traversal');
const source=path.resolve(__dirname,'../..');
const keys=['wall-absorber-studio','wall-absorber-rental'];
const viewport={width:1600,height:900},mathModule='/__wall-absorber-qa/three.core.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const execute=promisify(execFile);
const ref=resource=>resource.id+'@'+resource.version;
const report={status:'running',scope:'Actual wall-mounted geometry and viewing, ordinary edits, and cold recovery.',
  recordingRequested:record,dccRequired:requireDcc,rooms:[],files:[],browserErrors:[]};
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
    assert(script.equals(await pinned('source/scripts/company-platform/qa-wall-absorber-rooms.cjs')));
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

const looks=['honeyfelt','timber','upholstered','foam'].map(style=>'wall-absorber-'+style+'@1');
const dccLook='wall-absorber-timber@2';
const item=(doc,id)=>doc.nodes.find(n=>n.id===id);
const mountEdge=yaw=>['north','west','south','east'][((Math.round(yaw/(Math.PI/2))%4)+4)%4];
const rounded=value=>Number(value.toFixed(4));
const withSlide=(panel,along,offset,y=panel.transform.position[1])=>{
  const t=structuredClone(panel.transform);t.position[along]=rounded(offset);t.position[1]=rounded(y);return t;
};

async function loadRoom(key,responses,{cold=false,direct}={}){
  const url=new URL(base),relative='data/rooms/'+key+'/save.json';
  const filename=dev?path.join(batch,key,'save.json'):path.join(bundle,relative);
  const bytes=cold?null:dev?await fs.readFile(filename):await pinned(relative);
  if(!cold&&!dev)url.searchParams.set('delivery',key);
  if(direct)url.searchParams.set('object',direct);
  await page.goto(url.href);await ready();
  const build=await page.evaluate(()=>company.buildInfo);
  assert.equal(build.shortId,report.build);assert.equal(build.sourceDigest,report.sourceDigest);
  if(!cold&&dev){
    const menu=page.locator('details.file-menu');
    await menu.locator('summary').click();
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#import').click()]);
    await chooser.setFiles(filename);
    if(await menu.evaluate(node=>node.open))await menu.locator('summary').click();
  }
  await page.waitForFunction(id=>company.session.document.id===id,key);
  await ready();
  if(cold){
    assert.equal(await page.locator('#status').textContent(),'已恢复上次保存的方案。');
    assert(![...responses.keys()].some(url=>url==='/delivery-save.json'||url.startsWith('/delivery-room/')));
  }else{
    const saved=JSON.parse(bytes);assert.equal(saved.schema,'company-save');
    assert.deepEqual(await current(),saved.document);
    if(!dev){
      const response=responses.get('/delivery-room/'+key+'.json');
      assert.equal(response?.status(),200);assert(bytes.equals(await response.body()));
    }
  }
  return bytes;
}

async function findRoom(key){
  const {doc,facilities}=await page.evaluate(()=>{
    const doc=company.session.document;
    return {doc,facilities:doc.nodes.filter(n=>n.kind==='facility').map(n=>({
      id:n.id,resource:company.catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version),
    }))};
  });
  const candidates=facilities.filter(f=>f.resource?.mountRole==='wall-absorber-panel');
  assert.equal(candidates.length,1);
  const panel=item(doc,candidates[0].id),room=item(doc,panel.parentId),floor=item(doc,room.parentId);
  assert.equal(room.kind,'room');assert.equal(floor.kind,'floor');
  assert(doc.singingRooms.some(rule=>rule.regionId===room.id&&Object.values(rule.roles).every(id=>item(doc,id))),room.id);
  assert.equal(ref(panel.resource),key===keys[0]?looks[0]:looks[1]);
  const edge=mountEdge(panel.transform.yaw),along=['north','south'].includes(edge)?0:2,normal=2-along;
  const connects=(floor.connections??[]).flatMap(c=>[c.from,c.to].map(side=>({...side,id:c.id})));
  const portal=[...connects,...(floor.exteriorEntrances??[])].find(p=>p.regionId===room.id&&p.edge===edge);
  assert(portal,'The installed wall must have an actual opening for the doorway trial');
  const sameRegion=facilities.map(f=>({...f,node:item(doc,f.id)})).filter(f=>f.node.parentId===room.id);
  const window=sameRegion.find(f=>f.resource.windowSystem&&mountEdge(f.node.transform.yaw)===edge)?.node;
  const background=sameRegion.find(f=>f.resource.mountRole==='background-panel'&&mountEdge(f.node.transform.yaw)===edge)?.node;
  const doorway={kind:'doorway',id:portal.id,transform:withSlide(panel,along,portal.offset),code:'wall-display-over-portal'};
  let overlap=window&&{kind:'window',id:window.id,
    transform:withSlide(panel,along,window.transform.position[along],window.transform.position[1]),code:'wall-display-over-window'};
  if(!overlap&&background){
    const transform=withSlide(background,along,panel.transform.position[along]-.35);
    const wall=panel.transform.position[normal];
    transform.position[normal]=rounded(wall-Math.sign(wall)*.05);
    overlap={kind:'background',id:background.id,subject:background.id,transform,code:'wall-absorber-occupied'};
  }
  const moved=withSlide(panel,along,panel.transform.position[along]-.1);
  return {key,id:panel.id,roomId:room.id,floorId:floor.id,edge,along,normal,moved,doorway,overlap,initial:panel};
}

const view=()=>page.evaluate(()=>company.session.scene.view);
async function enter(room){
  if((await view()).floorId!==room.floorId){
    await page.locator('#floor').selectOption(room.floorId);
    await page.waitForFunction(id=>company.session.scene.view.floorId===id&&!document.querySelector('#room').disabled,room.floorId);
  }
  await page.locator('#room').selectOption(room.roomId);
  await page.waitForFunction(id=>company.session.scene.view.mode==='room'&&company.session.scene.view.roomId===id,room.roomId);
  await ready();
  await select(room.id);
}
async function select(id){
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(id);
  assert.equal(await page.locator('#edit-instance').inputValue(),id);
}
const focus=()=>page.locator('#edit-focus').click();
const wallMode=mode=>page.locator('#wall-view').selectOption(mode);

async function observe(room,project=true){
  const result=await page.evaluate(async({room,project,mathModule})=>{
    const {Vector3,Box3,Raycaster}=await import(mathModule);
    const {camera,renderer,session:{scene,document:doc},catalog}=company;
    company.drawHostFrame();camera.updateMatrixWorld(true);scene.root.updateMatrixWorld(true);
    const panel=scene.root.getObjectByName(room.id),region=scene.root.getObjectByName(room.roomId);
    const instance=doc.nodes.find(n=>n.id===room.id);
    const resource=catalog.resources.find(r=>r.id===instance.resource.id&&r.version===instance.resource.version);
    if(!panel||panel.parent!==region||resource.mount!=='wall')throw Error('Missing installed wall panel');
    const wallView=scene.wallPresentation();
    const wallMeshes=wallView.walls.filter(w=>w.region===room.roomId&&w.edge===room.edge)
      .map(w=>scene.root.getObjectByName(w.id)).filter(Boolean);
    if(!wallMeshes.length)throw Error('Missing wall mesh');
    const local=panel.matrixWorld.clone().invert(),bounds=new Box3();
    const a=new Vector3(),b=new Vector3(),c=new Vector3(),ab=new Vector3(),ac=new Vector3(),normal=new Vector3();
    const triangles=[],parts=[];
    let contactArea=0,sideArea=0,frontArea=0;
    panel.traverse(mesh=>{
      if(!mesh.isMesh||!mesh.geometry.getAttribute('position'))return;
      const {index,attributes,groups,drawRange}=mesh.geometry,num=index?.count??attributes.position.count;
      const draws=Array.isArray(mesh.material)?groups:[{start:0,count:num,materialIndex:0}];
      const matrix=local.clone().multiply(mesh.matrixWorld);
      const verts=(i,target)=>mesh.getVertexPosition(index?index.getX(i):i,target).applyMatrix4(matrix);
      parts.push(mesh.userData.name||mesh.name);
      for(const draw of draws){
        const mat=[mesh.material].flat()[draw.materialIndex];
        if(!mat?.visible||mat.opacity<=0)continue;
        const max=Math.min(num,draw.start+draw.count,drawRange.start+drawRange.count);
        for(let i=Math.max(draw.start,drawRange.start);i+2<max;i+=3){
          verts(i,a);verts(i+1,b);verts(i+2,c);
          normal.crossVectors(ab.subVectors(b,a),ac.subVectors(c,a)).multiplyScalar(.5);
          if(normal.lengthSq()<1e-20)continue;
          bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);
          const low=Math.min(a.z,b.z,c.z),high=Math.max(a.z,b.z,c.z);
          if(low>=-.001&&high<=.001)contactArea+=Math.abs(normal.z);
          if(high-low>.001)sideArea+=Math.hypot(normal.x,normal.y);
          if(low>.001)frontArea+=Math.abs(normal.z);
          triangles.push([a,b,c].map(p=>p.toArray().map(n=>Math.round(n*1e5)).join(',')).sort().join('/'));
        }
      }
    });
    const clean=v=>v.toArray().map(n=>Number(n.toFixed(7)));
    const ray=new Raycaster(),front=panel.getWorldDirection(new Vector3()),center=panel.getWorldPosition(new Vector3());
    const intoWall=front.clone().negate();
    const support=[-.18,0,.18].flatMap(x=>[-.4,0,.4].map(y=>{
      ray.set(panel.localToWorld(new Vector3(x,y,.20)),intoWall);
      const hit=ray.intersectObjects(wallMeshes,true)[0];
      return hit?{mesh:hit.object.name,gap:clean(hit.point.applyMatrix4(local))[2]}:null;
    }));
    const binding=wallView.walls.find(w=>w.id===support[4]?.mesh&&w.mounted.some(m=>m.id===room.id));
    if(!binding)throw Error('The actual backing wall segment does not own this panel');
    const contact=support.map(hit=>hit?.gap??null);
    const points={triangles:triangles.length,parts,bounds:{min:clean(bounds.min),max:clean(bounds.max)},contactArea,sideArea,frontArea,contact};
    const data=new TextEncoder().encode(triangles.sort().join('|'));
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
    const provenance=resource.provenance??{};
    const design={kind:provenance.sourceDesign,author:provenance.sourceAuthor,license:provenance.sourceLicense,
      original:provenance.dependencies?.originalModel,editable:provenance.dependencies?.editableSource};
    const result={instance,asset:resource.asset,design,mount:resource.mounting,digest,points,
      world:panel.matrixWorld.toArray(),front:clean(front),interiorFacing:front.dot(region.getWorldPosition(new Vector3()).sub(center).normalize()),
      visible:panel.visible,wall:{id:binding.id,edge:binding.edge,height:binding.height,visible:binding.visible,
        mounted:binding.mounted.find(m=>m.id===room.id).visible,mode:wallView.mode},uuid:scene.root.uuid};
    if(!project)return result;
    const screen=renderer.domElement.getBoundingClientRect(),owners=[];
    scene.root.traverseVisible(o=>{if(o.isMesh&&[o.material].flat().some(m=>m.visible&&m.opacity>0))owners.push(o);});
    const samples=[];
    let first=0;
    for(const x of [.1,.3,.5,.7,.9])for(const y of [.1,.3,.5,.7,.9]){
      const point=new Vector3(bounds.min.x+x*(bounds.max.x-bounds.min.x),bounds.min.y+y*(bounds.max.y-bounds.min.y),bounds.max.z);
      const projected=point.applyMatrix4(panel.matrixWorld).project(camera);
      samples.push(projected);
      if(Math.abs(projected.x)>=1||Math.abs(projected.y)>=1||Math.abs(projected.z)>=1)continue;
      ray.setFromCamera(projected,camera);
      for(let o=ray.intersectObjects(owners,false)[0]?.object;o;o=o.parent)if(o===panel){first++;break;}
    }
    const width=(Math.max(...samples.map(p=>p.x))-Math.min(...samples.map(p=>p.x)))*screen.width/2;
    const height=(Math.max(...samples.map(p=>p.y))-Math.min(...samples.map(p=>p.y)))*screen.height/2;
    result.projection={first,width,height,frontFacing:front.dot(camera.position.clone().sub(center).normalize())};
    return result;
  },{room,project,mathModule});
  assert.deepEqual(result.mount,{origin:'center',width:.6,height:1.2,depth:.08});
  assert(result.points.triangles>0&&result.interiorFacing>0);
  const {contactArea,sideArea,frontArea,contact,bounds:{min,max}}=result.points;
  assert(contactArea>.0001&&sideArea>.0001&&frontArea>.0001&&max[2]>=.01&&max[2]<=.081&&min[2]>=-.001);
  assert(contact.every(gap=>gap!==null&&Math.abs(gap)<.002),JSON.stringify({wall:result.wall,gaps:contact}));
  assert.equal(result.wall.height,2.8);
  assert.equal(result.visible,result.wall.visible);assert.equal(result.visible,result.wall.mounted);
  return result;
}

async function seenAsset(panel,responses){
  const {asset}=panel,response=responses.get(asset.url);
  assert.equal(response?.status(),200,'Expected browser response for '+asset.url);
  const bytes=await response.body();
  assert.equal(bytes.length,asset.bytes);assert.equal(sha(bytes),asset.sha256);
  if(!dev)assert((await pinned('viewer'+asset.url)).equals(bytes));
}
function physical(panel){
  const {instance,asset,digest,points,world,front}=panel;
  return {instance,asset,digest,points,world,front};
}
function assertReadable(panel){
  const p=panel.projection;
  assert(panel.visible&&p.frontFacing>.5&&p.first>=10&&p.width>=40&&p.height>=75,JSON.stringify(p));
}

async function cutaway(room){
  const initial=await observe(room);await shot(room.key+'-overview.png');
  await focus();const front=await observe(room);assertReadable(front);
  await shot(room.key+'-wall-front.png');await hold(900);
  const box=await page.locator('#stage canvas').boundingBox();
  assert(box&&box.width>box.height*.55);
  const x=box.x+box.width*.2,y=box.y+box.height*.43;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x+box.height*.5,y,{steps:12});await page.mouse.up();
  const hidden=await observe(room);
  assert.equal(hidden.wall.mode,'cutaway');assert.equal(hidden.visible,false);
  assert.equal(hidden.projection.first,0);
  assert.deepEqual(physical(hidden),physical(front));
  await shot(room.key+'-wall-cutaway.png');await hold(900);
  await wallMode('full');await ready();
  const full=await observe(room);
  assert.equal(full.wall.mode,'full');assert.equal(full.visible,true);
  assert.deepEqual(physical(full),physical(front));
  await shot(room.key+'-wall-full.png');await hold(900);
  await wallMode('cutaway');await ready();await focus();
  const restored=await observe(room);assertReadable(restored);
  assert.deepEqual(physical(restored),physical(front));
  await shot(room.key+'-wall-restored.png');await hold(900);
  return {initial,front,hidden,full,restored};
}

async function replace(room,target){
  const expected=await current(),n=item(expected,room.id),[id,version]=target.split('@');
  assert.notEqual(ref(n.resource),target);
  const oldDefaults=await page.evaluate(old=>company.catalog.resources.find(r=>r.id===old.id&&r.version===old.version).stateDefaults,n.resource);
  n.state={...oldDefaults,...n.state};n.resource={id,version:Number(version)};expected.revision++;
  const menu=page.locator('#edit-look');
  await menu.selectOption(target);
  await page.waitForFunction(({id,target,revision})=>{
    const doc=company.session.document,n=doc.nodes.find(row=>row.id===id);
    return doc.revision===revision&&n.resource.id+'@'+n.resource.version===target;
  },{id:room.id,target,revision:expected.revision});
  await ready();
  assert.deepEqual(await current(),expected);
  assert.equal(await menu.inputValue(),target);
}

async function moveFields(room,transform,wall=true){
  for(const selector of ['#placement-tools','#placement-tools > details']){
    const details=page.locator(selector);
    if(!await details.evaluate(node=>node.open))await details.locator(':scope > summary').click();
  }
  const xyz=['x','y','z'].map(axis=>page.locator('#edit-'+axis));
  const yaw=page.locator('#edit-yaw'),degrees=String(((Math.round(transform.yaw*180/Math.PI)%360)+360)%360);
  if(wall)assert(await xyz[room.normal].isDisabled()&&await yaw.isDisabled());
  for(const [axis,field] of xyz.entries()){
    if(await field.isDisabled())assert.equal(Number(await field.inputValue()),transform.position[axis]);
    else await field.fill(String(transform.position[axis]));
  }
  if(await yaw.isDisabled())assert.equal(await yaw.inputValue(),degrees);
  else await yaw.selectOption(degrees);
}

async function move(room){
  const expected=await current(),n=item(expected,room.id);
  n.transform=room.moved;expected.revision++;
  await moveFields(room,room.moved);
  await page.locator('#edit-position').click();
  await page.waitForFunction(revision=>company.session.document.revision===revision,expected.revision);
  await ready();assert.deepEqual(await current(),expected);
  await focus();const panel=await observe(room);assertReadable(panel);
  await shot(room.key+'-shifted.png');await hold(900);
  return panel;
}

async function reject(room,trial,text){
  const before=await current(),actual=await observe(room,false);
  await select(trial.subject??room.id);
  await moveFields(room,trial.transform,!trial.subject);
  const start=report.browserErrors.length;
  const [event]=await Promise.all([page.waitForEvent('console',e=>e.type()==='error'),page.locator('#edit-position').click()]);
  assert.deepEqual(report.browserErrors.splice(start),[{stage,message:event.text()}]);
  const error=await event.args()[0].evaluate(e=>({code:e.code,path:e.path,details:e.details}));
  assert.equal(error.code,trial.code);
  assert.equal(error.path,room.id);
  if(trial.kind==='background')assert.equal(error.details.other,trial.id);
  await page.waitForFunction(()=>document.querySelector('#status').dataset.error==='true'&&!document.querySelector('#edit-position').disabled);
  const feedback=await page.locator('#status').textContent();
  assert(feedback.includes('已保留'),feedback);
  assert.equal(await page.locator('#edit-message').getAttribute('data-error'),'true');
  assert.deepEqual(await current(),before);assert.deepEqual(await observe(room,false),actual);
  assert.equal(await saved(room.key),text);
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'),'false');
  await shot(room.key+'-rejected-'+trial.kind+'.png');await hold(1300);
  return {trial,error,feedback,saveSha256:sha(text)};
}

async function save(room){
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false'&&!document.querySelector('#save').disabled);
  const text=await saved(room.key);
  assert.deepEqual(JSON.parse(text).document,await current());
  return text;
}

async function cold(room,expect,profile,text,prior){
  const responses=await open(profile);
  await loadRoom(room.key,responses,{cold:true});
  assert.equal(await saved(room.key),text);assert.deepEqual(await current(),JSON.parse(text).document);
  if(prior)assert.equal(await saved(prior.key),prior.text);
  await enter(room);await focus();
  const state=await observe(room);assertReadable(state);
  await seenAsset(state,responses);
  assert.deepEqual(physical(state),physical(expect));
  const name=room.key+'-restored-'+ref(state.instance.resource).replace('@','-v')+'.png';
  await shot(name);
  return {panel:state,sha256:sha(text),sameBytes:true,withoutDelivery:true,image:name};
}

async function exercise(key,profile,prior){
  stage=key+'/load';
  const responses=await open(profile,record);
  if(record)activeVideo={key,video:page.video()};
  const bytes=await loadRoom(key,responses),room=await findRoom(key);
  const receipt={key,room,sourceSha256:sha(bytes),looks:[],cold:[],rejections:[]};report.rooms.push(receipt);
  await enter(room);
  stage=key+'/wall';
  receipt.wall=await cutaway(room);
  const starting=receipt.wall.front,origin=ref(starting.instance.resource);
  const options=await page.locator('#edit-look option').evaluateAll(rows=>rows.map(o=>o.value).filter(Boolean));
  const firstCold=key===keys[0]?looks[2]:looks[3];
  const remaining=looks.filter(look=>look!==origin&&look!==firstCold);
  const sequence=requireDcc?[origin,dccLook]:[origin,...remaining,firstCold];
  assert(sequence.every(look=>options.includes(look)),JSON.stringify(options));
  for(const [index,look] of sequence.entries()){
    stage=key+'/'+look;
    if(index)await replace(room,look);
    await focus();const observed=await observe(room);
    await seenAsset(observed,responses);assertReadable(observed);
    assert.equal(observed.instance.parentId,starting.instance.parentId);
    assert.deepEqual(observed.instance.transform,starting.instance.transform);
    assert.deepEqual(observed.world,starting.world);
    receipt.looks.push(observed);
    await shot(key+'-'+look.replace('@','-v')+'.png');await hold(900);
  }
  assert.equal(new Set(receipt.looks.map(p=>p.digest)).size,sequence.length);
  assert.equal(new Set(receipt.looks.map(p=>p.asset.sha256)).size,sequence.length);
  if(requireDcc){
    const authored=receipt.looks.at(-1);
    const normalize=name=>name.toLowerCase().replaceAll(/[^a-z0-9]+/g,'-');
    const parts=authored.points.parts.map(normalize);
    assert.equal(authored.design.kind,'dcc');
    assert.equal(authored.design.license,'Project-authored');
    assert.equal(authored.design.original?.sha256,authored.asset.sha256);
    assert(authored.design.editable?.path.endsWith('/author-chevron.py'));
    assert(parts.includes('mounting-board'));
    assert.equal(parts.filter(part=>/^chevron-[1-8]-(left|right)$/.test(part)).length,16);
    assert(starting.points.parts.some(part=>part==='timber-batten-7'));
  }
  stage=key+'/shift';
  receipt.shifted=requireDcc?receipt.looks.at(-1):await move(room);
  assert.equal(receipt.shifted.digest,receipt.looks.at(-1).digest);
  assert.equal(receipt.shifted.instance.parentId,room.initial.parentId);
  const text=await save(room);
  await shot(key+'-saved.png');await hold(1000);
  if(!requireDcc){
    for(const trial of [room.doorway,room.overlap].filter(Boolean)){
      stage=key+'/rejected-'+trial.kind;
      receipt.rejections.push(await reject(room,trial,text));
    }
    await readyAfterSave(room,text);
  }
  await close();
  if(activeVideo){await archive(activeVideo.video,key+'-normal.webm');activeVideo=null;}
  stage=key+'/cold';
  receipt.cold.push(await cold(room,receipt.shifted,profile,text,prior));
  if(requireDcc){await close();return {key,text};}

  stage=key+'/cold-original';
  await replace(room,origin);await focus();
  const original=await observe(room);assertReadable(original);
  assert.equal(original.digest,starting.digest);
  const second=await save(room);await close();
  receipt.cold.push(await cold(room,original,profile,second,prior));
  await close();return {key,text:second};
}

async function readyAfterSave(room,text){
  assert.equal(await save(room),text);
  await select(room.id);await focus();
  await shot(room.key+'-saved-ending.png');await hold(1500);
}

async function directDelivery(room){
  stage=room.key+'/direct';
  const profile=await fs.mkdtemp(path.join(temp,'direct-')),responses=await open(profile);
  await loadRoom(room.key,responses,{direct:room.id});
  const current=await view();
  assert.equal(current.mode,'room');assert.equal(current.roomId,room.roomId);assert.equal(current.floorId,room.floorId);
  assert.equal(await page.locator('#edit-instance').inputValue(),room.id);
  const panel=await observe(room);assertReadable(panel);
  await shot(room.key+'-direct.png');await close();
  return {view:current,panel};
}

(async()=>{
  stage='identities';await prepare();base=await serve();
  const profile=await fs.mkdtemp(path.join(temp,'profile-'));
  let prior;
  for(const key of requireDcc?[keys[1]]:keys)prior=await exercise(key,profile,prior);
  if(!requireDcc){
    const variants=report.rooms.flatMap(room=>room.cold.map(state=>ref(state.panel.instance.resource)));
    assert.deepEqual(variants.sort(),[...looks].sort());
    assert(report.rooms.some(room=>room.rejections.some(entry=>entry.trial.kind!=='doorway')),'Expected actual wall collision evidence');
  }
  if(!dev&&!requireDcc)report.direct=await directDelivery(report.rooms[1].room);
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
    if(temp){assert.equal(path.dirname(await fs.realpath(temp)),output);await fs.rm(temp,{recursive:true});}
    if(created)await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:report.status,...(created?{report:path.join(output,'report.json')}:{})}));
  }
});
