// Isolated fixed GPU diagnostic. Does not claim admission or author sitting poses.
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),toolRoot=process.env.QA_RUNTIME_ROOT||root;
const {chromium}=require(path.join(toolRoot,'prototype/node_modules/playwright'));
const {expectations,verifyCandidate}=require(path.join(toolRoot,'scripts/qa-m1-common.cjs'));
(async()=>{
 const out=path.join(root,'output/playwright/simple-skirt-v4',Date.now().toString());await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});let context;const errors=[],httpErrors=[];const report={out,status:'diagnostic-incomplete',limits:['No sitting garment response authored.','Static top/self/weight gates failed; GPU visibility diagnostic only.']};
 try{
  context=await browser.newContext({viewport:{width:1440,height:1080},recordVideo:{dir:out,size:{width:1440,height:1080}}});const page=await context.newPage();
  page.on('response',r=>{if(r.status()>=400)httpErrors.push({status:r.status(),url:r.url()});});
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push({text:m.text(),location:m.location()});});
  await page.goto(process.argv[2]+'?skirtSample=v4&handTarget=authored');await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:45000});
  report.identity=await verifyCandidate(page,expectations());
  report.initial=await page.evaluate(traceEnabled=>{
   const d=__debug,a=d.avatar(),c=d.game.scene.getScene('CharacterStudio');d.reset();d.setPaused(true);d.setOutfit(1);d.setBodyMode('dressed');d.setDynamics(true);d.setCorrections('full');d.setPlaybackRate(1);
   const chair=d.snapshot().chair;a.root.position.set(...chair.approach);c.yaw=chair.yaw;a.root.rotation.y=c.yaw;d.motion().reset();a.update(0);a.root.updateMatrixWorld(true);a.resetSecondary?.();d.advance(2);d.view('front');
   const p=a.profile,refs=p.motion.seatHandSurfaces(false),V=a.root.position.constructor,v=new V();
   const visible=m=>{for(let n=m;n;n=n.parent)if(!n.visible)return false;return true;};
   const describe=m=>({uuid:m.uuid,name:m.name,visible:visible(m),skinned:m.isSkinnedMesh,vertices:m.geometry.attributes.position.count,triangles:m.geometry.index.count/3,groups:m.geometry.groups,material:(Array.isArray(m.material)?m.material:[m.material]).map(x=>({name:x.name,alphaTest:x.alphaTest,side:x.side})),privateNodes:m.skeleton.bones.filter(b=>b.name.includes(':private:')).map(b=>b.name)});
   const actual=[];a.root.traverse(m=>{if(m.isSkinnedMesh&&visible(m))actual.push(describe(m));});
   const positions=m=>{const arr=[];for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,v).applyMatrix4(m.matrixWorld);arr.push(...v.toArray());}return arr;};
   window.__skirtTrace=[];let prepared=null;const query=p.motion.seatHandSurfaces;
   if(traceEnabled)p.motion.seatHandSurfaces=function(refresh=true){const result=query(refresh);if(refresh)prepared=result.map(m=>({mesh:m,positions:positions(m)}));return result;};
   const simulate=c.simulate;if(traceEnabled)c.simulate=function(dt){prepared=null;const result=simulate.call(c,dt);if(prepared){const metrics=d.motion().getMetrics();const entries=prepared.map(({mesh,positions:pre})=>{const final=positions(mesh);let max=0,sum=0,changed=0,index=-1;for(let i=0;i<pre.length;i+=3){const distance=Math.hypot(final[i]-pre[i],final[i+1]-pre[i+1],final[i+2]-pre[i+2]);sum+=distance;if(distance>1e-7)changed++;if(distance>max){max=distance;index=i/3;}}return{uuid:mesh.uuid,name:mesh.name,vertices:pre.length/3,maxMetres:max,meanMetres:sum/(pre.length/3),changed,index};});window.__skirtTrace.push({time:c.simulationTime,mode:c.mode,sitProgress:metrics.sitProgress,handContacts:metrics.handContacts,entries});}return result;};
   return{equipment:a.getOutfitInfo().equipment,meshRoles:p.meshRoles,queried:refs.map(describe),actualVisible:actual,radii:p.motion.seatHandRadii,oldGuideCount:d.scene.getObjectsByProperty('name','M1_UniformSkirt_Constrained').length,chair,traceEnabled};
  },!process.env.QA_MOVIE_ONLY);
  if(report.initial.queried.length!==2||report.initial.meshRoles.skirt.length!==2||report.initial.oldGuideCount!==0)throw Error('Actual two-primitive/exclusive adapter contract failed');
  report.movie=[];
  for(const view of (process.env.QA_LIVE_ONLY?[]:['front','side'])){
   const start=await page.evaluate(view=>{__debug.view(view);__debug.setPaused(false);return{wall:performance.now(),simulation:__debug.snapshot().simulationTime};},view);
   await page.waitForTimeout(700);await page.screenshot({path:path.join(out,`${view}-standing.png`)});
   await page.evaluate(()=>__debug.action('sit'));await page.waitForTimeout(550);await page.screenshot({path:path.join(out,`${view}-sit-in.png`)});
   await page.waitForTimeout(1900);await page.screenshot({path:path.join(out,`${view}-seated.png`)});
   report.movie.push(await page.evaluate(()=>({snapshot:__debug.snapshot(),camera:__debug.cameraObject().matrixWorld.toArray()})));
   await page.evaluate(()=>__debug.action('stand'));await page.waitForTimeout(550);await page.screenshot({path:path.join(out,`${view}-rise.png`)});
   await page.waitForTimeout(1900);await page.screenshot({path:path.join(out,`${view}-standing-end.png`)});const end=await page.evaluate(()=>({wall:performance.now(),simulation:__debug.snapshot().simulationTime}));report.movie.at(-1).timing={view,start,end,wallSeconds:(end.wall-start.wall)/1000,simulationSeconds:end.simulation-start.simulation,ratio:(end.simulation-start.simulation)/((end.wall-start.wall)/1000)};
  }
  await page.evaluate(()=>__debug.setPaused(true));
  if(process.env.QA_LIVE_ONLY){
   report.liveStages=await page.evaluate(()=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar(),stages=[];c.action('sit');for(let i=0;i<300;i++)c.simulate(1/120);for(const speaking of [true,false]){a.livePresentation.setSpeaking(speaking);const start=window.__skirtTrace.length;for(let i=0;i<240;i++)c.simulate(1/120);stages.push({speaking,sampled:window.__skirtTrace.length-start,state:a.livePresentation.getState(),motion:d.motion().getMetrics()});}return stages;});
   await page.screenshot({path:path.join(out,'live-seated-end.png')});
  }
  const trace=await page.evaluate(()=>window.__skirtTrace);await fs.writeFile(path.join(out,'surface-trace.json'),JSON.stringify(trace));
  report.surfaceComparison={sampledSubsteps:trace.length,byMesh:report.initial.queried.map(m=>{const entries=trace.flatMap(f=>f.entries.filter(e=>e.uuid===m.uuid));return{uuid:m.uuid,name:m.name,samples:entries.length,maximumMetres:entries.length?Math.max(...entries.map(e=>e.maxMetres)):null,changedFrames:entries.filter(e=>e.changed).length};}),framesWithHandRecords:trace.filter(f=>f.handContacts?.length).length};
  report.finalIdentity=await verifyCandidate(page,expectations());report.httpErrors=httpErrors;report.errors=errors;report.status=errors.length?'runtime-errors':'diagnostic-ran-not-admitted';
  const video=page.video();await context.close();context=null;await video.saveAs(path.join(out,'front-side-sit-rise-1x.webm'));
 }catch(error){report.error=String(error);report.errors=errors;throw error;}
 finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));if(context)await context.close();await browser.close();console.log(JSON.stringify({out,status:report.status,surfaceComparison:report.surfaceComparison,errors}));}
})().catch(e=>{console.error(e);process.exitCode=1;});
