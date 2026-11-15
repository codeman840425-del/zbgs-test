// Diagnostic only, no source edits: world outline width 0.75mm -> 1.5mm -> restore.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const identities={female:{assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95',outfit:1},male:{assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',outfit:2}};
(async()=>{
 const build=process.env.QA_M1_BUILD;assert.equal(build,'abdb18defd26');
 const out=path.resolve('output/playwright/m1',build,'foundation-outline-width-'+Date.now());await fs.mkdir(out,{recursive:true});
 const report={build,diagnosticOnly:true,intervention:'Body/Face SKIN isOutline outlineWidthFactor only: original ~0.00075m -> 0.0015m -> original',distanceDefinition:'Camera offset 3.2m or 9m from the same character target, vertical offset 0.5m. Room-distance diagnostic is not the oblique room camera preset.',bodies:[],errors:[]};
 const browser=await chromium.launch({channel:'chrome',headless:false});
 try{for(const [body,identity] of Object.entries(identities)){
  const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push({body,error:e.message}));
  await page.goto(new URL('?body='+body,process.argv[2]).href);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  const item={body,identity:await verifyCandidate(page,{build,...identity}),cases:[]};report.bodies.push(item);
  await page.evaluate(outfit=>{__debug.reset();__debug.setBodyMode('dressed');__debug.setOutfit(outfit);__debug.setPlaybackRate(1);},identity.outfit);
  await page.waitForTimeout(650);await page.evaluate(()=>__debug.setPaused(true));
  item.materials=await page.evaluate(()=>{
   window.__widthAB=[];__debug.avatar().root.traverse(mesh=>{if(!mesh.isMesh)return;for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(m.isOutline&&/_(Body|Face)_.*SKIN/.test(m.name))__widthAB.push({m,width:m.outlineWidthFactor});});
   return __widthAB.map(x=>({name:x.m.name,width:x.width,side:x.m.side,depthWrite:x.m.depthWrite,alphaTest:x.m.alphaTest}));
  });assert.equal(item.materials.length,2);for(const m of item.materials)assert(Math.abs(m.width-.00075)<1e-9);
  for(const direction of ['front','side'])for(const [distance,d] of [['close',3.2],['room-distance',9]]){
   await page.evaluate(({direction,d})=>{const camera=__debug.cameraObject(),root=__debug.avatar().root.position;camera.position.set(root.x+(direction==='side'?d:0),root.y+1.37,root.z+(direction==='front'?d:0));camera.lookAt(root.x,root.y+.87,root.z);camera.updateMatrixWorld(true);},{direction,d});
   await page.waitForTimeout(80);const test={direction,distance,frames:[]};item.cases.push(test);
   for(const stage of ['original','width-1p5mm','restored']){
    const state=await page.evaluate(stage=>{for(const x of __widthAB)x.m.outlineWidthFactor=stage==='width-1p5mm'?.0015:x.width;return __widthAB.map(x=>({name:x.m.name,width:x.m.outlineWidthFactor,side:x.m.side,depthWrite:x.m.depthWrite,alphaTest:x.m.alphaTest}));},stage);
    await page.waitForTimeout(80);const snapshot=await page.evaluate(()=>{const s=__debug.snapshot();return {camera:s.camera,simulationTime:s.simulationTime,root:__debug.avatar().root.position.toArray(),pixelRatio:__debug.renderer.getPixelRatio()};});
    const filename=[body,direction,distance,stage].join('-')+'.png';await page.locator('.viewport').screenshot({path:path.join(out,filename)});test.frames.push({stage,filename,snapshot,materials:state});
   }
   for(const f of test.frames){const initial=test.frames[0].snapshot.camera;assert.equal(f.snapshot.camera.mode,initial.mode);f.cameraNumericDrift=Math.max(...['position','target'].flatMap(k=>f.snapshot.camera[k].map((v,i)=>Math.abs(v-initial[k][i]))));assert(f.cameraNumericDrift<=1e-12,'Camera changed beyond floating-point controls roundoff');assert.equal(f.snapshot.simulationTime,test.frames[0].snapshot.simulationTime);for(let i=0;i<f.materials.length;i++){const {width,...m}=f.materials[i],{width:oldWidth,...old}=item.materials[i];assert.deepEqual(m,old);}}
   assert.deepEqual(test.frames[2].materials,item.materials);
  }
  item.finalIdentity=await verifyCandidate(page,{build,...identity});await page.close();
 }}catch(e){report.failure=String(e);process.exitCode=1;}
 finally{await browser.close();report.browserClosed=true;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(out);console.log(JSON.stringify({failure:report.failure,errors:report.errors,cases:report.bodies.map(b=>({body:b.body,cases:b.cases.length}))}));}
})().catch(e=>{console.error(e);process.exitCode=1;});
