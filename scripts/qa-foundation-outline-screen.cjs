// One diagnostic candidate only. No production edit; actual renderer buffer height.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const identities={female:{assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95',outfit:1},male:{assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',outfit:2}};
(async()=>{
 const build=process.env.QA_M1_BUILD;assert.equal(build,'269a73423c97','Pins the integrated candidate');
 const out=path.resolve('output/playwright/m1',build,'foundation-outline-screen-'+Date.now());await fs.mkdir(out,{recursive:true});
 const report={build,diagnosticOnly:true,intervention:'Only Body_SKIN isOutline: world ~0.00075m -> screenCoordinates factor=2/actual WebGL drawingBufferHeight -> original. Face and other material properties retained.',cameras:['room','close','front','side'],errors:[],bodies:[]};
 const browser=await chromium.launch({channel:'chrome',headless:false});
 try{for(const [body,id]of Object.entries(identities)){
  const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push({body,error:e.message}));
  await page.goto(new URL('?body='+body,process.argv[2]).href);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});const item={body,identity:await verifyCandidate(page,{build,...id}),cases:[]};report.bodies.push(item);
  await page.evaluate(outfit=>{__debug.reset();__debug.setBodyMode('dressed');__debug.setOutfit(outfit);__debug.setPlaybackRate(1);__debug.setHelpers(false);},id.outfit);await page.waitForTimeout(650);await page.evaluate(()=>__debug.setPaused(true));
  item.setup=await page.evaluate(()=>{
   const d=__debug,renderer=d.renderer,gl=renderer.getContext();window.__screenAB={materials:[],body:[],initialPose:[]};
   d.avatar().root.traverse(o=>{if(o.isBone)__screenAB.initialPose.push({uuid:o.uuid,p:o.position.toArray(),q:o.quaternion.toArray(),s:o.scale.toArray()});if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){__screenAB.materials.push(m);if(m.isOutline&&/_Body_.*SKIN/.test(m.name))__screenAB.body.push({m,mode:m.outlineWidthMode,width:m.outlineWidthFactor});}});
   __screenAB.snapshotMaterials=()=>__screenAB.materials.map(m=>({uuid:m.uuid,name:m.name,visible:m.visible,side:m.side,transparent:m.transparent,alphaTest:m.alphaTest,depthTest:m.depthTest,depthWrite:m.depthWrite,polygonOffset:m.polygonOffset,polygonOffsetFactor:m.polygonOffsetFactor,polygonOffsetUnits:m.polygonOffsetUnits,isOutline:m.isOutline??false,mode:m.outlineWidthMode,width:m.outlineWidthFactor,widthTexture:m.outlineWidthMultiplyTexture?.uuid??null,map:m.map?.uuid??null,outlineColor:m.outlineColorFactor?.toArray(),outlineLightingMix:m.outlineLightingMixFactor}));
   __screenAB.initialMaterials=__screenAB.snapshotMaterials();__screenAB.factor=2/gl.drawingBufferHeight;
   const box=renderer.domElement.getBoundingClientRect();return{drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],canvasAttribute:[renderer.domElement.width,renderer.domElement.height],canvasCSS:[box.width,box.height],pixelRatio:renderer.getPixelRatio(),factor:__screenAB.factor,bodyMaterials:__screenAB.body.map(x=>({uuid:x.m.uuid,name:x.m.name,mode:x.mode,width:x.width})),materials:__screenAB.initialMaterials};
  });assert.equal(item.setup.bodyMaterials.length,1);assert.equal(item.setup.bodyMaterials[0].mode,'worldCoordinates');assert(Math.abs(item.setup.bodyMaterials[0].width-.00075)<1e-9);
  for(const camera of report.cameras){
   await page.evaluate(camera=>__debug.game.scene.getScene('CharacterStudio').cameraPreset(camera,true),camera);await page.waitForTimeout(80);const test={camera,frames:[]};item.cases.push(test);
   for(const stage of ['original','screen-1px','restored']){
    await page.evaluate(stage=>{for(const x of __screenAB.body){x.m.outlineWidthMode=stage==='screen-1px'?'screenCoordinates':x.mode;x.m.outlineWidthFactor=stage==='screen-1px'?__screenAB.factor:x.width;}},stage);await page.waitForTimeout(120);
    const state=await page.evaluate(()=>{const d=__debug,s=d.snapshot(),bones=[];d.avatar().root.traverse(o=>{if(o.isBone)bones.push({uuid:o.uuid,p:o.position.toArray(),q:o.quaternion.toArray(),s:o.scale.toArray()});});return{camera:s.camera,simulationTime:s.simulationTime,root:d.avatar().root.position.toArray(),poseUnchanged:JSON.stringify(bones)===JSON.stringify(__screenAB.initialPose),materials:__screenAB.snapshotMaterials(),drawingBufferHeight:d.renderer.getContext().drawingBufferHeight};});
    assert(state.poseUnchanged,'Bone pose changed while paused');assert.equal(state.drawingBufferHeight,item.setup.drawingBuffer[1]);
    for(let i=0;i<state.materials.length;i++){const expected={...item.setup.materials[i]};if(stage==='screen-1px'&&expected.uuid===item.setup.bodyMaterials[0].uuid){expected.mode='screenCoordinates';expected.width=item.setup.factor;}assert.deepEqual(state.materials[i],expected,'Unexpected material mutation');}
    if(test.frames.length){const initial=test.frames[0].state;assert.equal(state.simulationTime,initial.simulationTime);assert.equal(state.camera.mode,initial.camera.mode);state.cameraNumericDrift=Math.max(...['position','target'].flatMap(k=>state.camera[k].map((v,i)=>Math.abs(v-initial.camera[k][i]))));assert(state.cameraNumericDrift<=1e-12);}
    const filename=[body,camera,stage].join('-')+'.png';await page.locator('.viewport').screenshot({path:path.join(out,filename)});test.frames.push({stage,filename,state});
   }
  }item.finalIdentity=await verifyCandidate(page,{build,...id});await page.close();
 }}catch(e){report.failure=String(e);process.exitCode=1;}
 finally{await browser.close();report.browserClosed=true;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(out);console.log(JSON.stringify({failure:report.failure,errors:report.errors,bodies:report.bodies.map(x=>({body:x.body,views:x.cases.length,factor:x.setup?.factor}))}));}
})().catch(e=>{console.error(e);process.exitCode=1;});
