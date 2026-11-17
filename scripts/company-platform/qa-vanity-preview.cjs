const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg),report={build,status:'running',checks:[],limits:['SwiftShader browser; no role C3, ordinary-PC or final human acceptance']};
let server,context,page;const errors=[];
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);}
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});console.log(name);}
async function draw(){await page.evaluate(()=>{company.setPreviewClock(33330);company.drawHostFrame();});await page.waitForTimeout(80);}
async function actual(){return page.evaluate(()=>{const doc=company.session.document,ids=doc.nodes.filter(n=>n.id.startsWith('vanity/')&&n.kind==='facility').map(n=>n.id);return{document:doc,objects:ids.map(id=>{const object=company.session.scene.root.getObjectByName(id),v=company.camera.position.clone();return{id,position:object?.getWorldPosition(v).toArray(),geometryPresent:!!object};}),cache:company.assetLibrary.snapshot(),memory:company.renderer.info.memory};});}
(async()=>{
 await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
 await check('All four real tables use one display flow and retain supported state through separate browser restarts',async()=>{
  const results=[];
  for(let index=0;index<4;index++) {
   await page.evaluate(index=>company.showAppearanceSample('vanity-table',index),index);await draw();
   await page.evaluate(()=>company.apply([{type:'set-state',id:'vanity/primary/clock',state:{timeOffsetSeconds:4500,on:true,brightness:.35}}]));await draw();
   const before=await actual();assert(before.objects.every(o=>o.geometryPresent));assert.equal(before.cache.loadedAssets,4);
   await page.screenshot({path:path.join(out,`table-${index+1}.png`)});await page.evaluate(()=>company.save());
   await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),before.document);await draw();
   results.push({index,resource:before.document.nodes.find(n=>n.id==='vanity/primary').resource,...before});
  }return results;
 });
 await check('Explicit quarter-turn changes visible child positions, seat direction and blocking from the same final transform',async()=>{
  await page.evaluate(()=>company.showAppearanceSample('vanity-table',0));
  await page.evaluate(()=>company.apply([{type:'move',id:'vanity/primary',transform:{position:[.5,0,-1.3],yaw:Math.PI/2}},{type:'move',id:'vanity/primary/seat',transform:{position:[1.05,0,-1.32],yaw:Math.PI*1.5}}]));
  await draw();const a=await actual(),clock=a.objects.find(o=>o.id==='vanity/primary/clock'),seat=a.objects.find(o=>o.id==='vanity/primary/seat');
  assert(clock.position.every((v,i)=>Math.abs(v-[.35,.78,-1.32][i])<1e-8));assert(seat.position.every((v,i)=>Math.abs(v-[1.05,0,-1.32][i])<1e-8));
  const obstacle=await page.evaluate(()=>company.session.scene.snapshot().navigation.find(o=>o.instanceId==='vanity/primary'));assert(obstacle);await page.screenshot({path:path.join(out,'turned-table.png')});return{...a,obstacle};
 });
 await check('Bad mounting, blocked front reserve, wrong seat and missing asset reject without changing live document or saved bytes',async()=>{
  await page.evaluate(()=>company.load(company.layouts.vanities));await page.evaluate(()=>company.save());
  const result=await page.evaluate(async()=>{const before=JSON.stringify(company.session.document),saved=JSON.stringify(await company.export()),cases=[
    [{type:'move',id:'vanity/primary',transform:{position:[-1,0,-1],yaw:0}}],
    [{type:'move',id:'vanity/primary/clock',transform:{position:[.02,.8,-.15],yaw:0}}],
    [{type:'add-facility',id:'bad-front',parentId:company.session.document.nodes.find(n=>n.kind==='room').id,resource:{id:'chair',version:1},transform:{position:[-.25,0,-.15],yaw:0}}],
    [{type:'replace-resource',id:'vanity/primary/seat',resource:{id:'chair',version:1}}]
   ],failures=[];
   for(const ops of cases){let code;try{await company.apply(ops);}catch(e){code=e.code;}const documentPreserved=JSON.stringify(company.session.document)===before,exportPreserved=JSON.stringify(await company.export())===saved;if(!code||!documentPreserved||!exportPreserved)throw Error('Candidate failure: '+JSON.stringify({ops,code,documentPreserved,exportPreserved}));failures.push({code,ops});}return failures;
  });
  const resource=await page.evaluate(()=>company.catalog.resources.find(r=>r.id==='vanity-table-mobile'));
  await page.route('**'+resource.asset.url,route=>route.fulfill({status:503,body:'deliberate missing candidate'}));
  const before=await page.evaluate(()=>company.session.document);const failure=await page.evaluate(async()=>{try{await company.apply([{type:'replace-resource',id:'vanity/primary',resource:{id:'vanity-table-mobile',version:1}}]);return null;}catch(e){return e.code;}});
  assert(failure);assert.deepEqual(await page.evaluate(()=>company.session.document),before);await page.unroute('**'+resource.asset.url);return{rejected:result,missingAsset:failure};
 });
 await check('Two same-name rooms retain independent rotated sets and nondefault state after browser shutdown',async()=>{
  await page.evaluate(()=>company.load(company.layouts.vanityAlternate));await draw();
  await page.evaluate(()=>company.apply([{type:'set-state',id:'vanity/primary/clock',state:{on:false}}]));
  const before=await actual();assert.equal(before.document.nodes.find(n=>n.id==='vanity/secondary/clock').state.on,true);assert.equal(before.document.nodes.find(n=>n.id==='vanity/secondary/clock').state.timeOffsetSeconds,7200);
  await page.evaluate(()=>company.showSpace('floor',company.session.document.nodes[0].id));await draw();await page.screenshot({path:path.join(out,'two-rooms.png')});await page.evaluate(()=>company.save());
  await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),before.document);
  for(const room of before.document.nodes.filter(n=>n.kind==='room')){await page.evaluate(id=>company.showSpace('room',company.session.document.nodes[0].id,id),room.id);await draw();}
  return before;
 });
 await check('Repeated replacement releases old geometry and retains only current view dependencies',async()=>{
  const samples=[];for(let i=0;i<8;i++){await page.evaluate(i=>company.showAppearanceSample('vanity-table',i%4),i);await draw();samples.push(await page.evaluate(()=>({cache:company.assetLibrary.snapshot(),memory:{...company.renderer.info.memory},pass:{...company.renderer.info.render}})));}
  assert(samples.every(s=>s.cache.loadedAssets===4));for(let i=0;i<4;i++)assert.deepEqual(samples[i].memory,samples[i+4].memory);return samples;
 });
 assert.deepEqual(errors,[]);report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)await server.close();report.pageErrors=errors;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
