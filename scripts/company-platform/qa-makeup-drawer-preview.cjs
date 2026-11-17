const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const report={build,status:'running',checks:[],limits:['SwiftShader browser evidence, not ordinary-PC performance or character C3.']};
let server,context,page;const errors=[],id='makeup-drawer/primary';
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);}
async function draw(){await page.waitForTimeout(40);await page.evaluate(()=>company.drawHostFrame());}
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});console.log(name);}
async function state(){return page.evaluate(id=>{
  company.session.scene.root.updateMatrixWorld(true);
  const root=company.session.scene.root,doc=company.session.document,object=root.getObjectByName(id),position=name=>root.getObjectByName(name).getWorldPosition(company.camera.position.clone()).toArray();
  return{node:doc.nodes.find(n=>n.id===id),insert:doc.nodes.find(n=>n.id===id+'/insert'),content:doc.nodes.find(n=>n.id===id+'/insert/content'),top:doc.nodes.find(n=>n.id===id+'/top-clock'),contentWorld:position(id+'/insert/content'),topWorld:position(id+'/top-clock'),drawer:object.getObjectByName('cabinet-drawer-slide').position.toArray()};
},id);}
const near=(a,b)=>assert(a.every((v,i)=>Math.abs(v-b[i])<1e-7),`${a} != ${b}`);
(async()=>{
  await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
  await check('Actual four appearance choices retain contents and partial state through independent browser shutdowns',async()=>{
    const result=[];
    for(let index=0;index<4;index++) {
      await page.selectOption('#sample-branch','makeup-storage-drawer');await page.selectOption('#sample-look',String(index));await page.click('#sample-show');
      await page.waitForFunction(index=>company.session.document.id==='appearance-makeup-storage-drawer'&&company.session.document.nodes.find(n=>n.id==='makeup-drawer/primary/insert').resource.id===company.appearanceCandidates('makeup-storage-drawer')[index].id,index);
      await page.evaluate(()=>company.pausePreview());
      await page.evaluate(id=>company.apply([{type:'set-state',id,state:{openFraction:.83}}]),id);
      await page.click('[data-view="cabinet"]');await draw();const before=await state();assert.equal(before.node.state.openFraction,.83);
      await page.screenshot({path:path.join(out,`storage-${index+1}.png`)});await page.click('#save');await page.waitForFunction(()=>!document.querySelector('#save').disabled);await page.waitForFunction(()=>localStorage.getItem('company-preview:last-company')==='appearance-makeup-storage-drawer');
      const doc=await page.evaluate(()=>company.session.document);await context.close();context=null;await open();
      assert.deepEqual(await page.evaluate(()=>company.session.document),doc);await page.evaluate(()=>company.pausePreview());await page.click('[data-view="cabinet"]');await draw();const after=await state();assert.deepEqual(after,before);
      result.push({index,before,after});
    }return result;
  });
  await check('Visible open/close controls move a real drawer and its saved child while the top clock stays put',async()=>{
    await page.evaluate(()=>company.showAppearanceSample('makeup-storage-drawer',2));await page.evaluate(()=>company.pausePreview());const result=[];
    for(const value of [0,.5,1,0]) {
      await page.click(`[data-opening="${value}"]`);await page.waitForFunction(value=>company.session.document.nodes.find(n=>n.id==='makeup-drawer/primary').state.openFraction===value,value);await draw();
      assert.equal(await page.getAttribute(`[data-opening="${value}"]`,'aria-pressed'),'true');assert((await page.locator('#cabinet-status').innerText()).includes(`${value*100}%`));
      const current=await state();near(current.drawer,[0,0,.32*value]);assert.deepEqual(current.content.transform.position,[0,.01,-.045]);
      if(result.length){near(current.topWorld,result[0].topWorld);near(current.contentWorld,[result[0].contentWorld[0],result[0].contentWorld[1],result[0].contentWorld[2]+.32*value]);}
      result.push(current);await page.screenshot({path:path.join(out,`opening-${value}-${result.length}.png`)});
    }
    assert.deepEqual(result[0],result[3]);return result;
  });
  await check('Same-name rooms with a quarter-turned host preserve independent content and state after restart',async()=>{
    await page.selectOption('#layout','makeupDrawerAlternate');await page.waitForFunction(()=>company.session.document.id==='makeup-drawer-alternate');
    await page.evaluate(id=>company.apply([{type:'set-state',id,state:{openFraction:.91}}]),id);
    const before=await page.evaluate(()=>company.session.document);await page.evaluate(()=>company.save());await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),before);
    const other='makeup-drawer/secondary',result=await page.evaluate(async other=>{
      const c=company,table=c.session.document.nodes.find(n=>n.id==='vanity/secondary');await c.showSpace('room',c.session.document.nodes[0].id,table.parentId);c.pausePreview();
      const child=other+'/insert/content';
      // A commit replaces the root, so reacquire it for each pose.
      await c.apply([{type:'set-state',id:other,state:{openFraction:0}}]);const closed=c.session.scene.root.getObjectByName(child).getWorldPosition(c.camera.position.clone()).toArray();
      await c.apply([{type:'set-state',id:other,state:{openFraction:1}}]);const opened=c.session.scene.root.getObjectByName(child).getWorldPosition(c.camera.position.clone()).toArray();
      return{closed,opened,primary:c.session.document.nodes.find(n=>n.id==='makeup-drawer/primary').state};
    },other);near(result.opened,[result.closed[0]+.32,result.closed[1],result.closed[2]]);assert.equal(result.primary.openFraction,.91);
    await page.selectOption('#cabinet',other);await page.click('[data-view="cabinet"]');await draw();await page.screenshot({path:path.join(out,'second-turned-room.png')});return result;
  });
  await check('Copying an actual cabinet subtree into a second room remaps content identities and survives restart',async()=>{
    const result=await page.evaluate(async()=>{
      const c=company,source='makeup-drawer/primary',copy='makeup-drawer/copied';
      const original=c.session.document.nodes.filter(n=>n.id===source||n.id.startsWith(source+'/'));
      const destination=c.session.document.nodes.find(n=>n.id==='makeup-drawer/secondary');
      await c.apply([{type:'remove',id:'makeup-drawer/secondary'},{type:'copy-facility',id:source,newId:copy,parentId:destination.parentId,transform:destination.transform}]);
      const copied=c.session.document.nodes.filter(n=>n.id===copy||n.id.startsWith(copy+'/'));
      const sourceAfter=c.session.document.nodes.filter(n=>n.id===source||n.id.startsWith(source+'/'));
      await c.apply([{type:'set-state',id:copy,state:{openFraction:.32}}]);await c.save();
      return{original,sourceAfter,copied,doc:c.session.document};
    });assert.deepEqual(result.sourceAfter,result.original);assert.equal(result.copied.length,4);const copiedInsert=result.copied.find(n=>n.resource.id===result.original.find(o=>o.id==='makeup-drawer/primary/insert').resource.id),copiedContent=result.copied.find(n=>n.resource.id==='makeup-storage-content-compact');assert(copiedInsert&&copiedContent);assert.equal(copiedInsert.parentId,'makeup-drawer/copied');assert.equal(copiedContent.parentId,copiedInsert.id);assert(result.copied.every(n=>!result.original.some(o=>o.id===n.id)));
    await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),result.doc);return result;
  });
  await check('A missing uncached replacement model retains old root, saved bytes and independent content',async()=>{
    await page.evaluate(()=>company.showAppearanceSample('makeup-storage-drawer',0));await page.evaluate(()=>company.save());await context.close();context=null;await open();
    const url=await page.evaluate(()=>company.appearanceCandidates('makeup-storage-drawer')[3].asset.url);await page.route('**'+url,route=>route.fulfill({status:503,body:'Intentional missing candidate fixture'}));
    const result=await page.evaluate(async()=>{const c=company,root=c.session.scene.root,doc=JSON.stringify(c.session.document),saved=JSON.stringify({...localStorage});let code;try{await c.showAppearanceSample('makeup-storage-drawer',3);}catch(e){code=e.code;}return{code,sameRoot:root===c.session.scene.root,sameDocument:doc===JSON.stringify(c.session.document),sameSaved:saved===JSON.stringify({...localStorage})};});
    assert.equal(result.code,'asset-fetch-failed');assert(result.sameRoot&&result.sameDocument&&result.sameSaved);await page.unroute('**'+url);await draw();return result;
  });
  await check('Repeated swaps release display resources and keep independent saved contents',async()=>{
    await page.evaluate(()=>{company.pausePreview();company.setPreviewClock(33330);});
    const samples=[];for(let i=0;i<8;i++){await page.evaluate(i=>company.showAppearanceSample('makeup-storage-drawer',i%4),i);await draw();samples.push(await page.evaluate(()=>({memory:{...company.renderer.info.memory},reflection:company.mirrorController.snapshot().resources})));}
    for(let i=0;i<4;i++)assert.deepEqual(samples[i].memory,samples[i+4].memory);assert(samples.every(s=>s.reflection.live<=3&&s.reflection.peak<=6));return samples;
  });
  assert.deepEqual(errors,[]);report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)await server.close();report.pageErrors=errors;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
