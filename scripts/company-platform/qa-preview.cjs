const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [dist,build,outArg]=process.argv.slice(2);
if(!dist||!/^[a-f0-9]{12}$/.test(build||'')||!outArg)throw Error('Usage: node scripts/company-platform/qa-preview.cjs DIST BUILD OUTPUT_NEW_DIR');
const out=path.resolve(outArg),report={build,status:'running',checks:[],limits:['Scene authoring only. No character usage, occupancy, contact or ordinary-PC performance conclusion.']};
let server,context;
async function check(name,fn){await fn();report.checks.push({name,passed:true});}
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000}});const page=await context.newPage();await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo,null,{timeout:30000});assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);return page;}
async function settled(page){await page.waitForFunction(()=>!document.getElementById('save').disabled);}
(async()=>{
 await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out,{recursive:false});server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});let page=await open();
 await fs.writeFile(path.join(out,'initial-ui.txt'),await page.locator('body').ariaSnapshot());
 await check('Real GLB sofa and two streaming stations load with four distinct contact points',async()=>{
  const result=await page.evaluate(()=>({points:company.snapshot().points,instances:company.session.document.nodes.filter(n=>n.kind==='facility').length}));
  assert.equal(result.points.length,4);assert.equal(new Set(result.points.map(p=>p.id)).size,4);assert.equal(result.instances,14);
  await page.screenshot({path:path.join(out,'room-initial.png')});await page.getByRole('button',{name:'沙发近景',exact:true}).click();await page.screenshot({path:path.join(out,'sofa-baseline.png')});
 });
 await check('Actual model replacement preserves instance and independent point identities',async()=>{
  const ids=await page.evaluate(()=>company.snapshot().points.map(p=>p.id));await page.getByLabel('沙发样件').selectOption('2');await settled(page);
  assert.equal(await page.evaluate(()=>company.session.document.nodes.find(n=>n.id==='lounge/sofa').resource.version),2);
  assert.deepEqual(await page.evaluate(()=>company.snapshot().points.map(p=>p.id)),ids);await page.screenshot({path:path.join(out,'sofa-variant.png')});
 });
 await check('Declared fabric slot changes actual materials while base frame and stable identity remain',async()=>{
  const before=await page.evaluate(()=>{const root=company.session.scene.root.getObjectByName('lounge/sofa'),materials=[];root.traverse(m=>{if(m.isMesh)materials.push([m.name,m.material.color.getHexString()]);});return{points:company.snapshot().points.map(p=>p.id),materials};});
  await page.getByLabel('沙发面料方案').selectOption('blue');await settled(page);
  const after=await page.evaluate(()=>{const root=company.session.scene.root.getObjectByName('lounge/sofa'),materials=[];root.traverse(m=>{if(m.isMesh)materials.push([m.name,m.material.color.getHexString()]);});return{points:company.snapshot().points.map(p=>p.id),materials};});
  assert.deepEqual(before.points,after.points);assert(after.materials.some(([name,color])=>name==='seat-left'&&color==='345c83'));
  const changed=after.materials.filter(([name,color])=>before.materials.find(([n])=>n===name)?.[1]!==color);assert.equal(changed.length,6);
  await page.screenshot({path:path.join(out,'sofa-material.png')});
 });
 await check('Independent screen state changes an actual material and persists with composite edits',async()=>{
  await page.getByLabel('选择工位',{exact:true}).selectOption('station-2');await page.getByRole('button',{name:'关闭屏幕',exact:true}).click();await settled(page);
  const screens=await page.evaluate(()=>[1,2].map(i=>company.session.scene.root.getObjectByName(`station-${i}/monitor`).getObjectByName('monitor-screen').material.emissiveIntensity));assert.deepEqual(screens,[.35,0]);
  await page.evaluate(async()=>company.apply([{type:'move',id:'station-2',transform:{position:[1.6,0,-.3],yaw:Math.PI/2}},{type:'move',id:'station-2/desk',transform:{position:[0,0,-1.1],yaw:0}}]));
  await page.getByRole('button',{name:'室内总览',exact:true}).click();await page.screenshot({path:path.join(out,'room-edited.png')});
  await page.getByRole('button',{name:'保存方案',exact:true}).click();await settled(page);
 });
 const saved=await page.evaluate(()=>company.session.document);
 await check('Close the actual browser, reopen the same profile, recover and continue editing',async()=>{
  await context.close();context=null;page=await open();assert.deepEqual(await page.evaluate(()=>company.session.document),saved);
  await page.evaluate(()=>company.apply([{type:'set-state',id:'station-1/fill-light',state:{on:false}}]));
  assert.equal(await page.evaluate(()=>company.snapshot().lights.find(l=>l.id==='station-1/fill-light').intensity),0);
 });
 await check('Bad layout and missing GLB preserve the live scene and saved bytes',async()=>{
  const result=await page.evaluate(async()=>{
   const before=JSON.stringify(company.session.document),stored=localStorage.getItem('company-platform:v1:company-demo'),errors=[];
   try{await company.apply([{type:'move',id:'station-2',transform:{position:[-1.5,0,0],yaw:0}}]);}catch(e){errors.push(e.code);}
   const missing=structuredClone(company.catalog.resources.find(r=>r.id==='lounge-sofa'&&r.version===2));missing.version=999;missing.asset.url='/company-assets/missing-probe.glb';company.catalog.resources.push(missing);
   try{await company.apply([{type:'replace-resource',id:'lounge/sofa',resource:{id:'lounge-sofa',version:999}}]);}catch(e){errors.push(e.code);}finally{company.catalog.resources.pop();}
   return{errors,unchanged:before===JSON.stringify(company.session.document),saved:stored===localStorage.getItem('company-platform:v1:company-demo')};
  });assert.deepEqual(result.errors,['overlapping-facilities','asset-fetch-failed']);assert(result.unchanged&&result.saved);
 });
 await check('Embedded PNG is decoded by the real browser and cloned textures remain independent',async()=>{
  const bytes=await fs.readFile(path.join(__dirname,'../../evidence/company-asset-library-v1/triangle-textured.glb'));
  await page.route('**/company-assets/qa-texture.glb',route=>route.fulfill({body:bytes,contentType:'model/gltf-binary'}));
  const result=await page.evaluate(async descriptor=>{
   const resource={id:'qa-texture',version:1,category:'decor',mountRole:'decor',coordinates:{units:'metres',up:'+Y',forward:'+Z'},asset:descriptor,stateDefaults:{},usePoints:[]};company.catalog.resources.push(resource);
   try{
    await company.apply([1,2].map(i=>({type:'add-facility',id:`qa-texture-${i}`,parentId:'company-demo/room-1',resource:{id:'qa-texture',version:1},transform:{position:[3,0,i],yaw:0}})));
    const maps=[1,2].map(i=>{let map;company.session.scene.root.getObjectByName(`qa-texture-${i}`).traverse(n=>{if(n.material?.map)map=n.material.map;});return map;});
    return {width:maps.map(m=>m.image.width),height:maps.map(m=>m.image.height),independent:maps[0]!==maps[1]&&maps[0].source!==maps[1].source};
   }finally{await company.apply([{type:'remove',id:'qa-texture-1'},{type:'remove',id:'qa-texture-2'}]);company.catalog.resources.pop();}
  },{format:'glb',url:'/company-assets/qa-texture.glb',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
  assert.deepEqual(result,{width:[2,2],height:[2,2],independent:true});
 });
 await check('A real corrupt embedded PNG rejects the candidate and retains the valid scene',async()=>{
  const bytes=await fs.readFile(path.join(__dirname,'../../evidence/company-asset-library-v1/triangle-textured-bad-png.glb'));
  await page.route('**/company-assets/qa-bad-image.glb',route=>route.fulfill({body:bytes,contentType:'model/gltf-binary'}));
  const result=await page.evaluate(async asset=>{
   const before=JSON.stringify(company.session.document);company.catalog.resources.push({id:'qa-bad-image',version:1,category:'decor',coordinates:{units:'metres',up:'+Y',forward:'+Z'},asset,usePoints:[],stateDefaults:{}});
   let error;try{await company.apply([{type:'add-facility',id:'qa-bad-image',parentId:'company-demo/room-1',resource:{id:'qa-bad-image',version:1},transform:{position:[3,0,0],yaw:0}}]);}catch(e){error=e.code;}finally{company.catalog.resources.pop();}
   return {error,preserved:before===JSON.stringify(company.session.document)};
  },{format:'glb',url:'/company-assets/qa-bad-image.glb',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
  assert.deepEqual(result,{error:'asset-texture-load-failed',preserved:true});
 });
 await check('Agent copies, unpacks, regroups and reuses a composite in the actual rendered scene',async()=>{
  const result=await page.evaluate(async()=>{
   const original=company.session.document;
   await company.apply([{type:'remove',id:'station-2'},{type:'copy-workstation',id:'station-1',newId:'station-copy',transform:{position:[1.5,0,0],yaw:0}}]);
   const positions=()=>Object.fromEntries(company.session.document.nodes.filter(n=>n.kind==='facility').map(n=>{const root=company.session.scene.root.getObjectByName(n.id);return[n.id,root.getWorldPosition(root.position.clone()).toArray()];}));
   const before=positions();
   await company.apply([{type:'unpack-workstation',id:'station-copy'},{type:'group-facilities',id:'custom-group',parentId:'company-demo/room-1',memberIds:['station-copy/desk','station-copy/chair','station-copy/fill-light'],transform:{position:[1.5,0,0],yaw:0}}]);
   const grouped=positions(),groups=company.session.document.nodes.filter(n=>n.kind==='assembly').map(n=>n.id);
   await company.apply([{type:'move',id:'custom-group',transform:{position:[1.6,0,-.3],yaw:Math.PI/2}},{type:'remove',id:'station-1'},{type:'copy-group',id:'custom-group',newId:'custom-group-copy',transform:{position:[-1.5,0,0],yaw:0}}]);
   const copied=company.snapshot(),instances=company.session.document.nodes.filter(n=>n.kind==='facility'),unique=new Set(instances.map(n=>n.id)).size===instances.length;
   await company.load(original);return{before,grouped,groups,unique,copiedPointCount:copied.points.length};
  });
  for(const id of Object.keys(result.before))for(let i=0;i<3;i++)assert(Math.abs(result.before[id][i]-result.grouped[id][i])<1e-8);
  assert.deepEqual(result.groups,['custom-group']);assert(result.unique);assert.equal(result.copiedPointCount,4);
 });
 await check('Small viewport retains controls without horizontal document overflow',async()=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>company.renderer.domElement.clientWidth===innerWidth);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'small-preview.png'),fullPage:true});
 });
 report.status='passed';
})().catch(error=>{report.status='failed';report.error=error.stack;process.exitCode=1;}).finally(async()=>{
 if(context)await context.close();if(server)await server.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,output:out,error:report.error}));
});
