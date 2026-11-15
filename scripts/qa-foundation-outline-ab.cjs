// Diagnostic only: exact frozen body, unchanged pose/camera, outline visibility A/B/A.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const identities={female:{assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95',outfit:1},male:{assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',outfit:2}};
(async()=>{
 const build=process.env.QA_M1_BUILD;assert.equal(build,'abdb18defd26','This source audit pins the abdb candidate');
 const out=path.resolve('output/playwright/m1',build,'foundation-outline-ab-'+Date.now());await fs.mkdir(out,{recursive:true});
 const report={build,diagnosticOnly:true,intervention:'Body/Face SKIN isOutline material.visible only; original values restored',bodies:[],errors:[]};
 const browser=await chromium.launch({channel:'chrome',headless:false});
 try{for(const [body,identity] of Object.entries(identities)){
  const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push({body,error:e.message}));
  await page.goto(new URL('?body='+body,process.argv[2]).href);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  const item={body,identity:await verifyCandidate(page,{build,...identity}),frames:[]};report.bodies.push(item);
  await page.evaluate(outfit=>{__debug.reset();__debug.setBodyMode('dressed');__debug.setOutfit(outfit);__debug.view('front');__debug.setPlaybackRate(1);},identity.outfit);
  await page.waitForTimeout(500);await page.evaluate(()=>__debug.setPaused(true));await page.waitForTimeout(50);
  item.materials=await page.evaluate(()=>{
   window.__outlineAB=[];const rows=[];
   __debug.avatar().root.traverse(mesh=>{if(!mesh.isMesh)return;
    for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
     rows.push({mesh:mesh.name,meshVisible:mesh.visible,material:m.name,type:m.type,side:m.side,transparent:m.transparent,alphaTest:m.alphaTest,depthTest:m.depthTest,depthWrite:m.depthWrite,isOutline:m.isOutline??false,outlineWidthFactor:m.outlineWidthFactor,outlineWidthMode:m.outlineWidthMode,castShadow:mesh.castShadow,receiveShadow:mesh.receiveShadow,groups:mesh.geometry.groups,map:m.map?.uuid});
     if(m.isOutline&&/_(Body|Face)_.*SKIN/.test(m.name))__outlineAB.push({m,visible:m.visible});
    }
   });return {rows,changedMaterials:__outlineAB.map(x=>x.m.name),pixelRatio:__debug.renderer.getPixelRatio(),cameraNear:__debug.cameraObject().near,cameraFar:__debug.cameraObject().far};
  });assert.equal(item.materials.changedMaterials.length,2,'Expected Body and Face outline only');
  for(const stage of ['original','no-skin-outline','restored']){
   await page.evaluate(stage=>{for(const x of __outlineAB)x.m.visible=stage==='no-skin-outline'?false:x.visible;},stage);
   await page.waitForTimeout(80);
   const snapshot=await page.evaluate(()=>{const s=__debug.snapshot();return{camera:s.camera,simulationTime:s.simulationTime,mode:s.mode,root:__debug.avatar().root.position.toArray(),render:s.renderer};});
   const filename=body+'-'+stage+'.png';await page.locator('.viewport').screenshot({path:path.join(out,filename)});item.frames.push({stage,filename,snapshot});
  }
  assert.deepEqual(item.frames[0].snapshot.camera,item.frames[1].snapshot.camera);assert.deepEqual(item.frames[0].snapshot.camera,item.frames[2].snapshot.camera);
  assert.equal(item.frames[0].snapshot.simulationTime,item.frames[2].snapshot.simulationTime);
  item.finalIdentity=await verifyCandidate(page,{build,...identity});await page.close();
 }}catch(e){report.failure=String(e);process.exitCode=1;}
 finally{await browser.close();report.browserClosed=true;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(out);console.log(JSON.stringify({failure:report.failure,errors:report.errors,bodies:report.bodies.map(b=>({body:b.body,changed:b.materials?.changedMaterials}))}));}
})().catch(e=>{console.error(e);process.exitCode=1;});
