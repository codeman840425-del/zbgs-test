const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg),hash=b=>createHash('sha256').update(b).digest('hex');
const report={build,status:'running',checks:[],limits:['SwiftShader functional browser evidence, not ordinary-PC performance or C3/human acceptance.']};
let made=false,server,context,page;const errors=[],downloads=[],pending=[];
async function open(){
 context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/ceiling-acoustic-v1/')&&r.url().endsWith('.glb')&&r.status()===200)pending.push(r.body().then(b=>downloads.push({url:new URL(r.url()).pathname,sha256:hash(b),bytes:b.length})));});
 await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);await page.evaluate(()=>company.pausePreview());
}
async function draw(){await page.evaluate(()=>{company.drawHostFrame();if(company.renderer.getContext().isContextLost())throw Error('WebGL context lost');});}
async function inside(){await page.evaluate(async()=>{const d=company.session.document;await company.showSpace('room',d.nodes[0].id,d.nodes[1].id);company.view('ceiling');});await draw();}
async function shot(name){await draw();await page.screenshot({path:path.join(out,name+'.png')});}
async function inspect(){return page.evaluate(()=>{
 const c=company,root=c.session.scene.root;root.updateMatrixWorld(true);const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
 const entries=c.session.document.nodes.filter(n=>n.resource&&c.catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version)?.mount==='ceiling').map(n=>{
  const o=root.getObjectByName(n.id),r=c.catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version);let low=Infinity,high=-Infinity,meshes=0;const v=c.camera.position.clone();
  o?.traverse(m=>{if(m.isMesh){meshes++;const p=m.geometry.attributes.position;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld);low=Math.min(low,v.y);high=Math.max(high,v.y);}}});
  return{node:n,asset:r.asset,visible:o?visible(o):false,meshes,low:Number.isFinite(low)?low:null,high:Number.isFinite(high)?high:null};
 });const ceilings=[];root.traverse(o=>{if(o.name.startsWith('Ceiling:'))ceilings.push({id:o.name,visible:visible(o)});});
 return{document:c.session.document,entries,ceilings,navigation:c.session.scene.snapshot().navigation,memory:{...c.renderer.info.memory},cache:c.assetLibrary.snapshot()};
});}
async function check(name,fn){report.checks.push({name,passed:true,result:await fn()});await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(name);}
async function reject(operations){return page.evaluate(async operations=>{const c=company,doc=JSON.stringify(c.session.document),saved=JSON.stringify({...localStorage}),root=c.session.scene.root;let code;
 try{await c.apply(operations);}catch(e){code=e.code;}return{code,documentPreserved:doc===JSON.stringify(c.session.document),savePreserved:saved===JSON.stringify({...localStorage}),rootPreserved:root===c.session.scene.root};},operations);}
const intact=r=>assert(r.code&&r.documentPreserved&&r.savePreserved&&r.rootPreserved,JSON.stringify(r));
(async()=>{
 await fs.mkdir(out);made=true;report.harnessSha256=hash(await fs.readFile(__filename));server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
 await check('Four actual appearances connect at 2.8m, leave 2.5m clear and survive separate browser restarts',async()=>{
  const rows=[];for(let index=0;index<4;index++){
   await page.locator('#sample-branch').selectOption('ceiling-acoustic-baffle');await page.locator('#sample-look').selectOption(String(index));await page.locator('#sample-show').click();
   await page.waitForFunction(index=>company.session.document.nodes.find(n=>n.id==='ceiling-acoustic/primary')?.resource.id===company.appearanceCandidates('ceiling-acoustic-baffle')[index].id&&!document.getElementById('sample-show').disabled,index);
   await draw();const before=await inspect(),item=before.entries[0];assert(item.visible&&item.meshes>8);assert(Math.abs(item.low-2.5)<1e-5&&Math.abs(item.high-2.8)<1e-5);assert(before.ceilings.every(c=>c.visible));await shot('look-'+(index+1));await page.evaluate(()=>company.save());
   await Promise.all(pending);await context.close();context=null;await open();assert.deepEqual((await inspect()).document,before.document);await inside();const after=await inspect();assert(after.entries[0].visible);rows.push(before);
  }assert.equal(new Set(rows.map(r=>r.entries[0].asset.sha256)).size,4);return rows;
 });
 await check('Top cutaway and room focus hide complete attachments without altering logical state or saved bytes',async()=>{
  await page.evaluate(()=>company.showAppearanceSample('ceiling-acoustic-baffle',0));await page.evaluate(()=>company.save());await draw();const before=await inspect(),saved=await page.evaluate(()=>({...localStorage}));
  await page.evaluate(()=>company.view('top'));await draw();const hidden=await inspect();assert(hidden.entries.every(n=>!n.visible)&&hidden.ceilings.every(n=>!n.visible));assert.deepEqual(hidden.document,before.document);assert.deepEqual(hidden.navigation,before.navigation);assert.deepEqual(await page.evaluate(()=>({...localStorage})),saved);await shot('top-view-hidden');
  await inside();const after=await inspect();assert(after.entries.every(n=>n.visible)&&after.ceilings.every(n=>n.visible));assert.deepEqual(after.document,before.document);return{before,hidden,after};
 });
 await check('Move rotate copy and appearance swaps retain edited identities and support a low table underneath',async()=>{
  await page.evaluate(()=>company.apply([{type:'move',id:'ceiling-acoustic/primary',transform:{position:[-1,2.8,0],yaw:Math.PI/2}},{type:'copy-facility',id:'ceiling-acoustic/primary',newId:'ceiling-copy',transform:{position:[1,2.8,0],yaw:Math.PI/2}}]));
  const before=await inspect();await page.evaluate(()=>company.showAppearanceSample('ceiling-acoustic-baffle',3));await inside();const after=await inspect();assert.equal(after.entries.length,2);assert.deepEqual(after.entries[0].node.transform,before.entries[0].node.transform);assert.deepEqual(after.entries[1].node,before.entries[1].node);await page.evaluate(()=>company.save());await shot('moved-copied');return after;
 });
 await check('Bad height wall crossing overlap and real HTTP503 preserve the current scene and save',async()=>{
  await page.evaluate(()=>company.load(company.layouts.ceilingAcoustic));await inside();await page.evaluate(()=>company.save());const rows=[];
  for(const ops of [[{type:'move',id:'ceiling-acoustic/primary',transform:{position:[0,2.7,0],yaw:0}}],[{type:'move',id:'ceiling-acoustic/primary',transform:{position:[2.5,2.8,0],yaw:0}}],[{type:'copy-facility',id:'ceiling-acoustic/primary',newId:'overlap',transform:{position:[.2,2.8,0],yaw:0}}]]){const r=await reject(ops);intact(r);rows.push(r);}
  await context.close();context=null;await open();await inside();const url=await page.evaluate(()=>company.appearanceCandidates('ceiling-acoustic-baffle')[3].asset.url);await page.route('**'+url,r=>r.fulfill({status:503,body:'Intentional missing ceiling resource'}));
  const r=await reject([{type:'replace-resource',id:'ceiling-acoustic/primary',resource:{id:'ceiling-acoustic-timber-grid',version:1}}]);intact(r);rows.push(r);await page.unroute('**'+url);return rows;
 });
 await check('Actual legacy GLB without mounting is rejected when intersecting the ceiling, including a hidden floor and building overview',async()=>{
  await page.evaluate(()=>{const c=company,src=c.catalog.resources.find(r=>r.id==='wall-shelf-side-bracket'),fixture={id:'qa-legacy-tall-display',version:1,category:'decor',mountRole:'qa-legacy-tall-display',coordinates:structuredClone(src.coordinates),asset:structuredClone(src.asset),provenance:structuredClone(src.provenance),usePoints:[],stateDefaults:{},footprint:{center:[0,0],halfSize:[.5,.175],blocking:false}};c.catalog.resources.push(fixture);});
  const room=await page.evaluate(()=>company.session.document.nodes[1].id),operation={type:'add-facility',id:'qa-tall',parentId:room,resource:{id:'qa-legacy-tall-display',version:1},transform:{position:[0,1.1,-.1],yaw:0}};
  const r=await reject([operation]);intact(r);assert.equal(r.code,'ceiling-visual-overlap');
  const hidden=await page.evaluate(async()=>{const c=company,good=structuredClone(c.layouts.ceilingAcoustic);good.scale='building';for(const n of [...good.nodes]){const copy=structuredClone(n);copy.id+='-second';if(copy.parentId!==good.id)copy.parentId+='-second';good.nodes.push(copy);}await c.load(good);await c.showSpace('building',good.nodes[0].id);await c.save();
   const before=JSON.stringify(c.session.document),saved=JSON.stringify({...localStorage}),root=c.session.scene.root;let code;try{await c.apply([{type:'add-facility',id:'qa-hidden-tall',parentId:good.nodes[1].id+'-second',resource:{id:'qa-legacy-tall-display',version:1},transform:{position:[0,1.1,-.1],yaw:0}}]);}catch(e){code=e.code;}
   return{code,documentPreserved:before===JSON.stringify(c.session.document),savePreserved:saved===JSON.stringify({...localStorage}),rootPreserved:root===c.session.scene.root,view:c.session.scene.view,cache:c.assetLibrary.snapshot()};});intact(hidden);assert.equal(hidden.code,'ceiling-visual-overlap');assert.equal(hidden.cache.loadedAssets,0);return{visible:r,hidden};
 });
 await check('Second input preserves placement during repeated replacement and resource release',async()=>{
  await page.locator('#layout').selectOption('ceilingAcousticAlternate');await page.waitForFunction(()=>company.session.document.id==='ceiling-acoustic-alternate'&&!document.getElementById('layout').disabled);const before=await inspect(),cycles=[];
  for(let cycle=0;cycle<2;cycle++)for(let index=0;index<4;index++){await page.evaluate(i=>company.showAppearanceSample('ceiling-acoustic-baffle',i),index);await draw();const state=await inspect();assert.equal(state.document.id,before.document.id);assert.deepEqual(state.entries[0].node.transform,before.entries[0].node.transform);cycles.push({index,memory:state.memory,cache:state.cache});}
  assert.deepEqual(cycles.slice(0,4),cycles.slice(4));await shot('second-input');await page.evaluate(()=>company.save());await context.close();context=null;await open();await inside();const restored=await inspect();assert.equal(restored.document.id,before.document.id);return{cycles,restored};
 });
 await Promise.all(pending);const descriptors=await page.evaluate(()=>company.appearanceCandidates('ceiling-acoustic-baffle').map(r=>r.asset));for(const a of descriptors)assert(downloads.some(d=>d.url===a.url&&d.sha256===a.sha256&&d.bytes===a.bytes));assert.deepEqual(errors,[]);report.downloads=downloads;report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;report.code=e.code;process.exitCode=1;console.error(e.stack);}).finally(async()=>{await context?.close();await server?.close();if(made)await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');});
