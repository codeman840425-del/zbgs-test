const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg),report={build,status:'running',checks:[],limits:['SwiftShader, not ordinary-PC performance, character C3 or human final acceptance']};
let server,context,page;const errors=[];
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);}
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});console.log(name);}
async function aim(alternate=false){const previous=await page.evaluate(alternate=>{const passes=company.mirrorController.snapshot().reflectionPasses;company.camera.position.set(...(alternate?[.5,.92,0]:[1.5,.92,.5]));company.camera.lookAt(...(alternate?[-1.974,.92,0]:[1.5,.92,-1.474]));company.camera.updateMatrixWorld();company.session.scene.setWallView({mode:'full'});return passes;},alternate);await page.waitForFunction(previous=>company.mirrorController.snapshot().reflectionPasses>previous&&company.session.scene.mirrorBindings().some(b=>b.fresh),previous);}
async function pixels(){return page.evaluate(()=>{const b=company.session.scene.mirrorBindings().find(b=>b.reflector);if(!b)throw Error('No active mirror');const t=b.reflector.getRenderTarget(),data=new Uint16Array(t.width*t.height*4);company.renderer.readRenderTargetPixels(t,0,0,t.width,t.height,data);let hash=0,rgbNonzero=0,redPixels=0,bluePixels=0;for(let i=0;i<data.length;i+=4){for(let k=0;k<3;k++){const x=data[i+k];hash=(Math.imul(hash,31)+x)>>>0;if(x)rgbNonzero++;}if(data[i]>data[i+1]&&data[i]>data[i+2])redPixels++;if(data[i+2]>data[i]&&data[i+2]>data[i+1])bluePixels++;}return{hash,rgbNonzero,redPixels,bluePixels,owner:b.snapshot(),stats:company.mirrorController.snapshot()};});}
(async()=>{
 await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});await open();
 await check('Four real grounded stands render and recover exact resources in separate browser processes',async()=>{
  const results=[];
  for(let index=0;index<4;index++){
   await page.evaluate(index=>company.showAppearanceSample('floor-mirror',index),index);await page.waitForTimeout(100);await page.screenshot({path:path.join(out,`stand-${index+1}.png`)});await aim();
   const before=await pixels();assert(before.rgbNonzero>1000);await page.screenshot({path:path.join(out,`reflection-${index+1}.png`)});await page.evaluate(()=>company.save());const doc=await page.evaluate(()=>company.session.document);
   await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),doc);await aim();assert((await pixels()).rgbNonzero>1000);results.push({index,resource:doc.nodes.find(n=>n.id==='floor-mirror/primary').resource,...before});
  }return results;
 });
 await check('Real host object behind the main camera changes reflection pixels and obeys camera parallax',async()=>{
  await page.evaluate(()=>company.showAppearanceSample('floor-mirror',1));await aim();const before=await pixels();
  const placement=await page.evaluate(()=>{
   let source;company.session.scene.root.traverse(n=>{if(!source&&n.isMesh&&n.geometry.type==='BoxGeometry')source=n;});
   const mesh=source.clone();mesh.geometry=source.geometry.clone();mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox,center=box.getCenter(company.camera.position.clone()),size=box.getSize(company.camera.position.clone());mesh.geometry.translate(-center.x,-center.y,-center.z);mesh.scale.set(.4/size.x,.4/size.y,.4/size.z);mesh.quaternion.identity();mesh.position.set(1.5,.92,1.7);mesh.material=source.material.clone();mesh.material.color.set('#ff100a');mesh.material.emissive?.set('#660000');company.world.add(mesh);company.world.updateMatrixWorld(true);window.__floorMirrorProbe=mesh;
   return{behindMainCamera:mesh.position.clone().sub(company.camera.position).dot(company.camera.getWorldDirection(mesh.position.clone()))<0};
  });assert(placement.behindMainCamera);await page.waitForTimeout(120);const red=await pixels();report.reflectionProbe={placement,before,red};assert.notEqual(red.hash,before.hash);assert(red.redPixels>before.redPixels);await page.screenshot({path:path.join(out,'offscreen-red.png')});
  await page.evaluate(()=>{__floorMirrorProbe.material.color.set('#102aff');__floorMirrorProbe.material.emissive?.set('#000066');});await page.waitForTimeout(120);const blue=await pixels();report.reflectionProbe.blue=blue;assert.notEqual(blue.hash,red.hash);assert(blue.bluePixels>red.bluePixels);await page.screenshot({path:path.join(out,'offscreen-blue.png')});
  await page.evaluate(()=>{company.camera.position.x+=.25;company.camera.lookAt(1.5,.92,-1.474);company.camera.updateMatrixWorld();});await page.waitForTimeout(100);const shifted=await pixels();assert.notEqual(shifted.hash,blue.hash);
  const plane=await page.evaluate(()=>{const b=company.session.scene.mirrorBindings()[0],v=b.reflector.getReflectionCamera(company.camera).position;return{host:company.camera.position.toArray(),virtual:v.toArray(),position:b.reflector.getWorldPosition(v.clone()).toArray()};});assert(Math.abs((plane.host[2]+plane.virtual[2])/2+1.474)<1e-6);
  await page.evaluate(()=>{__floorMirrorProbe.removeFromParent();__floorMirrorProbe.geometry.dispose();__floorMirrorProbe.material.dispose();delete window.__floorMirrorProbe;});return{placement,before,red,blue,shifted,plane};
 });
 await check('Rotated stand keeps its physical footprint and actual reflection plane together',async()=>{
  await page.evaluate(()=>company.load(company.layouts.floorMirrorAlternate));await aim(true);const p=await pixels();assert(p.rgbNonzero>1000);
  const actual=await page.evaluate(()=>{const b=company.session.scene.mirrorBindings()[0],v=company.camera.position.clone();return{plane:b.reflector.getWorldPosition(v).toArray(),normal:v.set(0,0,1).transformDirection(b.reflector.matrixWorld).toArray(),obstacle:company.session.scene.snapshot().navigation.find(o=>o.instanceId==='floor-mirror/primary')};});
  assert(Math.abs(actual.plane[0]+1.974)<1e-6);assert(Math.abs(actual.plane[1]-.92)<1e-6);assert(Math.abs(actual.normal[0]-1)<1e-6);assert.equal(actual.obstacle.x,-2);await page.screenshot({path:path.join(out,'turned-stand.png')});return actual;
 });
 await check('Bad ground, rotation, overlap and real doorway obstruction keep the live scene and saved bytes',async()=>{
  await page.evaluate(async()=>{await company.load(company.layouts.floorMirrors);await company.save();});
  const result=await page.evaluate(async()=>{const before=JSON.stringify(company.session.document),saved=JSON.stringify({...localStorage}),root=company.session.scene.root,codes=[];
   for(const transform of [{position:[1.5,.1,-1.5],yaw:0},{position:[1.5,0,-1.5],yaw:.4},{position:[-1.2,0,0],yaw:0},{position:[0,0,2.175],yaw:0}])try{await company.apply([{type:'move',id:'floor-mirror/primary',transform}]);}catch(e){codes.push(e.code);}
   return{codes,unchanged:before===JSON.stringify(company.session.document)&&saved===JSON.stringify({...localStorage})&&root===company.session.scene.root};
  });assert.equal(result.codes.length,4);assert(result.codes.includes('blocked-portal'));assert(result.codes.includes('overlapping-facilities'));assert(result.unchanged);return result;
 });
 await check('Wall and floor mirrors share one controller budget; focusing public space releases detailed targets without changing obstacles',async()=>{
  await page.evaluate(()=>company.apply([{type:'add-facility',id:'wall-mirror/secondary',parentId:company.session.document.nodes[1].id,resource:{id:'mirror-full',version:1},transform:{position:[1.5,.92,-2.525],yaw:0}}]));await aim();await page.waitForTimeout(100);
  const mixed=await page.evaluate(()=>({bindings:company.session.scene.mirrorBindings().map(b=>b.snapshot()),stats:company.mirrorController.snapshot()}));assert.equal(mixed.bindings.length,2);assert.equal(mixed.bindings.filter(b=>b.active).length,1);assert.equal(mixed.stats.resources.live,1);
  await page.evaluate(()=>{company.camera.position.set(1.5,1.2,7);company.camera.lookAt(1.5,.92,-1.474);company.camera.updateMatrixWorld();company.session.scene.setWallView({mode:'cutaway',cameraPosition:company.camera.position.toArray()});});await page.waitForTimeout(80);
  const cutaway=await page.evaluate(()=>company.session.scene.mirrorBindings().find(b=>b.snapshot().id==='floor-mirror/primary').snapshot());assert(cutaway.active&&cutaway.fresh);const walls=await page.evaluate(()=>company.session.scene.wallPresentation());assert.equal(walls.effectiveMode,'cutaway');assert(walls.walls.some(w=>!w.visible));
  const before=await page.evaluate(()=>({document:company.session.document,navigation:company.session.scene.snapshot().navigation}));
  await page.evaluate(()=>company.showSpace('room',company.session.document.nodes[0].id,company.session.document.nodes.find(n=>n.kind==='area').id));await page.waitForTimeout(100);const hidden=await page.evaluate(()=>company.mirrorController.snapshot());assert.equal(hidden.resources.live,0);await page.waitForTimeout(100);assert.equal((await page.evaluate(()=>company.mirrorController.snapshot())).reflectionPasses,hidden.reflectionPasses);
  assert.deepEqual(await page.evaluate(()=>({document:company.session.document,navigation:company.session.scene.snapshot().navigation})),before);
  await page.evaluate(()=>company.showSpace('building'));assert.equal((await page.evaluate(()=>company.mirrorController.snapshot())).resources.live,0);await page.evaluate(()=>company.showSpace('floor',company.session.document.nodes[0].id));await aim();return{mixed,cutaway,walls,hidden};
 });
 await check('Two different floors keep resource identity and whole-company saves through repeated switches and restart',async()=>{
  await page.evaluate(()=>company.load(company.layouts.floorMirrors));const doc=await page.evaluate(()=>company.session.document),two=structuredClone(doc);two.id='floor-mirror-two-floors';two.scale='building';two.nodes[0].parentId=two.id;
  const copy=structuredClone(doc.nodes),ids=new Map(copy.map(n=>[n.id,'second/'+n.id]));for(const n of copy){n.id=ids.get(n.id);n.parentId=ids.get(n.parentId)||two.id;if(n.stationId)n.stationId=ids.get(n.stationId);if(n.connections)for(const c of n.connections){c.id='second/'+c.id;for(const side of ['from','to'])c[side].regionId=ids.get(c[side].regionId);}if(n.id==='second/floor-mirror/primary')n.resource={id:'floor-mirror-grid',version:1};}two.nodes.push(...copy);
  await page.evaluate(async doc=>{await company.load(doc);await company.save();},two);const snapshots=[];
  for(let i=0;i<3;i++)for(const floorId of [copy[0].id,two.nodes[0].id]){await page.evaluate(id=>company.showSpace('floor',id),floorId);await aim();const p=await pixels();assert.equal(p.stats.resources.live,1);snapshots.push({floorId,owner:p.owner.id,resources:p.stats.resources});}
  assert.deepEqual(await page.evaluate(()=>company.session.document),two);await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),two);return snapshots;
 });
 await check('A real nested-render exception rejects the candidate, rebuilds the renderer and preserves document/save',async()=>{
  await page.evaluate(()=>company.load(company.layouts.floorMirrors));await aim();await page.evaluate(()=>company.save());
  const result=await page.evaluate(async()=>{
   const c=company;await c.pausePreview();const before=JSON.stringify(c.session.document),saved=JSON.stringify({...localStorage}),oldRoot=c.session.scene.root,oldRenderer=c.renderer;
   let mesh;c.session.scene.root.traverse(n=>{if(!mesh&&n.isMesh&&!n.userData.companyMirrorSurface)mesh=n;});
   const probe=mesh.clone();probe.geometry=mesh.geometry.clone();probe.material=mesh.material.clone();probe.position.set(1.5,.92,1.7);probe.scale.set(.2,.2,.2);probe.frustumCulled=false;c.world.add(probe);
   let thrown=false;probe.onBeforeRender=(renderer,scene,camera)=>{if(camera!==c.camera&&!thrown){thrown=true;throw Error('Expected actual nested-render failure');}};
   let code;try{await c.apply([{type:'replace-resource',id:'floor-mirror/primary',resource:{id:'floor-mirror-arch',version:1}}]);}catch(e){code=e.code;}
   probe.removeFromParent();probe.geometry.dispose();probe.material.dispose();
   return{code,thrown,documentPreserved:before===JSON.stringify(c.session.document),savePreserved:saved===JSON.stringify({...localStorage}),rootPreserved:oldRoot===c.session.scene.root,rendererRecreated:oldRenderer!==c.renderer,status:c.renderStatus(),targetNull:c.renderer.getRenderTarget()===null};
  });assert.equal(result.code,'mirror-renderer-reset-required');assert(result.thrown&&result.documentPreserved&&result.savePreserved&&result.rootPreserved&&result.rendererRecreated&&result.targetNull);
  await page.waitForTimeout(60);await page.evaluate(()=>company.drawHostFrame());await page.waitForFunction(()=>company.session.scene.mirrorBindings().some(b=>b.fresh));const recovered=await pixels();assert(recovered.rgbNonzero>1000);await page.screenshot({path:path.join(out,'renderer-recovered.png')});return{result,recovered};
 });
 await check('A broken real mirror shader is rejected before replacing the current scene or saved bytes',async()=>{
  await page.evaluate(()=>company.load(company.layouts.floorMirrors));await aim();await page.evaluate(()=>company.save());
  const result=await page.evaluate(async()=>{
   const c=company,before=JSON.stringify(c.session.document),saved=JSON.stringify({...localStorage}),root=c.session.scene.root,preflight=c.mirrorController.preflight;
   c.mirrorController.preflight=function(bindings,...args){const b=bindings[0];b.activate();b.reflector.material.vertexShader='THIS IS INTENTIONALLY INVALID GLSL';b.reflector.material.needsUpdate=true;return preflight.call(this,bindings,...args);};
   let code;try{await c.apply([{type:'replace-resource',id:'floor-mirror/primary',resource:{id:'floor-mirror-grid',version:1}}]);}catch(e){code=e.code;}finally{c.mirrorController.preflight=preflight;}
   return{code,rootPreserved:root===c.session.scene.root,documentPreserved:before===JSON.stringify(c.session.document),savePreserved:saved===JSON.stringify({...localStorage}),stats:c.mirrorController.snapshot()};
  });assert.equal(result.code,'mirror-shader-failed');assert(result.rootPreserved&&result.documentPreserved&&result.savePreserved);assert.equal(result.stats.resources.live,1);
  await page.waitForTimeout(60);await page.evaluate(()=>company.drawHostFrame());const recovered=await pixels();assert(recovered.rgbNonzero>1000);return{result,recovered};
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
