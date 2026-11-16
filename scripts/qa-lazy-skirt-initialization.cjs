// Actual same-body first skirt selection at different motion poses.
// Calibration must not inherit the transient animated thigh shape.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,folder]=process.argv.slice(2),out=path.resolve(folder);
const baseline=process.argv.includes('--expect-eager');
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={build,baseline,cases:[],scope:'Original female first skirt selection idle/walking/seated. Paused pose capture is diagnostic; each clip also retains 1x motion before and after selection. Frozen skirt algorithm and shape are not reaccepted.'};
 try{for(const pose of ['idle','walking','seated']){
  const dir=path.join(out,pose);await fs.mkdir(dir);
  const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}}),p=await context.newPage();
  const r={pose,errors:[]};report.cases.push(r);p.on('pageerror',e=>r.errors.push(String(e)));
  const bones=()=>p.evaluate(()=>{
   const a=__debug.avatar(),rows=[];a.vrm.scene.traverse(n=>{if(n.isBone)rows.push({name:n.name,p:n.position.toArray(),q:n.quaternion.toArray(),s:n.scale.toArray()});});
   return {rows,rootP:a.root.position.toArray(),rootQ:a.root.quaternion.toArray()};
  });
  try{
   await p.goto(base+'?body=female&workbench=appearance');await p.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
   r.identity=await verifyCandidate(p,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
   r.initial=await p.evaluate(()=>__debug.avatar().getOutfitInfo().equipment.skirtDynamics);
   if(!baseline)assert.equal(r.initial,null);
   await p.evaluate(()=>{__debug.camera('room');__debug.setPlaybackRate(1);});
   if(pose==='walking'){
    await p.evaluate(()=>{__debug.setSpeed(1.05);__debug.walkTo(2,1.8);});
    await p.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='walk'&&s.speed>.7;},null,{timeout:15000});
    await p.waitForTimeout(350);
   }
   if(pose==='seated'){
    await p.evaluate(()=>__debug.action('sit'));await p.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:45000});
    await p.waitForTimeout(700);
   }
   await p.evaluate(()=>__debug.setPaused(true));r.before=await bones();
   r.selection=await p.evaluate(()=>__debug.command({type:'outfit',value:1}));
   // Historical eager command returns void. New lazy command must confirm commit.
   if(!baseline)assert.equal(r.selection?.applied,true);
   r.after=await bones();assert.deepEqual(r.after,r.before,'Synchronous rest calibration must restore all current bone/root transforms');
   r.skirt=await p.evaluate(()=>__debug.avatar().getOutfitInfo().equipment.skirtDynamics);
   assert(r.skirt?.thighRadii.length===2);
   if(report.cases[0].skirt)for(let i=0;i<2;i++)assert(Math.abs(r.skirt.thighRadii[i]-report.cases[0].skirt.thighRadii[i])<1e-7,'Calibration changed with first-selection pose');
   await p.evaluate(()=>__debug.setPaused(false));await p.waitForTimeout(900);
   await p.screenshot({path:path.join(dir,'selected.png')});
   if(pose==='seated')await p.evaluate(()=>__debug.action('stand'));
   await p.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.target&&!s.pending;},null,{timeout:45000});
   await p.evaluate(()=>{__debug.setSpeed(1.05);__debug.walkTo(-.5,1.8);});
   await p.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.target&&!s.pending;},null,{timeout:45000});
   assert.equal(r.errors.length,0);r.status='passed';
  }catch(error){r.status='failed';r.error=String(error);process.exitCode=1;await p.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});throw error;}
  finally{const video=p.video();await context.close();await video.saveAs(path.join(dir,'normal1x-with-paused-switch.webm'));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 }}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({out,cases:report.cases.map(r=>({pose:r.pose,status:r.status,radii:r.skirt?.thighRadii,error:r.error}))}));
})().catch(error=>{console.error(error);process.exitCode=1;});
