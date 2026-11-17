const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const report={build,status:'running',checks:[],limits:['Headless SwiftShader functional evidence, not ordinary-PC performance, real-character C3 or human acceptance']};
let createdOut=false;
let server,context,page;const errors=[],network=[],responses=[];
async function open(){
  context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('response',response=>{if(response.url().includes('/side-table-v1/')&&response.url().endsWith('.glb')&&response.status()===200)responses.push((async()=>{const bytes=await response.body();network.push({url:response.url(),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});})());});
  await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
  assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);
}
async function check(name,fn){report.checks.push({name,passed:true,result:await fn()});await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(name);}
async function draw(){await page.evaluate(()=>{company.setPreviewClock(33330);company.drawHostFrame();if(company.renderer.getContext().isContextLost())throw Error('Context lost');});await page.waitForTimeout(80);}
async function shot(name){await draw();await page.screenshot({path:path.join(out,name+'.png')});}
async function actual(){return page.evaluate(()=>{
  const document=company.session.document;company.session.scene.root.updateMatrixWorld(true);
  const tables=document.nodes.filter(n=>company.catalog.resources.find(r=>r.id===n.resource?.id&&r.version===n.resource?.version)?.mountRole==='side-table');
  return{document,tables:tables.map(n=>{
    const resource=company.catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version),object=company.session.scene.root.getObjectByName(n.id),board=object.getObjectByName(resource.supportNodes.top);
    board.geometry.computeBoundingBox();const top=board.geometry.boundingBox.clone().applyMatrix4(board.matrixWorld);
    let meshes=0,triangles=0;object.traverse(m=>{if(m.isMesh){meshes++;triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;}});
    return{id:n.id,resource:n.resource,asset:resource.asset,provenance:resource.provenance,meshes,triangles,topY:top.max.y,children:document.nodes.filter(child=>child.parentId===n.id).map(child=>{
      const group=company.session.scene.root.getObjectByName(child.id);let bottom=Infinity;
      group.traverse(m=>{if(m.isMesh){m.geometry.computeBoundingBox();bottom=Math.min(bottom,m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).min.y);}});
      return{id:child.id,attachment:child.attachment,bottom,world:group.getWorldPosition(company.camera.position.clone()).toArray()};
    })};
  }),cache:company.assetLibrary.snapshot(),memory:{...company.renderer.info.memory}};
});}
async function reject(ops,expected){const result=await page.evaluate(async ops=>{
  const before=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage}),root=company.session.scene.root;let code,message;
  try{await company.apply(ops);}catch(e){code=e.code;message=e.message;}
  return{code,message,documentPreserved:before===JSON.stringify(company.session.document),savePreserved:saved===JSON.stringify({...localStorage}),scenePreserved:root===company.session.scene.root};
},ops);if(expected)assert.equal(result.code,expected);else assert(result.code);assert(result.documentPreserved&&result.savePreserved&&result.scenePreserved);return result;}
(async()=>{
  await fs.mkdir(out);createdOut=true;report.harnessSha256=createHash('sha256').update(await fs.readFile(__filename)).digest('hex');
  server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
  await check('Four actual external looks load, support the ornament and independently survive browser shutdown',async()=>{
    const results=[];
    for(let index=0;index<4;index++){
      await page.evaluate(index=>company.showAppearanceSample('side-table',index),index);await draw();const before=await actual();
      assert.equal(before.tables.length,1);const table=before.tables[0];assert(table.meshes>1&&table.triangles>20);assert.equal(table.children.length,1);
      assert(Math.abs(table.topY-.5)<1e-5);assert(Math.abs(table.children[0].bottom-table.topY)<.001);
      assert.match(JSON.stringify(table.provenance),/kenney/i);assert.equal(before.cache.loadedAssets,2);
      await shot('look-'+(index+1));await page.evaluate(()=>company.save());await Promise.all(responses);
      await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),before.document);await draw();
      const after=await actual();assert(Math.abs(after.tables[0].children[0].bottom-after.tables[0].topY)<.001);results.push(before);
    }
    assert.equal(new Set(results.map(r=>r.tables[0].asset.sha256)).size,4);return results;
  });
  await check('Parent movement, quarter-turn, appearance replacement and subtree copying preserve real child contact and isolated IDs',async()=>{
    await page.evaluate(()=>company.showAppearanceSample('side-table',0));
    await page.evaluate(()=>company.apply([
      {type:'move',id:'side-table/primary/ornament',transform:{position:[.04,.5,.02],yaw:0}},
      {type:'move',id:'side-table/primary',transform:{position:[.7,0,-.4],yaw:Math.PI/2}},
      {type:'copy-facility',id:'side-table/primary',newId:'side-table/copy',transform:{position:[-1.1,0,.7],yaw:0}},
    ]));
    const before=await actual();assert.equal(before.tables.length,2);assert.equal(new Set(before.document.nodes.map(n=>n.id)).size,before.document.nodes.length);
    const source=before.tables.find(t=>t.id==='side-table/primary'),copy=before.tables.find(t=>t.id==='side-table/copy');
    assert.notEqual(source.children[0].id,copy.children[0].id);assert.deepEqual(copy.children[0].attachment,{surfaceId:'top'});
    source.children[0].world.forEach((v,i)=>assert(Math.abs(v-[.72,.5,-.44][i])<1e-6));
    await page.evaluate(()=>company.showAppearanceSample('side-table',2));
    const after=await actual();assert.deepEqual(after.tables.find(t=>t.id==='side-table/primary').children,source.children);
    assert.deepEqual(after.tables.find(t=>t.id==='side-table/copy').resource,copy.resource);
    assert.equal(after.tables.find(t=>t.id==='side-table/primary').resource.id,'side-table-nested');
    const obstacle=await page.evaluate(()=>company.session.scene.snapshot().navigation.find(n=>n.instanceId==='side-table/primary'));assert(obstacle);
    await page.evaluate(()=>company.view('top'));await shot('moved-copied');await page.evaluate(()=>company.save());
    const saved=await page.evaluate(()=>company.session.document);await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),saved);
    return{before,after,obstacle};
  });
  await check('Illegal height, overhang, duplicate prop, wrong parent and missing asset preserve actual scene and saved bytes',async()=>{
    await page.evaluate(()=>company.load(company.layouts.sideTables));await page.evaluate(()=>company.save());
    const rejected=[];
    rejected.push(await reject([{type:'move',id:'side-table/primary/ornament',transform:{position:[0,.52,0],yaw:0}}],'invalid-support-fit'));
    rejected.push(await reject([{type:'move',id:'side-table/primary/ornament',transform:{position:[.14,.5,0],yaw:0}}],'invalid-support-fit'));
    rejected.push(await reject([{type:'copy-facility',id:'side-table/primary/ornament',newId:'bad-duplicate',transform:{position:[0,.5,0],yaw:0}}],'overlapping-supported-props'));
    rejected.push(await reject([{type:'attach-surface',id:'side-table/primary/ornament',parentId:'side-table-demo/room-1',surfaceId:'top',transform:{position:[0,.5,0],yaw:0}}]));
    const candidate=await page.evaluate(()=>company.catalog.resources.find(r=>r.id==='side-table-low'));
    let intercepted=0;await page.route('**'+candidate.asset.url,route=>{intercepted++;return route.fulfill({status:503,body:'deliberate missing external candidate'});});
    const missing=await reject([{type:'replace-resource',id:'side-table/primary',resource:{id:candidate.id,version:candidate.version}}],'asset-fetch-failed');assert.equal(intercepted,1);
    await page.unroute('**'+candidate.asset.url);return{rejected,missing,intercepted};
  });
  await check('Independent second layout, exact export dependency pins and resource disposal reuse the same chain',async()=>{
    await page.evaluate(()=>company.load(company.layouts.sideTableAlternate));await draw();const before=await actual();
    before.tables[0].children[0].world.forEach((v,i)=>assert(Math.abs(v-[1,.5,.3][i])<1e-6));
    await shot('second-input');await page.evaluate(()=>company.save());const encoded=await page.evaluate(()=>company.export());await fs.writeFile(path.join(out,'side-tables.company.json'),encoded);
    const envelope=JSON.parse(encoded);assert.equal(envelope.dependencies.resources.length,2);
    await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),before.document);
    const cycles=[];for(let i=0;i<8;i++){await page.evaluate(i=>company.showAppearanceSample('side-table',i%4),i);await draw();cycles.push(await page.evaluate(()=>({cache:company.assetLibrary.snapshot(),memory:{...company.renderer.info.memory}})));}
    assert(cycles.every(s=>s.cache.loadedAssets===2));for(let i=0;i<4;i++)assert.deepEqual(cycles[i].memory,cycles[i+4].memory);
    return{before,dependencies:envelope.dependencies,cycles};
  });
  await Promise.all(responses);
  await check('Actual browser network bytes match registered Kenney-derived assets',async()=>{
    const resources=await page.evaluate(()=>company.catalog.resources.filter(r=>r.mountRole==='side-table'));
    for(const r of resources){const matching=network.filter(n=>new URL(n.url).pathname===r.asset.url);assert(matching.length);assert(matching.every(n=>n.sha256===r.asset.sha256&&n.bytes===r.asset.bytes));}
    return{resources:resources.map(r=>({id:r.id,asset:r.asset})),network};
  });
  assert.deepEqual(errors,[]);report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{
  if(context)await context.close();if(server)await server.close();report.pageErrors=errors;if(createdOut)await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));
});
