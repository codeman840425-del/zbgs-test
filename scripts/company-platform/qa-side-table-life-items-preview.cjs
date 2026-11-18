const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const role='side-table-life-items',target='life-items/primary',parent='life-items/table';
const report={build,status:'running',checks:[],limits:['Actual browser with headless SwiftShader; not physical-GPU/ordinary-PC performance, C3 or human acceptance']};
let createdOut=false,server,context,page;const errors=[],network=[],responses=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
async function open(){
  context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  await context.addInitScript(()=>{window.__bitmapRecords=[];const create=globalThis.createImageBitmap;globalThis.createImageBitmap=async(...args)=>{const image=await create(...args),close=image.close.bind(image),record={image,closes:0};image.close=()=>{record.closes++;close();};window.__bitmapRecords.push(record);return image;};});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('response',response=>{if(response.url().includes('/side-table-life-items-v1/')&&response.url().endsWith('.glb')&&response.status()===200)responses.push((async()=>{const b=await response.body();network.push({url:response.url(),bytes:b.length,sha256:hash(b)});})());});
  await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
  assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);
}
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(name);}
async function draw(){await page.evaluate(()=>{company.setPreviewClock(33330);company.drawHostFrame();if(company.renderer.getContext().isContextLost())throw Error('Context lost');});await page.waitForTimeout(80);}
async function shot(name){await draw();await page.screenshot({path:path.join(out,name+'.png')});}
async function inspect(){return page.evaluate(async()=>{
  const doc=company.session.document;company.session.scene.root.updateMatrixWorld(true);
  const items=[];
  for(const node of doc.nodes){
    const resource=company.catalog.resources.find(r=>r.id===node.resource?.id&&r.version===node.resource?.version);if(resource?.mountRole!=='side-table-life-items')continue;
    const object=company.session.scene.root.getObjectByName(node.id),meshes=[],images=new Set();let bottom=Infinity;
    object.traverse(m=>{if(m.isMesh){m.geometry.computeBoundingBox();bottom=Math.min(bottom,m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).min.y);const mats=[m.material].flat();for(const material of mats)if(material.map)images.add(material.map.image);meshes.push({name:m.name,triangles:(m.geometry.index?.count||m.geometry.attributes.position.count)/3,uv:m.geometry.attributes.uv?.count||0,textures:mats.filter(mat=>mat.map).map(mat=>({colorSpace:mat.map.colorSpace,flipY:mat.map.flipY,minFilter:mat.map.minFilter,magFilter:mat.map.magFilter}))});}});
    const decoded=[];for(const image of images){const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height).data;decoded.push({width:image.width,height:image.height,rgbaSha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))].map(v=>v.toString(16).padStart(2,'0')).join('')});}
    const parentNode=doc.nodes.find(n=>n.id===node.parentId),parentResource=company.catalog.resources.find(r=>r.id===parentNode.resource.id&&r.version===parentNode.resource.version),parentObject=company.session.scene.root.getObjectByName(parentNode.id),top=parentObject.getObjectByName(parentResource.supportNodes[node.attachment.surfaceId]);top.geometry.computeBoundingBox();
    items.push({node,asset:resource.asset,provenance:resource.provenance,meshes,decoded,bottom,topY:top.geometry.boundingBox.clone().applyMatrix4(top.matrixWorld).max.y,world:object.getWorldPosition(company.camera.position.clone()).toArray()});
  }
  return{document:doc,items,cache:company.assetLibrary.snapshot(),memory:{...company.renderer.info.memory}};
});}
async function rejected(ops,expected){const result=await page.evaluate(async ops=>{
  const before=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage}),root=company.session.scene.root;let code,message;
  try{await company.apply(ops);}catch(e){code=e.code;message=e.message;}
  return{code,message,documentPreserved:before===JSON.stringify(company.session.document),savePreserved:saved===JSON.stringify({...localStorage}),scenePreserved:root===company.session.scene.root};
},ops);if(expected)assert.equal(result.code,expected);else assert(result.code);assert(result.documentPreserved&&result.savePreserved&&result.scenePreserved);return result;}
(async()=>{
  await fs.mkdir(out);createdOut=true;report.harnessSha256=hash(await fs.readFile(__filename));
  server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
  await check('Four real life-item looks rest on a real table, decode original pixels and each survive complete browser restart',async()=>{
    const rows=[];
    for(let index=0;index<4;index++){
      await page.evaluate(index=>company.showAppearanceSample('side-table-life-items',index),index);
      await page.waitForFunction(index=>company.session.document.nodes.find(n=>n.id==='life-items/primary')?.resource.id===company.appearanceCandidates('side-table-life-items')[index].id,index);
      await draw();const before=await inspect();assert.equal(before.items.length,1);
      const item=before.items[0];assert(item.meshes.length>0);assert(Math.abs(item.bottom-item.topY)<1e-5);assert.equal(before.cache.loadedAssets,2);
      if(index!==2){assert(item.decoded.length);for(const image of item.decoded){assert.equal(image.width,512);assert.equal(image.height,512);assert.equal(image.rgbaSha256,'fa98a1a1ac8d9ef41320a1077c5ce0cd0791bb26889e826c87b46b6891761d81');}assert(item.meshes.some(m=>m.uv>0&&m.textures.some(t=>t.colorSpace==='srgb')));}
      await shot('look-'+(index+1));await page.evaluate(()=>company.save());await Promise.all(responses);await context.close();context=null;await open();
      const restored=await inspect();assert.deepEqual(restored.document,before.document);assert.deepEqual(restored.items[0].decoded,item.decoded);assert(Math.abs(restored.items[0].bottom-restored.items[0].topY)<1e-5);rows.push(before);
    }
    assert.equal(new Set(rows.map(r=>r.items[0].asset.sha256)).size,4);return rows;
  });
  await check('Parent move and quarter-turn, subtree copy and compatible appearance change preserve local edit and independent identities',async()=>{
    await page.evaluate(()=>company.showAppearanceSample('side-table-life-items',0));
    await page.evaluate(()=>company.apply([
      {type:'move',id:'life-items/primary',transform:{position:[.04,.5,.01],yaw:Math.PI/2}},
      {type:'move',id:'life-items/table',transform:{position:[.7,0,-.4],yaw:Math.PI/2}},
      {type:'replace-resource',id:'life-items/table',resource:{id:'side-table-nested',version:1}},
      {type:'copy-facility',id:'life-items/table',newId:'life-items/copy-table',transform:{position:[-1.1,0,.7],yaw:0}},
    ]));
    const before=await inspect();assert.equal(before.items.length,2);assert.equal(new Set(before.document.nodes.map(n=>n.id)).size,before.document.nodes.length);
    const original=before.items.find(i=>i.node.id===target),copy=before.items.find(i=>i.node.parentId==='life-items/copy-table');assert(copy);assert.notEqual(copy.node.id,target);
    original.world.forEach((v,i)=>assert(Math.abs(v-[.71,.5,-.44][i])<1e-6));
    await page.evaluate(()=>company.showAppearanceSample('side-table-life-items',3));const after=await inspect(),changed=after.items.find(i=>i.node.id===target);
    assert.equal(changed.node.resource.id,'side-table-life-pen-notebook');assert.deepEqual(changed.node.transform,original.node.transform);assert.deepEqual(changed.node.attachment,original.node.attachment);
    assert.deepEqual(after.document.nodes.find(n=>n.id===parent),before.document.nodes.find(n=>n.id===parent));assert.deepEqual(after.items.find(i=>i.node.id===copy.node.id).node,copy.node);
    for(const item of after.items)assert(Math.abs(item.bottom-item.topY)<1e-5);
    await page.evaluate(()=>company.view('top'));await shot('moved-copied');await page.evaluate(()=>company.save());await context.close();context=null;await open();assert.deepEqual((await inspect()).document,after.document);return{before,after};
  });
  await check('Invalid support, overlap and actual missing candidate keep current scene and stored bytes',async()=>{
    await page.evaluate(()=>company.load(company.layouts.sideTableLifeItems));await page.evaluate(()=>company.save());const rejectedCases=[];
    rejectedCases.push(await rejected([{type:'move',id:target,transform:{position:[0,.52,0],yaw:0}}],'invalid-support-fit'));
    rejectedCases.push(await rejected([{type:'move',id:target,transform:{position:[.07,.5,0],yaw:0}}],'invalid-support-fit'));
    rejectedCases.push(await rejected([{type:'copy-facility',id:target,newId:'bad-duplicate',transform:{position:[0,.5,0],yaw:0}}],'overlapping-supported-props'));
    const room=await page.evaluate(()=>company.session.document.nodes.find(n=>n.kind==='room').id);
    rejectedCases.push(await rejected([{type:'attach-surface',id:target,parentId:room,surfaceId:'top',transform:{position:[0,.5,0],yaw:0}}]));
    const candidate=await page.evaluate(()=>company.catalog.resources.find(r=>r.id==='side-table-life-bottle'));let intercepted=0;
    await page.route('**'+candidate.asset.url,route=>{intercepted++;return route.fulfill({status:503,body:'deliberate missing candidate'});});
    const missing=await rejected([{type:'replace-resource',id:target,resource:{id:candidate.id,version:candidate.version}}],'asset-fetch-failed');assert.equal(intercepted,1);await page.unroute('**'+candidate.asset.url);return{rejectedCases,missing};
  });
  await check('Corrupt original embedded PNG and missing UV are rejected after actual download without committing',async()=>{
    const source=await page.evaluate(()=>company.catalog.resources.find(r=>r.id==='side-table-life-cup')),bytes=await fs.readFile(path.join(dist,source.asset.url.slice(1))),results=[];
    for(const kind of ['bad-png','missing-uv']){
      const bad=Buffer.from(bytes),length=bad.readUInt32LE(12),json=JSON.parse(bad.subarray(20,20+length).toString());
      if(kind==='bad-png'){const view=json.bufferViews[json.images[0].bufferView];bad[20+length+8+(view.byteOffset||0)]=0;}
      else{for(const mesh of json.meshes)for(const p of mesh.primitives)delete p.attributes.TEXCOORD_0;const encoded=Buffer.from(JSON.stringify(json));assert(encoded.length<=length);bad.fill(32,20,20+length);encoded.copy(bad,20);}
      const candidate=structuredClone(source);candidate.id='qa-life-'+kind;candidate.asset={...candidate.asset,url:'/company-assets/qa-life-'+kind+'.glb',bytes:bad.length,sha256:hash(bad)};let intercepted=0;
      await page.route('**'+candidate.asset.url,route=>{intercepted++;return route.fulfill({status:200,contentType:'model/gltf-binary',body:bad});});
      await page.evaluate(r=>company.catalog.resources.push(r),candidate);
      try{const result=await rejected([{type:'replace-resource',id:target,resource:{id:candidate.id,version:candidate.version}}]);assert(/texture|load|uv/.test(result.code));assert.equal(intercepted,1);results.push({kind,...result});}
      finally{await page.evaluate(id=>{const i=company.catalog.resources.findIndex(r=>r.id===id);company.catalog.resources.splice(i,1);},candidate.id);await page.unroute('**'+candidate.asset.url);}
    }return results;
  });
  await check('Late actual image decoding cannot replace a newer edit or its saved bytes',async()=>{
    await page.evaluate(()=>company.load(company.layouts.sideTableLifeItems));
    await page.evaluate(()=>{
      const original=globalThis.createImageBitmap;window.__lateImageReady=false;
      globalThis.createImageBitmap=async(...args)=>{globalThis.createImageBitmap=original;const image=await original(...args);window.__lateImage=image;window.__lateImageReady=true;await new Promise(resolve=>window.__releaseLateImage=resolve);return image;};
      window.__lateChange=company.apply([{type:'replace-resource',id:'life-items/primary',resource:{id:'side-table-life-bottle',version:1}}]).then(()=>({committed:true}),e=>({code:e.code,message:e.message}));
    });
    await page.waitForFunction(()=>window.__lateImageReady===true);
    await page.evaluate(async()=>{await company.apply([{type:'move',id:'life-items/primary',transform:{position:[.02,.5,0],yaw:0}}]);await company.save();});
    const result=await page.evaluate(async()=>{
      const before=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage}),root=company.session.scene.root;window.__releaseLateImage();const late=await window.__lateChange;
      return{late,documentPreserved:before===JSON.stringify(company.session.document),savePreserved:saved===JSON.stringify({...localStorage}),scenePreserved:root===company.session.scene.root,closed:window.__lateImage.width===0,closes:window.__bitmapRecords.find(r=>r.image===window.__lateImage)?.closes,cache:company.assetLibrary.snapshot()};
    });assert(result.late.code);assert(result.documentPreserved&&result.savePreserved&&result.scenePreserved&&result.closed);assert.equal(result.closes,1);assert.equal(result.cache.loadedAssets,2);return result;
  });
  await check('Independent second layout and repeated swap use the same chain with stable rendering allocations',async()=>{
    await page.evaluate(()=>company.load(company.layouts.sideTableLifeItemsAlternate));await page.waitForFunction(()=>company.session.document.id==='side-table-life-items-alternate');await draw();const before=await inspect();before.items[0].world.forEach((v,i)=>assert(Math.abs(v-[1,.5,.3][i])<1e-6));
    await page.evaluate(()=>company.view('top'));await shot('second-input');await page.evaluate(()=>company.save());const encoded=await page.evaluate(()=>company.export());await fs.writeFile(path.join(out,'life-items.company.json'),encoded);const envelope=JSON.parse(encoded);assert.equal(envelope.dependencies.resources.length,2);
    await context.close();context=null;await open();assert.deepEqual((await inspect()).document,before.document);
    const cycles=[];for(let i=0;i<8;i++){await page.evaluate(i=>company.showAppearanceSample('side-table-life-items',i%4),i);const current=await page.evaluate(()=>company.session.document);assert.equal(current.id,before.document.id);assert.deepEqual(current.nodes.find(n=>n.id===parent),before.document.nodes.find(n=>n.id===parent));assert.deepEqual(current.nodes.find(n=>n.id===target).transform,before.items[0].node.transform);await draw();cycles.push(await page.evaluate(()=>({cache:company.assetLibrary.snapshot(),memory:{...company.renderer.info.memory},liveBitmaps:window.__bitmapRecords.filter(r=>r.image.width>0).length})));}
    await fs.writeFile(path.join(out,'swap-cycles.json'),JSON.stringify(cycles,null,2)+'\n');assert(cycles.every(c=>c.cache.loadedAssets===2));for(let i=0;i<4;i++)assert.deepEqual(cycles[i],cycles[i+4]);return{before,dependencies:envelope.dependencies,cycles};
  });
  await Promise.all(responses);
  await check('Actual network bytes match all four registered assets',async()=>{
    const resources=await page.evaluate(()=>company.catalog.resources.filter(r=>r.mountRole==='side-table-life-items'));
    for(const r of resources){const matching=network.filter(n=>new URL(n.url).pathname===r.asset.url);assert(matching.length);assert(matching.every(n=>n.sha256===r.asset.sha256&&n.bytes===r.asset.bytes));}return{resources:resources.map(r=>({id:r.id,asset:r.asset})),network};
  });
  await check('Original decoded image survives cache and scene disposal until its last clone is released exactly once',async()=>{
    await page.evaluate(()=>company.showAppearanceSample('side-table-life-items',0));await page.evaluate(()=>company.pausePreview());
    return page.evaluate(()=>{
      const r=company.catalog.resources.find(r=>r.id==='side-table-life-cup'),instance=company.assetLibrary.instantiate(r);let image;instance.root.traverse(n=>{if(n.isMesh)for(const m of [n.material].flat())if(m.map)image=m.map.image;});
      const record=window.__bitmapRecords.find(v=>v.image===image);if(!record)throw Error('Actual ImageBitmap required');company.assetLibrary.retainOnly([]);if(image.width!==512||record.closes!==0)throw Error('Cache eviction closed live image');
      company.session.dispose();company.assetLibrary.dispose();if(image.width!==512||record.closes!==0)throw Error('Scene disposal closed external clone');
      const textures=new Set(),materials=new Set(),geometries=new Set();instance.root.traverse(n=>{if(n.geometry)geometries.add(n.geometry);for(const m of n.material?[n.material].flat():[]){materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}});
      for(const t of textures){t.dispose();t.dispose();}for(const m of materials)m.dispose();for(const g of geometries)g.dispose();
      if(image.width!==0||record.closes!==1||window.__bitmapRecords.some(r=>r.image.width>0))throw Error('Image ownership did not finish exactly once');return{decoded:window.__bitmapRecords.length,finalCloses:record.closes};
    });
  });assert.deepEqual(errors,[]);report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{
  if(context)await context.close();if(server)await server.close();report.pageErrors=errors;if(createdOut)await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));
});
