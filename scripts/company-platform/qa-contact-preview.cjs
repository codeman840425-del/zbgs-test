const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [dist,build,output]=process.argv.slice(2);
if(!dist||!build||!output)throw Error('Usage: qa-contact-preview.cjs FIXED_DIST BUILD NEW_OUTPUT_DIR');
const out=path.resolve(output),report={build,status:'running',checks:[],limits:['Real browser company provider only. No actors, task/lease integration, character contact fitting or performance acceptance.']};
let server,browser;
(async()=>{
 await fs.mkdir(out,{recursive:false});server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));await page.goto(server.url);
 await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);
 const result=await page.evaluate(async()=>{
  await company.load(company.layouts.twoFloors);
  const session=company.session,floors=session.document.nodes.filter(n=>n.kind==='floor').map(n=>n.id);
  const points=session.scene.describeUsePoints(),sofas=points.filter(p=>p.resource.id.includes('sofa'));
  const left=sofas.find(p=>p.id.endsWith('#left')),right=sofas.find(p=>p.facilityId===left.facilityId&&p.id.endsWith('#right'));
  const original=JSON.stringify(session.document);
  const handles=await Promise.all([session.retainUsePointContact(left.id),session.retainUsePointContact(right.id)]);
  const before=handles.map(h=>({seat:[...h.seat.matrixWorld.elements],back:[...h.back.matrixWorld.elements]}));
  const cacheInBuilding=company.assetLibrary.snapshot();
  const visits=[];
  for(const floorId of [floors[0],floors[1],floors[0]]){
   await company.showSpace('floor',floorId);company.renderer.render(company.world,company.camera);
   visits.push({floorId,cache:company.assetLibrary.snapshot(),contacts:handles.map(h=>({seat:[...h.seat.matrixWorld.elements],back:[...h.back.matrixWorld.elements]})),unchanged:original===JSON.stringify(session.document)});
  }
  const node=session.document.nodes.find(n=>n.id===left.facilityId);let blocked;
  try{await session.apply([{type:'move',id:node.id,transform:node.transform}]);blocked='accepted';}catch(error){blocked=error.code;}
  await company.showSpace('building');
  const afterBuilding=handles.map(h=>({seat:[...h.seat.matrixWorld.elements],back:[...h.back.matrixWorld.elements]}));
  const finalCache=company.assetLibrary.snapshot(),firstSeat=handles[0].seat,secondSeat=handles[1].seat;
  let firstDisposed=0,secondDisposed=0;firstSeat.geometry.addEventListener('dispose',()=>firstDisposed++);secondSeat.geometry.addEventListener('dispose',()=>secondDisposed++);
  handles[0].release();const remainingUsable=!handles[1].released&&handles[1].seat===secondSeat;handles[0].release();handles[1].release();
  let invalid;try{void handles[0].seat;}catch(error){invalid=error.code;}
  return{before,visits,afterBuilding,cacheInBuilding,finalCache,blocked,remainingUsable,firstDisposed,secondDisposed,invalid,documentUnchanged:original===JSON.stringify(session.document)};
 });
 assert.deepEqual(result.cacheInBuilding,{cachedAssets:0,loadedAssets:0});assert.deepEqual(result.finalCache,result.cacheInBuilding);
 for(const visit of result.visits){assert(visit.unchanged);assert.deepEqual(visit.contacts,result.before);}
 assert.deepEqual(result.afterBuilding,result.before);assert.equal(result.blocked,'facility-busy');assert(result.documentUnchanged&&result.remainingUsable);
 assert.equal(result.firstDisposed,1);assert.equal(result.secondDisposed,1);assert.equal(result.invalid,'contact-handle-invalid');assert.deepEqual(errors,[]);
 report.checks.push({name:'Actual browser GLB contacts survive view changes, protect edits and release independently',passed:true,result});
 await page.screenshot({path:path.join(out,'building-after-release.png')});report.status='passed';
})().catch(error=>{report.status='failed';report.error=error.stack;process.exitCode=1;}).finally(async()=>{await browser?.close();await server?.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,build,error:report.error,output:out}));});
