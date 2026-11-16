const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [build,evidencePath,outPath]=process.argv.slice(2);assert(/^[a-f0-9]{12}$/.test(build));assert(/^\/evidence\/[a-z0-9-]+\/$/.test(evidencePath));assert(outPath);const out=path.resolve(outPath);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const r={build,errors:[],videos:[],scope:'Published header/runtime, actual face edit and room movement, two evidence videos playing >=2s. Not full visual or performance acceptance.'};
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1600,height:1000}});p.on('pageerror',e=>r.errors.push(String(e)));
  const response=await p.goto('http://127.0.0.1:4196/?workbench=appearance');assert.equal((await response.allHeaders())['x-zbgs-candidate'],build);
  await p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-fields').disabled);assert.equal(await p.evaluate(()=>__debug.buildInfo.shortId),build);
  const details=p.locator('#appearance-geometry');if(!await details.evaluate(n=>n.open))await details.locator('summary').click();
  await p.locator('#mouth-width-sample').selectOption('0.12');await p.waitForFunction(()=>__debug.avatar().facialGeometry.getState().mouthWidth===.12&&!document.querySelector('#appearance-fields').disabled);
  r.before=await p.evaluate(()=>__debug.snapshot().position);await p.locator('[data-camera=room]').click();await p.waitForTimeout(650);
  const b=await p.locator('#phaser-stage canvas').boundingBox();await p.mouse.click(b.x+b.width*.52,b.y+b.height*.73);
  await p.waitForFunction(pos=>Math.hypot(...__debug.snapshot().position.map((v,i)=>v-pos[i]))>.1,r.before,{timeout:8000});r.after=await p.evaluate(()=>__debug.snapshot().position);
  await p.screenshot({path:path.join(out,'room-moving.png')});
  if(process.argv.includes('--jaw-hair')){
   await p.locator('[data-appearance-group=male]').click();
   await p.waitForFunction(()=>__debug.avatar().profile.bodyType==='male'&&!document.querySelector('#appearance-identity-fields').disabled);
   await p.locator('#appearance-body').selectOption('m2-male-jaw-v1');
   await p.waitForFunction(()=>__debug.avatar().profile.bodyType==='m2-male-jaw-v1'&&!document.querySelector('#appearance-fields').disabled);
   await p.locator('#appearance-hair-style').selectOption('male-sidepart-v1');
   await p.waitForFunction(()=>__debug.avatar().appearance.getState().hairStyle==='male-sidepart-v1'&&!document.querySelector('#appearance-fields').disabled);
   r.jawHair=await p.evaluate(()=>__debug.avatar().appearance.getState());
   assert.equal(r.jawHair.hairFit.kind,'explicit-fit-v1');assert.equal(r.jawHair.hairFit.id,'male-sidepart-jaw-fit-v1');assert.equal(r.jawHair.hairFit.version,1);
   const pending=p.waitForEvent('download');await p.locator('#appearance-download').click();const download=await pending;
   const file=path.join(out,'public-male-jaw.v6.json');await download.saveAs(file);const recipe=JSON.parse(await fs.readFile(file,'utf8'));
   assert.equal(recipe.schema,'workbench-appearance-recipe-v6');assert.deepEqual(recipe.hairFit,r.jawHair.hairFit);
   await p.locator('[data-camera=close]').click();await p.waitForTimeout(650);await p.screenshot({path:path.join(out,'male-jaw-short-hair.png')});
   r.scope+=' Optional male-jaw actual UI short-hair selection and downloaded v6 fit identity checked.';
  }
  const response2=await p.goto('http://127.0.0.1:4174'+evidencePath);assert.equal(response2.status(),200);assert.equal(await p.locator('video').count(),2);
  for(let i=0;i<2;i++){
   const v=p.locator('video').nth(i);await v.scrollIntoViewIfNeeded();
   await v.evaluate(async v=>{v.muted=true;v.playbackRate=1;await v.play();});
   await p.waitForFunction(i=>{const v=document.querySelectorAll('video')[i];return v.currentTime>=2&&!v.error;},i,{timeout:15000});
   r.videos.push(await v.evaluate(v=>{v.pause();return{src:v.currentSrc,time:v.currentTime,rate:v.playbackRate,width:v.videoWidth,height:v.videoHeight,error:v.error?.code||null};}));
  }
  assert.equal(r.errors.length,0);r.status='passed';
 }catch(e){r.status='failed';r.failure=String(e);process.exitCode=1;console.error(e);}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(r,null,2));console.log(JSON.stringify({out,status:r.status}));}
})();
