const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,destination,expectation]=process.argv.slice(2),out=path.resolve(destination);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const ctx=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}}),p=await ctx.newPage();
 const report={build,expectation,status:'running',errors:[],scope:'Same female v8 look, room camera, 1.05 m/s and exact desk-side destination. Only the new seat-path regression; not full M1 or target-PC approval.'};
 p.on('pageerror',e=>report.errors.push(String(e)));
 try{
  await p.goto(url+'?body=female&workbench=appearance');await p.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  report.identity=await verifyCandidate(p,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  const recipe=await fs.readFile(path.join(__dirname,'../evidence/m2-accessory-record-room-785-v1/female-v8.json'),'utf8');
  assert((await p.evaluate(text=>__debug.importAppearanceRecipe(text),recipe)).applied);
  await p.evaluate(()=>{__debug.camera('room');__debug.setSpeed(1.05);});await p.waitForTimeout(900);
  await p.evaluate(()=>__debug.walkTo(-1.4,-.6));
  await p.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.target&&!s.pending;},null,{timeout:20000});
  report.before=await p.evaluate(()=>__debug.snapshot());report.request=await p.evaluate(()=>__debug.action('sit'));
  if(expectation==='stall'){
   await p.waitForTimeout(6000);report.result=await p.evaluate(id=>__debug.tasks().get(id),report.request.task.requestId);
   assert.equal(report.result.state,'running');assert.equal(await p.evaluate(()=>__debug.snapshot().motion.sitProgress),0);report.status='baseline-stall-reproduced';
  }else{
   await p.waitForFunction(id=>['completed','failed','cancelled'].includes(__debug.tasks().get(id)?.state),report.request.task.requestId,{timeout:30000});
   report.result=await p.evaluate(id=>__debug.tasks().get(id),report.request.task.requestId);assert.equal(report.result.state,'completed');await p.waitForTimeout(900);
   const stand=await p.evaluate(()=>__debug.action('stand'));await p.waitForFunction(id=>__debug.tasks().get(id)?.state==='completed',stand.task.requestId,{timeout:15000});
   const leave=await p.evaluate(()=>__debug.walkTo(1.2,1.6));await p.waitForFunction(id=>__debug.tasks().get(id)?.state==='completed',leave.task.requestId,{timeout:15000});
   report.status='technical-checks-passed-visual-pending';
  }
  report.after=await p.evaluate(()=>__debug.snapshot());await p.screenshot({path:path.join(out,'end.png')});assert.deepEqual(report.errors,[]);
 }catch(e){report.status='failed';report.error=String(e.stack??e);process.exitCode=1;}
 finally{const v=p.video();await ctx.close();await v.saveAs(path.join(out,'normal1x.webm'));await v.delete();await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({status:report.status,error:report.error}));
})();
