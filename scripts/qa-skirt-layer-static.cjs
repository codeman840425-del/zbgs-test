// Same-pose GPU comparison for one local garment source edit. No animation pass.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const {expectations,verifyCandidate}=require('./qa-m1-common.cjs');
const [url,selector,outDir]=process.argv.slice(2);
if(!url||!['v4','layer1'].includes(selector)||!outDir)throw Error('fixed URL, v4/layer1 and fresh output required');
(async()=>{
 const out=path.resolve(outDir);await fs.mkdir(out,{recursive:true});
 try{await fs.access(path.join(out,'report.json'));throw Error('Refuse overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
 const report={selector,kind:'Paused static actual GPU diagnostic; not motion or performance acceptance',views:[],errors};
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push({text:m.text(),location:m.location()});});
 try{
  await page.goto(url+'?skirtSample='+selector+'&handTarget=authored');await page.waitForFunction(()=>window.__debug?.ready||document.querySelector('#loading')?.textContent.includes('角色加载失败'),null,{timeout:45000});
  if(!await page.evaluate(()=>!!window.__debug?.ready))throw Error(await page.locator('#loading').innerText());
  report.identity=await verifyCandidate(page,expectations());
  report.state=await page.evaluate(()=>{
   const d=__debug,a=d.avatar(),c=d.game.scene.getScene('CharacterStudio');d.reset();d.setPaused(true);d.setOutfit(1);d.setBodyMode('dressed');d.setDynamics(true);d.setCorrections('full');d.setPlaybackRate(1);
   const chair=d.snapshot().chair;a.root.position.set(...chair.approach);c.yaw=chair.yaw;a.root.rotation.y=c.yaw;d.motion().reset();a.update(0);a.root.updateMatrixWorld(true);a.resetSecondary?.();d.advance(2);
   const nodes=[];a.root.traverse(m=>{if(m.userData.diagnosticGarment)nodes.push({name:m.name,id:m.userData.diagnosticGarment,vertices:m.geometry.attributes.position.count,faces:m.geometry.index.count/3,skinned:m.isSkinnedMesh,visible:m.visible&&m.parent.visible});});
   const bones=[];a.vrm.scene.traverse(n=>{if(n.isBone)bones.push({name:n.name,matrix:n.matrixWorld.toArray()});});
   return {nodes,bones,snapshot:d.snapshot(),oldGuide:d.scene.getObjectsByProperty('name','M1_UniformSkirt_Constrained').length};
  });
  assert.equal(report.state.nodes.length,2);assert.equal(report.state.oldGuide,0);assert(report.state.nodes.every(n=>n.skinned&&n.visible));
  for(const view of ['front','side','back','room']){
   const state=await page.evaluate(view=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio');if(view==='room')c.cameraPreset('room',true);else d.view(view);d.renderer.render(d.scene,d.cameraObject());return {view,camera:d.cameraObject().matrixWorld.toArray(),projection:d.cameraObject().projectionMatrix.toArray(),simulationTime:d.snapshot().simulationTime};},view);
   await page.screenshot({path:path.join(out,view+'.png')});report.views.push(state);
  }
  report.nonFaviconErrors=errors.filter(e=>typeof e==='string'||!e.location?.url?.endsWith('/favicon.ico'));
  assert.equal(report.nonFaviconErrors.length,0);report.completed=true;
 }catch(error){report.failure=String(error);report.pageText=await page.locator('body').innerText().catch(()=>null);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({out,completed:report.completed,errors}));}
})().catch(e=>{console.error(e);process.exitCode=1;});
