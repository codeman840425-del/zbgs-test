const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const report={build,status:'running',checks:[],limits:['No real character usage or ordinary-PC performance acceptance. Browser frame samples describe only this environment.']};
let server,context,page;const errors=[];
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});}
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000}});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);}
async function shot(name){await page.evaluate(async()=>{company.renderer.render(company.world,company.camera);await new Promise(requestAnimationFrame);company.renderer.render(company.world,company.camera);await new Promise(requestAnimationFrame);});await page.screenshot({path:path.join(out,name+'.png')});}
(async()=>{
 await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
 await check('Different sofa geometry replaces only appearance, preserving physical/navigation/use identity',async()=>{
  await page.evaluate(()=>company.view('sofa'));await shot('01-soft-sofa');
  const before=await page.evaluate(()=>{const s=company.snapshot();return{navigation:s.navigation,points:s.points};});
  await page.getByLabel('沙发样件').selectOption('timber');await page.waitForFunction(()=>!document.getElementById('save').disabled);await shot('02-timber-sofa');
  const after=await page.evaluate(()=>{const s=company.snapshot();let meshes=0;company.session.scene.root.getObjectByName('lounge/sofa').traverse(n=>{if(n.isMesh&&!n.name.startsWith('Simplified:'))meshes++;});return{navigation:s.navigation,points:s.points,meshes,resource:company.session.document.nodes.find(n=>n.id==='lounge/sofa').resource};});
  assert.deepEqual(after.navigation,before.navigation);assert.deepEqual(after.points,before.points);assert.equal(after.meshes,18);assert.equal(after.resource.id,'timber-sofa');return{newMeshes:after.meshes,unchangedPhysicalContract:true};
 });
 await check('Rental rooms display real matching door gaps and connected public passage',async()=>{
  await page.evaluate(()=>company.load(company.layouts.rental));await shot('03-rental-cutaway');
  return await page.evaluate(()=>{const nav=company.session.scene.navigation(),nodes=company.session.document.nodes;if(nav.connections.length!==4)throw Error('Expected three room doors and a connected public living area');for(const c of nav.connections){const a=c.from.world.center,b=c.to.world.center;if(a.some((v,i)=>Math.abs(v-b[i])>1e-6))throw Error('Mismatched door geometry');if(nodes.find(n=>n.id===c.from.regionId).kind==='room'&&nodes.find(n=>n.id===c.to.regionId).kind==='room')throw Error('Residential circulation crosses another business room');}return{regions:nav.regions.length,connections:nav.connections.length,wallObstacles:nav.obstacles.filter(o=>o.kind==='wall').length};});
 });
 await check('Building overview loads no detailed facilities; floor switching loads only its own asset',async()=>{
  await page.evaluate(()=>company.load(company.layouts.twoFloors));await shot('04-building-overview');
  assert.deepEqual(await page.evaluate(()=>company.assetLibrary.snapshot()),{cachedAssets:0,loadedAssets:0});
  const result=await page.evaluate(async()=>{
   const original=JSON.stringify(company.session.document),floors=company.session.document.nodes.filter(n=>n.kind==='floor').map(n=>n.id),states=[];
   for(const floorId of [floors[0],floors[1],floors[0]]){await company.showSpace('floor',floorId);company.renderer.render(company.world,company.camera);states.push({floorId,cache:company.assetLibrary.snapshot(),points:company.snapshot().points.map(p=>p.id),memory:{...company.renderer.info.memory},drawCalls:company.renderer.info.render.calls});}
   return{states,documentUnchanged:original===JSON.stringify(company.session.document)};
  });assert(result.documentUnchanged);for(const s of result.states){assert.equal(s.cache.loadedAssets,1);assert(s.points.every(p=>p.startsWith(s.floorId)));}assert.deepEqual(result.states[0].memory,result.states[2].memory);await shot('05-first-floor');return result;
 });
 await check('Same-name rooms and stations keep separate state, and viewing leaves full configuration intact',async()=>{
  const result=await page.evaluate(async()=>{
   const doc=company.session.document,floors=doc.nodes.filter(n=>n.kind==='floor').map(n=>n.id),screens=doc.nodes.filter(n=>n.resource?.id==='monitor'),first=screens.find(n=>n.id.startsWith(floors[0])),second=screens.find(n=>n.id.startsWith(floors[1]));
   await company.apply([{type:'set-state',id:first.id,state:{on:false}}]);const saved=JSON.stringify(company.session.document);
   await company.showSpace('floor',floors[1]);await company.showSpace('room',floors[1],`${floors[1]}/room-2`);company.renderer.render(company.world,company.camera);
   const other=company.session.document.nodes.find(n=>n.id===second.id),secondOn=other.state.on??company.catalog.resources.find(r=>r.id===other.resource.id&&r.version===other.resource.version).stateDefaults.on;
   const lights=company.snapshot().lights;const hidden=company.session.scene.root.getObjectByName(`${floors[1]}/room-1/sofa`).getObjectByName('lounge-sofa')?.visible;
   return{unchanged:saved===JSON.stringify(company.session.document),secondOn,lights,cache:company.assetLibrary.snapshot(),focused:company.session.scene.view};
  });assert(result.unchanged);assert.equal(result.secondOn,true);assert(result.lights.filter(l=>l.intensity>0).length<=2);assert(result.lights.every(l=>!l.castsShadow));await shot('06-second-floor-focus');return result;
 });
 let saved;
 await check('Explicit template upgrade retains state/local overrides and saves every floor',async()=>{
  const result=await page.evaluate(async()=>{
   const station=company.session.document.nodes.find(n=>n.kind==='workstation');
   await company.apply([{type:'move',id:`${station.id}/desk`,transform:{position:[0,0,-1.1],yaw:0}}]);
   await company.session.upgrade(station.id,{id:'stream-station',version:2});await company.save();
   return{doc:company.session.document,save:JSON.parse(await company.export())};
  });saved=result.doc;assert.equal(saved.nodes.filter(n=>n.kind==='floor').length,2);const upgraded=saved.nodes.find(n=>n.kind==='workstation'&&n.template.version===2);assert(upgraded);assert.equal(saved.nodes.find(n=>n.id===upgraded.id+'/desk').transform.position[2],-1.1);assert.equal(result.save.document.nodes.length,saved.nodes.length);await fs.writeFile(path.join(out,'two-floors.company.json'),JSON.stringify(result.save,null,2));return{floors:2,pinnedResources:result.save.dependencies.resources.length};
 });
 await check('Close browser process and reopen the last saved company with all floors and state',async()=>{await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),saved);return{lastCompany:saved.id,allNodes:saved.nodes.length};});
 await check('A failed offscreen resource load preserves both current view and full company data',async()=>{
  const result=await page.evaluate(async()=>{
   await company.showSpace('floor',`${company.session.document.id}/floor-1`);
   const candidate=structuredClone(company.session.document),target=candidate.nodes.find(n=>n.id.endsWith('/floor-2/room-1/sofa'));
   const bad=structuredClone(company.catalog.resources.find(r=>r.id==='timber-sofa'));bad.version=999;bad.asset.url='/company-assets/missing-offscreen.glb';company.catalog.resources.push(bad);target.resource.version=999;
   await company.load(candidate);await company.showSpace('floor',`${candidate.id}/floor-1`);const before=JSON.stringify(company.snapshot());let code;
   try{await company.showSpace('floor',`${candidate.id}/floor-2`);}catch(e){code=e.code;}
   const unchanged=before===JSON.stringify(company.snapshot());await company.restore();company.catalog.resources.pop();return{code,unchanged};
  });assert.deepEqual(result,{code:'asset-fetch-failed',unchanged:true});return result;
 });
 await check('Five-floor structure uses one display floor at a time and bounded realtime lights',async()=>{
  await page.evaluate(()=>company.load(company.layouts.building));await shot('07-five-floor-overview');
  const result=await page.evaluate(async()=>{
   const floor=company.session.document.nodes.filter(n=>n.kind==='floor').at(-1);await company.showSpace('floor',floor.id);company.renderer.render(company.world,company.camera);const snapshot=company.snapshot();
   return{logicalFloors:snapshot.document.nodes.filter(n=>n.kind==='floor').length,displayedFacilities:snapshot.displayedFacilities,logicalFacilities:snapshot.document.nodes.filter(n=>n.kind==='facility').length,lights:snapshot.lights,cache:company.assetLibrary.snapshot(),drawCalls:company.renderer.info.render.calls,memory:{...company.renderer.info.memory}};
  });assert.equal(result.logicalFloors,5);assert(result.displayedFacilities<result.logicalFacilities);assert(result.lights.filter(l=>l.intensity>0).length<=2);await shot('08-fifth-floor');return result;
 });
 await check('Explicit 100-station configuration renders only one 20-station floor under the same light cap',async()=>{
  const {createScaledCompany}=await import('../../prototype/src/company/space.js');
  const input=JSON.parse(await fs.readFile(path.join(__dirname,'space-inputs/maximum.json'),'utf8'));
  const readJson=async name=>JSON.parse(await fs.readFile(path.join(__dirname,'../../prototype/src/company',name),'utf8'));
  const maximum=createScaledCompany(input,await readJson('library-catalog.json'),await readJson('templates-extended.json'));
  await page.evaluate(document=>company.load(document),maximum);
  const result=await page.evaluate(async()=>{
   const floor=company.session.document.nodes.find(n=>n.kind==='floor');await company.showSpace('floor',floor.id);
   const intervals=[],submission=[],start=performance.now();let last=start;
   for(let i=0;i<35;i++){await new Promise(requestAnimationFrame);const now=performance.now();if(i>4)intervals.push(now-last);last=now;const before=performance.now();company.renderer.render(company.world,company.camera);if(i>4)submission.push(performance.now()-before);}
   const percentile=(list,p)=>[...list].sort((a,b)=>a-b)[Math.floor((list.length-1)*p)];
   const gl=company.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
   return{stationCount:company.session.document.nodes.filter(n=>n.kind==='workstation').length,displayedFacilities:company.snapshot().displayedFacilities,lights:company.snapshot().lights.filter(l=>l.intensity>0).length,drawCalls:company.renderer.info.render.calls,triangles:company.renderer.info.render.triangles,memory:{...company.renderer.info.memory},frameIntervalMs:{median:percentile(intervals,.5),p95:percentile(intervals,.95)},cpuRenderSubmissionMs:{median:percentile(submission,.5),p95:percentile(submission,.95)},environment:{userAgent:navigator.userAgent,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unknown',width:innerWidth,height:innerHeight,pixelRatio:company.renderer.getPixelRatio()},limits:'Short functional development-browser sample; not isolated performance benchmarking, GPU timings or ordinary-PC acceptance.'};
  });assert.equal(result.stationCount,100);assert.equal(result.displayedFacilities,120);assert(result.lights<=2);await shot('09-maximum-current-floor');return result;
 });
 assert.deepEqual(errors,[]);report.status='passed';
})().catch(error=>{report.status='failed';report.error=error.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)await server.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error,output:out}));});
