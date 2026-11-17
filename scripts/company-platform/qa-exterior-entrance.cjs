const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../../prototype/node_modules/playwright'),{serve}=require('./serve.cjs');
const dist=path.resolve(process.argv[2]||'prototype/dist-company'),out=path.resolve(process.argv[3]||'output/playwright/company-entrance-dev1');
let server,context,page;const errors=[],report={checks:[],scope:'Actual room/frame meshes, UI, static navigation and persistence; no real-character crossing or target-device performance claim.'};
const idle=()=>page.waitForFunction(()=>window.company?.editor&&!document.querySelector('#mode-room').disabled);
const doc=()=>page.evaluate(()=>company.session.document);
const click=async id=>{await page.locator('#'+id).click();await idle();};
const choose=async(id,value)=>{await page.locator('#'+id).selectOption(value);await idle();};
const shot=async name=>page.screenshot({path:path.join(out,name+'.png')});
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},...(process.env.COMPANY_RECORD==='1'?{recordVideo:{dir:path.join(out,'normal-speed-video'),size:{width:1440,height:1000}}}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await idle();await page.waitForFunction(()=>company.buildInfo);}
async function check(name,fn){const observed=await fn();report.checks.push({name,passed:true,observed});console.log(name);}
async function aperture(id){return page.evaluate(id=>{
 const root=company.session.scene.root.getObjectByName(id);root.updateWorldMatrix(true,true);const nav=company.session.scene.navigation(),entry=nav.exteriorEntrances[0];
 const vec=(...a)=>company.camera.position.clone().set(...a);
 function hits(x,y){const origin=root.localToWorld(vec(x,y,-.5)),direction=vec(0,0,1).transformDirection(root.matrixWorld),hit=[];
  function triangles(mesh){if(!mesh.isMesh)return;const g=mesh.geometry,p=g.getAttribute('position'),idx=g.index;if(!p)return;
   for(let i=0;i<(idx?idx.count:p.count);i+=3){const [a,b,c]=[0,1,2].map(k=>vec(p.getX(idx?idx.getX(i+k):i+k),p.getY(idx?idx.getX(i+k):i+k),p.getZ(idx?idx.getX(i+k):i+k)).applyMatrix4(mesh.matrixWorld)),e1=b.sub(a),e2=c.sub(a),h=direction.clone().cross(e2),det=e1.dot(h);if(Math.abs(det)<1e-8)continue;const s=origin.clone().sub(a),u=s.dot(h)/det;if(u<0||u>1)continue;const q=s.cross(e1),v=direction.dot(q)/det;if(v<0||u+v>1)continue;const t=e2.dot(q)/det;if(t>=0&&t<=1){hit.push(mesh.name);break;}}
  }root.traverse(triangles);company.session.scene.walls.forEach(triangles);return hit;
 }
 return{entry,opening:[-.65,0,.65].flatMap(x=>[.1,1,2.15].map(y=>({x,y,hits:hits(x,y)}))),headerHits:hits(0,2.5),jambHits:[hits(-.78,1),hits(.78,1)],groundBlocked:nav.obstacles.filter(o=>Math.abs(entry.world.center[0]-o.x)<o.hw-1e-6&&Math.abs(entry.world.center[2]-o.z)<o.hd-1e-6).map(o=>o.name),obstacles:nav.obstacles.map(o=>({name:o.name,x:o.x,z:o.z,hw:o.hw,hd:o.hd}))};
 },id);}
(async()=>{await fs.mkdir(out,{recursive:true});report.build=JSON.parse(await fs.readFile(path.join(dist,'company-build-info.json')));report.playbackSpeed=1;server=await serve(dist,report.build.shortId,{manifest:'company-build-info.json',entry:'company.html'});await open();
let frameId;
await check('New minimum home exposes a real doorway and installs an existing frame',async()=>{
 await choose('layout','smallHome');const before=await doc();assert.equal(before.nodes.find(n=>n.kind==='floor').exteriorEntrances.length,1);
 await click('tool-add');await choose('add-branch','door-frame');assert.equal(await page.locator('#add-target option').count(),1);assert(!await page.locator('#add-center').isDisabled());assert(!await page.locator('#add-entrance').isVisible());await click('add-center');
 frameId=(await doc()).nodes.find(n=>!before.nodes.some(p=>p.id===n.id)).id;await click('tool-selection');await choose('edit-instance',frameId);await choose('wall-view','full');await click('edit-focus');await shot('01-installed-frame');await page.locator('.view-toolbar [data-view=room]').click();await shot('01-room-with-real-entrance');await click('edit-focus');return{frameId};
});
await check('Four real frame looks preserve clear aperture, header and ground passage',async()=>{
 const before=(await doc()).nodes.find(n=>n.id===frameId),looks=await page.locator('#edit-look option').evaluateAll(ns=>ns.map(n=>n.value));assert.equal(looks.length,4);const observations=[];
 for(const look of looks){await choose('edit-look',look);const actual=await aperture(frameId);assert(actual.opening.every(p=>p.hits.length===0),JSON.stringify(actual.opening));assert(actual.headerHits.length>0);assert(actual.jambHits.every(h=>h.length>0));assert.deepEqual(actual.groundBlocked,[]);assert.deepEqual((await doc()).nodes.find(n=>n.id===frameId).transform,before.transform);await shot('02-'+look.split('@')[0]);observations.push({look,...actual});}
 return observations;
});
await check('Cutaway changes viewing only; duplicate frame and removing its aperture retain document and save',async()=>{
 await click('save');const before=await doc(),saved=await page.evaluate(()=>JSON.stringify(localStorage)),original=await aperture(frameId);await choose('wall-view','cutaway');const after=await aperture(frameId);assert.deepEqual(after.obstacles,original.obstacles);assert.deepEqual(await doc(),before);
 const rejected=await page.evaluate(async id=>{const d=company.session.document,n=d.nodes.find(n=>n.id===id),floor=d.nodes.find(n=>n.kind==='floor'),codes=[];for(const op of [{type:'add-facility',id:'duplicate-frame',parentId:n.parentId,resource:n.resource,transform:n.transform},{type:'set-exterior-entrances',id:floor.id,entrances:[]}])try{await company.session.apply([op]);codes.push('accepted');}catch(e){codes.push(e.code);}return codes;},frameId);
 assert.deepEqual(rejected,['duplicate-door-frame','invalid-portal-fit']);assert.deepEqual(await doc(),before);assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),saved);return{rejected};
});
await check('Same identity and revision import refreshes entrance plan and preserves unrelated entrances',async()=>{
 await page.evaluate(()=>company.load(structuredClone(company.layouts.smallHome)));await idle();await click('tool-add');await choose('add-branch','door-frame');
 const fresh=await doc();assert(!await page.locator('#add-entrance').isVisible());
 const legacy=structuredClone(fresh);legacy.nodes.filter(n=>n.kind==='floor').forEach(n=>delete n.exteriorEntrances);
 await page.evaluate(d=>company.load(d),legacy);await idle();assert(await page.locator('#add-entrance').isVisible());
 await page.evaluate(d=>company.load(d),fresh);await idle();assert(!await page.locator('#add-entrance').isVisible());
 await page.evaluate(d=>company.load(d),legacy);await idle();assert(await page.locator('#add-entrance').isVisible());
 return{id:fresh.id,revision:fresh.revision};
});
await check('Legacy saved home stays unchanged until explicit create-entry-and-frame click',async()=>{
 const old=await page.evaluate(async()=>{const old=structuredClone(company.layouts.smallHome);old.nodes.filter(n=>n.kind==='floor').forEach(n=>delete n.exteriorEntrances);await company.load(old);return old;});await idle();assert.deepEqual(await doc(),old);
 await click('tool-add');await choose('add-branch','door-frame');assert(await page.locator('#add-center').isDisabled());assert(await page.locator('#add-entrance').isVisible());assert((await page.locator('#entrance-note').textContent()).includes('将改变墙体'));await shot('03-explicit-old-save-upgrade');await click('add-entrance');frameId=await page.locator('#edit-instance').inputValue();const after=await doc();assert.equal(after.id,old.id);assert.equal(after.nodes.find(n=>n.kind==='floor').exteriorEntrances.length,1);assert.equal(after.nodes.length,old.nodes.length+1);return{frameId,document:after.id};
});
await check('Rotated second input retains actual hole orientation, frame and complete restart state',async()=>{
 await page.evaluate(async()=>{const d=structuredClone(company.session.document);d.id='entrance-rotated-input';const floor=d.nodes.find(n=>n.kind==='floor');floor.parentId=d.id;d.nodes.find(n=>n.kind==='room').transform.yaw=Math.PI/2;await company.load(d);});await idle();await choose('edit-instance',frameId);await click('edit-focus');await choose('wall-view','full');const actual=await aperture(frameId);assert(actual.opening.every(p=>!p.hits.length));assert(actual.headerHits.length);assert(Math.abs(actual.entry.world.normal[0]-1)<1e-6);await shot('04-rotated-input');await click('save');const saved=await doc();await fs.writeFile(path.join(out,'layout.json'),JSON.stringify(saved,null,2));await context.close();context=null;await open();assert.deepEqual(await doc(),saved);assert.deepEqual((await aperture(frameId)).groundBlocked,[]);await shot('05-restored');return{entry:actual.entry};
});
assert.deepEqual(errors,[]);report.status='passed';})().catch(async e=>{report.status='failed';report.error={message:e.message,stack:e.stack};console.error(e);await shot('failure').catch(()=>{});process.exitCode=1;}).finally(async()=>{report.errors=errors;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await context?.close();await server?.close();});
