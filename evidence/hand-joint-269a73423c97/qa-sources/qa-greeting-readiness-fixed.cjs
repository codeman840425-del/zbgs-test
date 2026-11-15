// Targeted regression for the real outgoing microphone hold/readiness boundary.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {expectations,prepareOutput,verifyCandidate,writeFailure}=require('../qa-m1-common.cjs');
if(process.argv.includes('--plan')){console.log(JSON.stringify({cases:['female standing/seated','male standing/seated'],boundary:'mic requested=false but actual arm weight>.001 must not report greeting ready; natural fade then actual task completes',simulation:'real1x, no reset/advance/teleport',expected:'post-175 readiness fix; explicit fixed identity required'},null,2));process.exit(0);}
(async()=>{const id=expectations(),base=process.argv[2],out=await prepareOutput(id.build,'greeting-readiness'),{chromium}=require('../../prototype/node_modules/playwright'),browser=await chromium.launch({channel:'chrome',headless:true}),r={build:id.build,records:[],errors:[]};
 try{for(const body of ['female','male']){const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>r.errors.push(e.message));
  const expected=body==='female'?id:{build:id.build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'};
  try{await page.goto(new URL('?body='+body,base).href);await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});const initial=await verifyCandidate(page,expected);await page.evaluate(()=>{__debug.setPlaybackRate(1);__debug.setPaused(false);});
   for(const pose of ['standing','seated']){
    if(pose==='seated'){await page.evaluate(()=>__debug.request({requestId:'seat-ready-check',kind:'sit'}));await page.waitForFunction(()=>__debug.tasks().get('seat-ready-check')?.state==='completed',null,{timeout:45000});}
    await page.waitForFunction(()=>__debug.game.scene.getScene('CharacterStudio').greetingReady(),null,{timeout:30000});
    const equip=await page.evaluate(()=>__debug.command({type:'accessory',kind:'mic',value:true}));assert(equip.applied);await page.waitForFunction(()=>__debug.avatar().livePresentation.getState().arm?.weight>.99,null,{timeout:10000});
    const release=await page.evaluate(async()=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio'),live=d.avatar().livePresentation;const applied=await d.command({type:'accessory',kind:'mic',value:false});return {applied,state:live.getState(),controllerReady:c.greetingReady(),liveReady:live.canStartGreeting?.(),simulationTime:d.snapshot().simulationTime};});
    r.records.push({body,pose,initial,release});const row=r.records.at(-1);assert.equal(release.applied.applied,true);assert(release.state.arm?.weight>.001,'Must observe real outgoing hold, not miss the boundary');assert.equal(release.controllerReady,false,'Controller must not advertise ready during actual hold');assert.equal(release.liveReady,false,'Live and controller readiness must agree');
    await page.waitForFunction(()=>{const d=__debug,l=d.avatar().livePresentation;return d.game.scene.getScene('CharacterStudio').greetingReady()&&l.canStartGreeting();},null,{timeout:10000});
    row.settled=await page.evaluate(()=>({state:__debug.avatar().livePresentation.getState(),simulationTime:__debug.snapshot().simulationTime}));
    const taskId='after-release-'+pose;await page.evaluate(requestId=>__debug.request({requestId,kind:'greeting'}),taskId);await page.waitForFunction(id=>['completed','failed','cancelled'].includes(__debug.tasks().get(id)?.state),taskId,{timeout:20000});row.task=await page.evaluate(id=>__debug.tasks().get(id),taskId);assert.equal(row.task.state,'completed');row.finalGate=await verifyCandidate(page,expected);row.passed=true;
   }
  }finally{await page.close();}
 }assert.equal(r.errors.length,0);r.passed=true;
 }catch(e){r.failure=String(e);await writeFailure(out,e);throw e;}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(r,null,2));console.log(out);}
})().catch(e=>{console.error(e);process.exitCode=1;});
