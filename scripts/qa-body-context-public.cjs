const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const build='460b72813f68';
(async()=>{
 const project=await productionRoot();
 const out=await projectOutput(process.argv[2] || path.join(project,'evidence/current-workbench-460b72813f68'),project);
 const evidenceFile=name=>projectOutput(path.join(out,name),out);

 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,await evidenceFile('executed-script.cjs'));
 const r={build,errors:[],videos:[],scope:'Published header/runtime, actual face edit and room movement, two evidence videos playing >=2s. Not full visual or performance acceptance.'};
 let session;
 try{
  session=await launchQABrowser(out,{channel:'chrome',headless:true});
  const {browser}=session;
  const p=await browser.newPage({viewport:{width:1600,height:1000}});p.on('pageerror',e=>r.errors.push(String(e)));
  const response=await p.goto('http://127.0.0.1:4196/?workbench=appearance');assert.equal((await response.allHeaders())['x-zbgs-candidate'],build);
  await p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-fields').disabled);assert.equal(await p.evaluate(()=>__debug.buildInfo.shortId),build);
  const details=p.locator('#appearance-geometry');if(!await details.evaluate(n=>n.open))await details.locator('summary').click();
  await p.locator('#mouth-width-sample').selectOption('0.12');await p.waitForFunction(()=>__debug.avatar().facialGeometry.getState().mouthWidth===.12&&!document.querySelector('#appearance-fields').disabled);
  r.before=await p.evaluate(()=>__debug.snapshot().position);await p.locator('[data-camera=room]').click();await p.waitForTimeout(650);
  const b=await p.locator('#phaser-stage canvas').boundingBox();await p.mouse.click(b.x+b.width*.52,b.y+b.height*.73);
  await p.waitForFunction(pos=>Math.hypot(...__debug.snapshot().position.map((v,i)=>v-pos[i]))>.1,r.before,{timeout:8000});r.after=await p.evaluate(()=>__debug.snapshot().position);
  await p.screenshot({path:await evidenceFile('room-moving.png')});
  const response2=await p.goto('http://127.0.0.1:4174/evidence/body-context-guard-delivery-v1/');assert.equal(response2.status(),200);assert.equal(await p.locator('video').count(),2);
  for(let i=0;i<2;i++){
   const v=p.locator('video').nth(i);await v.scrollIntoViewIfNeeded();
   await v.evaluate(async v=>{v.muted=true;v.playbackRate=1;await v.play();});
   await p.waitForFunction(i=>{const v=document.querySelectorAll('video')[i];return v.currentTime>=2&&!v.error;},i,{timeout:15000});
   r.videos.push(await v.evaluate(v=>{v.pause();return{src:v.currentSrc,time:v.currentTime,rate:v.playbackRate,width:v.videoWidth,height:v.videoHeight,error:v.error?.code||null};}));
  }
  assert.equal(r.errors.length,0);r.status='passed';
 }catch(e){r.status='failed';r.failure=String(e);process.exitCode=1;console.error(e);}
 finally{await session?.close();await fs.writeFile(await evidenceFile('report.json'),JSON.stringify(r,null,2));console.log(JSON.stringify({out,status:r.status}));}
})().catch(e=>{console.error(e);process.exitCode=1});
