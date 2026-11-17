const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const report={build,status:'running',checks:[],limits:['SwiftShader; not ordinary-PC performance, role C3 or human acceptance']};
let server,context,page;const errors=[];
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);}
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});console.log(name);}
async function fresh(){await page.waitForFunction(()=>company.session.scene.mirrorBindings().some(b=>b.fresh));}
async function aim(alternate=false){await page.evaluate(alternate=>{company.camera.position.set(...(alternate?[-.4,1.4,0]:[1.2,1.4,.5]));company.camera.lookAt(...(alternate?[-3.374,1.4,0]:[1.2,1.4,-2.499]));company.camera.updateMatrixWorld();company.session.scene.setWallView({mode:'full'});},alternate);await fresh();}
async function pixels(){return page.evaluate(()=>{
 const b=company.session.scene.mirrorBindings().find(b=>b.reflector),target=b?.reflector.getRenderTarget();if(!target)throw Error('No reflection target');
 const data=new Uint16Array(target.width*target.height*4);company.renderer.readRenderTargetPixels(target,0,0,target.width,target.height,data);
 let hash=0,nonzero=0;for(const x of data){hash=(Math.imul(hash,31)+x)>>>0;if(x)nonzero++;}
 return {hash,nonzero,target:{width:target.width,height:target.height,samples:target.samples,type:target.texture.type},binding:b.snapshot(),stats:company.mirrorController.snapshot()};
});}
(async()=>{
 await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
 await check('Four actual mirror contours render fresh host-scene pixels and survive separate browser restarts',async()=>{
  const result=[];
  for(let index=0;index<4;index++){
   await page.evaluate(index=>company.showAppearanceSample('mirror',index),index);await aim();await page.waitForTimeout(100);
   const before=await pixels();assert(before.nonzero>1000);assert.equal(before.target.width,512);assert.equal(before.target.samples,0);
   await page.screenshot({path:path.join(out,`mirror-${index+1}.png`)});await page.evaluate(()=>company.save());const doc=await page.evaluate(()=>company.session.document);
   await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),doc);await aim();await fresh();
   result.push({index,resource:doc.nodes.find(n=>n.id==='mirror/primary').resource,...before});
  }
  return result;
 });
 await check('A changing host object behind the main camera appears in actual reflection pixels',async()=>{
  await page.evaluate(()=>company.showAppearanceSample('mirror',1));await aim();
  const before=await pixels();
  const placement=await page.evaluate(()=>{
   let source;company.session.scene.root.traverse(n=>{if(!source&&n.isMesh&&n.geometry.type==='BoxGeometry')source=n;});
   if(!source){source=company.session.scene.root.getObjectByName('mirror/station/desk');source=source.getObjectByProperty('isMesh',true);}
   const mesh=source.clone();mesh.geometry=source.geometry.clone();mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox,center=box.getCenter(company.camera.position.clone()),size=box.getSize(company.camera.position.clone());mesh.geometry.translate(-center.x,-center.y,-center.z);mesh.scale.set(.45/size.x,.45/size.y,.45/size.z);mesh.quaternion.identity();mesh.position.set(1.2,1.4,1.7);mesh.name='MirrorQA:host-object';mesh.material=source.material.clone();mesh.material.color.set('#ff1a0a');mesh.material.emissive?.set('#660000');company.world.add(mesh);company.world.updateMatrixWorld(true);window.__mirrorProbe=mesh;
   const delta=mesh.position.clone().sub(company.camera.position),direction=company.camera.getWorldDirection(delta.clone());
   return {behindMainCamera:delta.dot(direction)<0,position:mesh.position.toArray(),camera:company.camera.position.toArray()};
  });assert(placement.behindMainCamera);await page.waitForTimeout(160);const red=await pixels();assert.notEqual(red.hash,before.hash);
  await page.screenshot({path:path.join(out,'offscreen-object-red.png')});
  await page.evaluate(()=>{__mirrorProbe.material.color.set('#0a2aff');__mirrorProbe.material.emissive?.set('#000066');});await page.waitForTimeout(160);const blue=await pixels();assert.notEqual(blue.hash,red.hash);
  await page.screenshot({path:path.join(out,'offscreen-object-blue.png')});
  await page.evaluate(()=>{company.camera.position.x+=.3;company.camera.lookAt(1.2,1.4,-2.499);company.camera.updateMatrixWorld();});await page.waitForTimeout(100);
  const shifted=await pixels();assert.notEqual(shifted.hash,blue.hash);
  const cameras=await page.evaluate(()=>{const b=company.session.scene.mirrorBindings().find(b=>b.reflector);return{host:company.camera.position.toArray(),virtual:b.reflector.getReflectionCamera(company.camera).position.toArray()};});
  assert(Math.abs(cameras.host[0]-cameras.virtual[0])<1e-6);assert(Math.abs((cameras.host[2]+cameras.virtual[2])/2+2.499)<1e-6);
  await page.evaluate(()=>{__mirrorProbe.removeFromParent();__mirrorProbe.geometry.dispose();__mirrorProbe.material.dispose();delete window.__mirrorProbe;});
  return{placement,before,red,blue,shifted,cameras};
 });
 await check('Side-wall mirror uses the same real plane and reflected host scene',async()=>{
  await page.evaluate(()=>company.load(company.layouts.mirrorAlternate));await aim(true);const p=await pixels();assert(p.nonzero>1000);
  const plane=await page.evaluate(()=>{const b=company.session.scene.mirrorBindings()[0],p=company.camera.position.clone();return {position:b.reflector.getWorldPosition(p).toArray(),normal:p.set(0,0,1).transformDirection(b.reflector.matrixWorld).toArray()};});
  assert(Math.abs(plane.position[0]+3.374)<1e-6);assert(Math.abs(plane.normal[0]-1)<1e-6);await page.screenshot({path:path.join(out,'side-wall.png')});return{plane,pixels:p};
 });
 await check('Hidden mirrors stop passes; building and two-floor views release targets without changing stored facts',async()=>{
  await page.evaluate(()=>company.load(company.layouts.mirrors));await aim();
  const original=await page.evaluate(()=>company.session.document);
  await page.evaluate(()=>{company.camera.position.set(1.2,1.4,-5);company.camera.lookAt(1.2,1.4,0);company.session.scene.setWallView({mode:'cutaway',cameraPosition:company.camera.position.toArray()});});
  await page.waitForTimeout(100);const hidden=await page.evaluate(()=>({mirror:company.session.scene.root.getObjectByName('mirror/primary').visible,stats:company.mirrorController.snapshot()}));
  assert.equal(hidden.mirror,false);assert.equal(hidden.stats.resources.live,0);await page.waitForTimeout(150);assert.equal((await page.evaluate(()=>company.mirrorController.snapshot())).reflectionPasses,hidden.stats.reflectionPasses);
  assert.deepEqual(await page.evaluate(()=>company.session.document),original);
  await page.evaluate(()=>company.showSpace('building'));assert.equal((await page.evaluate(()=>company.mirrorController.snapshot())).resources.live,0);
  await page.evaluate(()=>company.showSpace('floor',company.session.document.nodes[0].id));await aim();
  const two=structuredClone(original);two.id='mirror-two-floors';two.scale='building';two.nodes[0].parentId=two.id;
  const copied=structuredClone(original.nodes),ids=new Map(copied.map(n=>[n.id,'second/'+n.id]));
  for(const n of copied){n.id=ids.get(n.id);n.parentId=ids.get(n.parentId)||two.id;if(n.stationId)n.stationId=ids.get(n.stationId);if(n.id==='second/mirror/primary')n.resource={id:'mirror-grid',version:1};}
  two.nodes.push(...copied);await page.evaluate(async doc=>{await company.load(doc);await company.save();},two);
  const lifecycle=[];
  for(let i=0;i<3;i++)for(const floorId of [copied[0].id,two.nodes[0].id]){
   await page.evaluate(floorId=>company.showSpace('floor',floorId),floorId);await aim();const p=await pixels();assert.equal(p.stats.resources.live,1);lifecycle.push({floorId,owner:p.binding.id,resources:p.stats.resources});
  }
  assert.deepEqual(await page.evaluate(()=>company.session.document),two);await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),two);
  return{hidden,lifecycle};
 });
 await check('One host frame admits one reflection and multiple mirrors do not recursively allocate targets',async()=>{
  await page.evaluate(()=>company.load(company.layouts.mirrors));await aim();
  await page.evaluate(()=>company.apply([{type:'add-facility',id:'mirror/second',parentId:company.session.document.nodes[1].id,resource:{id:'mirror-round',version:1},transform:{position:[-.8,1.4,-2.525],yaw:0}}]));
  await aim();await page.evaluate(()=>company.pausePreview());
  const result=await page.evaluate(()=>{
   const c=company,bindings=c.session.scene.mirrorBindings(),before=c.mirrorController.snapshot(),timeMs=performance.now()+1000;
   const first=c.mirrorController.update(bindings,c.renderer,c.world,c.camera,{frameId:'qa-frame',timeMs});
   for(let i=0;i<5;i++)c.mirrorController.update(bindings,c.renderer,c.world,c.camera,{frameId:'qa-frame',timeMs:timeMs+i});
   const after=c.mirrorController.snapshot();return{before,first,after,bindings:bindings.map(b=>b.snapshot())};
  });assert.equal(result.after.reflectionPasses-result.before.reflectionPasses,1);assert.equal(result.after.resources.live,1);assert.equal(result.bindings.filter(b=>b.active).length,1);
  // Restart establishes a normal host-time sequence after the explicit future-time budget fixture.
  await context.close();context=null;await open();return result;
 });
 await check('A real nested-render exception rejects the candidate, rebuilds the renderer and preserves document/save',async()=>{
  await page.evaluate(()=>company.load(company.layouts.mirrors));await aim();await page.evaluate(()=>company.save());
  const result=await page.evaluate(async()=>{
   const c=company;await c.pausePreview();const before=JSON.stringify(c.session.document),saved=JSON.stringify({...localStorage}),oldRoot=c.session.scene.root,oldRenderer=c.renderer;
   let mesh;c.session.scene.root.traverse(n=>{if(!mesh&&n.isMesh&&!n.userData.companyMirrorSurface)mesh=n;});
   const probe=mesh.clone();probe.geometry=mesh.geometry.clone();probe.material=mesh.material.clone();probe.position.set(1.2,1.4,1.7);probe.scale.set(.2,.2,.2);probe.frustumCulled=false;c.world.add(probe);
   let thrown=false;probe.onBeforeRender=(renderer,scene,camera)=>{if(camera!==c.camera&&!thrown){thrown=true;throw Error('Expected actual nested-render failure');}};
   let code;try{await c.apply([{type:'replace-resource',id:'mirror/primary',resource:{id:'mirror-arch',version:1}}]);}catch(e){code=e.code;}
   probe.removeFromParent();probe.geometry.dispose();probe.material.dispose();
   return{code,thrown,documentPreserved:before===JSON.stringify(c.session.document),savePreserved:saved===JSON.stringify({...localStorage}),rootPreserved:oldRoot===c.session.scene.root,rendererRecreated:oldRenderer!==c.renderer,status:c.renderStatus(),targetNull:c.renderer.getRenderTarget()===null};
  });assert.equal(result.code,'mirror-renderer-reset-required');assert(result.thrown&&result.documentPreserved&&result.savePreserved&&result.rootPreserved&&result.rendererRecreated&&result.targetNull);
  await page.waitForTimeout(60);await page.evaluate(()=>company.drawHostFrame());await fresh();const recovered=await pixels();assert(recovered.nonzero>1000);await page.screenshot({path:path.join(out,'renderer-recovered.png')});return{result,recovered};
 });
 await check('A broken real mirror shader is rejected before replacing the current scene or saved bytes',async()=>{
  await page.evaluate(()=>company.load(company.layouts.mirrors));await aim();await page.evaluate(()=>company.save());
  const result=await page.evaluate(async()=>{
   const c=company,before=JSON.stringify(c.session.document),saved=JSON.stringify({...localStorage}),root=c.session.scene.root,preflight=c.mirrorController.preflight;
   c.mirrorController.preflight=function(bindings,...args){const b=bindings[0];b.activate();b.reflector.material.vertexShader='THIS IS INTENTIONALLY INVALID GLSL';b.reflector.material.needsUpdate=true;return preflight.call(this,bindings,...args);};
   let code;try{await c.apply([{type:'replace-resource',id:'mirror/primary',resource:{id:'mirror-grid',version:1}}]);}catch(e){code=e.code;}finally{c.mirrorController.preflight=preflight;}
   return{code,rootPreserved:root===c.session.scene.root,documentPreserved:before===JSON.stringify(c.session.document),savePreserved:saved===JSON.stringify({...localStorage}),stats:c.mirrorController.snapshot()};
  });assert.equal(result.code,'mirror-shader-failed');assert(result.rootPreserved&&result.documentPreserved&&result.savePreserved);assert.equal(result.stats.resources.live,1);
  await page.waitForTimeout(60);await page.evaluate(()=>company.drawHostFrame());const recovered=await pixels();assert(recovered.nonzero>1000);return{result,recovered};
 });
 await check('Actual WebGL canvas and bound-target scissor states survive the reflection prepass exactly',async()=>{
  const result=await page.evaluate(()=>{
   const c=company,r=c.renderer,gl=r.getContext(),bindings=c.session.scene.mirrorBindings(),owner=bindings.find(b=>b.reflector),ratio=r.getPixelRatio();
   const outcomes=[];const state=()=>({box:Array.from(gl.getParameter(gl.SCISSOR_BOX)),test:gl.getParameter(gl.SCISSOR_TEST)});
   try{
    r.setPixelRatio(1.5);r.setScissor(3,4,20,21);r.setScissorTest(true);const canvas=state();
    c.mirrorController.preflight(bindings,r,c.world,c.camera,{frameId:'gl-canvas',timeMs:performance.now()});outcomes.push({kind:'canvas',before:canvas,after:state()});
    r.setRenderTarget(owner.reflector.getRenderTarget());r.setScissor(7,8,9,10);r.setScissorTest(false);const target=state();
    c.mirrorController.preflight(bindings,r,c.world,c.camera,{frameId:'gl-target',timeMs:performance.now()});outcomes.push({kind:'target',before:target,after:state()});
   }finally{r.setRenderTarget(null);r.setPixelRatio(ratio);r.setSize(document.getElementById('stage').clientWidth,document.getElementById('stage').clientHeight);r.setScissor(0,0,r.domElement.clientWidth,r.domElement.clientHeight);r.setScissorTest(false);}
   return outcomes;
  });for(const r of result)assert.deepEqual(r.after,r.before);return result;
 });
 const samples=[];for(let i=0;i<10;i++){await page.waitForTimeout(40);samples.push(await page.evaluate(()=>{const start=performance.now();company.drawHostFrame();return{hostSubmissionMs:performance.now()-start,reflection:company.mirrorController.snapshot().lastReflection,main:{...company.renderer.info.render}};}));}
 report.cost=await page.evaluate(()=>({controller:company.mirrorController.snapshot(),rendererMemory:company.renderer.info.memory,lastMainPass:{...company.renderer.info.render},pixelRatio:company.renderer.getPixelRatio(),context:company.renderer.getContext().getParameter(company.renderer.getContext().RENDERER),limits:['Main-pass and reflection counters are reported separately','Submission time is synchronous CPU wall time, not a GPU completion query or frame-rate benchmark','Target-object counts are not measured driver VRAM','SwiftShader tiny representative room; no ordinary-PC claim']}));report.cost.samples=samples;
 assert.deepEqual(errors,[]);report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)await server.close();report.pageErrors=errors;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
