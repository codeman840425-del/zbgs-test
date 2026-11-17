const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg),report={build,status:'running',checks:[],limits:['Software rendering, not ordinary-PC performance or role/human final acceptance']};
let server,context,page;const errors=[];
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});await context.addInitScript(()=>{window.__bitmapRecords=[];const create=globalThis.createImageBitmap;globalThis.createImageBitmap=async(...args)=>{const image=await create(...args),close=image.close.bind(image),record={image,closes:0};image.close=()=>{record.closes++;close();};window.__bitmapRecords.push(record);return image;};});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);}
async function check(name,fn){report.checks.push({name,passed:true,result:await fn()});console.log(name);}
async function inspect(id='floor-information/primary/content'){return page.evaluate(id=>{
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
   await page.evaluate(index=>company.showAppearanceSample('information-board-floor',index),index);
   const contents=await page.evaluate(()=>company.catalog.resources.filter(r=>r.informationContent).map(r=>({id:r.id,version:r.version})));
   const checksums=[];
   for(const resource of contents) {
    await page.evaluate(async ({resource,index})=>{await company.showAppearanceSample('information-board-floor',index);await company.apply([{type:'replace-resource',id:'floor-information/primary/content',resource},{type:'set-state',id:'floor-information/primary/content',state:{visible:true}}]);},{resource,index});
    const before=await inspect();assert.equal(before.width,1100);assert.equal(before.height,700);assert.equal(before.colorSpace,'srgb');assert(before.visible);checksums.push(before.pixelChecksum);
    await page.screenshot({path:path.join(out,`frame-${index+1}-${resource.id}.png`)});await page.evaluate(()=>company.save());const doc=await page.evaluate(()=>company.session.document);
    await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),doc);assert.deepEqual(await inspect(),before);result.push({index,resource,visible:before.visible,pixelChecksum:before.pixelChecksum});
   }
   assert.equal(new Set(checksums).size,contents.length);
  }
  return result;
 });
 await check('Actual preview frame choice preserves selected content; hide is isolated and persists',async()=>{
  const before=await inspect();await page.evaluate(()=>company.showAppearanceSample('information-board-floor',0));assert.deepEqual((await inspect()).node,before.node);
  const other=await inspect('floor-information/secondary/content');
  await page.locator('#information-visible').click();await page.waitForFunction(()=>company.session.document.nodes.find(n=>n.id==='floor-information/primary/content').state.visible===false);
  assert.equal((await inspect()).visible,false);assert.deepEqual(await inspect('floor-information/secondary/content'),other);
  await page.evaluate(()=>company.save());await context.close();context=null;await open();assert.equal((await inspect()).visible,false);
  await page.evaluate(()=>company.apply([{type:'set-state',id:'floor-information/primary/content',state:{visible:true}}]));return{content:before.node.resource,isolated:true};
 });
 await check('Public-area parent rotation, atomic subtree copy and two-floor isolation preserve content',async()=>{
  await page.evaluate(()=>company.load(company.layouts.floorInformationAlternate));
  assert.equal(await page.evaluate(()=>company.session.scene.view.mode),'floor');
  const before=await inspect();assert(Math.abs(before.world[12]+1.969)<1e-7);assert.equal(before.world[13],1.3);
  await page.evaluate(async()=>{
   await company.apply([{type:'move',id:'floor-information/primary',transform:{position:[-1.8,0,.2],yaw:Math.PI/2}}]);
   const frame=company.session.document.nodes.find(n=>n.id==='floor-information/primary'),content=company.session.document.nodes.find(n=>n.id==='floor-information/primary/content');
   await company.apply([{type:'add-facility',id:'floor-information/copy',parentId:frame.parentId,resource:frame.resource,transform:{position:[0,0,.7],yaw:0}},
    {type:'add-facility',id:'floor-information/copy/content',parentId:'floor-information/copy',resource:content.resource,transform:content.transform,state:{visible:false}}]);
  });
  assert.equal((await inspect('floor-information/copy/content')).visible,false);assert.equal((await inspect()).visible,true);
  const doc=await page.evaluate(()=>company.session.document),two=structuredClone(doc);two.id='floor-information-two-floors';two.scale='building';two.name='两层落地板隔离';
  const copied=structuredClone(doc.nodes),ids=new Map(copied.map(n=>[n.id,`second/${n.id}`]));
  for(const n of copied){n.id=ids.get(n.id);n.parentId=ids.get(n.parentId)||two.id;if(n.stationId)n.stationId=ids.get(n.stationId);if(n.connections)for(const c of n.connections){c.id='second/'+c.id;for(const side of ['from','to'])c[side].regionId=ids.get(c[side].regionId);}if(n.id==='second/floor-information/primary/content')n.state.visible=false;}
  two.nodes[0].parentId=two.id;two.nodes.push(...copied);
  await page.evaluate(async doc=>{await company.load(doc);await company.save();await company.showSpace('floor','second/'+doc.nodes[0].id);},two);
  assert.equal((await inspect('second/floor-information/primary/content')).visible,false);
  await page.evaluate(()=>company.showSpace('floor',company.session.document.nodes[0].id));assert.equal((await inspect()).visible,true);
  await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),two);return{floors:2,copiedIndependent:true};
 });
 await check('Bad install, invalid state, missing face and content network failure preserve scene and saved bytes',async()=>{
  await page.evaluate(()=>company.load(company.layouts.floorInformation));
  const bad=await page.evaluate(async()=>{
   const before=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage}),codes=[];
   for(const op of [{type:'move',id:'floor-information/primary',transform:{position:[0,0,-1.05],yaw:0}},{type:'move',id:'floor-information/primary',transform:{position:[-1.5,.1,0],yaw:0}},{type:'move',id:'floor-information/primary/content',transform:{position:[0,.1,.031],yaw:0}},{type:'set-state',id:'floor-information/primary/content',state:{visible:'no'}}])try{await company.apply([op]);}catch(e){codes.push(e.code);}
   const resource=structuredClone(company.catalog.resources.find(r=>r.informationContent));resource.id='qa-missing-information-face';resource.informationNodes.face='missing';company.catalog.resources.push(resource);
   try{await company.apply([{type:'replace-resource',id:'floor-information/primary/content',resource:{id:resource.id,version:1}}]);}catch(e){codes.push(e.code);}finally{company.catalog.resources.pop();}
   return{codes,unchanged:before===JSON.stringify(company.session.document)&&saved===JSON.stringify({...localStorage})};
  });assert.equal(bad.codes.length,5);assert(bad.codes.includes('blocked-portal'));assert(bad.unchanged);
  // Both content assets are currently used; remove the other one before testing a real uncached failure.
  const r=await page.evaluate(async()=>{const r=company.catalog.resources.filter(r=>r.informationContent)[1];await company.apply([{type:'remove',id:'floor-information/secondary/content'}]);await company.save();return r;});
  await page.route(`**${r.asset.url}`,route=>route.fulfill({status:503,body:'expected failure'}));
  const fetch=await page.evaluate(async r=>{const before=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage});let code;try{await company.apply([{type:'replace-resource',id:'floor-information/primary/content',resource:{id:r.id,version:r.version}}]);}catch(e){code=e.code;}return{code,unchanged:before===JSON.stringify(company.session.document)&&saved===JSON.stringify({...localStorage})};},r);
  await page.unroute(`**${r.asset.url}`);assert.equal(fetch.code,'asset-fetch-failed');assert(fetch.unchanged);return{bad,fetch};
 });
 await check('Actual missing mesh and corrupt embedded image fail after download without committing',async()=>{
  await page.evaluate(()=>company.load(company.layouts.floorInformation));
  const sources=await page.evaluate(()=>({content:company.catalog.resources.find(r=>r.informationContent),board:company.catalog.resources.find(r=>r.mountRole==='information-board-floor')})),results=[];
  for(const kind of ['missing-face','bad-png','missing-base']) {
   const source=kind==='missing-base'?sources.board:sources.content,bytes=await fs.readFile(path.join(dist,source.asset.url.slice(1)));
   const bad=Buffer.from(bytes),jsonLength=bad.readUInt32LE(12),json=JSON.parse(bad.subarray(20,20+jsonLength).toString('utf8'));
   if(kind==='missing-face'||kind==='missing-base') {
    const node=json.nodes.find(n=>n.name===(kind==='missing-base'?'information-base':'information-face'));assert(node);node.name=kind==='missing-base'?'information-baze':'information-fail';const changed=Buffer.from(JSON.stringify(json));assert(changed.length<=jsonLength);bad.fill(32,20,20+jsonLength);changed.copy(bad,20);
   } else {
    const view=json.bufferViews[json.images[0].bufferView],binStart=20+jsonLength+8;bad[binStart+view.byteOffset]=0;
   }
   const r=structuredClone(source);r.id='qa-information-'+kind;r.asset={...r.asset,url:'/company-assets/qa-information-'+kind+'.glb',bytes:bad.length,sha256:createHash('sha256').update(bad).digest('hex')};
   await page.route('**'+r.asset.url,route=>route.fulfill({status:200,contentType:'model/gltf-binary',body:bad}));
   const result=await page.evaluate(async ({r,kind})=>{const before=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage});company.catalog.resources.push(r);let code;try{await company.apply([{type:'replace-resource',id:kind==='missing-base'?'floor-information/primary':'floor-information/primary/content',resource:{id:r.id,version:r.version}}]);}catch(e){code=e.code;}finally{company.catalog.resources.pop();}return{code,unchanged:before===JSON.stringify(company.session.document)&&saved===JSON.stringify({...localStorage})};},{r,kind});
   await page.unroute('**'+r.asset.url);assert(result.code&&result.unchanged);assert(kind!=='bad-png'?/^information-/.test(result.code):/texture|load/.test(result.code),JSON.stringify({kind,...result}));results.push({kind,...result});
  }
  return results;
 });
 await check('Unload removes content rendering and retained assets',async()=>{await page.evaluate(()=>company.load(company.layouts.smallHome));assert.equal(await page.evaluate(()=>!!company.session.scene.root.getObjectByName('floor-information/primary')),false);return await page.evaluate(()=>company.assetLibrary.snapshot());});
 assert.deepEqual(errors,[]);report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)await server.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
