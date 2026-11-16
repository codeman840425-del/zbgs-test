const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const report={build,status:'running',checks:[],limits:['Software rendering; no character, ordinary-PC or human acceptance.']};
let server,context,page,roomId,floorId;const errors=[];
async function open(){
  context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(server.url);
  await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);
}
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(name);}
async function shot(name){await page.evaluate(async()=>{await new Promise(requestAnimationFrame);company.renderer.render(company.world,company.camera);if(company.renderer.getContext().isContextLost())throw Error('Context lost');});await page.locator('.viewport').screenshot({path:path.join(out,`${name}.png`)});}
async function functional(){return page.evaluate(()=>{
  const doc=structuredClone(company.session.document);delete doc.revision;for(const n of doc.nodes)delete n.finishes;
  return{document:doc,points:company.session.scene.describeUsePoints().map(({revision,...p})=>p),obstacles:company.session.scene.navigation().obstacles.map(({object,...o})=>o)};
});}
async function room(){await page.evaluate(({f,r})=>company.showSpace('room',f,r),{f:floorId,r:roomId});}
(async()=>{
  await fs.mkdir(out);report.harnessSha256=createHash('sha256').update(await fs.readFile(__filename)).digest('hex');server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
  await check('The frozen wall-floor save imports without changing pinned resource identities',async()=>{
    const file=path.resolve(__dirname,'../../evidence/company-surface-fixed-3d7-v1/all-floors.company.json'),bytes=await fs.readFile(file),saved=JSON.parse(bytes);
    await page.evaluate(text=>company.session.import(text),bytes.toString('utf8'));
    assert.deepEqual(await page.evaluate(()=>company.session.document),saved.document);
    return{sourceBuild:'3d7adc60d3b8',saveSha256:createHash('sha256').update(bytes).digest('hex'),resources:saved.dependencies.resources.length};
  });
  await page.evaluate(()=>company.load(company.layouts.surfaceHome));
  ({roomId,floorId}=await page.evaluate(()=>{const r=company.session.document.nodes.find(n=>n.kind==='room');return{roomId:r.id,floorId:r.parentId};}));
  const baseline=await functional();
  await check('Four real ceiling textures display from inside and survive browser-process restart',async()=>{
    const resources=await page.evaluate(()=>company.catalog.resources.filter(r=>r.kind==='surface-finish'&&r.finish.allowedSurfaces.includes('ceiling')).map(r=>({id:r.id,version:r.version,sha256:r.asset.sha256})));
    assert.equal(resources.length,4);assert.equal(new Set(resources.map(r=>r.sha256)).size,4);
    for(const resource of resources) {
      await page.locator('#finish-ceiling').selectOption(`${resource.id}@${resource.version}`);await page.waitForFunction(()=>!document.getElementById('save').disabled);
      assert.equal(await page.locator('#status').getAttribute('data-error'),'false');await page.locator('[data-view="ceiling"]').click();
      const surface=await page.evaluate(()=>company.session.scene.surfacePresentation().find(s=>s.surface==='ceiling'));
      assert(surface.visible);assert.equal(surface.face,3);assert.deepEqual(surface.textureSize,[512,512]);assert.equal(surface.resource.id,resource.id);
      assert.deepEqual(await functional(),baseline);await shot(resource.id);await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);
      await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),saved);await room();await page.locator('[data-view="ceiling"]').click();
      assert(await page.evaluate(()=>company.session.scene.surfacePresentation().find(s=>s.surface==='ceiling').visible));
    }
    return resources;
  });
  await check('Top view hides only ceiling display; rotation and scales remain local to the room',async()=>{
    const doc=await page.evaluate(()=>company.session.document);await page.locator('[data-view="top"]').click();
    assert(!(await page.evaluate(()=>company.session.scene.surfacePresentation().find(s=>s.surface==='ceiling').visible)));assert.deepEqual(await page.evaluate(()=>company.session.document),doc);assert.deepEqual(await functional(),baseline);await shot('top-ceiling-hidden');
    const result=await page.evaluate(async id=>{
      const r=company.session.document.nodes.find(n=>n.id===id);
      await company.apply([{type:'move',id,transform:{...r.transform,yaw:Math.PI/2}},{type:'set-surface-finish',id,surface:'ceiling',finish:{...r.finishes.ceiling,tileMeters:[.5,2],quarterTurns:1}}]);
      await company.showSpace('room',r.parentId,id);company.view('ceiling');
      const mesh=company.session.scene.root.getObjectByName(`Ceiling:${id}`);return{world:mesh.matrixWorld.toArray(),surface:company.session.scene.surfacePresentation().find(s=>s.surface==='ceiling')};
    },roomId);
    assert(result.surface.visible);assert.deepEqual(result.surface.repeat,[2,.5]);assert.equal(result.surface.rotation,Math.PI/2);assert(Math.abs(result.world[0])<1e-7);assert(Math.abs(result.world[2]+1)<1e-7);await shot('rotated-room-ceiling');
    await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),saved);await room();await page.locator('[data-view="ceiling"]').click();return result;
  });
  await check('Incompatible finishes and real fetch failure preserve visible ceiling and durable save',async()=>{
    const failedUrl='/company-assets/qa-ceiling-failure.glb';await page.route(`**${failedUrl}`,route=>route.fulfill({status:503,body:'deliberate unavailable source'}));
    const result=await page.evaluate(async({roomId,failedUrl})=>{
      const ceiling=company.catalog.resources.find(r=>r.finish?.allowedSurfaces.includes('ceiling')),floor=company.catalog.resources.find(r=>r.finish?.allowedSurfaces.includes('floor'));
      const bad=structuredClone(ceiling);bad.id='qa-ceiling-failure';bad.asset.url=failedUrl;company.catalog.resources.push(bad);
      const baseline=JSON.stringify(company.session.document),save=JSON.stringify(Object.entries(localStorage).sort()),shown=JSON.stringify(company.session.scene.surfacePresentation()),results=[];
      try{for(const resource of [floor,bad]){let code;try{await company.apply([{type:'set-surface-finish',id:roomId,surface:'ceiling',finish:{resource:{id:resource.id,version:resource.version}}}]);}catch(error){code=error.code;}
        results.push({id:resource.id,code,preserved:baseline===JSON.stringify(company.session.document)&&save===JSON.stringify(Object.entries(localStorage).sort())&&shown===JSON.stringify(company.session.scene.surfacePresentation())});}}
      finally{company.catalog.resources.splice(company.catalog.resources.indexOf(bad),1);}return results;
    },{roomId,failedUrl});assert(result.every(r=>r.code&&r.preserved));return result;
  });
  await check('Second layout retains ceilings on all floors and releases their display resources',async()=>{
    const result=await page.evaluate(async()=>{
      await company.load(company.layouts.surfaces);const doc=company.session.document,rooms=doc.nodes.filter(n=>n.kind==='room'),floors=doc.nodes.filter(n=>n.kind==='floor'),resources=company.catalog.resources.filter(r=>r.finish?.allowedSurfaces.includes('ceiling'));
      await company.apply(rooms.map((r,i)=>({type:'set-surface-finish',id:r.id,surface:'ceiling',finish:{resource:{id:resources[i%4].id,version:resources[i%4].version}}})));
      await company.save();const saved=JSON.parse(await company.export()),cycles=[];
      for(let cycle=0;cycle<3;cycle++) {
        const states=[];for(const floor of floors){const r=rooms.find(r=>r.parentId===floor.id);await company.showSpace('room',floor.id,r.id);company.view('ceiling');await new Promise(requestAnimationFrame);company.renderer.render(company.world,company.camera);states.push({assets:company.assetLibrary.snapshot(),memory:{...company.renderer.info.memory},textures:company.session.scene.surfacePresentation().filter(s=>s.surface==='ceiling').map(s=>({region:s.regionId,resource:s.resource,visible:s.visible}))});}
        await company.showSpace('building');states.push({assets:company.assetLibrary.snapshot()});cycles.push(structuredClone(states));
      }
      return{saved,cycles};
    });assert.deepEqual(result.cycles[2],result.cycles[1]);assert.equal(result.cycles[2].at(-1).assets.loadedAssets,0);
    await fs.writeFile(path.join(out,'two-floors.company.json'),JSON.stringify(result.saved,null,2)+'\n');await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),result.saved.document);return{cycles:result.cycles,resources:result.saved.dependencies.resources};
  });
  await check('Public-area finish controls edit the selected area instead of another room',async()=>{
    await page.evaluate(()=>company.load(company.layouts.ceilings));
    const area=await page.evaluate(()=>company.session.document.nodes.find(n=>n.kind==='area'));
    await page.evaluate(area=>company.showSpace('room',area.parentId,area.id),area);
    assert.equal(await page.locator('#room').inputValue(),area.id);
    const before=await page.evaluate(()=>company.session.document);
    const resource=await page.evaluate(()=>company.catalog.resources.find(r=>r.id==='ceiling-woven'));
    await page.locator('#finish-ceiling').selectOption(`${resource.id}@${resource.version}`);await page.waitForFunction(()=>!document.getElementById('save').disabled);
    const after=await page.evaluate(()=>company.session.document);assert.deepEqual(after.nodes.filter(n=>n.id!==area.id),before.nodes.filter(n=>n.id!==area.id));
    assert.equal(after.nodes.find(n=>n.id===area.id).finishes.ceiling.resource.id,resource.id);
    await page.locator('[data-view="ceiling"]').click();assert(await page.evaluate(id=>company.session.scene.surfacePresentation().some(s=>s.regionId===id&&s.surface==='ceiling'&&s.visible),area.id));
    await shot('public-area-ceiling');return{areaId:area.id,resource:resource.id};
  });
  assert.deepEqual(errors,[]);report.status='passed';
})().catch(error=>{report.status='failed';report.error=error.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)await server.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error,out}));});
