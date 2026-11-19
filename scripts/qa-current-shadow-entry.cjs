// Public smoke only. Run after publication confirmation; does not start/stop public servers.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const BUILD='34e7745e78ab';
if(process.argv.includes('--plan')){console.log(JSON.stringify({build:BUILD,checks:['4196 header/build-info/runtime','UI green iris +12 mouth, room ground click actual displacement','4174 report actual F/M media playback >=2 seconds, no media errors'],browserStarted:false}));process.exit(0)}
(async()=>{
 const project=await productionRoot();
 const OUT=await projectOutput(process.argv[2] || path.join(project,'evidence/current-workbench-'+BUILD),project);
 const evidenceFile=name=>projectOutput(path.join(OUT,name),OUT);
 await fs.mkdir(OUT,{recursive:false});
 await fs.copyFile(__filename,await evidenceFile('executed-script.cjs'));
 let session;
const R={build:BUILD,errors:[],httpErrors:[],failedRequests:[],videos:[]};
const watch=p=>{p.on('pageerror',e=>R.errors.push(String(e)));p.on('response',r=>{if(r.status()>=400)R.httpErrors.push({url:r.url(),status:r.status()})});p.on('requestfailed',r=>R.failedRequests.push({url:r.url(),resourceType:r.resourceType(),error:r.failure()}))};
try{
  session=await launchQABrowser(OUT,{channel:'chrome',headless:true});
  const {browser}=session;
 const p=await browser.newPage({viewport:{width:1600,height:1000}});watch(p);
 const response=await p.goto('http://127.0.0.1:4196/?workbench=appearance&body=female');
 await p.waitForFunction(()=>__debug?.ready&&!document.querySelector('#appearance-fields').disabled);
 R.headers=await response.allHeaders();assert.equal(R.headers['x-zbgs-candidate'],BUILD);
 R.served=await p.evaluate(async()=>{const r=await fetch('/build-info.json',{cache:'no-store'});if(!r.ok)throw Error('build HTTP '+r.status);return r.json()});
 R.runtime=await p.evaluate(()=>__debug.buildInfo);assert.equal(R.served.shortId,BUILD);assert.equal(R.runtime.shortId,BUILD);
 await p.locator('#appearance-eye-color').selectOption('green');await p.waitForFunction(()=>!document.querySelector('#appearance-fields').disabled&&__debug.avatar().appearance.getState().eyeColor==='green');
 const d=p.locator('#appearance-geometry');if(!await d.evaluate(n=>n.open))await d.locator('summary').click();
 await p.locator('#mouth-width-sample').selectOption('0.12');await p.waitForFunction(()=>__debug.avatar().facialGeometry.getState().mouthWidth===.12&&!document.querySelector('#appearance-fields').disabled);
 R.appearance=await p.evaluate(()=>({appearance:__debug.avatar().appearance.getState(),geometry:__debug.avatar().facialGeometry.getState()}));
 await p.screenshot({path:await evidenceFile('public-green-mouth12.png')});
 R.beforeMove=await p.evaluate(()=>__debug.snapshot());await p.locator('[data-camera=room]').click();await p.waitForTimeout(650);
 const box=await p.locator('#phaser-stage canvas').boundingBox();await p.mouse.click(box.x+box.width*.52,box.y+box.height*.73);
 await p.waitForFunction(pos=>Math.hypot(...__debug.snapshot().position.map((v,i)=>v-pos[i]))>.1,R.beforeMove.position,{timeout:8000});
 R.afterMove=await p.evaluate(()=>__debug.snapshot());assert.equal(R.afterMove.camera.mode,'room');
 await p.screenshot({path:await evidenceFile('public-room-moving.png')});await p.close();
 const g=await browser.newPage({viewport:{width:1600,height:1000}});watch(g);
 R.galleryURL='http://127.0.0.1:4174/evidence/face-shadow-prepare-v1/';const gr=await g.goto(R.galleryURL);assert.equal(gr.status(),200);
 R.videoElements=await g.locator('video').evaluateAll(ns=>ns.map((v,index)=>({index,src:v.currentSrc||v.src||v.querySelector('source')?.src})));
 for(const body of ['female','male']){
  const matches=R.videoElements.filter(v=>v.src.includes("/visual-final/")).filter(v=>new RegExp('(^|[/_-])'+body+'([/_-]|\\.)').test(v.src));assert.equal(matches.length,1,'Expected one actual '+body+' video');
  const v=g.locator('video').nth(matches[0].index);await v.scrollIntoViewIfNeeded();
  const before=await v.evaluate(async v=>{v.muted=true;v.playbackRate=1;await v.play();return{currentTime:v.currentTime,src:v.currentSrc,readyState:v.readyState,error:v.error?.code||null,rate:v.playbackRate}});
  await g.waitForFunction(({index,start})=>{const v=document.querySelectorAll('video')[index];if(v.error)throw Error('Media error '+v.error.code);return v.currentTime>=start+2},{index:matches[0].index,start:before.currentTime},{timeout:15000});
  const after=await v.evaluate(v=>{const result={currentTime:v.currentTime,src:v.currentSrc,readyState:v.readyState,error:v.error?.code||null,rate:v.playbackRate,width:v.videoWidth,height:v.videoHeight};v.pause();return result});
  assert.equal(after.error,null);assert.equal(after.rate,1);assert(after.width>0&&after.height>0);R.videos.push({body,before,after});
  await g.screenshot({path:await evidenceFile(body+'-evidence-playing.png')});
 }
 assert.equal(R.errors.length,0);assert.equal(R.httpErrors.length,0);
 R.metadataAborts=R.failedRequests.filter(x=>x.resourceType==='media'&&x.error?.errorText==='net::ERR_ABORTED');
 assert.equal(R.failedRequests.filter(x=>!R.metadataAborts.includes(x)).length,0);
 R.passed=true;R.scope='Published identity, UI selections and real movement; two native media loads and >=2s playback each, not complete visual acceptance.';
}catch(e){R.passed=false;R.failure=String(e);process.exitCode=1;console.error(e)}finally{await session?.close();await fs.writeFile(await evidenceFile('report.json'),JSON.stringify(R,null,2));console.log('CLOSED',OUT,R.passed)}})().catch(e=>{console.error(e);process.exitCode=1});
