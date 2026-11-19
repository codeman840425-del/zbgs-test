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
const record=options.includes('--record'),requireVersionPair=options.includes('--require-version-pair');
const args=options.filter(v=>v!=='--record'&&v!=='--require-version-pair');
const dev=/^[a-f0-9]{12}$/.test(pin);
assert(input&&(dev||/^[a-f0-9]{64}$/.test(pin))&&args.length===(dev?2:1)&&
  options.length===args.length+Number(record)+Number(requireVersionPair),
  'Use PACKAGE MANIFEST_SHA NEW_OUT or DIST BUILD BATCH_ROOT NEW_OUT, with optional --record and --require-version-pair');
assert(!args.at(-1).split(/[\\/]/).includes('..'),'Output path cannot contain traversal');
const source=path.resolve(__dirname,'../..');
const keys=['public-wayfinding-arrivals','public-wayfinding-training'];
const viewport={width:1600,height:900},mathModule='/__wayfinding-qa/three.core.js';
const meanings=[['arrivals','lift','stairs'],['training','lift','stairs']];
const print={
  'wayfinding-arrivals@1':['来宾签到','签到后请等候'],
  'wayfinding-training@1':['培训报到','签到 · 寄衣'],
  'wayfinding-training@2':['新人报到','主播培训 · 第二场'],
  'wayfinding-lift@1':['电梯','楼层通行'],
  'wayfinding-stairs@1':['楼梯','步行上下楼'],
};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const execute=promisify(execFile);
const ref=resource=>resource.id+'@'+resource.version;
const report={status:'running',scope:'Native room views and wayfinding signs, real print textures, ordinary edits, and cold recovery.',
  recordingRequested:record,rooms:[],files:[],browserErrors:[]};
let output,bundle,batch,manifest,files,server,devServer,created,temp,chromium,three,base,context,page,stage,activeVideo;
const verifiedTextures=new Map();

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
    assert(script.equals(await pinned('source/scripts/company-platform/qa-public-wayfinding.cjs')));
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

const findNode=(doc,id)=>{
  const node=doc.nodes.find(n=>n.id===id);assert(node,'Missing facility or space '+id);return node;
};

async function fixture(key,index){
  const save=`data/rooms/${key}/save.json`,layout=`data/rooms/${key}/layout.json`;
  const file=dev?path.join(batch,key,'save.json'):path.join(bundle,save);
  const bytes=dev?await fs.readFile(file):await pinned(save);
  const json=dev?await fs.readFile(path.join(batch,key,'layout.json')):await pinned(layout);
  const {schema,document:doc}=JSON.parse(bytes);
  assert.equal(schema,'company-save');assert.equal(doc.id,key);assert.deepEqual(doc,JSON.parse(json));
  assert.equal(doc.wayfindingRooms.length,1);
  const {floorId,signs,service}=doc.wayfindingRooms[0],floor=findNode(doc,floorId);
  assert.equal(floorId,key+(index?'/upper':'/ground'));
  assert.equal(floor.kind,'floor');
  assert.deepEqual(signs.map(sign=>sign.meaning),meanings[index]);
  assert.equal(service.regionId,signs[0].regionId);
  assert.equal(service.portalId,signs[0].portalId);
  assert.equal(service.fromRegionId,signs[0].fromRegionId);
  assert.equal(service.regionId,floorId+(index?'/corridor-1':'/lobby'));
  for(const sign of signs){
    const {regionId,fromRegionId,portalId,boardId,contentId,meaning}=sign;
    assert.equal(findNode(doc,regionId).parentId,floorId);
    assert.equal(findNode(doc,fromRegionId).parentId,floorId);
    const portal=floor.connections.find(connection=>connection.id===portalId);
    assert(portal,portalId);
    assert.deepEqual([portal.from.regionId,portal.to.regionId].sort(),[regionId,fromRegionId].sort());
    assert.equal(findNode(doc,boardId).parentId,regionId);
    assert.equal(findNode(doc,contentId).parentId,boardId);
    assert.equal(ref(findNode(doc,contentId).resource),'wayfinding-'+meaning+'@1');
  }
  assert.equal(findNode(doc,service.counterId).parentId,service.regionId);
  assert.equal(findNode(doc,service.registerId).parentId,service.counterId);
  assert.equal(findNode(doc,service.registerId).attachment.surfaceId,service.surfaceId);
  if(index){
    assert.equal(findNode(doc,service.coatRackId).parentId,service.regionId);
    assert.equal(findNode(doc,service.garmentId).parentId,service.coatRackId);
  }else assert.equal(findNode(doc,service.waitingSeatId).parentId,service.regionId);
  return {index,key,file,bytes,doc,floorId,signs,service};
}

async function visit(room,responses,{cold=false,regionId}={}){
  const url=new URL(base);
  if(!cold&&!dev)url.searchParams.set('delivery',room.key);
  if(regionId)url.searchParams.set('region',regionId);
  await page.goto(url.href);await ready();
  const info=await page.evaluate(()=>company.buildInfo);
  assert.equal(info.shortId,report.build);assert.equal(info.sourceDigest,report.sourceDigest);
  if(!cold&&dev){
    const menu=page.locator('details.file-menu');
    await menu.locator('summary').click();
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#import').click()]);
    await chooser.setFiles(room.file);
    if(await menu.evaluate(node=>node.open))await menu.locator('summary').click();
  }
  await page.waitForFunction(id=>company.session.document.id===id,room.key);
  await ready();
  if(cold){
    assert.equal(await page.locator('#status').textContent(),'已恢复上次保存的方案。');
    assert(![...responses.keys()].some(url=>url==='/delivery-save.json'||url.startsWith('/delivery-room/')));
  }else{
    assert.deepEqual(await current(),room.doc);
    if(!dev){
      const response=responses.get('/delivery-room/'+room.key+'.json');
      assert.equal(response?.status(),200);
      assert(room.bytes.equals(await response.body()));
    }
  }
}

const currentView=()=>page.evaluate(()=>company.session.scene.view);
async function enter(room,regionId){
  if((await currentView()).floorId!==room.floorId){
    await page.locator('#floor').selectOption(room.floorId);
    await page.waitForFunction(id=>company.session.scene.view.floorId===id&&!document.querySelector('#room').disabled,room.floorId);
  }
  const picker=page.locator('#room');
  assert((await picker.locator('option').evaluateAll(opts=>opts.map(o=>o.value))).includes(regionId),regionId);
  await picker.selectOption(regionId);
  await page.waitForFunction(({floorId,regionId})=>{
    const view=company.session.scene.view;
    return view.mode==='room'&&view.floorId===floorId&&view.roomId===regionId;
  },{floorId:room.floorId,regionId});
  assert((await picker.locator('option:checked').textContent()).includes(findNode(room.doc,regionId).name));
  await ready();
}

const nativeView=name=>page.locator(`.view-toolbar [data-view="${name}"]`).click();
async function select(id,focus=false){
  await page.locator('#tool-selection').click();
  await page.locator('#edit-instance').selectOption(id);
  assert.equal(await page.locator('#edit-instance').inputValue(),id);
  if(focus)await page.locator('#edit-focus').click();
}
async function viewPrint(sign){
  await select(sign.contentId,true);
}

async function observedGLB(asset,responses){
  assert(asset?.url&&asset.sha256);
  const response=responses.get(asset.url);
  assert.equal(response?.status(),200,'No browser GLB response '+asset.url);
  const bytes=await response.body();
  assert.equal(bytes.length,asset.bytes);assert.equal(sha(bytes),asset.sha256);
  if(!dev)assert((await pinned('viewer'+asset.url)).equals(bytes));
  return bytes;
}

function unpackPrint(bytes,meshName){
  assert.equal(bytes.readUInt32LE(0),0x46546c67,'Expected GLB magic');
  assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const jsonLength=bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16),0x4e4f534a,'Expected GLB JSON chunk');
  const doc=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8'));
  const binaryHeader=20+jsonLength,binaryOffset=binaryHeader+8;
  assert.equal(bytes.readUInt32LE(binaryHeader+4),0x004e4942,'Expected GLB binary chunk');
  const mesh=doc.nodes.find(n=>n.name===meshName)?.mesh;
  assert(Number.isInteger(mesh),'Missing real printed mesh '+meshName);
  const primitives=doc.meshes[mesh].primitives;assert.equal(primitives.length,1);
  const primitive=primitives[0];
  const uv=doc.accessors[primitive.attributes.TEXCOORD_0];
  assert(uv?.type==='VEC2'&&uv.count>=4);
  const textureIndex=doc.materials[primitive.material].pbrMetallicRoughness.baseColorTexture.index;
  const image=doc.images[doc.textures[textureIndex].source];
  assert.equal(image.mimeType,'image/png');
  const imageView=doc.bufferViews[image.bufferView];
  assert.equal(imageView.buffer,0);
  const start=(imageView.byteOffset??0)+binaryOffset,end=start+imageView.byteLength;
  assert(end<=bytes.length);
  const png=bytes.subarray(start,end);
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  return png;
}

async function inspectSign(sign,{projection=true}={}){
  return page.evaluate(async({sign,projection,mathModule})=>{
    const {Vector3,Raycaster}=await import(mathModule);
    const {session:{scene,document:doc},camera,renderer,catalog}=company;
    company.drawHostFrame();camera.updateMatrixWorld(true);scene.root.updateMatrixWorld(true);
    const root=id=>scene.root.getObjectByName(id);
    const resource=id=>{
      const node=doc.nodes.find(n=>n.id===id);
      return catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version);
    };
    const instance=root(sign.contentId),board=root(sign.boardId),region=root(sign.regionId);
    const print=resource(sign.contentId),frame=resource(sign.boardId);
    const face=instance?.getObjectByName(print.informationNodes.face),back=board?.getObjectByName(frame.informationNodes.back);
    if(!face?.isMesh||!back?.isMesh||instance.parent!==board||board.parent!==region)throw Error('Missing real mounted sign '+sign.contentId);
    const geometry=face.geometry,p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
    const material=face.material,texture=material.map;
    if(!uv||!texture?.image||p.count!==uv.count)throw Error('Missing actual live textured UV mesh '+sign.contentId);
    const center=new Vector3().setFromMatrixPosition(face.matrixWorld),front=face.getWorldDirection(new Vector3());
    const count=(geometry.index?.count??p.count)/3;
    const vertices=[];
    for(let i=0;i<p.count;i++)vertices.push({local:new Vector3().fromBufferAttribute(p,i).toArray(),uv:[uv.getX(i),uv.getY(i)]});
    const world=face.matrixWorld.toArray();
    const canvas=renderer.domElement,view=scene.view;
    const result={ref:print.id+'@'+print.version,frameRef:frame.id+'@'+frame.version,asset:print.asset,frameAsset:frame.asset,
      meaning:print.wayfindingMeaning,declaredPng:{bytes:print.provenance?.contentPngBytes,sha256:print.provenance?.contentPngSha256},
      triangles:count,vertices,mesh:face.name,back:back.name,parent:instance.parent.name,center:center.toArray(),front:front.toArray(),
      map:{width:texture.image.width,height:texture.image.height,colorSpace:texture.colorSpace},visible:face.visible,world,view,
      paintId:scene.root.uuid,camera:camera.position.toArray()};
    if(!projection)return result;
    const projected=vertices.map(v=>new Vector3(...v.local).applyMatrix4(face.matrixWorld).project(camera));
    const [minX,maxX]=[Math.min(...projected.map(v=>v.x)),Math.max(...projected.map(v=>v.x))];
    const [minY,maxY]=[Math.min(...projected.map(v=>v.y)),Math.max(...projected.map(v=>v.y))];
    const rect=canvas.getBoundingClientRect();
    const meshes=[];
    scene.root.traverseVisible(o=>{if(o.isMesh&&[o.material].flat().some(m=>m.visible&&m.opacity>0))meshes.push(o);});
    const ray=new Raycaster(),hits={};
    const interpolate=(u,v)=>{
      const point=new Vector3((u-.5)*print.informationContent.width,(v-.5)*print.informationContent.height,0);
      return point.applyMatrix4(face.matrixWorld).project(camera);
    };
    for(const u of [.12,.31,.50,.69,.88])for(const v of [.12,.31,.50,.69,.88]){
      const screen=interpolate(u,v);
      let name='outside-frame';
      if(Math.abs(screen.x)<1&&Math.abs(screen.y)<1&&Math.abs(screen.z)<1){
        ray.setFromCamera(screen,camera);
        const hit=ray.intersectObjects(meshes,false)[0]?.object;
        name=hit===face?'face':hit?.name||'none';
      }
      hits[name]=(hits[name]||0)+1;
    }
    result.projection={left:rect.left+(1+minX)*rect.width/2,top:rect.top+(1-maxY)*rect.height/2,
      width:(maxX-minX)*rect.width/2,height:(maxY-minY)*rect.height/2,
      facing:front.dot(camera.position.clone().sub(center).normalize()),hits};
    return result;
  },{sign,projection,mathModule});
}

async function verifyPrint(sign,actual,responses){
  assert.equal(actual.meaning,sign.meaning);
  assert.equal(actual.parent,sign.boardId);
  assert.equal(actual.triangles,2);
  assert.deepEqual(actual.map,{width:1100,height:700,colorSpace:'srgb'});
  const uvByCorner=actual.vertices.map(({local,uv})=>[...local.map(x=>Math.round(x*100)/100),...uv]);
  const corners=[[-.44,-.28,0,0,1],[.44,-.28,0,1,1],[.44,.28,0,1,0],[-.44,.28,0,0,0]];
  assert.deepEqual(uvByCorner.map(row=>JSON.stringify(row)).sort(),corners.map(row=>JSON.stringify(row)).sort());
  const cached=verifiedTextures.get(actual.ref);
  if(cached)return cached;
  const glb=await observedGLB(actual.asset,responses);
  const embedded=unpackPrint(glb,actual.mesh),length=actual.declaredPng.bytes;
  assert(Number.isInteger(length)&&length>0&&length<=embedded.length);
  const png=embedded.subarray(0,length),padding=embedded.subarray(length);
  assert(padding.length<4&&padding.every(byte=>byte===0),'GLB may only align the embedded image with zero padding');
  assert.equal(png.subarray(-12).toString('hex'),'0000000049454e44ae426082','PNG must end at its IEND chunk');
  const pngSha=sha(png);
  assert.equal(pngSha,actual.declaredPng.sha256);
  assert.equal(png.readUInt32BE(16),actual.map.width);
  assert.equal(png.readUInt32BE(20),actual.map.height);
  const textureFile=path.posix.join(path.posix.dirname(actual.asset.url),'texture.png');
  const published=dev?await fs.readFile(path.join(bundle,textureFile.slice(1))):await pinned('viewer'+textureFile);
  assert(png.equals(published),'Published texture differs from the real GLB base-color PNG');
  assert(print[actual.ref],actual.ref+' needs explicit visual reading instructions');
  const name=actual.ref.replace('@','-v')+'-embedded.png';
  await fs.writeFile(path.join(output,name),png,{flag:'wx'});
  report.files.push({name,bytes:png.length,sha256:pngSha});
  const evidence={url:actual.asset.url,glbSha256:sha(glb),pngSha256:pngSha,alignmentPaddingBytes:padding.length,
    expectedText:print[actual.ref],name};
  verifiedTextures.set(actual.ref,evidence);
  return evidence;
}

async function closePrint(room,sign,responses,suffix='sign'){
  await viewPrint(sign);
  const actual=await inspectSign(sign),p=actual.projection;
  const name=room.key+'-'+sign.meaning+'-'+suffix+'.png';
  await shot(name);
  assert(actual.visible,sign.contentId+' real face is hidden');
  assert(p.facing>.65&&p.width>=100&&p.height>=65,sign.contentId+' native close-up is not printable '+JSON.stringify(p));
  assert.equal(p.hits.face,25,sign.contentId+' native close-up lacks a clear print '+JSON.stringify(p.hits));
  const texture=await verifyPrint(sign,actual,responses);
  await hold(1200);
  return {image:name,print:actual,texture};
}

async function inspectService(room,responses){
  const service=room.service;
  const actual=await page.evaluate(async({service,mathModule})=>{
    const {Vector3,Box3}=await import(mathModule);
    const {camera,renderer,session:{scene,document:doc},catalog}=company;
    company.drawHostFrame();camera.updateMatrixWorld(true);scene.root.updateMatrixWorld(true);
    const root=id=>scene.root.getObjectByName(id);
    const node=id=>doc.nodes.find(n=>n.id===id);
    const resource=id=>{
      const ref=node(id).resource;return catalog.resources.find(r=>r.id===ref.id&&r.version===ref.version);
    };
    const counter=root(service.counterId),register=root(service.registerId),region=root(service.regionId);
    if(!counter||!register||counter.parent!==region||register.parent!==counter)throw Error('Service furniture and register must be actually mounted');
    const countertop=counter.getObjectByName(resource(service.counterId).supportNodes?.[service.surfaceId]);
    const book=register.getObjectByName(service.registerParts.book),pen=register.getObjectByName(service.registerParts.pen);
    if(!book?.isMesh||!pen?.isMesh||!countertop?.isMesh)throw Error('Missing physical registration desk, pen, or book');
    const parts={counter,register,countertop,book,pen};
    if(service.waitingSeatId)parts.waitingSeat=root(service.waitingSeatId);
    if(service.coatRackId){
      parts.coatRack=root(service.coatRackId);parts.garment=root(service.garmentId);
      if(parts.garment?.parent!==parts.coatRack)throw Error('The actual garment is not attached to its rack');
    }
    const rect=renderer.domElement.getBoundingClientRect();
    const items={};
    for(const [role,item] of Object.entries(parts)){
      if(!item)throw Error('Missing real service object '+role);
      const bounds=new Box3().setFromObject(item,true),projected=[];
      if(bounds.isEmpty())throw Error('Geometry is missing '+role);
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])
        projected.push(new Vector3(x,y,z).project(camera));
      items[role]={name:item.name,size:bounds.getSize(new Vector3()).toArray(),worldMin:bounds.min.toArray(),worldMax:bounds.max.toArray(),
        projection:{width:(Math.max(...projected.map(p=>p.x))-Math.min(...projected.map(p=>p.x)))*rect.width/2,
          height:(Math.max(...projected.map(p=>p.y))-Math.min(...projected.map(p=>p.y)))*rect.height/2}};
      if(node(item.name)?.resource)items[role].asset=resource(item.name).asset;
    }
    return items;
  },{service,mathModule});
  for(const item of Object.values(actual))if(item.asset)await observedGLB(item.asset,responses);
  assert(Math.abs(actual.register.worldMin[1]-actual.countertop.worldMax[1])<.003,
    'Register bottom is separated from the actual counter top '+JSON.stringify({register:actual.register.worldMin,counter:actual.countertop.worldMax}));
  return actual;
}

async function setVisible(sign,visible){
  const document=await current(),node=findNode(document,sign.contentId);
  assert.notEqual(node.state?.visible??true,visible);
  node.state={...node.state,visible};document.revision++;
  const stateButton=on=>page.getByRole('button',{name:'内容显示：'+(on?'开':'关'),exact:true});
  const button=stateButton(!visible);
  assert.equal(await button.getAttribute('aria-pressed'),String(!visible));
  await button.click();
  await page.waitForFunction(({id,visible,revision})=>{
    const doc=company.session.document;
    return doc.revision===revision&&doc.nodes.find(n=>n.id===id).state.visible===visible;
  },{id:sign.contentId,visible,revision:document.revision});
  await ready();assert.deepEqual(await current(),document);
  assert.equal(await stateButton(visible).getAttribute('aria-pressed'),String(visible));
  const physical=await inspectSign(sign);
  assert.equal(physical.visible,visible);
  assert.equal(physical.projection.hits.face??0,visible?25:0);
  return physical;
}

async function replace(id,selector,target){
  const document=await current();
  const node=findNode(document,id),[name,version]=target.split('@');
  assert.notEqual(ref(node.resource),target);
  const previousDefaults=await page.evaluate(ref=>{
    const resource=company.catalog.resources.find(r=>r.id===ref.id&&r.version===ref.version);
    return resource.stateDefaults;
  },node.resource);
  node.state={...previousDefaults,...node.state};
  node.resource={id:name,version:Number(version)};document.revision++;
  const menu=page.locator(selector);
  await menu.selectOption(target);
  await page.waitForFunction(({id,target,revision})=>{
    const doc=company.session.document,n=doc.nodes.find(n=>n.id===id);
    return doc.revision===revision&&n.resource.id+'@'+n.resource.version===target;
  },{id,target,revision:document.revision});
  await ready();assert.deepEqual(await current(),document);
  assert.equal(await menu.inputValue(),target);
}

async function versions(room,responses){
  const sign=room.signs[0],before=await inspectSign(sign);
  const menu=page.locator('#edit-look');
  const options=(await menu.locator('option').evaluateAll(rows=>rows.map(r=>({value:r.value,text:r.textContent}))))
    .filter(r=>r.value.startsWith('wayfinding-training'));
  assert.equal(await menu.inputValue(),before.ref);
  const catalogVersions=await page.evaluate(()=>company.catalog.resources.filter(r=>r.id==='wayfinding-training').map(r=>r.version).sort());
  if(catalogVersions.length===1&&!requireVersionPair){
    assert.deepEqual(options.map(o=>o.value),['wayfinding-training@1']);
    return {options,catalogVersions,versionPairAvailable:false};
  }
  assert.deepEqual(options.map(o=>o.value).sort(),['wayfinding-training@1','wayfinding-training@2']);
  assert.equal(new Set(options.map(o=>o.text)).size,2);
  const results=[];
  for(const [index,target] of ['wayfinding-training@2','wayfinding-training@1','wayfinding-training@2'].entries()){
    await replace(sign.contentId,'#edit-look',target);
    const edited=await closePrint(room,sign,responses,'version-'+(index+1));
    assert.equal(edited.print.ref,target);
    assert.equal(edited.print.frameRef,before.frameRef);
    assert.deepEqual(edited.print.world,before.world);
    results.push(edited);
  }
  assert.equal(new Set(results.map(x=>x.texture.pngSha256)).size,2);
  return {options,catalogVersions,versionPairAvailable:true,results};
}

async function changeFrame(room,responses){
  const sign=room.signs[0],before=await inspectSign(sign);
  const target=room.index?'information-board-floor-notice@1':'information-board-floor-doorplate@1';
  assert.notEqual(before.frameRef,target);
  await select(sign.boardId);
  await replace(sign.boardId,'#edit-look',target);
  const receipt=await closePrint(room,sign,responses,'reframed');
  assert.equal(receipt.print.frameRef,target);
  assert.equal(receipt.print.ref,before.ref);
  assert.deepEqual(receipt.print.world,before.world);
  assert.notEqual(receipt.print.frameAsset.sha256,before.frameAsset.sha256);
  await observedGLB(receipt.print.frameAsset,responses);
  return receipt;
}

async function rejected(room,sign,kind,savedText){
  const before=await current(),rendered=await inspectSign(sign);
  const menu=page.locator('#edit-look');
  let click,target,expected;
  if(kind==='meaning'){
    await select(sign.contentId);
    target=room.index?'wayfinding-arrivals@1':'wayfinding-lift@1';
    expected={code:'wayfinding-content-meaning',path:sign.contentId};
    click=()=>menu.selectOption(target);
  }else{
    await select(sign.boardId);
    for(const selector of ['#placement-tools','#placement-tools > details']){
      const details=page.locator(selector);
      if(!await details.evaluate(node=>node.open))await details.locator(':scope > summary').click();
    }
    const orientation=page.locator('#edit-yaw');
    const origin=Number(await orientation.inputValue());
    target=String((origin+180)%360);
    expected={code:'wayfinding-sign-facing',path:sign.boardId};
    await orientation.selectOption(target);
    click=()=>page.locator('#edit-position').click();
  }
  const start=report.browserErrors.length;
  const [event]=await Promise.all([page.waitForEvent('console',e=>e.type()==='error'),click()]);
  const error=await event.args()[0].evaluate(e=>({code:e.code,path:e.path,details:e.details}));
  assert.deepEqual(report.browserErrors.splice(start),[{stage,message:event.text()}]);
  assert.equal(error.code,expected.code);assert.equal(error.path,expected.path);
  await page.waitForFunction(()=>document.querySelector('#status').dataset.error==='true'&&
    !document.querySelector('#edit-look').disabled);
  const feedback=await page.locator('#status').textContent();
  assert(feedback.includes('已保留'),feedback);
  const edit=page.locator('#edit-message');
  assert.equal(await edit.getAttribute('data-error'),'true');
  const editFeedback=await edit.textContent();
  assert(editFeedback.includes(kind==='meaning'?'同一用途':'门口'),editFeedback);
  assert.equal(await menu.inputValue(),kind==='meaning'?rendered.ref:rendered.frameRef);
  assert.deepEqual(await current(),before);
  assert.equal(await saved(room.key),savedText);
  assert.equal(await page.locator('#save-state').getAttribute('data-dirty'),'false');
  assert.deepEqual(await inspectSign(sign),rendered);
  await shot(room.key+'-rejected-'+kind+'.png');await hold(1400);
  return {target,error,feedback,editFeedback,sceneUnchanged:true,saveSha256:sha(savedText)};
}

async function overview(room,sign,suffix='overview'){
  await nativeView('room');
  const first=await inspectSign(sign);
  const name=room.key+'-'+sign.meaning+'-'+suffix+'.png';
  await shot(name);
  assert(first.projection.facing>0&&first.projection.hits.face>0,sign.boardId+' face is missing in the normal room view '+JSON.stringify(first.projection));
  await hold(1100);
  return {name,view:first.view,projection:first.projection};
}

async function exercise(room,profile,prior){
  const receipt={key:room.key,floorId:room.floorId,regionId:room.service.regionId,
    serviceDeclaration:room.service,sourceSha256:sha(room.bytes),signs:[]};
  report.rooms.push(receipt);
  stage=room.key+'/import';
  let responses=await open(profile,record);
  if(record)activeVideo={key:room.key,video:page.video()};
  await visit(room,responses);
  receipt.initialView=await currentView();
  for(const sign of room.signs){
    stage=room.key+'/'+sign.meaning+'/view';
    await enter(room,sign.regionId);
    const view=await overview(room,sign);
    const near=await closePrint(room,sign,responses);
    await observedGLB(near.print.frameAsset,responses);
    receipt.signs.push({...sign,view,near});
  }

  const main=room.signs[0];
  stage=room.key+'/service';
  await enter(room,main.regionId);
  await nativeView('top');await shot(room.key+'-layout.png');await hold(1100);
  await nativeView('room');
  receipt.service=await inspectService(room,responses);
  await select(room.service.registerId,true);
  await shot(room.key+'-counter-register.png');await hold(1400);
  await select(room.service.waitingSeatId??room.service.coatRackId,true);
  await shot(room.key+(room.index?'-coat-rack.png':'-waiting-seat.png'));await hold(1400);
  await viewPrint(main);

  if(room.index){
    stage=room.key+'/versions';
    receipt.versions=await versions(room,responses);
  }
  stage=room.key+'/frame';
  receipt.frame=await changeFrame(room,responses);
  const secondary=room.signs[room.index?2:1];
  stage=room.key+'/visibility';
  await enter(room,secondary.regionId);
  await viewPrint(secondary);
  receipt.visibility={hidden:await setVisible(secondary,false)};
  await shot(room.key+'-'+secondary.meaning+'-hidden.png');await hold(1200);
  receipt.visibility.shown=await setVisible(secondary,true);
  await shot(room.key+'-'+secondary.meaning+'-shown.png');await hold(1200);
  receipt.visibility.saved=await setVisible(secondary,false);
  await hold(900);

  stage=room.key+'/save';
  await enter(room,main.regionId);await viewPrint(main);
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false'&&!document.querySelector('#save').disabled);
  const text=await saved(room.key),document=await current();
  assert.deepEqual(JSON.parse(text).document,document);
  receipt.savedSha256=sha(text);
  await shot(room.key+'-saved.png');await hold(1200);
  receipt.rejected={};
  for(const kind of ['meaning','orientation']){
    stage=room.key+'/rejected-'+kind;
    receipt.rejected[kind]=await rejected(room,main,kind,text);
  }
  // End the original recording on a valid saved view after the two rejection messages.
  stage=room.key+'/saved-ending';
  await page.locator('#save').click();await ready();
  await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false');
  assert.equal(await saved(room.key),text);
  await shot(room.key+'-saved-ending.png');await hold(1600);
  await close();
  if(activeVideo){await archive(activeVideo.video,room.key+'-normal.webm');activeVideo=null;}

  stage=room.key+'/cold';
  responses=await open(profile);await visit(room,responses,{cold:true});
  const beforeFloorSelection=await currentView();
  assert.deepEqual(await current(),document);assert.equal(await saved(room.key),text);
  if(prior)assert.equal(await saved(prior.key),prior.text);
  await enter(room,main.regionId);
  const recovered=await closePrint(room,main,responses,'restored');
  assert.equal(recovered.print.frameRef,receipt.frame.print.frameRef);
  assert.equal(recovered.print.ref,receipt.frame.print.ref);
  assert.deepEqual(recovered.print.world,receipt.frame.print.world);
  assert.equal(await page.locator('#edit-look').inputValue(),receipt.frame.print.ref);
  await enter(room,secondary.regionId);await viewPrint(secondary);
  const hidden=await inspectSign(secondary);
  assert.equal(hidden.visible,false);
  assert.equal(hidden.projection.hits.face??0,0);
  assert.equal(await page.getByRole('button',{name:'内容显示：关',exact:true}).getAttribute('aria-pressed'),'false');
  await shot(room.key+'-'+secondary.meaning+'-hidden-restored.png');
  receipt.cold={sameBytes:true,withoutDelivery:true,sha256:sha(await saved(room.key)),beforeFloorSelection,recovered,hidden};
  await close();
  return {key:room.key,text};
}

async function directUpper(room){
  stage=room.key+'/direct-upper';
  const profile=await fs.mkdtemp(path.join(temp,'direct-'));
  const responses=await open(profile),regionId=room.service.regionId;
  await visit(room,responses,{regionId});
  const view=await currentView();
  assert.equal(view.floorId,room.floorId);assert.equal(view.roomId,regionId);assert.equal(view.mode,'room');
  const visible=await overview(room,room.signs[0],'direct-upper');
  const print=await closePrint(room,room.signs[0],responses,'direct-upper-print');
  await close();
  return {view,visible,print};
}

(async()=>{
  stage='identities';await prepare();
  const rooms=await Promise.all(keys.map(fixture));
  base=await serve();
  const profile=await fs.mkdtemp(path.join(temp,'profile-'));
  const prior=await exercise(rooms[0],profile);
  await exercise(rooms[1],profile,prior);
  if(!dev)report.directUpper=await directUpper(rooms[1]);
  assert.deepEqual(report.browserErrors,[]);
  report.textures=[...verifiedTextures.values()];
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
