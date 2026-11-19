// Final palette/framing-only affected checks. Prior b44 failure/race/peer evidence stays b44.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const BUILD='8b9023a1e89c',base='http://127.0.0.1:4196/';
let out;
const bodies={female:['beta-base-female-m1','027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'],male:['beta-base-male-m1b','62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'],'m1a-jaw-v1':['m1a-jaw-v1','3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011'],'m1a-waisthip-v1':['m1a-waisthip-v1','10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5'],'m2-male-jaw-v1':['m2-male-jaw-v1','25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153']};
const report={build:BUILD,viewport:{width:1600,height:1000},started:new Date().toISOString(),checks:[],identities:[],screenshots:[],movies:[],errors:[],status:'running',scope:'Only changed palette/framing plus requested bob/tinted full dance and same simulation-time variant screenshots. b44 race/503/dual-instance checks not relabeled.'};
const save=()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
async function check(name,fn){try{report.checks.push({name,passed:true,result:await fn()});}catch(e){report.checks.push({name,passed:false,error:String(e),stack:e.stack});console.error(name,e);}await save();}
async function select(page,id,value){await page.locator(id).selectOption(value);await page.waitForFunction(()=>!document.querySelector('#appearance-fields').disabled);}
async function view(page,framing,direction){await page.locator(`[data-inspect-framing="${framing}"]`).click();await page.locator(`[data-inspect-direction="${direction}"]`).click();}
async function shot(page,name){await page.screenshot({path:path.join(out,name+'.png')});report.screenshots.push({file:name+'.png',state:await page.evaluate(()=>({appearance:__debug.avatar().appearance.getState(),body:__debug.avatar().getAssetProfile(),snapshot:__debug.snapshot(),live:__debug.avatar().livePresentation.getState()}))});}
async function material(page,retain){return page.evaluate(async retain=>{const a=__debug.avatar();let all=[];a.vrm.scene.traverse(o=>{if(o.isMesh)for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(/_(Body|Face)_\d+_SKIN|_HAIR|_FaceBrow_/.test(m.name))all.push(m);});all=[...new Set(all)];if(retain)window.__originalMats=all;
 const rows=[];for(const m of(retain?all:window.__originalMats)){let pixels=null;if(m.map?.image){const im=m.map.image,c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);pixels=[...new Uint8Array(await crypto.subtle.digest('SHA-256',ctx.getImageData(0,0,c.width,c.height).data))].map(v=>v.toString(16).padStart(2,'0')).join('');}rows.push({name:m.name,uuid:m.uuid,color:m.color.toArray(),shade:m.shadeColorFactor?.toArray(),map:m.map?.uuid,source:m.map?.source.uuid,pixels});}return rows;},retain);}
async function startTrace(page){await page.evaluate(()=>{const d=__debug,a=d.avatar(),camera=d.cameraObject(),V=a.root.position.constructor,q=window.__finalAppearance={start:performance.now(),last:null,rows:[],running:true};const bones=['head','leftMiddleDistal','rightMiddleDistal','leftFoot','rightFoot'].map(n=>[n,a.vrm.humanoid.getRawBoneNode(n)]);function tick(now){if(!q.running)return;const s=d.snapshot(),live=a.livePresentation.getState();q.rows.push({t:(now-q.start)/1000,dt:q.last===null?null:(now-q.last)/1000,simulationTime:s.simulationTime,mode:s.mode,dance:s.motion.dance,appearance:s.appearance,camera:s.camera,task:d.tasks().active(),live:{time:live.time,preset:live.preset,speaking:live.speaking,gaze:live.gaze},expressions:Object.fromEntries(['blink','aa','happy'].map(n=>[n,a.vrm.expressionManager.getValue(n)])),screenBones:Object.fromEntries(bones.map(([n,b])=>[n,b?.getWorldPosition(new V()).project(camera).toArray()]))});q.last=now;requestAnimationFrame(tick);}requestAnimationFrame(tick);});}
async function endVideo(page,context,name,video){const trace=await page.evaluate(()=>{const q=window.__finalAppearance;q.running=false;return{start:q.start,rows:q.rows};});await fs.writeFile(path.join(out,name+'-trace.json'),JSON.stringify(trace));await context.close();await video.saveAs(path.join(out,name+'.webm'));report.movies.push({file:name+'.webm',trace:name+'-trace.json',frameCount:trace.rows.length,scope:'Full original page 1600x1000, normal 1x. Loading/setup before trace and idle exit retained.'});await save();return trace;}
(async()=>{
 const project=await productionRoot();
 out=await projectOutput(process.argv[2]??path.join(project,'evidence','m2-appearance-workbench-'+BUILD),project);
 await fs.mkdir(path.dirname(out),{recursive:true});
 await fs.mkdir(out);await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));await save();
 const {browser,close}=await launchQABrowser(out,{channel:'chrome'});
 async function open(body,record=false){const context=await browser.newContext({viewport:report.viewport,...(record?{recordVideo:{dir:path.join(out,'raw-video'),size:report.viewport}}:{})});const page=await context.newPage();page.on('pageerror',e=>report.errors.push({body,error:String(e)}));await page.goto(base+'?body='+body+'&workbench=appearance');await page.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-fields').disabled,null,{timeout:60000});report.identities.push(await verifyCandidate(page,{build:BUILD,assetId:bodies[body][0],sha256:bodies[body][1]}));return{context,page};}
 try{
  let {page,context}=await open('female',true);let video=page.video();const original=await material(page,true);await startTrace(page);
  await check('female near-view actual UI bob/colors/expressions/speaking/gaze/reset',async()=>{
   await select(page,'#appearance-hair-style','female-bob-v1');await select(page,'#appearance-hair-color','brown');await select(page,'#appearance-skin-tone','warm');await page.locator('[data-expression="neutral"]').click();await view(page,'face','front');await page.waitForTimeout(1500);await shot(page,'female-bob-brown-warm-neutral-front');
   await page.locator('[data-expression="aa"]').click();await page.waitForTimeout(1200);await shot(page,'female-bob-brown-warm-aa-front');
   await page.locator('[data-expression="happy"]').click();await page.waitForTimeout(1200);await shot(page,'female-bob-brown-warm-happy-front');
   await page.getByRole('button',{name:'讲话演示',exact:true}).click();await view(page,'face','side');await page.getByRole('button',{name:'看向镜头',exact:true}).click();await page.waitForTimeout(2100);await shot(page,'female-bob-brown-warm-speaking-side');
   await select(page,'#appearance-hair-color','blonde');await select(page,'#appearance-skin-tone','deep');await page.waitForTimeout(1600);await shot(page,'female-bob-blonde-deep-speaking-side');
   await view(page,'face','front');await page.getByRole('button',{name:'看向镜头',exact:true}).click();await page.waitForTimeout(2000);await shot(page,'female-bob-blonde-deep-speaking-front');
   await view(page,'half','front');await page.waitForTimeout(1600);await shot(page,'female-deep-half-neck-hands');
   await page.getByRole('button',{name:'停止讲话',exact:true}).click();await page.locator('[data-expression="neutral"]').click();await page.locator('#appearance-reset').click();await page.waitForFunction(()=>!document.querySelector('#appearance-fields').disabled);await view(page,'face','front');await page.waitForTimeout(1500);await shot(page,'female-reset-front');
   const restored=await material(page,false);assert.deepEqual(restored,original);return{original,restored,state:await page.evaluate(()=>__debug.avatar().appearance.getState())};
  });let trace=await endVideo(page,context,'female-appearance-speaking-1x',video);
  report.checks.push({name:'automatic blink and speaking present in captured real-time trace',passed:trace.rows.some(x=>x.expressions.blink>.8)&&trace.rows.some(x=>x.live.speaking&&x.expressions.aa>.1),result:{maxBlink:Math.max(...trace.rows.map(x=>x.expressions.blink)),gazeSamples:trace.rows.filter(x=>x.live.gaze).length}});await save();
  for(const body of ['female','male']){
   ({page,context}=await open(body,true));video=page.video();
   await check(body+' tinted default original 30s full-front',async()=>{
    if(body==='female'){await select(page,'#appearance-hair-style','female-bob-v1');await select(page,'#appearance-hair-color','brown');await select(page,'#appearance-skin-tone','warm');}else await select(page,'#appearance-skin-tone','deep');
    await view(page,'full','front');await page.evaluate(()=>{__debug.setPlaybackRate(1);__debug.setHelpers(false);__debug.setDynamics(true);});assert.equal(await page.locator('select[aria-label="舞蹈样件"]').inputValue(),'rokoko-5359146-30s-v1');await startTrace(page);
    const request=await page.evaluate(()=>__debug.command({type:'action',name:'dance',requestId:'final-appearance-30s'}));
    await page.waitForFunction(()=>['completed','failed','cancelled'].includes(__debug.tasks().get('final-appearance-30s')?.state),null,{timeout:50000});await page.waitForTimeout(600);
    const final=await page.evaluate(()=>({snapshot:__debug.snapshot(),task:__debug.tasks().get('final-appearance-30s'),appearance:__debug.avatar().appearance.getState()}));assert.equal(final.task.state,'completed');assert.equal(final.snapshot.mode,'idle');await shot(page,body+'-dance-ended');return{request,final};
   });trace=await endVideo(page,context,body+'-original-30s-1x',video);
   const dance=trace.rows.filter(x=>x.mode==='dance');const maxY=Math.max(...dance.flatMap(x=>['leftMiddleDistal','rightMiddleDistal'].map(n=>x.screenBones[n]?.[1]??-Infinity)));report.checks.push({name:body+' dance full clock and hand-bone framing',passed:Math.max(...trace.rows.map(x=>x.dance.time))>=30&&maxY<1,result:{maxDanceClock:Math.max(...trace.rows.map(x=>x.dance.time)),maxHandNDCY:maxY,limit:'Hand bone projection only; actual image review needed for fingertips/outline.'}});await save();
  }
  for(const body of Object.keys(bodies)){
   ({page,context}=await open(body));await check(body+' identical numerical idle time views',async()=>{
    await page.evaluate(()=>{__debug.setPaused(true);__debug.reset();__debug.setDynamics(false);__debug.command({type:'expression',name:'neutral'});const c=__debug.game.scene.getScene('CharacterStudio');for(let i=0;i<144;i++)c.simulate(1/120);});
    for(const frame of ['face','half'])for(const dir of ['front','side']){await view(page,frame,dir);await shot(page,`${body}-same-time-${frame}-${dir}`);}
    const records=[];if(['female','m1a-waisthip-v1'].includes(body)){await page.locator('[data-body-mode="base"]').click();for(const dir of ['front','side']){await view(page,'half',dir);await shot(page,`${body}-base-neutral-half-${dir}`);}records.push(await page.evaluate(()=>__debug.avatar().getDebugState()));}
    if(body==='male'){const baseline=await material(page,true);await select(page,'#appearance-skin-tone','deep');await view(page,'face','side');await shot(page,'male-deep-face-side');await view(page,'half','front');await shot(page,'male-deep-half-neck-hands');const active=await material(page,false);assert(active.some((m,i)=>m.color.some((v,k)=>v!==baseline[i].color[k])));await page.locator('#appearance-reset').click();await page.waitForFunction(()=>!document.querySelector('#appearance-fields').disabled);assert.deepEqual(await material(page,false),baseline);records.push({colorChanged:true,sourceRestored:true});}
    const s=await page.evaluate(()=>({simulationTime:__debug.snapshot().simulationTime,appearance:__debug.avatar().appearance.getState(),live:__debug.avatar().livePresentation.getState()}));assert(Math.abs(s.simulationTime-1.2)<1e-8);return{s,records};
   });await context.close();
  }
  report.status=report.checks.every(x=>x.passed)&&!report.errors.length?'technical-passed-review-pending':'failures-preserved';
 }catch(e){report.fatal=String(e);report.status='incomplete';throw e;}finally{await close();report.finished=new Date().toISOString();await save();console.log(out);}
})().catch(e=>{console.error(e);process.exitCode=1;});
