const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg),report={build,status:'running',checks:[],limits:['Software browser rendering only; no ordinary-PC performance, role integration or final human acceptance.']};
let server,context,page;const errors=[];
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);}
async function check(name,fn){report.checks.push({name,passed:true,result:await fn()});await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(name);}
async function inspect(id='clock/primary'){return page.evaluate(id=>{
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
  for(const branch of ['analog-clock','digital-clock'])for(let index=0;index<4;index++){
   await page.evaluate(({branch,index})=>company.showAppearanceSample(branch,index),{branch,index});
   await page.evaluate(async()=>{company.setPreviewClock(33330.5);const node=company.session.document.nodes.find(n=>n.id==='clock/primary'),r=company.catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version);await company.apply([{type:'set-state',id:node.id,state:r.clockDisplay.kind==='digital'?{timeOffsetSeconds:60,on:true,brightness:.3}:{timeOffsetSeconds:60}}]);company.view('clock');});
   const before=await inspect();assertTime(before,33330.5,60);if(branch==='digital-clock')assert.equal(before.intensity,.3);
   await page.screenshot({path:path.join(out,`${branch}-${index+1}.png`)});await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);
   await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),saved);await page.evaluate(()=>company.setPreviewClock(33330.5));const restored=await inspect();assertTime(restored,33330.5,60);assert.deepEqual(restored.state,before.state);
   result.push({branch,index,before,restored});
  }return result;
 });
 await check('Midnight, changed host input and digit power update actual nodes without changing document/storage',async()=>{
  await page.evaluate(()=>company.showAppearanceSample('digital-clock',0));await page.evaluate(()=>company.apply([{type:'set-state',id:'clock/primary',state:{timeOffsetSeconds:0,on:true,brightness:1}}]));
  const baseline=await page.evaluate(()=>({doc:JSON.stringify(company.session.document),storage:JSON.stringify({...localStorage})}));const states=[];
  for(const t of [86399,86400,3661,0]){await page.evaluate(t=>company.setPreviewClock(t),t);const s=await inspect();assertTime(s,t);states.push(s);}
  assert.deepEqual(await page.evaluate(()=>({doc:JSON.stringify(company.session.document),storage:JSON.stringify({...localStorage})})),baseline);
  await page.evaluate(()=>company.apply([{type:'set-state',id:'clock/primary',state:{on:false}}]));await page.waitForFunction(()=>company.session.document.nodes.find(n=>n.id==='clock/primary').state.on===false);const off=await inspect();assert(off.digits.flat().every(v=>!v)&&off.dots.every(v=>!v));assert.equal(off.intensity,0);
  await page.evaluate(()=>company.apply([{type:'set-state',id:'clock/primary',state:{on:true}}]));await page.waitForFunction(()=>company.session.document.nodes.find(n=>n.id==='clock/primary').state.on===true);await page.evaluate(()=>company.apply([{type:'set-state',id:'clock/primary',state:{brightness:0}}]));await page.waitForFunction(()=>company.session.document.nodes.find(n=>n.id==='clock/primary').state.brightness===0);assert((await inspect()).digits.flat().every(v=>!v));
  return {states,off};
 });
 await check('Turned wall mounting, cutaway and view release retain latest host input and logical settings',async()=>{
  await page.evaluate(async()=>{await company.load(company.layouts.clockAlternate);company.setPreviewClock(43215);company.view('clock');});const turned=await inspect();assertTime(turned,43215);assert.equal(await page.evaluate(()=>company.session.document.nodes.find(n=>n.id==='clock/primary').transform.yaw),Math.PI/2);
  const saved=await page.evaluate(()=>JSON.stringify(company.session.document));
  const hidden=await page.evaluate(()=>{company.session.scene.setWallView({mode:'cutaway',cameraPosition:[-8,2,0]});return company.session.scene.wallPresentation();});
  assert(hidden.walls.some(w=>!w.visible&&w.mounted.some(m=>m.id==='clock/primary'&&!m.visible)));
  await page.evaluate(async()=>{await company.session.setView({mode:'building'});company.setPreviewClock(43245);await company.session.setView({mode:'room',roomId:company.session.document.nodes.find(n=>n.kind==='room').id});company.view('clock');});assertTime(await inspect(),43245);assert.equal(await page.evaluate(()=>JSON.stringify(company.session.document)),saved);return {turned,hidden};
 });
 await check('Two actual floors retain independent saved clock settings and consume latest input on reload',async()=>{
  const rooms=await page.evaluate(async()=>{
   await company.load(company.layouts.twoFloors);const doc=company.session.document,floors=doc.nodes.filter(n=>n.kind==='floor'),rooms=floors.map(f=>doc.nodes.find(n=>n.kind==='room'&&n.parentId===f.id)),resource=company.appearanceCandidates('digital-clock')[0];
   await company.apply(rooms.map((r,i)=>({type:'add-facility',id:`floor-clock-${i}`,parentId:r.id,resource:{id:resource.id,version:resource.version},transform:{position:[0,1.8,-r.bounds.depth/2+.1],yaw:0},state:{on:true,brightness:i?.3:1,timeOffsetSeconds:i*3600}})));
   return rooms.map(r=>({id:r.id,floorId:r.parentId}));
  });
  await page.evaluate(async rooms=>{company.setPreviewClock(33330);await company.showSpace('room',rooms[0].floorId,rooms[0].id);},rooms);assertTime(await inspect('floor-clock-0'),33330);
  await page.evaluate(async rooms=>{company.setPreviewClock(40000);await company.showSpace('room',rooms[1].floorId,rooms[1].id);},rooms);const second=await inspect('floor-clock-1');assertTime(second,40000,3600);assert.equal(second.intensity,.3);
  await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),saved);
  for(let i=0;i<2;i++){await page.evaluate(async({room,time})=>{company.setPreviewClock(time);await company.showSpace('room',room.floorId,room.id);},{room:rooms[i],time:50000});assertTime(await inspect(`floor-clock-${i}`),50000,i*3600);}
  return {rooms,second,savedClockIds:saved.nodes.filter(n=>n.id.startsWith('floor-clock-')).map(n=>n.id)};
 });
 await check('Bad state, missing actual display node and failed download preserve scene and storage',async()=>{
  await page.evaluate(()=>company.showAppearanceSample('analog-clock',0));
  const bad=await page.evaluate(async()=>{const before=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage}),results=[];
   for(const state of [{timeOffsetSeconds:86401},{timeOffsetSeconds:'1'}]){try{await company.apply([{type:'set-state',id:'clock/primary',state}]);}catch(e){results.push(e.code);}}
   const good=company.appearanceCandidates('analog-clock')[0],bad=structuredClone(good);bad.id='qa-clock-missing';bad.clockNodes.second='missing-hand';company.catalog.resources.push(bad);try{await company.apply([{type:'replace-resource',id:'clock/primary',resource:{id:bad.id,version:1}}]);}catch(e){results.push(e.code);}finally{company.catalog.resources.pop();}
   return {results,unchanged:before===JSON.stringify(company.session.document)&&saved===JSON.stringify({...localStorage})};});
  assert.deepEqual(bad.results.slice(0,2),['invalid-device-state','invalid-device-state']);assert.equal(bad.results.length,3);assert(/clock/.test(bad.results[2]));assert(bad.unchanged);
  const target=await page.evaluate(()=>company.appearanceCandidates('analog-clock')[3]);await page.route(`**${target.asset.url}`,r=>r.fulfill({status:503,body:'expected test failure'}));
  const rejected=await page.evaluate(async target=>{const before=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage});let code;try{await company.apply([{type:'replace-resource',id:'clock/primary',resource:{id:target.id,version:target.version}}]);}catch(e){code=e.code;}return {code,unchanged:before===JSON.stringify(company.session.document)&&saved===JSON.stringify({...localStorage})};},target);await page.unroute(`**${target.asset.url}`);assert.equal(rejected.code,'asset-fetch-failed');assert(rejected.unchanged);return {bad,rejected};
 });
 await check('Unloading clocks releases their imported cache and meshes',async()=>{
  await page.evaluate(()=>company.load(company.layouts.smallHome));const result=await page.evaluate(()=>({primary:Boolean(company.session.scene.root.getObjectByName('clock/primary')),assets:company.assetLibrary.snapshot()}));assert.equal(result.primary,false);return result;
 });
 assert.deepEqual(errors,[]);report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)await server.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
