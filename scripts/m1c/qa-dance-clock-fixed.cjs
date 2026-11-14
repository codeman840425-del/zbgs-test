// Actual danceClock observer only. Adds QA functions, NEVER an audio player.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {prepareOutput,verifyCandidate,writeFailure}=require('../qa-m1-common.cjs');
const root=path.resolve(__dirname,'../..'),build=process.env.QA_BUILD||'18a7de64033c';
const plan={build,clock:'__debug.motion().getMetrics().dance.time (actual danceClock)',states:['normal1x source loop across boundary','real paused .35s hold','resume at .25x','action exit while clock fades','explicit reset'],offsets:[-.25,0,.4],audio:'No AudioContext, file, oscillator or audio element; target audio positions only. Device/output latency and audible synchronization UNTESTED.'};
(async()=>{
 if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));return;}
 const base=process.argv[2];if(!base||!/^http:\/\/127\.0\.0\.1:/.test(base))throw Error('Require run-fixed-check loopback URL');
 const {chromium}=require('../../prototype/node_modules/playwright'),out=await prepareOutput(build,'dance-clock-'+Date.now());
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));let report={plan,errors};
 try{
  await page.goto(new URL('?body=female',base).href);await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
  const expected={build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'};report.initialGate=await verifyCandidate(page,expected);
  const module=await fs.readFile(path.join(__dirname,'dance-audio-mapping.mjs'),'utf8');
  await page.addScriptTag({content:module.replace(/^export /gm,'')+'\nwindow.__danceAudioQA={mapDanceAudio,createDanceAudioObserver};'});
  await page.evaluate(()=>{
   const d=__debug;d.reset();d.setPaused(true);d.setDynamics(false);d.setBodyMode('base');d.setPlaybackRate(1);d.advance(1);
   d.command({type:'danceSelect',id:'ual1-dance-reference'});
   const observers=[-.25,0,.4].map(offsetSeconds=>__danceAudioQA.createDanceAudioObserver({offsetSeconds,audioDurationSeconds:2,loop:true}));
   const samples=[];let stopped=false,last=-Infinity;window.__danceObserverQA={samples,stop:()=>{stopped=true;}};
   const tick=now=>{if(stopped)return;if(now-last>25){last=now;const m=d.motion().getMetrics(),c=d.game.scene.getScene('CharacterStudio');samples.push({wallMs:now,simulationTime:c.simulationTime,paused:c.paused,rate:c.playbackRate,action:m.action,danceMix:m.danceMix,dance:{...m.dance},mapped:observers.map(o=>o.observe(m,{paused:c.paused,playbackRate:c.playbackRate}))});}requestAnimationFrame(tick);};requestAnimationFrame(tick);
   d.command({type:'action',name:'dance',requestId:'clock-loop'});d.setPaused(false);
  });
  await page.waitForFunction(()=>__debug.motion().getMetrics().dance.time>1.3,null,{timeout:15000});
  const pauseBefore=await page.evaluate(()=>{__debug.setPaused(true);return __debug.motion().getMetrics().dance.time;});await page.waitForTimeout(350);
  const pauseAfter=await page.evaluate(()=>__debug.motion().getMetrics().dance.time);assert.equal(pauseBefore,pauseAfter);
  await page.evaluate(()=>{__debug.setPlaybackRate(.25);__debug.setPaused(false);});await page.waitForTimeout(900);
  const slow=await page.evaluate(()=>({danceTime:__debug.motion().getMetrics().dance.time,rate:__debug.game.scene.getScene('CharacterStudio').playbackRate}));assert.equal(slow.rate,.25);assert(slow.danceTime>pauseAfter);
  await page.evaluate(()=>{__debug.setPlaybackRate(1);__debug.tasks().cancel('clock-loop','qa-audio-observer-end');});await page.waitForTimeout(80);
  const exit=await page.evaluate(()=>({metrics:__debug.motion().getMetrics(),sample:__danceObserverQA.samples.at(-1)}));assert.equal(exit.metrics.action,'idle');
  await page.evaluate(()=>__debug.reset());await page.waitForTimeout(80);
  const data=await page.evaluate(()=>{__danceObserverQA.stop();return{samples:__danceObserverQA.samples,history:__debug.tasks().history(),final:__debug.motion().getMetrics().dance};});
  assert(data.samples.some(s=>s.mapped.some(m=>m.clipWraps>0)));assert(data.samples.some(s=>s.paused&&s.mapped.every(m=>m.status==='paused')));assert(data.samples.every(s=>s.mapped.every(m=>m.transportObserved===false&&m.driftSeconds===null)));
  report={...report,pauseBefore,pauseAfter,slow,exit,data,finalGate:await verifyCandidate(page,expected),checks:{actualClipLoopObserved:true,pausedActualClockExact:true,quarterRateApplied:true,noSyntheticAudioPassClaim:true},limits:plan.audio};
  await page.screenshot({path:path.join(out,'observer-room.png')});assert.equal(errors.length,0);
 }catch(error){report.failure=String(error);await writeFailure(out,error);throw error;}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out);}
})().catch(error=>{console.error(error);process.exitCode=1;});
