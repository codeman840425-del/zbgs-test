const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const [distArg,outArg]=process.argv.slice(2),dist=path.resolve(distArg),out=path.resolve(outArg);
let server,context,page;const errors=[];const report={checks:[],scope:'Explicit workstation template upgrade in the real company editor. Software rendering; no character or ordinary-PC performance claim.'};
const idle=()=>page.waitForFunction(()=>window.company?.editor&&!document.querySelector('#save').disabled,{timeout:60000});
const doc=()=>page.evaluate(()=>structuredClone(company.session.document));
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.waitForFunction(()=>window.company?.editor&&company.buildInfo,{timeout:60000});await idle();}
async function check(name,run){const observed=await run();report.checks.push({name,passed:true,observed});await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2));console.log(name);}
(async()=>{
 await fs.mkdir(out,{recursive:true});const build=JSON.parse(await fs.readFile(path.join(dist,'company-build-info.json'))).shortId;server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});report.build=build;await open();
 await check('current editor exposes an explicit version target for a selected workstation',async()=>{
   await page.locator('#layout').selectOption('base');await idle();let d=await doc();let stations=d.nodes.filter(n=>n.kind==='workstation');assert(stations.length>=1);
   const station=stations[0],room=d.nodes.find(n=>n.id===station.parentId);assert(room);
   await page.evaluate(({floorId,roomId})=>company.showSpace('room',floorId,roomId),{floorId:d.nodes.find(n=>n.id===room.parentId).id,roomId:room.id});await idle();
   await page.locator('#edit-instance').selectOption(station.id);await idle();
   assert(await page.locator('#template-upgrade-panel').isVisible());
   const options=await page.locator('#template-target option').evaluateAll(ns=>ns.map(n=>({value:n.value,label:n.textContent})));
   assert(options.some(o=>o.label.includes('v1')));assert(options.some(o=>o.label.includes('v2')));
   return {stationId:station.id,stationCount:stations.length,options};
 });
 await check('upgrade preserves local state, identity, and only the selected workstation',async()=>{
   const before=await doc(),station=before.nodes.find(n=>n.kind==='workstation'),parts=before.nodes.filter(n=>n.stationId===station.id),other=before.nodes.find(n=>n.kind==='workstation'&&n.id!==station.id);
   const monitor=parts.find(n=>n.partKey==='monitor');assert(monitor);
   await page.evaluate(({id})=>company.apply([{type:'set-state',id,state:{on:false}}]),{id:monitor.id});await idle();
   const edited=await doc();const target=JSON.stringify({id:station.template.id,version:2});await page.locator('#template-target').selectOption(target);await page.locator('#template-upgrade').click();await idle();
   const after=await doc();const upgraded=after.nodes.find(n=>n.id===station.id),savedMonitor=after.nodes.find(n=>n.id===monitor.id);
   assert.equal(upgraded.template.version,2);assert.equal(savedMonitor.state.on,false);assert.deepEqual(upgraded.transform,station.transform);
   for(const p of parts)assert(after.nodes.some(n=>n.id===p.id),p.id);
   if(other)assert.equal(after.nodes.find(n=>n.id===other.id).template.version,other.template.version);
   await page.locator('#save').click();await idle();return {stationId:station.id,from:station.template,to:upgraded.template,retainedPartIds:parts.map(n=>n.id),preservedState:{id:monitor.id,on:savedMonitor.state.on},otherStation:other?.id||null};
 });
 await check('saved upgrade survives browser restart and invalid target keeps the saved document',async()=>{
   const saved=await doc(),station=saved.nodes.find(n=>n.kind==='workstation');
   const failure=await page.evaluate(async id=>{try{await company.session.upgrade(id,{id:'stream-station',version:999});return null;}catch(e){return{code:e.code,path:e.path,message:e.message};}},station.id);
   assert(failure&&failure.code==='missing-template-version');assert.deepEqual(await doc(),saved);
   await context.close();context=null;await open();assert.deepEqual(await doc(),saved);await page.screenshot({path:path.join(out,'upgrade-restored.png')});return {failure,stationId:station.id,template:saved.nodes.find(n=>n.id===station.id).template};
 });
 assert.deepEqual(errors,[]);report.status='passed';
})().catch(async e=>{report.status='failed';report.error={message:e.message,stack:e.stack};console.error(e);try{await page.screenshot({path:path.join(out,'failure.png')});}catch{}process.exitCode=1;}).finally(async()=>{report.errors=errors;await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await context?.close();await server?.close();});
