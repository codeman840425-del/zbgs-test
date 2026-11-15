// Fixed source vs frozen failed authored target. Real rAF 1x, no pose injection after setup.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../../prototype/node_modules/playwright');
const {expectations,verifyCandidate}=require('../qa-m1-common.cjs');
(async()=>{
 const expected=expectations(),url=process.argv[2];assert.match(url||'',/^http:\/\/127\.0\.0\.1:\d+\/$/);
 const out=path.resolve('output/skirt-front-closed-loop/'+expected.build+'-'+Date.now());await fs.mkdir(out,{recursive:true});
 const report={build:expected.build,scope:'Frozen failed editable front target, actual live hand refit, 1x normal rAF; not acceptance',setup:'At actual chair approach; 60 offline 1/60 settle steps BEFORE film, same as capture. Dynamics false in both builds, full corrections, authored handTarget.',runs:[]};
 const browser=await chromium.launch({channel:'chrome',headless:false});
 try {for(const camera of ['room','close']){
  const dir=path.join(out,camera);await fs.mkdir(dir,{recursive:true});
  const ctx=await browser.newContext({viewport:{width:1440,height:1080},recordVideo:{dir,size:{width:1440,height:1080}}});const page=await ctx.newPage(),video=page.video();
  const r={camera,events:[],errors:[]};report.runs.push(r);page.on('pageerror',e=>r.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')r.errors.push(m.text());});await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
  try{
   await page.goto(url+'?forearm=calibrated&handTarget=authored');await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});r.identity=await verifyCandidate(page,expected);
   r.setup=await page.evaluate(camera=>{
    const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar();d.reset();d.setPaused(true);d.setPlaybackRate(1);d.setOutfit(1);d.setBodyMode('dressed');d.setDynamics(false);d.setCorrections('full');
    const chair=d.snapshot().chair;a.root.position.set(...chair.approach);c.yaw=chair.yaw;a.root.rotation.y=c.yaw;d.motion().reset();a.update(0);a.root.updateMatrixWorld(true);for(let i=0;i<60;i++)c.simulate(1/60);c.cameraPreset(camera,true);
    const tag=document.createElement('div');tag.textContent='失败候选对照 / '+d.buildInfo.shortId+' / '+camera+' / 1×';Object.assign(tag.style,{position:'fixed',bottom:'6px',left:'6px',background:'#102c34',color:'white',padding:'6px',zIndex:99999,pointerEvents:'none'});document.body.append(tag);
    return d.snapshot();
   },camera);
   await page.evaluate(()=>{const d=__debug,m=d.scene.getObjectByName('M1_UniformSkirt_Constrained'),V=d.avatar().root.position.constructor,v=new V();let running=true;const rows=[];window.__frontFilm={rows,stop:()=>running=false,start:performance.now()};const tick=now=>{if(!running)return;const s=d.snapshot();m.getVertexPosition(720,v).applyMatrix4(m.matrixWorld);rows.push({wall:now,time:s.simulationTime,mode:s.mode,sitProgress:s.motion.sitProgress,handContacts:s.motion.handContacts,paused:s.paused,rate:s.playbackRate,camera:s.camera,vertex720:v.toArray(),hidden:document.hidden});requestAnimationFrame(tick);};d.setPaused(false);requestAnimationFrame(tick);});
   const mark=async name=>{r.events.push({name,wall:await page.evaluate(()=>performance.now()),state:await page.evaluate(()=>__debug.snapshot())});};
   const shot=async name=>{await mark(name);await page.screenshot({path:path.join(dir,name+'.png')});};
   await page.waitForTimeout(1000);await shot('standing');await mark('sit-request');await page.evaluate(()=>__debug.action('sit'));
   await page.waitForTimeout(720);await shot('sit-072');await page.waitForTimeout(400);await shot('sit-112');await page.waitForTimeout(2100);await shot('seated');
   await mark('stand-request');await page.evaluate(()=>__debug.action('stand'));await page.waitForTimeout(550);await shot('rise-055');await page.waitForTimeout(700);await shot('rise-125');await page.waitForTimeout(2100);await shot('standing-end');
   r.finalIdentity=await verifyCandidate(page,expected);r.complete=true;
  }catch(e){r.failure=String(e);await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});throw e;}
  finally{r.frames=await page.evaluate(()=>{window.__frontFilm?.stop();return window.__frontFilm?.rows||[];}).catch(()=>[]);r.frameFailures=r.frames.filter(f=>f.paused||f.rate!==1||f.hidden||f.camera?.mode!==camera);await ctx.close();await video.saveAs(path.join(dir,'normal-sit-rise.webm'));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
  assert.equal(r.errors.length,0,JSON.stringify(r.errors));assert.equal(r.frameFailures.length,0);
 }}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out);}
})().catch(e=>{console.error(e);process.exitCode=1;});
