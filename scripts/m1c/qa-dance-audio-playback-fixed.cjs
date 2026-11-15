// Explicit future browser/audio run. --plan / --check never starts browser.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {prepareOutput,verifyCandidate,writeFailure}=require('../qa-m1-common.cjs');
const root=path.resolve(__dirname,'../..'),build=process.env.QA_BUILD;
const plan={build:build||'REQUIRED_AT_RUN',scope:'Isolated QA iframe + actual fixed danceClock + original synthetic PCM',audio:'Headed Chrome, mute-audio default removed; explicit button click unlocks AudioContext and connects low-gain PCM to device. Requires allocated audio/browser window.',sequence:['normal 1x source and audio loop','actual pause .4s','resume .25x','offset +.4 / -.25 and reset','task exit and dispose'],measurements:['actual AudioContext.currentTime','scheduled-source estimated buffer position vs actual danceClock','graph analyser RMS','internal MediaRecorder output','browser output timestamp/baseLatency/outputLatency estimates'],limits:['No hardware loopback/microphone capture','No measured acoustic/display latency','No choreographic alignment guarantee','Playwright viewport video has no audio; separate internal audio is not a synchronized final film']};
(async()=>{
 if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));return;}
 const wavPath=path.join(root,'assets-source/m1c-audio-qa/original-beat-120bpm.wav'),meta=JSON.parse(await fs.readFile(path.join(root,'assets-source/m1c-audio-qa/source.json'),'utf8'));
 const wav=await fs.readFile(wavPath);assert.equal(crypto.createHash('sha256').update(wav).digest('hex'),meta.sha256);
 if(process.argv.includes('--check')){console.log(JSON.stringify({passed:true,pcm:meta,browserStarted:false,audioPlayed:false,plan},null,2));return;}
 const base=process.argv[2];assert(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(base||''));assert(/^[a-f0-9]{12}$/.test(build||''),'Explicit QA_BUILD required');
 const {chromium}=require('../../prototype/node_modules/playwright'),out=await prepareOutput(build,'dance-audio-playback-'+Date.now());
 const browser=await chromium.launch({channel:'chrome',headless:false,ignoreDefaultArgs:['--mute-audio']});
 const context=await browser.newContext({viewport:{width:1440,height:1100},recordVideo:{dir:out,size:{width:1440,height:1100}}});
 const qaSourceHashes={};for(const name of ['dance-audio-harness.html','dance-audio-transport.mjs','dance-audio-mapping.mjs'])qaSourceHashes[name]=crypto.createHash('sha256').update(await fs.readFile(path.join(__dirname,name))).digest('hex');
 const page=await context.newPage(),video=page.video(),report={plan,pcm:meta,qaSourceHashes,errors:[],inputs:[],listening:'Pending human observation; never inferred from graph RMS'};
 page.on('pageerror',e=>report.errors.push(e.message));
 try{
  const files={'dance-audio-harness.html':'text/html','dance-audio-transport.mjs':'text/javascript','dance-audio-mapping.mjs':'text/javascript','original-beat-120bpm.wav':'audio/wav'};
  await page.route('**/__audio-qa/**',async route=>{const name=new URL(route.request().url()).pathname.split('/').pop();if(!files[name])return route.fulfill({status:404,body:'Not found'});await route.fulfill({status:200,contentType:files[name],body:name.endsWith('.wav')?wav:await fs.readFile(path.join(__dirname,name))});});
  await page.goto(base+'__audio-qa/dance-audio-harness.html');
  const frame=await (await page.$('#room')).contentFrame();await frame.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  const expected={build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'};
  report.initialGate=await verifyCandidate(frame,expected);
  await frame.evaluate(()=>{__debug.reset();__debug.setPaused(true);__debug.setPlaybackRate(1);__debug.command({type:'danceSelect',id:'ual1-dance-reference'});});
  await page.click('#enable');await page.waitForFunction(()=>__audioHarness.ready||__audioHarness.error);assert.equal(await page.evaluate(()=>__audioHarness.error),undefined);
  const mark=async name=>report.inputs.push({name,wall:new Date().toISOString(),performanceNow:await page.evaluate(()=>performance.now())});
  await mark('normal1x-start');await frame.evaluate(()=>{__debug.command({type:'action',name:'dance',requestId:'audio-qa-loop'});__debug.setPaused(false);});
  await frame.waitForFunction(()=>__debug.motion().getMetrics().dance.time>2.2);await page.screenshot({path:path.join(out,'normal-loop.png')});
  await mark('pause');await frame.evaluate(()=>__debug.setPaused(true));await page.waitForTimeout(400);
  await mark('quarter-resume');await frame.evaluate(()=>{__debug.setPlaybackRate(.25);__debug.setPaused(false);});await page.waitForTimeout(800);
  await mark('positive-offset');await page.evaluate(()=>__audioHarness.offset(.4));await frame.evaluate(()=>__debug.setPlaybackRate(1));await page.waitForTimeout(650);
  await mark('negative-offset-restart');await frame.evaluate(()=>__debug.reset());await page.evaluate(()=>__audioHarness.offset(-.25));await page.waitForTimeout(60);
  await frame.evaluate(()=>{__debug.command({type:'danceSelect',id:'ual1-dance-reference'});__debug.command({type:'action',name:'dance',requestId:'audio-qa-restart'});__debug.setPaused(false);});await page.waitForTimeout(900);
  await mark('exit');await frame.evaluate(()=>__debug.tasks().cancel('audio-qa-restart','qa-end'));await page.waitForTimeout(350);
  report.finalGate=await verifyCandidate(frame,expected);const result=await page.evaluate(()=>__audioHarness.finish());
  await fs.writeFile(path.join(out,'internal-graph-audio.webm'),Buffer.from(result.audioBase64,'base64'));delete result.audioBase64;report.data=result;
  const s=result.samples;report.checks={contextRunning:s.some(x=>x.contextState==='running'),graphHasEnergy:s.some(x=>x.rms>.005),audioRecorded:(await fs.stat(path.join(out,'internal-graph-audio.webm'))).size>1000,pausedSourceStopped:s.some(x=>x.paused&&!x.sourceActive),quarterRate:s.some(x=>x.rate===.25&&x.sourceActive),clipAndAudioLoop:s.some(x=>x.observed.clipWraps>0)&&s.some(x=>x.observed.audioWraps>0),negativeCue:s.some(x=>x.mapped.status==='waiting-offset'&&!x.sourceActive),exitStopped:s.at(-1).action==='idle'&&!s.at(-1).sourceActive};
  const drift=s.filter(x=>x.sourceActive&&Number.isFinite(x.observed.driftSeconds)).map(x=>Math.abs(x.observed.driftSeconds));report.driftEstimate={maxSeconds:Math.max(...drift),sampleCount:drift.length,acceptance:'Reported only; not acoustic sync or a zero-drift assertion'};
  assert(Object.values(report.checks).every(Boolean),JSON.stringify(report.checks));assert.equal(report.errors.length,0);
 }catch(error){report.failure=String(error);await writeFailure(out,error);throw error;}
 finally{await page.evaluate(()=>window.__audioHarness?.finish()).catch(()=>{});await context.close();await video.saveAs(path.join(out,'playback-review.webm'));await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out);}
})().catch(error=>{console.error(error);process.exitCode=1;});
