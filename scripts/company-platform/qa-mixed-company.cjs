const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const [dist,build,inputFile,opsFile,outArg]=process.argv.slice(2);
if(!outArg)throw Error('Usage: node scripts/company-platform/qa-mixed-company.cjs FIXED_DIST BUILD INPUT OPS NEW_OUT [--software]');
const out=path.resolve(outArg),hash=b=>createHash('sha256').update(b).digest('hex');
const report={build,status:'running',checks:[],shots:[],limits:['Company production and display only; no real actors or occupancy acceptance.','Short allocation-count checks are not GPU memory, long-duration stability or ordinary-PC performance acceptance.']};
let server,context,page;const errors=[];
async function open(){
  context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:process.argv.includes('--software')?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);
  await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);
}
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(name);}
async function shot(name){
  const render=await page.evaluate(async()=>{
    if(company.session.scene.view.mode==='building')return {mode:'building',...company.assetLibrary.snapshot(),facilities:company.snapshot().displayedFacilities};
    await new Promise(requestAnimationFrame);company.renderer.render(company.world,company.camera);
    const gl=company.renderer.getContext();if(gl.isContextLost())throw Error('WebGL context lost');
    const colors=new Set(),pixel=new Uint8Array(4);for(let x=1;x<12;x++)for(let y=1;y<12;y++){gl.readPixels(Math.floor(gl.drawingBufferWidth*x/12),Math.floor(gl.drawingBufferHeight*y/12),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);colors.add(Array.from(pixel).join(','));}
    if(colors.size<4)throw Error('Blank framebuffer');const ext=gl.getExtension('WEBGL_debug_renderer_info');
    return{mode:company.session.scene.view.mode,colors:colors.size,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown'};
  });
  await page.locator('.viewport').screenshot({path:path.join(out,`${name}.png`)});report.shots.push({name,render});
}
async function logical(){return page.evaluate(()=>({document:company.session.document,points:company.session.scene.describeUsePoints(),floors:company.session.document.nodes.filter(n=>n.kind==='floor').map(n=>{const {floors,obstacles,...rest}=company.session.scene.navigation(n.id);return{...rest,obstacles:obstacles.map(({object,...o})=>o)};})}));}
async function metrics(){return page.evaluate(async()=>{
  await new Promise(requestAnimationFrame);company.renderer.render(company.world,company.camera);
  const gl=company.renderer.getContext();if(gl.isContextLost())throw Error('WebGL context lost');
  return{view:company.session.scene.view,...company.assetLibrary.snapshot(),...company.renderer.info.memory,programs:company.renderer.info.programs.length,drawCalls:company.renderer.info.render.calls,triangles:company.renderer.info.render.triangles,lights:company.snapshot().lights.filter(l=>l.intensity>0).length,displayedFacilities:company.snapshot().displayedFacilities};
});}
(async()=>{
  await fs.mkdir(out);const inputBytes=await fs.readFile(inputFile),opsBytes=await fs.readFile(opsFile),input=JSON.parse(inputBytes),ops=JSON.parse(opsBytes);
  report.inputs={layoutSha256:hash(inputBytes),opsSha256:hash(opsBytes),harnessSha256:hash(await fs.readFile(__filename))};
  server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
  const floors=input.nodes.filter(n=>n.kind==='floor').map(n=>n.id);assert.equal(floors.length,2);
  const firstRoom=input.nodes.find(n=>n.kind==='room'&&n.parentId===floors[0]).id;
  await check('Complete two-floor mixed company loads, building view keeps no indoor resources',async()=>{
    await page.evaluate(doc=>company.load(doc),input);assert.deepEqual(await page.evaluate(()=>company.session.document),input);
    const m=await metrics();assert.equal(m.displayedFacilities,0);assert.equal(m.loadedAssets,0);await shot('01-building-exterior');
    await page.locator('.company-building-view__facade').click();await page.waitForTimeout(650);await shot('02-building-section');return m;
  });
  const initial=await logical();
  await check('Both floors show their own real models without changing any logical data',async()=>{
    const result=[];for(let i=0;i<floors.length;i++){
      await page.evaluate(id=>company.showSpace('floor',id),floors[i]);await shot(`03-floor-${i+1}`);const m=await metrics();assert(m.loadedAssets>0&&m.lights<=2);result.push(m);assert.deepEqual(await logical(),initial);
    }
    await page.evaluate(({f,r})=>company.showSpace('room',f,r),{f:floors[0],r:firstRoom});await shot('04-room-before');assert.deepEqual(await logical(),initial);return result;
  });
  await check('Normal-height walls cut away selectively and viewing never changes saved or physical data',async()=>{
    await page.evaluate(id=>company.showSpace('floor',id),floors[0]);
    const before=await logical(),saveBefore=await page.evaluate(()=>company.export());
    const presentation=()=>page.evaluate(()=>company.session.scene.wallPresentation());
    await page.locator('#wall-view').selectOption('full');
    const full=await presentation();assert(full.walls.length>0&&full.walls.every(w=>w.visible&&w.height===2.8));
    await shot('08-full-height-floor');
    await page.locator('#wall-view').selectOption('cutaway');
    const cutaway=await presentation();assert(cutaway.walls.some(w=>w.visible)&&cutaway.walls.some(w=>!w.visible));
    assert(cutaway.walls.every(w=>w.height===2.8));
    for(const w of cutaway.walls)for(const m of w.mounted)assert.equal(m.visible,w.visible,m.id);
    await shot('09-cutaway-floor');
    await page.evaluate(({f,r})=>company.showSpace('room',f,r),{f:floors[0],r:firstRoom});
    const front=await presentation();await shot('10-cutaway-room-front');
    await page.evaluate(()=>{
      const s=company.session.scene.wallPresentation(),target=s.targets[0],p=company.camera.position;
      p.x=2*target[0]-p.x;p.z=2*target[2]-p.z;company.camera.lookAt(...target);
      company.session.scene.setWallView({mode:'cutaway',cameraPosition:p.toArray()});
    });
    const back=await presentation();await shot('11-cutaway-room-reverse');
    const visibleIds=s=>s.walls.filter(w=>w.visible).map(w=>w.id);
    assert.notDeepEqual(visibleIds(front),visibleIds(back));
    await page.locator('#wall-view').selectOption('full');const restored=await presentation();
    assert(restored.walls.filter(w=>w.region===firstRoom).every(w=>w.visible));
    assert.deepEqual(await logical(),before);assert.equal(await page.evaluate(()=>company.export()),saveBefore);
    await page.locator('#wall-view').selectOption('cutaway');
    await page.evaluate(({f,r})=>company.showSpace('room',f,r),{f:floors[0],r:firstRoom});
    return{full,cutaway,front,back,unchangedDocumentNavigationUsePointsAndSave:true};
  });
  await check('A disabled lamp does not consume the light budget and room focus uses only that room',async()=>{
    await page.evaluate(id=>company.showSpace('floor',id),floors[0]);
    const result=await page.evaluate(async({floorId,roomId})=>{
      const lamps=company.snapshot().lights; if(lamps.length<3)throw Error('Fixture must contain at least three lights');
      const first=lamps.find(l=>l.intensity>0),node=company.session.document.nodes.find(n=>n.id===first.id),resource=company.catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version),oldOn=node.state.on??resource.stateDefaults.on;
      await company.apply([{type:'set-state',id:first.id,state:{on:false}}]);const floorLights=company.snapshot().lights;
      await company.showSpace('room',floorId,roomId);const roomLights=company.snapshot().lights;
      const nodes=new Map(company.session.document.nodes.map(n=>[n.id,n]));const belongs=id=>{for(let n=nodes.get(id);n;n=nodes.get(n.parentId))if(n.id===roomId)return true;return false;};
      if(roomLights.some(l=>l.intensity>0&&!belongs(l.id)))throw Error('Focused room spends light budget on another room');
      await company.apply([{type:'set-state',id:first.id,state:{on:oldOn}}]);
      return{disabled:first.id,floorLights,roomLights};
    },{floorId:floors[0],roomId:firstRoom});
    assert.equal(result.floorLights.filter(l=>l.intensity>0).length,2);assert.equal(result.floorLights.find(l=>l.id===result.disabled).intensity,0);return result;
  });
  const beforeIds=input.nodes.map(n=>n.id),editedId=ops.find(o=>o.type==='move'&&input.nodes.find(n=>n.id===o.id)?.kind==='workstation')?.id;
  assert(editedId,'Edit sequence must move an actual workstation');
  await check('Combined edit keeps attached devices in the actual transformed desk frame',async()=>{
    const before=await page.evaluate(()=>company.session.document);await page.evaluate(ops=>company.apply(ops),ops);
    const actual=await page.evaluate(id=>{
      const doc=company.session.document,root=company.session.scene.root,desk=root.getObjectByName(`${id}/desk`);root.updateMatrixWorld(true);
      const devices=doc.nodes.filter(n=>n.parentId===`${id}/desk`).map(n=>{
        const object=root.getObjectByName(n.id),position=object.getWorldPosition(company.camera.position.clone());desk.worldToLocal(position);
        return{id:n.id,declared:n.transform.position,actualDeskLocal:position.toArray()};
      });return{document:doc,devices};
    },editedId);
    assert.deepEqual(actual.document.nodes.map(n=>n.id),beforeIds);
    for(const d of actual.devices)for(let i=0;i<3;i++)assert(Math.abs(d.declared[i]-d.actualDeskLocal[i])<1e-7,d.id);
    const ancestors=new Map(before.nodes.map(n=>[n.id,n.parentId]));const onFloor=(id,f)=>{for(let p=id;p;p=ancestors.get(p))if(p===f)return true;return false;};
    assert.deepEqual(actual.document.nodes.filter(n=>onFloor(n.id,floors[1])),before.nodes.filter(n=>onFloor(n.id,floors[1])));
    await shot('05-room-edited');return{devices:actual.devices,otherFloorUnchanged:true};
  });
  await check('All four sofa resources remain usable through the existing human preview controls',async()=>{
    const sofa=await page.evaluate(()=>company.session.document.nodes.find(n=>n.kind==='facility'&&company.session.document.nodes.find(p=>p.id===n.parentId)?.kind==='room'&&company.catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version)?.mountRole==='sofa'));
    const room=input.nodes.find(n=>n.id===sofa.parentId);assert(room);await page.evaluate(({f,r})=>company.showSpace('room',f,r),{f:room.parentId,r:room.id});
    const original=await logical(),observed=[];
    for(const value of ['sofa-modular@1','sofa-arch@1','timber','1']){
      await page.getByLabel('沙发样件',{exact:true}).selectOption(value);await page.waitForFunction(()=>!document.getElementById('save').disabled);
      assert.equal(await page.locator('#status').getAttribute('data-error'),'false');const after=await logical();
      const functionPoints=points=>points.map(({revision,resource,...point})=>point);
      assert.deepEqual(functionPoints(after.points),functionPoints(original.points));assert.deepEqual(after.floors,original.floors);
      observed.push(after.document.nodes.find(n=>n.id===sofa.id).resource);
    }
    await page.evaluate(sofa=>company.apply([{type:'replace-resource',id:sofa.id,resource:sofa.resource}]),sofa);await shot('06-sofa-controls');return observed;
  });
  await check('Explicit template upgrade retains mixed resources and the edited local configuration',async()=>{
    const before=await page.evaluate(()=>company.session.document);
    await page.evaluate(id=>company.session.upgrade(id,{id:'stream-station',version:2}),editedId);
    const after=await page.evaluate(()=>company.session.document);
    const normalize=doc=>doc.nodes.map(n=>n.id===editedId?{...n,template:{id:'stream-station',version:1}}:n);
    assert.deepEqual(normalize(after),normalize(before));assert.equal(after.nodes.find(n=>n.id===editedId).template.version,2);
    return{station:editedId,templateVersion:2,localEditsAndResourcesRetained:true};
  });
  let savedDocument;
  await check('All floors and edited states survive complete browser-process closure and can be edited again',async()=>{
    await page.evaluate(()=>company.save());const text=await page.evaluate(()=>company.export());await fs.writeFile(path.join(out,'edited.company.json'),text);savedDocument=await page.evaluate(()=>company.session.document);
    await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),savedDocument);
    const monitor=savedDocument.nodes.find(n=>n.resource?.id.startsWith('monitor-'));const old=monitor.state.on??true;
    await page.evaluate(async({id,on})=>{await company.apply([{type:'set-state',id,state:{on}}]);await company.save();},{id:monitor.id,on:!old});
    assert.equal(await page.evaluate(id=>company.session.document.nodes.find(n=>n.id===id).state.on,monitor.id),!old);
    await page.evaluate(async({id,on})=>{await company.apply([{type:'set-state',id,state:{on}}]);await company.save();},{id:monitor.id,on:old});
    savedDocument=await page.evaluate(()=>company.session.document);await fs.writeFile(path.join(out,'final.company.json'),await page.evaluate(()=>company.export()));return{floors:floors.length,nodes:savedDocument.nodes.length,continuedEditing:true};
  });
  await check('Mixed resource errors preserve the complete company and last durable save',async()=>{
    const results=await page.evaluate(async()=>{
      const before=JSON.stringify(company.session.document),saved=await company.export(),durable=JSON.stringify(Object.entries(localStorage).sort()),out=[];
      for(const kind of ['missing-resource','wrong-hash','bad-parent']){
        const doc=structuredClone(company.session.document),node=doc.nodes.find(n=>n.resource?.id.startsWith('chair-'));let extra;
        if(kind==='missing-resource')node.resource={id:'missing-company-model',version:1};
        if(kind==='bad-parent')node.parentId='missing-room';
        if(kind==='wrong-hash'){
          extra=structuredClone(company.catalog.resources.find(r=>r.id===node.resource.id&&r.version===node.resource.version));extra.id='qa-broken-mixed-chair';extra.asset.sha256='0'.repeat(64);company.catalog.resources.push(extra);node.resource={id:extra.id,version:extra.version};
        }
        let code;try{await company.load(doc);}catch(e){code=e.code;}finally{if(extra)company.catalog.resources.pop();}
        out.push({kind,code,documentUnchanged:JSON.stringify(company.session.document)===before,saveUnchanged:await company.export()===saved,durableSaveUnchanged:JSON.stringify(Object.entries(localStorage).sort())===durable});
      }return out;
    });for(const r of results)assert(r.code&&r.documentUnchanged&&r.saveUnchanged&&r.durableSaveUnchanged);return results;
  });
  await check('Repeated mixed-floor viewing returns to warmed allocation baselines with bounded lights',async()=>{
    const baseline=await logical(),cycles=[];
    for(let cycle=0;cycle<5;cycle++){
      const states=[];
      for(const floorId of floors){await page.evaluate(id=>company.showSpace('floor',id),floorId);states.push(await metrics());assert(states.at(-1).lights<=2);}
      await page.evaluate(()=>company.showSpace('building'));states.push(await metrics());assert.equal(states.at(-1).loadedAssets,0);assert.equal(states.at(-1).displayedFacilities,0);
      assert.deepEqual(await logical(),baseline);cycles.push(states);
    }
    const allocation=m=>({geometries:m.geometries,textures:m.textures,programs:m.programs,loadedAssets:m.loadedAssets,cachedAssets:m.cachedAssets});
    for(let i=2;i<cycles.length;i++)assert.deepEqual(cycles[i].map(allocation),cycles[1].map(allocation));
    return{cycles,warmupCycles:2,unchangedLogic:true};
  });
  await page.evaluate(id=>company.showSpace('floor',id),floors[0]);await shot('07-final-floor');
  assert.deepEqual(errors,[]);report.status='passed';
  const rows=report.shots.map(s=>`<figure><a href="${s.name}.png"><img src="${s.name}.png"></a><figcaption>${s.name}</figcaption></figure>`).join('');
  await fs.writeFile(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><title>混合素材公司完整流程</title><style>body{font:16px system-ui;margin:30px;background:#f1f5ee;color:#234136}img{max-width:100%}figure{margin:25px 0}</style><h1>混合素材公司完整流程</h1><p>固定构建 ${build}。两层实际布局、组件编辑、全部楼层保存与关闭重开。无真实角色使用验收。</p>${rows}`);
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)await server.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,output:out}));});
