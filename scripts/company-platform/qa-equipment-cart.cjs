const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {createInterface}=require('node:readline');
const {createHash}=require('node:crypto');

const [packageArg,pinArg,outputArg]=process.argv.slice(2);
if(!packageArg||!/^([0-9a-f]{64})$/.test(pinArg)||!outputArg)
  throw Error('Usage: node qa-equipment-cart.cjs FIXED_PACKAGE EXPECTED_MANIFEST_SHA256 FRESH_OUTPUT');
const pkg=path.resolve(packageArg),out=path.resolve(outputArg),pinned=pinArg;
const viewport={width:1600,height:960};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const looks=['equipment-cart-open','equipment-cart-flightcase','equipment-cart-tool','equipment-cart-display'];
const roomKeys=['equipment-cart-studio','equipment-cart-rental'];
const report={status:'running',manifestSha256:pinned,rooms:[],screens:[],errors:[],
  scope:'Ordinary editor, physical GLB shelf contacts and independently reopened saves, software WebGL on this machine.'};
let ctx,page,server,url,chromium,stage,created,manifest,scratch;
let replies=new Map();
const nodeOf=(doc,id)=>doc.nodes.find(n=>n.id===id);
const doc=()=>page.evaluate(()=>company.session.document);
const ready=()=>page.waitForFunction(()=>window.company?.editor && company.buildInfo && !document.querySelector('#mode-room').disabled);
const click=async id=>{await page.locator('#'+id).click();await ready();};
const select=async(id,value)=>{await page.locator('#'+id).selectOption(value);await ready();};
async function details(selector) {
  const item=page.locator(selector);
  if(!await item.evaluate(el=>el.open)) await item.locator(':scope > summary').click();
}
async function choose(id) {await click('tool-selection');await select('edit-instance',id);}
async function tools(id) {await choose(id);await details('#placement-tools');}
async function precise(id,x,z) {
  await tools(id);
  await details('#placement-tools > details');
  await page.locator('#edit-x').fill(String(x));
  await page.locator('#edit-z').fill(String(z));
  await click('edit-position');
}
async function shot(file) {
  await page.evaluate(()=>company.drawHostFrame());
  await page.screenshot({path:path.join(out,file)});
  report.screens.push(file);
}
async function focus(id) {await choose(id);await click('edit-focus');}
async function attach(id,host,layer) {
  await tools(id);
  const key=host+(layer==='desktop'?':desktop':':surface:'+layer);
  await select('edit-target',key);
  await click('edit-attach');
  const n=nodeOf(await doc(),id);
  assert.equal(n.parentId,host,await page.locator('#edit-message').textContent());
  assert.equal(n.attachment?.surfaceId,layer==='desktop'?undefined:layer);
  return structuredClone(n);
}
async function open(profile,record=false) {
  ctx=await chromium.launchPersistentContext(path.join(out,profile),{headless:true,viewport,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disk-cache-dir='+path.join(out,'process-temp','disk-cache')],
    downloadsPath:path.join(out,'process-temp'),tracesDir:path.join(out,'process-temp'),
    ...(record?{recordVideo:{dir:path.join(out,'video'),size:viewport}}:{})});
  page=ctx.pages()[0]||await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror',e=>report.errors.push({stage,error:e.message}));
  replies=new Map();
  page.on('response',res=>replies.set(new URL(res.url()).pathname,res));
}
async function close() {if(ctx) {await ctx.close();ctx=null;page=null;}}
async function readPinned(file) {
  const b=await fs.readFile(path.join(pkg,file)),entry=manifest.files.find(f=>f.path===file);
  assert(entry&&entry.bytes===b.length&&entry.sha256===sha(b),file);
  return b;
}
async function visit(key,initial=true) {
  const link=new URL(url);
  if(initial)link.searchParams.set('delivery',key);
  await page.goto(link.href);await ready();
  await page.waitForFunction(key=>company.session.document.id===key,key);
  assert.equal(await page.evaluate(()=>company.buildInfo.shortId),manifest.buildId);
  if(initial) {
    const save=await readPinned('data/rooms/'+key+'/save.json');
    const response=replies.get('/delivery-room/'+key+'.json');
    assert(response?.ok() && save.equals(await response.body()),'Selected room save bytes');
    assert.deepEqual(await doc(),JSON.parse(save).document);
  } else {
    assert(![...replies.keys()].some(s=>s.startsWith('/delivery-room/')||s==='/delivery-save.json'),'Reopen must use the saved document');
  }
  const room=key+'/ground/live';
  await select('room',room);
  await page.locator('.view-toolbar [data-view="room"]').click();await ready();
}
async function changeLook(id,name) {
  await choose(id);
  const values=await page.locator('#edit-look option').evaluateAll(items=>items.map(opt=>opt.value));
  const val=values.find(entry=>entry===name+'@1');
  assert(val,'Published cart is missing from the ordinary appearance menu: '+name+'; '+values);
  await select('edit-look',val);
  assert.deepEqual(nodeOf(await doc(),id).resource,{id:name,version:1});
}
async function physical(id,required=2) {
  const result=await page.evaluate(id=>{
    const {document:doc,scene}=company.session, n=doc.nodes.find(n=>n.id===id);
    const host=scene.root.getObjectByName(id),r=company.catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version);
    scene.root.updateMatrixWorld(true);
    const inverse=host.matrixWorld.clone().invert(),vec=()=>company.camera.position.clone();
    function vertices(m) {
      const matrix=inverse.clone().multiply(m.matrixWorld),v=vec();
      return Array.from({length:m.geometry.attributes.position.count},(_,i)=>m.getVertexPosition(i,v).applyMatrix4(matrix).toArray());
    }
    function cross(a,b,p) {return (b[0]-a[0])*(p[2]-a[2])-(b[2]-a[2])*(p[0]-a[0]);}
    function covers(tri,p) {
      const sides=[cross(tri[0],tri[1],p),cross(tri[1],tri[2],p),cross(tri[2],tri[0],p)];
      return sides.every(v=>v>=-1e-7)||sides.every(v=>v<=1e-7);
    }
    const children=doc.nodes.filter(node=>node.parentId===id);
    const decks=r.supportSurfaces.map(s=>{
      const b=host.getObjectByName(r.supportNodes[s.id]);
      if(!b?.isMesh)throw Error('Missing support mesh for '+s.id);
      const p=vertices(b),idx=b.geometry.index;
      const top=Math.max(...p.map(v=>v[1])),faces=[];
      for(let i=0;i<(idx?.count??p.length);i+=3) {
        const triangle=[0,1,2].map(j=>p[idx?idx.getX(i+j):i+j]);
        if(triangle.every(v=>Math.abs(v[1]-top)<.00005)&&Math.abs(cross(...triangle))>1e-10)faces.push(triangle);
      }
      const sample=s.center;
      const corners=[-1,1].flatMap(dx=>[-1,1].map(dz=>[sample[0]+dx*(s.halfSize[0]-.001),top,sample[1]+dz*(s.halfSize[1]-.001)]));
      const devices=children.filter(node=>node.attachment?.surfaceId===s.id).map(node=>{
        const group=scene.root.getObjectByName(node.id),local=[];
        group.traverseVisible(mesh=>{if(mesh.isMesh)local.push(...vertices(mesh));});
        if(!local.length)throw Error('Device has no visible geometry: '+node.id);
        const bottom=local.reduce((y,p)=>Math.min(y,p[1]),Infinity);
        const supports=local.filter(p=>p[1]<=bottom+.0001);
        return {id:node.id,resource:node.resource,rootParentId:node.parentId,transform:node.transform,world:group.getWorldPosition(vec()).toArray(),
          bottomM:bottom,gapM:bottom-top,vertices:local.length,contactVertices:supports.length,
          supportedVertices:supports.filter(p=>faces.some(f=>covers(f,p))).length};
      });
      return {id:s.id,mesh:b.name,heightM:top,widthM:2*s.halfSize[0],depthM:2*s.halfSize[1],storedHeightM:s.topY,
        topFaces:faces.length,coveredInsetCorners:corners.filter(v=>faces.some(f=>covers(f,v))).length,devices};
    });
    return {id,ref:n.resource,transform:n.transform,asset:r.asset,meshRoot:host.name,world:host.getWorldPosition(vec()).toArray(),decks};
  },id);
  const devices=result.decks.flatMap(d=>d.devices);
  assert.equal(devices.length,required,id);
  for(const deck of result.decks) {
    assert(['upper','lower'].includes(deck.id));
    assert(Math.abs(deck.heightM-(deck.id==='upper'?.82:.30))<.001 && Math.abs(deck.storedHeightM-deck.heightM)<.001,JSON.stringify(deck));
    assert(Math.abs(deck.widthM-.52)<1e-6 && Math.abs(deck.depthM-.36)<1e-6);
    assert(deck.topFaces&&deck.coveredInsetCorners===4,JSON.stringify(deck));
    for(const item of deck.devices) assert(Math.abs(item.gapM)<.001 && item.contactVertices>0 && item.supportedVertices===item.contactVertices,JSON.stringify(item));
  }
  const response=replies.get(result.asset.url);
  assert(response?.ok(),'Browser did not load '+result.asset.url);
  assert.equal(sha(await response.body()),result.asset.sha256);
  return result;
}
async function commitCopy(id) {
  await page.locator('.view-toolbar [data-view="room"]').click();await tools(id);await click('edit-copy');
  await page.waitForFunction(()=>company.editor.placement.snapshot()?.complete,null,{timeout:120000});
  const spot=await page.evaluate(id=>{
    const s=company.editor.placement.snapshot(),rect=company.renderer.domElement.getBoundingClientRect();
    const parent=company.camera.matrixWorld.clone().fromArray(s.parentMatrix),pos=company.session.document.nodes.find(n=>n.id===id).transform.position;
    const points=s.cells.filter(c=>c.valid&&Math.hypot(c.position[0]-pos[0],c.position[2]-pos[2])>.8).map(c=>{
      const v=company.camera.position.clone().fromArray(c.position).applyMatrix4(parent).project(company.camera);
      return {position:c.position,x:rect.left+(v.x+1)*rect.width/2,y:rect.top+(1-v.y)*rect.height/2};
    }).filter(p=>p.x>rect.left+40&&p.x<rect.right-40&&p.y>rect.top+100&&p.y<rect.bottom-80&&document.elementFromPoint(p.x,p.y)===company.renderer.domElement);
    return points.sort((a,b)=>Math.hypot(a.x-rect.left-rect.width/2,a.y-rect.top-rect.height/2)-Math.hypot(b.x-rect.left-rect.width/2,b.y-rect.top-rect.height/2))[0];
  },id);
  assert(spot,'No visible legal drop cell for this cart');
  const before=await doc();
  await page.mouse.move(spot.x,spot.y);await page.mouse.down();
  await page.mouse.move(spot.x+2,spot.y+1);await page.mouse.move(spot.x,spot.y);await page.mouse.up();await ready();
  const after=await doc(),fresh=after.nodes.filter(n=>!before.nodes.some(old=>old.id===n.id));
  const cart=fresh.find(n=>n.resource?.id===nodeOf(before,id).resource.id);
  assert(cart && fresh.length===3,'Copy should create cart and its two children: '+JSON.stringify(fresh));
  assert.equal(fresh.filter(n=>n.parentId===cart.id).length,2);
  return {spot,cart:cart.id,children:fresh.filter(n=>n.parentId===cart.id)};
}
async function exercise(key,index) {
  const live=key+'/ground/live', original=JSON.parse(await readPinned('data/rooms/'+key+'/save.json')).document;
  const [first,second]=index===0?['cart-open','cart-flightcase']:['cart-tool','cart-display'];
  const donor=live+'/'+first,cart=live+'/'+second, room={key,looks:[],transfers:[]};
  report.rooms.push(room);
  stage=key+' named room';await open('profile-'+index);await visit(key);
  room.originalCarts=[await physical(donor),await physical(cart)];
  await focus(donor);
  for(const name of looks.filter(k=>k!==nodeOf(original,donor).resource.id).concat(nodeOf(original,donor).resource.id)) {
    stage=key+' appearance '+name;await changeLook(donor,name);
    const seen=await physical(donor);
    room.looks.push(seen);
    await focus(donor);await shot(key+'-'+name+'.png');
  }
  assert.equal(new Set(room.looks.map(r=>r.asset.sha256)).size,4);
  stage=key+' installing equipment';
  // Remove the two staged items from this private unsaved room to free both decks for real editor installations.
  for(const suffix of ['camera','audio']) {await tools(cart+'/'+suffix);await click('edit-remove');assert(!nodeOf(await doc(),cart+'/'+suffix));}
  if(index===0) {
    const deskCamera=live+'/desk-camera';
    for(const layer of ['lower','upper']) {
      const installed=await attach(deskCamera,cart,layer);
      room.transfers.push({installed,physical:await physical(cart,1)});
    }
    room.returnedToDesk=await attach(deskCamera,live+'/desk','desktop');
  }
  const cameraId=donor+'/camera',audioId=donor+'/audio';
  for(const [id,host,layer,count] of [[audioId,cart,'upper',1],[audioId,cart,'lower',1],
    [audioId,donor,'lower',2],[cameraId,cart,'lower',1],[cameraId,cart,'upper',1],[audioId,cart,'lower',2]]) {
    const installed=await attach(id,host,layer);
    room.transfers.push({installed,physical:await physical(host,count)});
  }
  const children=(await doc()).nodes.filter(n=>n.parentId===cart);
  assert.equal(children.length,2);
  await focus(cart);await shot(key+'-loaded.png');
  stage=key+' moving and turning loaded cart';
  const originalCart=nodeOf(await doc(),cart);
  const [x,,z]=originalCart.transform.position;
  await precise(cart,x,z+.4);
  assert.deepEqual(nodeOf(await doc(),cart).transform.position,[x,0,z+.4]);
  await tools(cart);await click('edit-rotate');
  const turns=nodeOf(await doc(),cart).transform.yaw-originalCart.transform.yaw;
  assert(Math.abs(Math.sin(turns)-1)<1e-6);
  assert.deepEqual((await doc()).nodes.filter(n=>n.parentId===cart),children);
  room.movedAndTurned=await physical(cart);
  stage=key+' copying loaded cart';
  const clone=await commitCopy(cart);
  room.copy={...clone,physical:await physical(clone.cart)};
  for(const child of children) {
    const twin=clone.children.find(n=>n.resource.id===child.resource.id);
    assert(twin&&twin.id!==child.id);
    assert.deepEqual([twin.attachment,twin.transform,twin.state],[child.attachment,child.transform,child.state]);
  }
  await click('save');await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false');
  const saved=await doc(),text=await page.evaluate(key=>company.session.readSavedText(key),key);
  assert.deepEqual(JSON.parse(text).document,saved);room.savedSha256=sha(text);
  if(index===0) {
    stage=key+' doorway rejection';
    await precise(cart,0,2.6);
    assert.equal(await page.locator('#edit-message').getAttribute('data-error'),'true');
    const reason=await page.locator('#edit-message').textContent();
    assert(reason.includes('堵住门口'),reason);
    assert.deepEqual(await doc(),saved);
    assert.equal(await page.evaluate(key=>company.session.readSavedText(key),key),text);
    room.doorway={cart,height:0,target:[0,0,2.6],reason};
    await shot('studio-doorway-rejection.png');
  }
  stage=key+' cold restart';
  await close();await open('profile-'+index);await visit(key,false);
  assert.deepEqual(await doc(),saved);
  assert.equal(await page.evaluate(key=>company.session.readSavedText(key),key),text);
  room.coldOriginal=await physical(cart);room.coldClone=await physical(clone.cart);
  await focus(clone.cart);await shot(key+'-reopened.png');
  await close();
}
async function film() {
  stage='normal-speed recorded tour';
  await open('record-profile',true);
  const video=page.video(),t0=Date.now();
  for(const [i,key] of roomKeys.entries()) {
    await visit(key);
    const cart=key+'/ground/live/'+(i?'cart-tool':'cart-open');
    await focus(cart);await page.waitForTimeout(800);
    const options=i?[looks[2],looks[3]]:[looks[0],looks[1]];
    for(const name of options) {
      await changeLook(cart,name);await focus(cart);await page.waitForTimeout(1200);
    }
    if(i===0) {
      // Free the lower shelf in this film-only copy, then install the real desk camera through the inspector.
      await tools(cart+'/audio');await click('edit-remove');
      await attach(key+'/ground/live/desk-camera',cart,'lower');
      await focus(cart);await page.waitForTimeout(1300);
      await tools(cart);await click('edit-rotate');await focus(cart);await page.waitForTimeout(1000);
      await physical(cart);
    }
    await page.locator('.view-toolbar [data-view="room"]').click();await page.waitForTimeout(650);
  }
  await close();
  const filename=path.join(out,'equipment-cart-1x.webm');
  await video.saveAs(filename);await video.delete();
  const bytes=await fs.readFile(filename);
  assert(bytes.length>10000);
  report.video={file:path.basename(filename),bytes:bytes.length,sha256:sha(bytes),realWallSeconds:(Date.now()-t0)/1000,
    speed:1,viewport,method:'Real-time browser WebM; ordinary appearance choices in both rooms, desk camera installed on the lower deck, rotation of the loaded cart.'};
}
async function main() {
  const {checkManagedOutput}=await import('./package-company.mjs');
  await checkManagedOutput(out,undefined,{allowDelivery:false});
  const input=await fs.realpath(pkg),relative=path.relative(input,out);
  assert(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative),'Keep evidence outside the fixed package');
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);created=true;
  scratch=path.join(out,'process-temp');await fs.mkdir(scratch);
  for(const key of ['TMP','TEMP','TMPDIR'])process.env[key]=scratch;
  chromium=require('../../prototype/node_modules/playwright').chromium;
  const bytes=await fs.readFile(path.join(pkg,'transfer-manifest.json'));
  assert.equal(sha(bytes),pinned);
  manifest=JSON.parse(bytes);report.build=manifest.buildId;
  report.harnessSha256=sha(await fs.readFile(__filename));
  await readPinned('serve.mjs');await readPinned('viewer/company-build-info.json');
  server=spawn(process.execPath,[path.join(pkg,'serve.mjs'),'0'],{cwd:pkg,windowsHide:true,stdio:['ignore','pipe','inherit']});
  const lines=createInterface({input:server.stdout});
  const [line]=await Promise.race([once(lines,'line',{signal:AbortSignal.timeout(20000)}),once(server,'exit').then(()=>{throw Error('Package server stopped');})]);
  lines.close();server.stdout.resume();
  url=new URL(line);
  assert.equal(url.hostname,'127.0.0.1');assert(url.port);url.search='';
  for(const [i,key] of roomKeys.entries())await exercise(key,i);
  await film();assert.deepEqual(report.errors,[]);
  report.status='passed';
}
main().catch(async error=>{
  process.exitCode=1;report.status='failed';report.failure={stage,message:error.message,stack:error.stack};
  if(page) {
    report.failure.editor=await page.locator('#edit-message').textContent({timeout:2000}).catch(()=>null);
    await page.screenshot({path:path.join(out,'failure.png'),timeout:5000}).catch(()=>{});
  }
  console.error(error);
}).finally(async()=>{
  await close();
  if(server && server.exitCode===null) {const stopped=once(server,'exit');server.kill();await stopped;}
  if(scratch) {
    const expected=path.join(await fs.realpath(out),'process-temp');
    assert.equal(await fs.realpath(scratch),expected,'Refuse redirected browser scratch cleanup');
    await fs.rm(scratch,{recursive:true,force:true,maxRetries:3});
  }
  if(created)await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,stage,out}));
});
