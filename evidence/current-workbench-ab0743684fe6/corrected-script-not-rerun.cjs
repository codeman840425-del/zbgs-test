// Bounded published-entry and evidence-gallery smoke. No product writes.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const{chromium}=require('../prototype/node_modules/playwright');
const BUILD='ab0743684fe6',OUT=path.resolve('evidence/current-workbench-'+BUILD);
(async()=>{await fs.mkdir(OUT,{recursive:false});await fs.copyFile(__filename,path.join(OUT,'executed-script.cjs'));const browser=await chromium.launch({channel:'chrome',headless:true});
const R={build:BUILD,errors:[],httpErrors:[],failedRequests:[],gallery:[]};
const watch=p=>{p.on('pageerror',e=>R.errors.push(String(e)));p.on('response',r=>{if(r.status()>=400)R.httpErrors.push({url:r.url(),status:r.status()})});p.on('requestfailed',r=>R.failedRequests.push({url:r.url(),resourceType:r.resourceType(),error:r.failure()}))};
try{
 const p=await browser.newPage({viewport:{width:1600,height:1000}});watch(p);
 const response=await p.goto('http://127.0.0.1:4196/?workbench=appearance&body=female');
 await p.waitForFunction(()=>__debug?.ready&&!document.querySelector('#appearance-fields').disabled);
 R.headers=await response.allHeaders();assert.equal(R.headers['x-zbgs-candidate'],BUILD);
 R.served=await p.evaluate(async()=>{const r=await fetch('/build-info.json',{cache:'no-store'});if(!r.ok)throw Error('build HTTP '+r.status);return r.json()});
 R.runtime=await p.evaluate(()=>__debug.buildInfo);assert.equal(R.served.shortId,BUILD);assert.equal(R.runtime.shortId,BUILD);
 await p.locator('#appearance-eye-color').selectOption('green');await p.waitForFunction(()=>!document.querySelector('#appearance-fields').disabled&&__debug.avatar().appearance.getState().eyeColor==='green');
 const d=p.locator('#appearance-geometry');if(!await d.evaluate(n=>n.open))await d.locator('summary').click();
 R.mouthOptions=await p.locator('#mouth-width-sample option').evaluateAll(ns=>ns.map(n=>({value:n.value,text:n.textContent})));
 assert(R.mouthOptions.some(x=>x.value==='0.12'));
 await p.locator('#mouth-width-sample').selectOption('0.12');await p.waitForFunction(()=>__debug.avatar().facialGeometry.getState().mouthWidth===.12&&!document.querySelector('#appearance-fields').disabled);
 R.appearance=await p.evaluate(()=>({appearance:__debug.avatar().appearance.getState(),geometry:__debug.avatar().facialGeometry.getState()}));
 await p.screenshot({path:path.join(OUT,'public-green-mouth12.png')});
 R.beforeMove=await p.evaluate(()=>__debug.snapshot());await p.locator('[data-camera=room]').click();await p.waitForTimeout(650);
 const box=await p.locator('#phaser-stage canvas').boundingBox();await p.mouse.click(box.x+box.width*.52,box.y+box.height*.73);
 await p.waitForFunction(pos=>Math.hypot(...__debug.snapshot().position.map((v,i)=>v-pos[i]))>.1,R.beforeMove.position,{timeout:8000});
 R.afterMove=await p.evaluate(()=>__debug.snapshot());assert.equal(R.afterMove.camera.mode,'room');
 await p.screenshot({path:path.join(OUT,'public-room-moving.png')});await p.close();
 const g=await browser.newPage({viewport:{width:1600,height:1000}});watch(g);
 R.galleryURL='http://127.0.0.1:4174/evidence/appearance-repair-ab074/';await g.goto(R.galleryURL);
 const loaded=()=>g.waitForFunction(()=>{const i=document.querySelector('#picture');return i?.complete&&i.naturalWidth>0});
 await loaded();R.defaultPicture=await g.locator('#picture').evaluate(i=>({src:i.src,width:i.naturalWidth,height:i.naturalHeight}));
 await g.screenshot({path:path.join(OUT,'evidence-page-default.png')});
 for(const body of ['female','male'])for(const topic of ['iris','face','side'])for(const version of ['old','new']){
  await g.locator(`[data-body=${body}]`).click();await g.locator('#topic').selectOption(topic);await g.locator(`[data-version=${version}]`).click();await loaded();
  R.gallery.push({body,topic,version,...await g.locator('#picture').evaluate(i=>({src:i.src,width:i.naturalWidth,height:i.naturalHeight}))});
 }
 // Browser may cancel metadata preloads. Keep them recorded; they are not image/JS/HTTP errors.
 R.metadataAborts=R.failedRequests.filter(x=>x.resourceType==='media'&&x.error?.errorText==='net::ERR_ABORTED'&&/^http:\/\/127\.0\.0\.1:4174\/evidence\/visible-face-final-ab074\/(female|male)-geometry-color-live-1x\.webm$/.test(x.url));
 R.blockingFailedRequests=R.failedRequests.filter(x=>!R.metadataAborts.includes(x));
 assert.equal(R.errors.length,0);assert.equal(R.httpErrors.length,0);assert.equal(R.blockingFailedRequests.length,0);
 R.passed=true;R.scope='Published identity + green/+12 UI + actual room floor movement; evidence-page images. Not full regression/visual acceptance.';
}catch(e){R.passed=false;R.failure=String(e);process.exitCode=1;console.error(e)}finally{await browser.close();await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(R,null,2));console.log('CLOSED',OUT,R.passed)}})();
