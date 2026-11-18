const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const [dist,build,outArg]=process.argv.slice(2);
if(!outArg)throw Error('Usage: node qa-surface-finishes.cjs DIST BUILD NEW_OUT');
const out=path.resolve(outArg),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={build,status:'running',checks:[],shots:[],limits:['Software rendering; no ordinary-PC or character acceptance.']};
let server,context,page,roomId,floorId;const pageErrors=[];
async function open(){
  context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  page=await context.newPage();page.on('pageerror',error=>pageErrors.push(error.message));await page.goto(server.url);
  await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);
}
async function focus(){await page.evaluate(({f,r})=>company.showSpace('room',f,r),{f:floorId,r:roomId});}
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(name);}
async function logical(){return page.evaluate(()=>{
  const document=structuredClone(company.session.document);delete document.revision;for(const node of document.nodes)delete node.finishes;
  const navigation=document.nodes.filter(node=>node.kind==='floor').map(node=>company.session.scene.navigation(node.id).obstacles.map(({object,...rest})=>rest));
  const points=company.session.scene.describeUsePoints().map(({revision,...point})=>point);
  return{document,navigation,points};
});}
async function shot(name){
  const state=await page.evaluate(async()=>{
    await new Promise(requestAnimationFrame);company.renderer.render(company.world,company.camera);const gl=company.renderer.getContext();if(gl.isContextLost())throw Error('Context lost');
    const pixel=new Uint8Array(4),colors=new Set();for(let x=1;x<12;x++)for(let y=1;y<12;y++){gl.readPixels(Math.floor(gl.drawingBufferWidth*x/12),Math.floor(gl.drawingBufferHeight*y/12),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);colors.add([...pixel].join(','));}
    if(colors.size<4)throw Error('Blank framebuffer');return{colors:colors.size,surfaces:company.session.scene.surfacePresentation()};
  });
  await page.locator('.viewport').screenshot({path:path.join(out,`${name}.png`)});report.shots.push({name,...state});
}
(async()=>{
  await fs.mkdir(out);report.harnessSha256=hash(await fs.readFile(__filename));server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
  await page.evaluate(()=>company.load(company.layouts.mixed));
  ({roomId,floorId}=await page.evaluate(()=>{const room=company.session.document.nodes.find(node=>node.kind==='room');return{roomId:room.id,floorId:room.parentId};}));await focus();
  const before=await logical();
  for(const type of ['wall','floor'])await check(`Four ${type} designs replace real complete surfaces and survive separate browser-process restarts`,async()=>{
    const resources=await page.evaluate(type=>company.catalog.resources.filter(r=>r.kind==='surface-finish'&&r.finish.allowedSurfaces.includes(type)).map(r=>({id:r.id,version:r.version,sha256:r.asset.sha256})),type);
    assert.equal(resources.length,4);assert.equal(new Set(resources.map(r=>r.sha256)).size,4);
    for(const resource of resources){
      await page.locator(`#finish-${type}`).selectOption(`${resource.id}@${resource.version}`,{force:true});
      await page.waitForFunction(()=>!document.getElementById('save').disabled);
      assert.equal(await page.locator('#status').getAttribute('data-error'),'false');assert.deepEqual(await logical(),before);
      const surfaces=await page.evaluate(()=>company.session.scene.surfacePresentation());
      const selected=surfaces.filter(s=>s.regionId===roomId&&(type==='floor'?s.surface==='floor':s.surface!=='floor'));
      assert(selected.length>0);assert(selected.every(s=>s.resource.id===resource.id&&s.textureSize[0]===512&&s.textureSize[1]===512));
      await shot(`${type}-${resource.id}`);await page.evaluate(()=>company.save());const saved=await page.evaluate(()=>company.session.document);
      await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),saved);await focus();
      assert.equal(await page.locator(`#finish-${type}`).inputValue(),`${resource.id}@${resource.version}`);assert.deepEqual(await logical(),before);
    }
    return resources;
  });
  await check('Meter-scale direction changes preserve independent room finishes, real portal gaps and live seat contact',async()=>{
    const result=await page.evaluate(async({roomId,floorId})=>{
      const doc=company.session.document,room=doc.nodes.find(n=>n.id===roomId),other=doc.nodes.find(n=>n.kind==='room'&&n.parentId===floorId&&n.id!==roomId);
      const point=company.session.scene.describeUsePoints().find(p=>p.floorId===floorId);const handle=await company.session.retainUsePointContact(point.id||point.usePointId);
      const seat=handle.seat,world=seat.matrixWorld.toArray();
      try{
        await company.apply([{type:'set-surface-finish',id:other.id,surface:'floor',finish:structuredClone(room.finishes.floor)},
          {type:'set-surface-finish',id:roomId,surface:'floor',finish:{...room.finishes.floor,tileMeters:[.5,2],quarterTurns:1}}]);
        if(handle.seat!==seat||JSON.stringify(seat.matrixWorld.toArray())!==JSON.stringify(world))throw Error('Appearance invalidated contact');
        const shown=company.session.scene.surfacePresentation(),floor=shown.find(s=>s.regionId===roomId&&s.surface==='floor'),otherFloor=shown.find(s=>s.regionId===other.id&&s.surface==='floor');
        return{floor,otherFloor,walls:shown.filter(s=>s.regionId===roomId&&s.surface==='east'),width:room.bounds.width,contactKept:true};
      }finally{handle.release();}
    },{roomId,floorId});
    assert.deepEqual(result.floor.repeat,[2,.5]);assert.equal(result.floor.rotation,Math.PI/2);assert.deepEqual(result.otherFloor.repeat,[1,1]);
    const spans=result.walls.map(s=>{const values=s.meterUV.map(uv=>uv[0]);return[Math.min(...values),Math.max(...values)];}).sort((a,b)=>a[0]-b[0]);
    assert(spans.length>=2,'Fixture must have portal-separated wall segments');assert(Math.abs(spans[1][0]-spans[0][1]-1.4)<1e-5,'Texture coordinates must preserve actual doorway width');
    assert.deepEqual(await logical(),before);await shot('scale-and-direction');await page.evaluate(()=>company.save());
    const saved=await page.evaluate(()=>company.session.document);await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),saved);await focus();return result;
  });
  await check('Invalid surface, missing version, corrupt image and wrong hash leave both scene and durable save intact',async()=>{
    const good=await page.evaluate(()=>company.catalog.resources.find(r=>r.kind==='surface-finish'&&r.finish.allowedSurfaces.includes('floor')));
    const response=await page.request.get(new URL(good.asset.url,server.url).href),bytes=Buffer.from(await response.body());
    const signature=bytes.indexOf(Buffer.from([137,80,78,71,13,10,26,10]));assert(signature>=0);bytes[signature]=0;
    await page.route('**/company-assets/qa-corrupt-finish.glb',route=>route.fulfill({status:200,contentType:'model/gltf-binary',body:bytes}));
    const result=await page.evaluate(async({roomId,good,hash,byteLength})=>{
      const original=JSON.stringify(company.session.document),saved=JSON.stringify(Object.entries(localStorage).sort()),scene=JSON.stringify(company.session.scene.surfacePresentation());
      const cases=[{name:'wrong-surface',finish:{resource:{id:good.id,version:good.version}},surface:'north'},
        {name:'invalid-scale',finish:{resource:{id:good.id,version:good.version},tileMeters:[0,1]},surface:'floor'},
        {name:'missing-version',finish:{resource:{id:good.id,version:999}},surface:'floor'}];
      const corrupt=structuredClone(good);corrupt.id='qa-corrupt-finish';corrupt.asset={...corrupt.asset,url:'/company-assets/qa-corrupt-finish.glb',sha256:hash,bytes:byteLength};
      const wrong=structuredClone(good);wrong.id='qa-wrong-hash';wrong.asset.sha256='0'.repeat(64);company.catalog.resources.push(corrupt,wrong);
      cases.push({name:'corrupt-image',finish:{resource:{id:corrupt.id,version:corrupt.version}},surface:'floor'},
        {name:'wrong-hash',finish:{resource:{id:wrong.id,version:wrong.version}},surface:'floor'});
      const results=[];
      try{for(const item of cases){let code;try{await company.apply([{type:'set-surface-finish',id:roomId,surface:item.surface,finish:item.finish}]);}catch(error){code=error.code;}
        results.push({name:item.name,code,preserved:JSON.stringify(company.session.document)===original&&JSON.stringify(Object.entries(localStorage).sort())===saved&&JSON.stringify(company.session.scene.surfacePresentation())===scene});}
      }finally{company.catalog.resources.splice(company.catalog.resources.indexOf(corrupt),2);}
      return results;
    },{roomId,good,hash:hash(bytes),byteLength:bytes.length});
    for(const item of result)assert(item.code&&item.preserved,item.name);assert.equal(result.find(r=>r.name==='corrupt-image').code,'asset-texture-load-failed');return result;
  });
  await check('All-floor finish pins remain complete while unloaded surfaces release their display resources',async()=>{
    const result=await page.evaluate(async()=>{
      const floors=company.session.document.nodes.filter(n=>n.kind==='floor');const room=company.session.document.nodes.find(n=>n.kind==='room'&&n.parentId===floors[1].id);
      const resource=company.catalog.resources.find(r=>r.kind==='surface-finish'&&r.finish.allowedSurfaces.includes('wall'));
      await company.apply([{type:'set-surface-finish',id:room.id,surface:'north',finish:{resource:{id:resource.id,version:resource.version}}}]);
      await company.save();const save=JSON.parse(await company.export()),cycles=[];
      for(let cycle=0;cycle<4;cycle++){
        const entries=[];for(const floor of floors){await company.showSpace('floor',floor.id);await new Promise(requestAnimationFrame);company.renderer.render(company.world,company.camera);entries.push({...company.assetLibrary.snapshot(),...company.renderer.info.memory});}
        await company.showSpace('building');await new Promise(requestAnimationFrame);company.renderer.render(company.world,company.camera);entries.push({...company.assetLibrary.snapshot(),...company.renderer.info.memory});cycles.push(entries);
      }
      return{save,cycles,unseenResource:resource.id};
    });
    assert(result.save.dependencies.resources.some(r=>r.id===result.unseenResource));
    assert.deepEqual(result.cycles[3],result.cycles[2]);assert.equal(result.cycles[3].at(-1).loadedAssets,0);
    await fs.writeFile(path.join(out,'all-floors.company.json'),JSON.stringify(result.save,null,2)+'\n');
    await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),result.save.document);await focus();await shot('final-room');return{cycles:result.cycles,pinnedResources:result.save.dependencies.resources.length};
  });
  await check('Two authored recipe inputs use the same runtime and persist complete finishes',async()=>{
    const results=[];
    for(const key of ['surfaces','surfaceHome']) {
      await page.locator('#layout').selectOption(key,{force:true});await page.waitForFunction(()=>!document.getElementById('save').disabled);
      const doc=await page.evaluate(()=>company.session.document),floors=doc.nodes.filter(n=>n.kind==='floor');
      for(const floor of floors) {
        await page.evaluate(id=>company.showSpace('floor',id),floor.id);
        const shown=await page.evaluate(()=>company.session.scene.surfacePresentation());
        for(const region of doc.nodes.filter(n=>['room','area'].includes(n.kind)&&n.parentId===floor.id)) {
          assert(shown.some(s=>s.regionId===region.id&&s.surface==='floor'));
          if(region.kind==='room')assert(shown.some(s=>s.regionId===region.id&&s.surface!=='floor'));
        }
        await shot(`${key}-${floors.indexOf(floor)+1}`);
      }
      await page.evaluate(()=>company.save());await context.close();context=null;await open();
      assert.deepEqual(await page.evaluate(()=>company.session.document),doc);
      results.push({key,company:doc.id,floors:floors.length,finishedRegions:doc.nodes.filter(n=>n.finishes).length});
    }
    return results;
  });
  assert.deepEqual(pageErrors,[]);report.status='passed';
  await fs.writeFile(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><title>连续墙地饰材 ${build}</title><style>body{font:16px system-ui;margin:24px}img{max-width:100%}</style><h1>连续墙地饰材 ${build}</h1><p>四墙面、四地面，真实整面应用及关闭恢复。无角色与普通机验收。</p>${report.shots.map(s=>`<figure><img src="${s.name}.png"><figcaption>${s.name}</figcaption></figure>`).join('')}`);
})().catch(error=>{report.status='failed';report.error=error.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)await server.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error,output:out}));});
