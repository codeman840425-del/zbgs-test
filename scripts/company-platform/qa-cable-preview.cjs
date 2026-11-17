const {chromium}=require('../../prototype/node_modules/playwright'),{serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg),hash=b=>createHash('sha256').update(b).digest('hex');
const report={build,status:'running',checks:[],limits:['Software Chromium functional evidence; no ordinary-PC performance, arbitrary cable routing, electrical simulation or C3 claims.']};
let server,context,page;const errors=[],downloads=[],pending=[];
async function open(){
 context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(/\/cable-(route|devices)-v1\/.+\.glb$/.test(r.url())&&r.status()===200)pending.push(r.body().then(b=>downloads.push({url:new URL(r.url()).pathname,sha256:hash(b),bytes:b.length})));});
 await page.goto(server.url);await page.waitForFunction(()=>window.company?.editor&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);await page.evaluate(()=>company.pausePreview());
}
async function idle(){await page.waitForFunction(()=>!document.querySelector('#mode-room').disabled);await page.evaluate(()=>company.drawHostFrame());}
async function shot(name){await idle();await page.screenshot({path:path.join(out,name+'.png')});}
async function inspect(){return page.evaluate(()=>{
 const c=company,root=c.session.scene.root;root.updateMatrixWorld(true);const entries=[];
 root.traverse(o=>{if(!o.userData.cableRoute)return;const route=o.userData.cableRoute,node=c.session.document.nodes.find(n=>n.id===route.id),parent=root.getObjectByName(node.parentId);const world=p=>c.camera.position.clone().fromArray(p).applyMatrix4(parent.matrixWorld).toArray();
  const centers={};for(const label of ['A','B']){const m=o.getObjectByName('endpoint-'+label),p=m.geometry.attributes.position;const center=c.camera.position.clone().set(0,0,0),v=center.clone();for(let i=0;i<p.count;i++)center.add(v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld));center.divideScalar(p.count);centers[label]=center.toArray();}
  entries.push({node,route,centers,expected:{A:world(route.a.map((v,i)=>v+.016*route.direction[i])),B:world(route.end.map((v,i)=>v-.016*route.direction[i]))},asset:c.catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version).asset});
 });return{document:c.session.document,entries,cache:c.assetLibrary.snapshot(),memory:{...c.renderer.info.memory},view:c.session.scene.view};
});}
const near=(a,b)=>a.every((x,i)=>Math.abs(x-b[i])<1e-6);
function endpoints(state){assert(state.entries.length);for(const e of state.entries){assert(near(e.centers.A,e.expected.A),JSON.stringify(e));assert(near(e.centers.B,e.expected.B),JSON.stringify(e));}}
async function check(name,fn){report.checks.push({name,passed:true,result:await fn()});await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(name);}
async function reject(operations){return page.evaluate(async ops=>{const c=company,before=JSON.stringify(c.session.document),save=JSON.stringify({...localStorage}),root=c.session.scene.root;let code;try{await c.apply(ops);}catch(e){code=e.code||e.message;}return{code,documentPreserved:before===JSON.stringify(c.session.document),savePreserved:save===JSON.stringify({...localStorage}),rootPreserved:root===c.session.scene.root};},operations);}
const intact=r=>assert(r.code&&r.documentPreserved&&r.savePreserved&&r.rootPreserved,JSON.stringify(r));
(async()=>{
 await fs.mkdir(out);report.harnessSha256=hash(await fs.readFile(__filename));server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
 await check('Four in-place cable appearances, real port endpoints, disconnect/reconnect and browser restart for each',async()=>{
  await page.evaluate(()=>company.showAppearanceSample('cable-route',0));const rows=[];
  for(let index=0;index<4;index++){
   await page.locator('#edit-instance').selectOption('cable/primary');const id=await page.evaluate(i=>company.appearanceCandidates('cable-route')[i].id,index);
   await page.locator('#edit-look').selectOption(id+'@1');await idle();await page.locator('#edit-focus').click();await idle();let connected=await inspect();endpoints(connected);assert.equal(connected.entries[0].route.connected,true);await shot('look-'+(index+1));
   assert(await page.locator('#edit-move').isDisabled());assert(await page.locator('#edit-copy').isDisabled());
   await page.locator('#edit-states button').click();await idle();const disconnected=await inspect();endpoints(disconnected);assert.equal(disconnected.entries[0].route.connected,false);assert(Math.abs(disconnected.entries[0].route.span-disconnected.entries[0].route.length-.025)<1e-8);await shot('unplugged-'+(index+1));
   await page.locator('#save').click();await idle();await Promise.all(pending);await context.close();context=null;await open();const restored=await inspect();assert.deepEqual(restored.document,disconnected.document);endpoints(restored);
   await page.locator('#edit-instance').selectOption('cable/primary');await page.locator('#edit-states button').click();await idle();rows.push({connected,disconnected,restored});
  }
  assert.equal(new Set(rows.map(r=>r.connected.entries[0].asset.sha256)).size,4);return rows;
 });
 await check('Whole desk move, rotation and copy remap real device references; second span and repeated swaps release resources',async()=>{
  await page.evaluate(()=>company.apply([{type:'move',id:'cable/desk',transform:{position:[-1.4,0,0],yaw:Math.PI/2}},{type:'copy-facility',id:'cable/desk',newId:'desk-copy',transform:{position:[1.4,0,0],yaw:Math.PI*1.5}}]));let state=await inspect();endpoints(state);assert.equal(state.entries.length,2);assert.notEqual(state.entries[0].node.cableLink.a.deviceId,state.entries[1].node.cableLink.a.deviceId);await page.evaluate(()=>company.view('top'));await shot('two-desks');
  await page.evaluate(()=>company.load(company.layouts.cableAlternate));await page.evaluate(()=>company.showAppearanceSample('cable-route',0));const cycles=[];
  for(let round=0;round<2;round++)for(let i=0;i<4;i++){await page.evaluate(i=>company.showAppearanceSample('cable-route',i),i);await idle();state=await inspect();endpoints(state);assert(Math.abs(state.entries[0].route.span-.298)<1e-6);cycles.push({id:i,cache:state.cache,memory:state.memory});}
  assert.deepEqual(cycles.slice(0,4),cycles.slice(4));await shot('second-span');await page.locator('#save').click();await idle();return{state,cycles};
 });
 await check('Invalid port movement, endpoint deletion, partial copy, duplicate reservation and HTTP failure keep live scene and saved bytes',async()=>{
  const rows=[];for(const ops of [
   [{type:'move',id:'cable/keyboard',transform:{position:[.1,.84,.31],yaw:0}}],
   [{type:'remove',id:'cable/monitor'}],
   [{type:'copy-facility',id:'cable/primary',newId:'orphan'}],
   [{type:'add-facility',id:'duplicate-cable',parentId:'cable/desk',resource:{id:'cable-route-single-sleeve',version:1},transform:{position:[0,0,0],yaw:0},cableLink:{a:{deviceId:'cable/keyboard',portId:'usb'},b:{deviceId:'cable/monitor',portId:'usb'}}}]
  ]){const r=await reject(ops);intact(r);rows.push(r);}
  await context.close();context=null;await open();const asset=await page.evaluate(()=>company.appearanceCandidates('cable-route')[0].asset);await page.route('**'+asset.url,r=>r.fulfill({status:503,body:'Intentional missing cable resource'}));const r=await reject([{type:'replace-resource',id:'cable/primary',resource:{id:'cable-route-single-sleeve',version:1}}]);intact(r);rows.push(r);await page.unroute('**'+asset.url);return rows;
 });
 await check('Company editor adds a cable to an available endpoint pair without replacing the room',async()=>{
  await page.locator('#mode-room').click();await idle();await page.evaluate(async()=>{const d=structuredClone(company.layouts.cables);d.id='custom-cable-room';d.nodes[0].parentId=d.id;d.nodes=d.nodes.filter(n=>n.id!=='cable/primary');await company.load(d);});
  const before=await inspect();await page.locator('#add-panel>summary').click();await page.locator('#add-branch').selectOption('cable-route');await page.locator('#add-look').selectOption('cable-route-flat-ribbon@1');assert.equal(await page.locator('#add-target option').count(),1);await page.locator('#add-center').click();await idle();const after=await inspect();endpoints(after);assert.equal(after.document.id,before.document.id);assert.equal(after.document.nodes.length,before.document.nodes.length+1);assert.equal(await page.locator('#add-target option').count(),0);return after;
 });
 await check('Actual obstructing geometry rejects edits on a hidden floor in building overview',async()=>{
  const result=await page.evaluate(async()=>{
   const c=company,good=structuredClone(c.layouts.cables);good.scale='building';for(const n of [...good.nodes]){const copy=structuredClone(n);copy.id+='-second';if(copy.parentId!==good.id)copy.parentId+='-second';if(copy.cableLink)for(const ref of Object.values(copy.cableLink))ref.deviceId+='-second';good.nodes.push(copy);}await c.load(good);await c.showSpace('building',good.nodes[0].id);await c.save();
   const src=c.catalog.resources.find(r=>r.id==='keyboard-compact-usb'),fixture={id:'qa-obstruction',version:1,category:'decor',coordinates:structuredClone(src.coordinates),asset:structuredClone(src.asset),provenance:structuredClone(src.provenance),usePoints:[],stateDefaults:{},footprint:null};c.catalog.resources.push(fixture);
   const before=JSON.stringify(c.session.document),save=JSON.stringify({...localStorage}),root=c.session.scene.root;let code;try{await c.apply([{type:'add-facility',id:'obstruction',parentId:'cable/desk-second',resource:{id:'qa-obstruction',version:1},transform:{position:[.15,.84,.02],yaw:0}}]);}catch(e){code=e.code;}
   return{code,documentPreserved:before===JSON.stringify(c.session.document),savePreserved:save===JSON.stringify({...localStorage}),rootPreserved:root===c.session.scene.root,cache:c.assetLibrary.snapshot()};
  });intact(result);assert.equal(result.code,'cable-route-obstructed');assert.equal(result.cache.loadedAssets,0);return result;
 });
 await page.evaluate(()=>company.load(company.layouts.cableAlternate));await page.evaluate(()=>company.showAppearanceSample('cable-route',3));await shot('final');await fs.writeFile(path.join(out,'save.json'),await page.evaluate(()=>company.session.export()));
 await Promise.all(pending);const assets=await page.evaluate(()=>company.appearanceCandidates('cable-route').map(r=>r.asset));for(const a of assets)assert(downloads.some(d=>d.url===a.url&&d.sha256===a.sha256&&d.bytes===a.bytes));assert.deepEqual(errors,[]);report.downloads=downloads;report.status='passed';
})().catch(async e=>{report.status='failed';report.error=e.stack;report.code=e.code;report.pageErrors=errors;report.pageText=await page?.locator('body').innerText().catch(()=>null);await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});console.error(e);process.exitCode=1;}).finally(async()=>{await context?.close();await server?.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');});
