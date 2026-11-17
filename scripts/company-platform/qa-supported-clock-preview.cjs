const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg),report={build,status:'running',checks:[],limits:['Software browser rendering only; no ordinary-PC performance, role integration or final human acceptance.']};
let server,context,page;const errors=[];
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);}
async function check(name,fn){report.checks.push({name,passed:true,result:await fn()});await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(name);}
async function inspect(id='supported-clock/primary'){return page.evaluate(id=>{
 const node=company.session.document.nodes.find(n=>n.id===id),r=company.catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version),object=company.session.scene.root.getObjectByName(id),base={id,resource:node.resource,state:node.state,kind:r.clockDisplay.kind,world:object.matrixWorld.toArray(),visible:object.visible};
 if(r.clockDisplay.kind==='analog')return {...base,angles:Object.fromEntries(Object.entries(r.clockNodes).map(([k,v])=>[k,object.getObjectByName(v).rotation.z]))};
 return {...base,digits:r.clockNodes.digits.map(names=>names.map(n=>object.getObjectByName(n).visible)),dots:r.clockNodes.colons.map(n=>object.getObjectByName(n).visible),intensity:object.getObjectByName(r.clockNodes.digits[0][0]).material.emissiveIntensity};
},id);}
function assertTime(snapshot,seconds,offset=0){const t=((seconds+offset)%86400+86400)%86400;
 if(snapshot.kind==='analog'){for(const [key,period]of [['hour',43200],['minute',3600],['second',60]])assert(Math.abs(snapshot.angles[key]+Math.PI*2*(t%period)/period)<1e-9);}
 else{const whole=Math.floor(t),digits=[Math.floor(whole/3600),Math.floor(whole/60)%60,whole%60].map(n=>String(n).padStart(2,'0')).join(''),segments=['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];assert.deepEqual(snapshot.digits,[...digits].map(d=>[...'abcdefg'].map(s=>segments[Number(d)].includes(s))));assert(snapshot.dots.every(Boolean));}
}
(async()=>{await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
 await check('All eight real looks render supplied time, keep offset/brightness through save and separate process restart',async()=>{
  const result=[];
  for(const branch of ['analog-clock-shelf','digital-clock-shelf'])for(let index=0;index<4;index++){
   await page.evaluate(({branch,index})=>company.showAppearanceSample(branch,index),{branch,index});
   await page.evaluate(async()=>{company.setPreviewClock(33330.5);const node=company.session.document.nodes.find(n=>n.id==='supported-clock/primary'),r=company.catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version);await company.apply([{type:'set-state',id:node.id,state:r.clockDisplay.kind==='digital'?{timeOffsetSeconds:60,on:true,brightness:.3}:{timeOffsetSeconds:60}}]);company.view('clock');});
   const before=await inspect();assertTime(before,33330.5,60);if(branch==='digital-clock-shelf')assert.equal(before.intensity,.3);
   await page.screenshot({path:path.join(out,`${branch}-${index+1}.png`)});await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);
   await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),saved);await page.evaluate(()=>company.setPreviewClock(33330.5));const restored=await inspect();assertTime(restored,33330.5,60);assert.deepEqual(restored.state,before.state);
   result.push({branch,index,before,restored});
  }return result;
 });
 await check('Parent move, rotation, compatible shelf replacement and copied assembly keep clock mounts and settings',async()=>{
  await page.evaluate(()=>company.showAppearanceSample('analog-clock-shelf',0));
  const before=await inspect();
  await page.evaluate(async()=>{await company.apply([{type:'move',id:'supported-clock/shelf',transform:{position:[1.7,0,-.4],yaw:Math.PI/2}}]);company.setPreviewClock(33330.5);});
  const turned=await inspect();assertTime(turned,33330.5);assert.notDeepEqual(turned.world,before.world);
  const mount=await page.evaluate(()=>{
   const parent=company.session.scene.root.getObjectByName('supported-clock/shelf'),clock=company.session.scene.root.getObjectByName('supported-clock/primary'),node=company.session.document.nodes.find(n=>n.id==='supported-clock/primary');
   const expected=clock.position.clone().fromArray(node.transform.position);parent.localToWorld(expected);const actual=clock.getWorldPosition(clock.position.clone());return {distance:actual.distanceTo(expected),local:clock.position.toArray(),attachment:node.attachment};
  });assert(mount.distance<1e-8);assert.equal(mount.attachment.surfaceId,'middle');
  await page.evaluate(async()=>{const r=company.catalog.resources.filter(r=>r.mountRole==='storage-shelf')[1];await company.apply([{type:'replace-resource',id:'supported-clock/shelf',resource:{id:r.id,version:r.version}}]);});assert.deepEqual((await inspect()).world,turned.world);
  const copied=await page.evaluate(async()=>{
   await company.apply([{type:'copy-group',id:'supported-clock/display',newId:'clock-copy',transform:{position:[0,0,2],yaw:0}}]);const doc=company.session.document,parent=doc.nodes.find(n=>n.parentId==='clock-copy'),node=doc.nodes.find(n=>n.parentId===parent.id&&company.catalog.resources.find(r=>r.id===n.resource?.id)?.clockDisplay?.kind==='digital');
   await company.apply([{type:'set-state',id:node.id,state:{on:false}}]);await company.save();return {parent:parent.id,clock:node.id,document:company.session.document};
  });assert.notEqual(copied.clock,'supported-clock/secondary');assert((await inspect('supported-clock/secondary')).digits.flat().some(Boolean));assert((await inspect(copied.clock)).digits.flat().every(v=>!v));
  await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),copied.document);return {mount,turned,copiedClock:copied.clock};
 });
 await check('Invalid support placement, missing frame and failed replacement keep effective scene and save',async()=>{
  await page.evaluate(()=>company.showAppearanceSample('analog-clock-shelf',0));
  const bad=await page.evaluate(async()=>{const before=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage}),codes=[];
   for(const position of [[0,1.06,0],[.5,1.05,0]]){try{await company.apply([{type:'move',id:'supported-clock/primary',transform:{position,yaw:0}}]);}catch(e){codes.push(e.code);}}
   const r=structuredClone(company.appearanceCandidates('analog-clock-shelf')[0]);r.id='qa-missing-supported-frame';r.clockNodes.frame='missing-frame';company.catalog.resources.push(r);try{await company.apply([{type:'replace-resource',id:'supported-clock/primary',resource:{id:r.id,version:1}}]);}catch(e){codes.push(e.code);}finally{company.catalog.resources.pop();}
   return {codes,unchanged:before===JSON.stringify(company.session.document)&&saved===JSON.stringify({...localStorage})};});assert.deepEqual(bad.codes.slice(0,2),['invalid-support-fit','invalid-support-fit']);assert(bad.codes.length===3&&/clock/.test(bad.codes[2])&&bad.unchanged);
  const r=await page.evaluate(()=>company.appearanceCandidates('analog-clock-shelf')[3]);await page.route(`**${r.asset.url}`,route=>route.fulfill({status:503,body:'expected failure'}));
  const fetch=await page.evaluate(async r=>{const before=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage});let code;try{await company.apply([{type:'replace-resource',id:'supported-clock/primary',resource:{id:r.id,version:1}}]);}catch(e){code=e.code;}return {code,unchanged:before===JSON.stringify(company.session.document)&&saved===JSON.stringify({...localStorage})};},r);await page.unroute(`**${r.asset.url}`);assert.equal(fetch.code,'asset-fetch-failed');assert(fetch.unchanged);return {bad,fetch};
 });
 await check('Second input uses same assets and clears supported clocks on unload',async()=>{
  await page.evaluate(async()=>{await company.load(company.layouts.supportedClockAlternate);company.setPreviewClock(86399);company.view('clock');});assertTime(await inspect(),86399);const alternate=await page.evaluate(()=>company.session.document);await page.screenshot({path:path.join(out,'alternate.png')});
  await page.evaluate(()=>company.load(company.layouts.smallHome));assert.equal(await page.evaluate(()=>Boolean(company.session.scene.root.getObjectByName('supported-clock/primary'))),false);return {alternateParent:alternate.nodes.find(n=>n.id==='supported-clock/shelf'),cache:await page.evaluate(()=>company.assetLibrary.snapshot())};
 });
 assert.deepEqual(errors,[]);report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)await server.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
