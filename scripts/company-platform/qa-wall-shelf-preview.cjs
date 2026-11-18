const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const report={build,status:'running',checks:[],limits:['Actual browser using SwiftShader; no physical-GPU/ordinary-PC, C3 or human acceptance claim.']};
let made=false,server,context,page;const errors=[],downloads=[],pending=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
async function open(){
  context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().includes('/wall-shelf-v1/')&&r.url().endsWith('.glb')&&r.status()===200)pending.push(r.body().then(b=>downloads.push({url:new URL(r.url()).pathname,bytes:b.length,sha256:hash(b)})));});
  await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);
  await page.evaluate(()=>company.pausePreview());
}
async function draw(){await page.evaluate(()=>{company.drawHostFrame();if(company.renderer.getContext().isContextLost())throw Error('WebGL context lost');});}
async function show(index){await page.evaluate(index=>company.showAppearanceSample('wall-shelf',index),index);await page.waitForFunction(index=>company.session.document.nodes.find(n=>n.id==='wall-shelf/primary')?.resource.id===company.appearanceCandidates('wall-shelf')[index].id,index);}
async function shot(name){await draw();await page.screenshot({path:path.join(out,name+'.png')});}
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(name);}
async function inspect(){return page.evaluate(()=>{
  const c=company,doc=c.session.document,root=c.session.scene.root,entries=[];
  const visible=object=>{for(let p=object;p;p=p.parent)if(!p.visible)return false;return true;};
  root.updateMatrixWorld(true);
  for(const n of doc.nodes.filter(n=>n.resource)){
    const r=c.catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version);
    if(r.mountRole!=='wall-shelf'&&r.mountRole!=='side-table-life-items')continue;
    const object=root.getObjectByName(n.id),v=c.camera.position.clone();let low=Infinity,high=-Infinity,meshes=0,triangles=0;
    // Exclude child facilities when measuring the parent asset itself.
    const visual=object.children.find(n=>n.name===r.id)||object;
    function visit(o){if(o!==object&&o.userData?.facilityId&&o.userData.facilityId!==n.id)return;
      if(o.isMesh){const p=o.geometry.attributes.position;meshes++;triangles+=(o.geometry.index?.count||p.count)/3;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);low=Math.min(low,v.y);high=Math.max(high,v.y);}}
      for(const child of o.children)visit(child);
    }
    // Child contacts measure the entire child; parent geometry is independently checked in the GLB gate.
    if(r.mountRole==='side-table-life-items')visit(object);
    let topY=null;
    if(n.attachment){const parent=doc.nodes.find(p=>p.id===n.parentId),pr=c.catalog.resources.find(r=>r.id===parent.resource.id&&r.version===parent.resource.version);
      const board=root.getObjectByName(parent.id).getObjectByName(pr.supportNodes[n.attachment.surfaceId]);topY=-Infinity;const p=board.geometry.attributes.position;
      for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(board.matrixWorld);topY=Math.max(topY,v.y);}}
    entries.push({node:n,role:r.mountRole,asset:r.asset,world:object.getWorldPosition(v).toArray(),visible:visible(object),rootVisible:object.visible,meshes,triangles,bottom:Number.isFinite(low)?low:null,topY});
  }
  return{document:doc,entries,navigation:c.session.scene.snapshot().navigation,memory:{...c.renderer.info.memory},cache:c.assetLibrary.snapshot()};
});}
function contacts(snapshot){for(const item of snapshot.entries.filter(i=>i.role==='side-table-life-items')){assert(item.meshes>0);assert(Math.abs(item.bottom-item.topY)<1e-5,`${item.node.id}: ${item.bottom} != ${item.topY}`);}}
async function reject(ops){return page.evaluate(async ops=>{const c=company,doc=JSON.stringify(c.session.document),saved=JSON.stringify({...localStorage}),root=c.session.scene.root;let code,message;
  try{await c.apply(ops);}catch(e){code=e.code;message=e.message;}return{code,message,documentPreserved:doc===JSON.stringify(c.session.document),savePreserved:saved===JSON.stringify({...localStorage}),rootPreserved:root===c.session.scene.root};},ops);}
(async()=>{
  await fs.mkdir(out);made=true;report.harnessSha256=hash(await fs.readFile(__filename));server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
  await check('Four actual wall-shelf appearances with supported objects each survive browser shutdown and restart',async()=>{
    const rows=[];for(let index=0;index<4;index++){
      await show(index);
      await draw();const before=await inspect();contacts(before);assert.equal(before.entries.length,5);assert(before.entries.every(n=>n.visible));await shot('look-'+(index+1));await page.evaluate(()=>company.save());
      await Promise.all(pending);await context.close();context=null;await open();await draw();const after=await inspect();assert.deepEqual(after.document,before.document);contacts(after);rows.push(before);
    }assert.equal(new Set(rows.map(r=>r.entries.find(i=>i.role==='wall-shelf').asset.sha256)).size,4);return rows;
  });
  await check('Move to a different wall, rotate and copy the complete shelf; appearance replacement retains edited children',async()=>{
    await page.evaluate(()=>company.showAppearanceSample('wall-shelf',0));
    await page.evaluate(()=>company.apply([{type:'move',id:'wall-shelf/tissue',transform:{position:[.1,.95,.19],yaw:Math.PI/2}},
      {type:'move',id:'wall-shelf/primary',transform:{position:[3.4,.35,.4],yaw:Math.PI*1.5}},
      {type:'copy-facility',id:'wall-shelf/primary',newId:'wall-shelf/copy',transform:{position:[3.4,.35,-1.4],yaw:Math.PI*1.5}}]));
    const before=await inspect();contacts(before);assert.equal(before.entries.length,10);const child=before.document.nodes.find(n=>n.id==='wall-shelf/tissue');
    await page.evaluate(()=>company.showAppearanceSample('wall-shelf',3));const after=await inspect();contacts(after);assert.deepEqual(after.document.nodes.find(n=>n.id===child.id),child);
    assert.equal(new Set(after.document.nodes.map(n=>n.id)).size,after.document.nodes.length);assert.equal(after.document.nodes.filter(n=>n.parentId==='wall-shelf/copy').length,4);
    await page.evaluate(()=>company.save());await shot('moved-copied');return{before,after};
  });
  await check('Wall cutaway hides shelf and its supported children while preserving navigation, document and save',async()=>{
    await page.evaluate(()=>company.load(company.layouts.wallShelves));await page.evaluate(()=>company.showAppearanceSample('wall-shelf',0));
    await page.evaluate(()=>{company.session.scene.setWallView({mode:'full'});return company.save();});await draw();const before=await inspect(),saved=await page.evaluate(()=>({...localStorage}));
    await page.evaluate(()=>company.session.scene.setWallView({mode:'cutaway',cameraPosition:[-.8,2,-6]}));await draw();const hidden=await inspect();
    assert(hidden.entries.every(n=>!n.visible));assert.deepEqual(hidden.document,before.document);assert.deepEqual(hidden.navigation,before.navigation);assert.deepEqual(await page.evaluate(()=>({...localStorage})),saved);await shot('wall-hidden');
    await page.evaluate(()=>company.session.scene.setWallView({mode:'full'}));await draw();const restored=await inspect();assert(restored.entries.every(n=>n.visible));contacts(restored);assert.deepEqual(restored.document,before.document);return{before,hidden,restored};
  });
  await check('Invalid installation/support and real missing model preserve original scene and saved bytes',async()=>{
    const rows=[];for(const ops of [
      [{type:'move',id:'wall-shelf/primary',transform:{position:[-.8,.35,-2.4],yaw:0}}],
      [{type:'move',id:'wall-shelf/tissue',transform:{position:[0,1,.19],yaw:0}}],
      [{type:'move',id:'wall-shelf/cup',transform:{position:[.18,.35,.19],yaw:0}}],
    ]){const r=await reject(ops);assert(r.code&&r.documentPreserved&&r.savePreserved&&r.rootPreserved);rows.push(r);}
    await page.evaluate(()=>company.save());await context.close();context=null;await open();const url=await page.evaluate(()=>company.appearanceCandidates('wall-shelf')[3].asset.url);
    await page.route('**'+url,route=>route.fulfill({status:503,body:'Intentional wall shelf load failure'}));
    const r=await reject([{type:'replace-resource',id:'wall-shelf/primary',resource:{id:'wall-shelf-back-panel',version:1}}]);assert(r.code&&r.documentPreserved&&r.savePreserved&&r.rootPreserved);rows.push(r);await page.unroute('**'+url);return rows;
  });
  await check('Second layout and repeated swaps retain placement, support layers and stable resource counts',async()=>{
    await page.evaluate(()=>company.load(company.layouts.wallShelfAlternate));await page.waitForFunction(()=>company.session.document.id==='wall-shelf-alternate');
    const before=await inspect(),parent=before.document.nodes.find(n=>n.id==='wall-shelf/primary'),children=before.document.nodes.filter(n=>n.parentId===parent.id),cycles=[];
    for(let cycle=0;cycle<2;cycle++)for(let index=0;index<4;index++){
      await page.evaluate(index=>company.showAppearanceSample('wall-shelf',index),index);await draw();const state=await inspect();contacts(state);assert.equal(state.document.id,before.document.id);
      const current=state.document.nodes.find(n=>n.id===parent.id);assert.deepEqual(current.transform,parent.transform);assert.deepEqual(state.document.nodes.filter(n=>n.parentId===parent.id),children);
      cycles.push({index,memory:state.memory,cache:state.cache});
    }assert.deepEqual(cycles.slice(0,4),cycles.slice(4));await page.evaluate(()=>company.save());await shot('second-input');await context.close();context=null;await open();const restored=await inspect();contacts(restored);assert.equal(restored.document.id,before.document.id);
    return{cycles,restored};
  });
  await Promise.all(pending);const resources=await page.evaluate(()=>company.appearanceCandidates('wall-shelf'));
  for(const resource of resources){const rows=downloads.filter(r=>r.url===resource.asset.url);assert(rows.length);assert(rows.every(r=>r.sha256===resource.asset.sha256&&r.bytes===resource.asset.bytes));}
  report.downloads=downloads;assert.deepEqual(errors,[]);report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{
  if(context)await context.close();if(server)await server.close();report.pageErrors=errors;if(made)await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));
});
