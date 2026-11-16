// Same-room original/derived rest-proportion comparison, using shared runtime.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const cases=[{body:'male',id:'beta-base-male-m1b',sha:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',outfit:2},
 {body:'m2-male-lower-leg-v1',id:'m2-male-lower-leg-v1',sha:'968a9d997683cd99de4eea8f77965184eea6d7bc639a6ae062085928325189d8',outfit:0}];
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true}),report={build,bodies:[],errors:[],status:'running',scope:'Development PC; sampled posed sole extrema are not continuous collision detection or human acceptance'};
 try{for(const c of cases){
  const dir=path.join(out,c.body);await fs.mkdir(dir);const ctx=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}}),p=await ctx.newPage();
  const row={body:c.body,stages:[]};report.bodies.push(row);p.on('pageerror',e=>report.errors.push(String(e)));
  try{
   await p.goto(url+'?body='+c.body+'&workbench=appearance');await p.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
   row.identity=await verifyCandidate(p,{build,sha256:c.sha,assetId:c.id});
   assert.equal((await p.evaluate(n=>__debug.setOutfit(n),c.outfit)).applied,true);
   const idle=()=>p.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.pending&&!s.target;},null,{timeout:45000});
   const shot=async name=>{await p.screenshot({path:path.join(dir,name+'.png')});row.stages.push({name,snapshot:await p.evaluate(()=>{const s=__debug.snapshot(),m=s.motion;return{mode:s.mode,chair:s.chair,position:s.position,bodyMode:__debug.avatar().appearance.getState().bodyMode,boneLengths:m.boneLengths,stride:m.stride,jogStride:m.jogStride,seatHeight:m.seatHeight,seatPelvisClearance:m.seatPelvisClearance,sourceGroundLift:m.sourceGroundLift,hipWorld:m.hipWorld,feet:m.feet};})});};
   await p.evaluate(()=>{__debug.setPlaybackRate(1);__debug.camera('inspect-full-side');__debug.setBodyMode('base');});await p.waitForTimeout(500);await shot('base-standing');
   await p.evaluate(()=>{__debug.camera('room');__debug.setSpeed(1.05);__debug.walkTo(1.25,1.8);});await idle();
   await p.evaluate(()=>{__debug.setBodyMode('dressed');__debug.camera('inspect-full-side');});await p.waitForTimeout(300);await shot('dressed-standing');
   await p.evaluate(()=>{
    window.__legSamples=[];window.__legSampling=true;let last=0;
    function sample(t){if(!window.__legSampling)return;if(t-last>=100){last=t;const s=__debug.snapshot(),a=__debug.avatar(),points=[];
     a.vrm.scene.traverse(n=>{if(n.isSkinnedMesh&&n.parent?.userData.equipmentId?.includes('shoes')&&n.parent.visible){let minY=Infinity;for(let i=0;i<n.geometry.attributes.position.count;i++){const v=n.position.clone();n.getVertexPosition(i,v);n.localToWorld(v);minY=Math.min(minY,v.y);}points.push(minY);}});
     __legSamples.push({t,mode:s.mode,phase:s.phase,position:s.position,frameMs:s.frameMs,sourceTime:s.motion.sourceTime,hip:s.motion.hipWorld,sit:s.motion.sitProgress,soleMinima:points,feet:s.motion.feet.map(f=>({side:f.side,contact:f.contact,slip:f.slip,contactPoint:f.contactPoint,reachClamp:f.reachClamp}))});}requestAnimationFrame(sample);}requestAnimationFrame(sample);
   });
   await p.evaluate(()=>{__debug.camera('room');__debug.setSpeed(1.05);__debug.walkTo(-1.25,1.8);});await idle();
   await p.evaluate(()=>{__debug.setSpeed(2.2);__debug.walkTo(1.3,1.7);});await p.waitForTimeout(700);await p.evaluate(()=>__debug.walkTo(-1.3,1.8));await idle();
   await p.evaluate(()=>__debug.action('sit'));await p.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:45000});
   await p.evaluate(()=>__debug.camera('inspect-full-side'));await p.waitForTimeout(500);await shot('seated');
   await p.evaluate(()=>{__debug.command({type:'speaking',value:true});__debug.command({type:'expression',name:'happy'});__debug.command({type:'gaze',target:__debug.cameraObject().position.toArray()});});await p.waitForTimeout(1500);
   await p.evaluate(()=>{__debug.command({type:'speaking',value:false});__debug.command({type:'expression',name:'neutral'});__debug.action('stand');});await idle();await shot('risen');
   await p.evaluate(()=>{__debug.camera('room');__debug.walkTo(-1,1.8);});await idle();
   row.dance=await p.evaluate(()=>__debug.request({requestId:'leg-dance',kind:'dance',payload:{danceId:'dance-technical-once-v1'}}));
   await p.waitForFunction(()=>['completed','failed','cancelled'].includes(__debug.tasks().get('leg-dance')?.state),null,{timeout:30000});
   assert.equal(await p.evaluate(()=>__debug.tasks().get('leg-dance').state),'completed');await idle();
   await p.evaluate(()=>{__legSampling=false;__debug.camera('inspect-face-front');__debug.command({type:'speaking',value:true});__debug.command({type:'expression',name:'happy'});});await p.waitForTimeout(2000);await shot('expression');
   const samples=await p.evaluate(()=>__legSamples);assert(samples.length>50);assert(samples.every(s=>s.soleMinima.length>0&&s.soleMinima.every(Number.isFinite)));await fs.writeFile(path.join(dir,'contact-samples.json'),JSON.stringify(samples));
   row.recipe=await p.evaluate(()=>__debug.exportAppearanceRecipe());await fs.writeFile(path.join(dir,'recipe.json'),row.recipe);delete row.recipe;
  }finally{const v=p.video();await ctx.close();await v.saveAs(path.join(dir,'normal1x.webm'));await v.delete();}
  const restored=await browser.newContext({viewport:{width:1440,height:900}});try{const p=await restored.newPage();await p.goto(url+'?body='+c.body+'&workbench=appearance');await p.waitForFunction(()=>__debug?.ready,null,{timeout:60000});const recipe=await fs.readFile(path.join(dir,'recipe.json'),'utf8');row.restore=await p.evaluate(text=>__debug.importAppearanceRecipe(text),recipe);assert.equal(row.restore.applied,true);assert.equal(await p.evaluate(()=>__debug.exportAppearanceRecipe()),recipe);}finally{await restored.close();}
 }
 assert.deepEqual(report.errors,[]);report.status='technical-checks-passed-visual-pending';
 }catch(e){report.error=String(e);report.status='failed-or-incomplete';throw e;}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({out,status:report.status}));
})().catch(e=>{console.error(e);process.exitCode=1;});
