// Only the observed female happy+blink combination, paused A/B. No animation capture.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const q=require('./qa-m2-eye-sample.cjs');
(async()=>{
 await fs.mkdir(q.OUT,{recursive:false});await fs.copyFile(__filename,path.join(q.OUT,'executed-script.cjs'));await fs.copyFile(path.join(__dirname,'qa-m2-eye-sample.cjs'),path.join(q.OUT,'executed-shared-core.cjs'));await q.save();
 const recipe=await q.source('female'),b=await chromium.launch({channel:'chrome',headless:true});
 try{const p=await b.newPage({viewport:{width:1600,height:1000}});p.on('pageerror',e=>q.report.errors.push(String(e)));await p.goto(q.BASE+'?workbench=appearance&body=female');await q.ready(p);
 q.report.identities.push(await q.verifyCandidate(p,{build:q.BUILD,assetId:q.IDS.female[0],sha256:q.IDS.female[1]}));await q.select(p,'#appearance-hair-style','none');await q.geometry(p,q.neutralGeometry);
 await p.evaluate(()=>{__debug.command({type:'speaking',value:false});__debug.command({type:'expression',name:'neutral'});__debug.command({type:'gaze',target:null});});await p.waitForTimeout(150);await p.evaluate(()=>__debug.setPaused(true));await q.installHarness(p,recipe);
 const original=new Map(),rows=[];
 for(const value of ['none',q.EYE]){await q.eye(p,value);for(const blink of [.5,.998971]){
  const actual=await p.evaluate(blink=>{__eyeHarness.diagnose({blink});const a=__debug.avatar(),em=a.vrm.expressionManager;em.setValue('happy',.65);em.setValue('aa',.511979);em.update();a.root.updateMatrixWorld(true);return __eyeHarness.pose();},blink);
  const frame=await q.shot(p,`female-${value}-happy-blink-${blink}.png`,'front');
  if(value==='none')original.set(blink,{actual,camera:frame.camera});else{assert.deepEqual(q.poseComparable(actual),q.poseComparable(original.get(blink).actual));assert.deepEqual(frame.camera,original.get(blink).camera);}
  rows.push({value,blink,happy:.65,aa:.511979,actual,file:q.report.shots.at(-1).file});
 }}
 q.report.checks.push({name:'observed happy+blink peak and half closure exact-pose old/new',passed:true,result:rows});assert.equal(q.report.errors.length,0);q.report.status='technical-passed-visual-review-pending';
 }catch(e){q.report.status='failed';q.report.fatal=String(e);console.error(e);process.exitCode=1;}
 finally{await b.close();q.report.finished=new Date().toISOString();await q.save();console.log('BROWSER CLOSED',q.OUT);}
})().catch(e=>{console.error(e);process.exitCode=1;});
