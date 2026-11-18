const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg),report={build,status:'running',checks:[],limits:['Software rendering, not ordinary-PC performance or role/human final acceptance']};
let server,context,page;const errors=[];
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});await context.addInitScript(()=>{window.__bitmapRecords=[];const create=globalThis.createImageBitmap;globalThis.createImageBitmap=async(...args)=>{const image=await create(...args),close=image.close.bind(image),record={image,closes:0};image.close=()=>{record.closes++;close();};window.__bitmapRecords.push(record);return image;};});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);}
async function check(name,fn){report.checks.push({name,passed:true,result:await fn()});console.log(name);}
async function inspect(id='information/primary/content'){return page.evaluate(id=>{
 const node=company.session.document.nodes.find(n=>n.id===id),object=company.session.scene.root.getObjectByName(id),face=object.getObjectByName('information-face'),image=face.material.map.image;
 const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height).data;
 let sum=0;for(let i=0;i<pixels.length;i++)sum=(Math.imul(sum,31)+pixels[i])>>>0;
 return {node,visible:face.visible,width:image.width,height:image.height,colorSpace:face.material.map.colorSpace,pixelChecksum:sum,world:object.matrixWorld.toArray(),parent:object.parent.name};
},id);}
(async()=>{
 await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
 await check('Four real frames each accept both independent contents and survive separate browser restart',async()=>{
  const result=[];
  for(let index=0;index<4;index++) {
   await page.evaluate(index=>company.showAppearanceSample('information-board',index),index);
   const contents=await page.evaluate(()=>company.catalog.resources.filter(r=>r.informationContent).map(r=>({id:r.id,version:r.version})));
   const checksums=[];
   for(const resource of contents) {
    await page.evaluate(async resource=>{await company.apply([{type:'replace-resource',id:'information/primary/content',resource},{type:'set-state',id:'information/primary/content',state:{visible:true}}]);company.view('information');},resource);
    const before=await inspect();assert.equal(before.width,1100);assert.equal(before.height,700);assert.equal(before.colorSpace,'srgb');assert(before.visible);checksums.push(before.pixelChecksum);
    await page.screenshot({path:path.join(out,`frame-${index+1}-${resource.id}.png`)});await page.evaluate(()=>company.save());const doc=await page.evaluate(()=>company.session.document);
    await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),doc);assert.deepEqual(await inspect(),before);result.push({index,resource,visible:before.visible,pixelChecksum:before.pixelChecksum});
   }
   assert.equal(new Set(checksums).size,contents.length);
  }
  return result;
 });
 await check('Actual preview frame choice preserves selected content; hide is isolated and persists',async()=>{
  const before=await inspect();await page.evaluate(()=>company.showAppearanceSample('information-board',0));assert.deepEqual((await inspect()).node,before.node);
  const other=await inspect('information/secondary/content');
  await page.evaluate(()=>company.apply([{type:'set-state',id:'information/primary/content',state:{visible:false}}]));await page.waitForFunction(()=>company.session.document.nodes.find(n=>n.id==='information/primary/content').state.visible===false);
  assert.equal((await inspect()).visible,false);assert.deepEqual(await inspect('information/secondary/content'),other);
  await page.evaluate(()=>company.save());await context.close();context=null;await open();assert.equal((await inspect()).visible,false);
  await page.evaluate(()=>company.apply([{type:'set-state',id:'information/primary/content',state:{visible:true}}]));return{content:before.node.resource,isolated:true};
 });
 await check('Side wall parent movement, view cutaway and two-floor restore keep content identity and exact mount',async()=>{
  await page.evaluate(async()=>{await company.load(company.layouts.informationAlternate);company.view('information');});
  const before=await inspect();assert(Math.abs(before.world[12]+3.369)<1e-7);
  const viewing=await page.evaluate(()=>{
   const doc=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage});
   const effective=id=>{let node=company.session.scene.root.getObjectByName(id);for(;node;node=node.parent)if(!node.visible)return false;return true;};
   company.session.scene.setWallView({mode:'cutaway',cameraPosition:[-10,2,0]});
   const hidden=!effective('information/primary')&&!effective('information/primary/content');
   company.session.scene.setWallView({mode:'full',cameraPosition:[-10,2,0]});
   const restored=effective('information/primary')&&effective('information/primary/content');
   company.view('information');return{hidden,restored,unchanged:doc===JSON.stringify(company.session.document)&&saved===JSON.stringify({...localStorage})};
  });assert(viewing.hidden&&viewing.restored&&viewing.unchanged);
  await page.screenshot({path:path.join(out,'side-wall.png')});
  const doc=await page.evaluate(()=>company.session.document);
  const two=structuredClone(doc);two.id='information-two-floors';two.scale='building';two.name='两层图文隔离';
  const copied=structuredClone(doc.nodes);const ids=new Map(copied.map(n=>[n.id,`second/${n.id}`]));
  for(const n of copied){n.id=ids.get(n.id);n.parentId=ids.get(n.parentId)||two.id;if(n.stationId)n.stationId=ids.get(n.stationId);if(n.id==='second/information/primary/content')n.state.visible=false;}
  two.nodes[0].parentId=two.id;two.nodes.push(...copied);
  await page.evaluate(async doc=>{await company.load(doc);await company.save();},two);
  await page.evaluate(()=>company.showSpace('floor','second/'+company.session.document.nodes[0].id));assert.equal((await inspect('second/information/primary/content')).visible,false);
  await page.evaluate(()=>company.showSpace('floor',company.session.document.nodes[0].id));assert.equal((await inspect()).visible,true);
  await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),two);return{floors:2,sideWorld:before.world,viewing};
 });
 await check('Bad install, invalid state, missing face and content network failure preserve scene and saved bytes',async()=>{
  await page.evaluate(()=>company.load(company.layouts.information));
  const bad=await page.evaluate(async()=>{
   const before=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage}),codes=[];
   for(const op of [{type:'move',id:'information/primary/content',transform:{position:[0,.1,.031],yaw:0}},{type:'set-state',id:'information/primary/content',state:{visible:'no'}}])try{await company.apply([op]);}catch(e){codes.push(e.code);}
   const resource=structuredClone(company.catalog.resources.find(r=>r.informationContent));resource.id='qa-missing-information-face';resource.informationNodes.face='missing';company.catalog.resources.push(resource);
   try{await company.apply([{type:'replace-resource',id:'information/primary/content',resource:{id:resource.id,version:1}}]);}catch(e){codes.push(e.code);}finally{company.catalog.resources.pop();}
   return{codes,unchanged:before===JSON.stringify(company.session.document)&&saved===JSON.stringify({...localStorage})};
  });assert.equal(bad.codes.length,3);assert(bad.unchanged);
  // Both content assets are currently used; remove the other one before testing a real uncached failure.
  const r=await page.evaluate(async()=>{const r=company.catalog.resources.filter(r=>r.informationContent)[1];await company.apply([{type:'remove',id:'information/secondary/content'}]);await company.save();return r;});
  await page.route(`**${r.asset.url}`,route=>route.fulfill({status:503,body:'expected failure'}));
  const fetch=await page.evaluate(async r=>{const before=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage});let code;try{await company.apply([{type:'replace-resource',id:'information/primary/content',resource:{id:r.id,version:r.version}}]);}catch(e){code=e.code;}return{code,unchanged:before===JSON.stringify(company.session.document)&&saved===JSON.stringify({...localStorage})};},r);
  await page.unroute(`**${r.asset.url}`);assert.equal(fetch.code,'asset-fetch-failed');assert(fetch.unchanged);return{bad,fetch};
 });
 await check('Actual missing mesh and corrupt embedded image fail after download without committing',async()=>{
  await page.evaluate(()=>company.load(company.layouts.information));
  const source=await page.evaluate(()=>company.catalog.resources.find(r=>r.informationContent)),bytes=await fs.readFile(path.join(dist,source.asset.url.slice(1))),results=[];
  for(const kind of ['missing-face','bad-png']) {
   const bad=Buffer.from(bytes),jsonLength=bad.readUInt32LE(12),json=JSON.parse(bad.subarray(20,20+jsonLength).toString('utf8'));
   if(kind==='missing-face') {
    const node=json.nodes.find(n=>n.name==='information-face');assert(node);node.name='information-fail';const changed=Buffer.from(JSON.stringify(json));assert(changed.length<=jsonLength);bad.fill(32,20,20+jsonLength);changed.copy(bad,20);
   } else {
    const view=json.bufferViews[json.images[0].bufferView],binStart=20+jsonLength+8;bad[binStart+view.byteOffset]=0;
   }
   const r=structuredClone(source);r.id='qa-information-'+kind;r.asset={...r.asset,url:'/company-assets/qa-information-'+kind+'.glb',bytes:bad.length,sha256:createHash('sha256').update(bad).digest('hex')};
   await page.route('**'+r.asset.url,route=>route.fulfill({status:200,contentType:'model/gltf-binary',body:bad}));
   const result=await page.evaluate(async r=>{const before=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage});company.catalog.resources.push(r);let code;try{await company.apply([{type:'replace-resource',id:'information/primary/content',resource:{id:r.id,version:r.version}}]);}catch(e){code=e.code;}finally{company.catalog.resources.pop();}return{code,unchanged:before===JSON.stringify(company.session.document)&&saved===JSON.stringify({...localStorage})};},r);
   await page.unroute('**'+r.asset.url);assert(result.code&&result.unchanged);assert(kind==='missing-face'?/information/.test(result.code):/texture|load/.test(result.code));results.push({kind,...result});
  }
  return results;
 });
 await check('Actual decoded bitmaps remain valid until the last external instance releases them',async()=>{
  await page.evaluate(()=>company.load(company.layouts.information));
  // Freeze the preview loop before deliberately disposing its scene in this lifetime test.
  await page.evaluate(()=>company.pausePreview());
  return await page.evaluate(()=>{
   const r=company.catalog.resources.find(r=>r.informationContent),instance=company.assetLibrary.instantiate(r),mesh=instance.root.getObjectByName('information-face'),image=mesh.material.map.image;
   const record=window.__bitmapRecords.find(v=>v.image===image);if(!record)throw Error('Expected actual ImageBitmap from GLTFLoader');
   company.assetLibrary.retainOnly([]);if(image.width!==1100||record.closes!==0)throw Error('Cache eviction closed live image');
   company.session.dispose();company.assetLibrary.dispose();if(image.width!==1100||record.closes!==0)throw Error('Scene disposal closed external clone image');
   const textures=new Set(),materials=new Set(),geometries=new Set();instance.root.traverse(n=>{if(n.geometry)geometries.add(n.geometry);for(const m of n.material?[n.material].flat():[]){materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}});
   for(const t of textures){t.dispose();t.dispose();}for(const m of materials)m.dispose();for(const g of geometries)g.dispose();
   if(image.width!==0||record.closes!==1)throw Error('Final bitmap close must be exactly once');
   const unclosed=window.__bitmapRecords.filter(v=>v.image.width>0);if(unclosed.length)throw Error('Decoded images remain after all owners release: '+unclosed.length);
   return{decoded:window.__bitmapRecords.length,lastImageWidth:image.width,closes:record.closes};
  });
 });
 await context.close();context=null;await open();
 await check('Existing wall floor and ceiling finish clones remain valid after cache eviction and close on final release',async()=>{
  await page.evaluate(async()=>{await company.load(company.layouts.ceilings);await company.showSpace('floor',company.session.document.nodes.find(n=>n.kind==='floor').id);});
  await page.evaluate(()=>company.pausePreview());
  return await page.evaluate(()=>{
   const images=new Set();company.session.scene.root.traverse(n=>{if(n.userData.finish)for(const m of [n.material].flat())if(m?.map)images.add(m.map.image);});
   if(!images.size)throw Error('Expected actual finish images');
   company.assetLibrary.retainOnly([]);for(const image of images)if(image.width===0)throw Error('Finish clone image was closed with cache');
   company.session.dispose();company.assetLibrary.dispose();
   for(const image of images){const record=window.__bitmapRecords.find(v=>v.image===image);if(!record||record.closes!==1||image.width!==0)throw Error('Finish image did not close exactly once');}
   if(window.__bitmapRecords.some(v=>v.image.width>0))throw Error('Unreleased decoded image');
   return{finishImages:images.size,allClosedOnce:true};
  });
 });
 await context.close();context=null;await open();
 await check('Unload removes content rendering and retained assets',async()=>{await page.evaluate(()=>company.load(company.layouts.smallHome));assert.equal(await page.evaluate(()=>!!company.session.scene.root.getObjectByName('information/primary')),false);return await page.evaluate(()=>company.assetLibrary.snapshot());});
 assert.deepEqual(errors,[]);report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)await server.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
