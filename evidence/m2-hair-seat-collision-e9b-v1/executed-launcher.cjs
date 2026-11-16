const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {capture}=require('../evidence/m2-hair-seat-feasibility-v1/capture-existing.cjs');
const [url,build,destination]=process.argv.slice(2),out=path.resolve(destination);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-launcher.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}});
 const page=await context.newPage(),report={build,status:'running',errors:[],scope:'Causal collision observation only; instrumented timing is not performance evidence.'};
 page.on('pageerror',error=>report.errors.push(String(error)));
 try{
  await page.goto(url+'?body=female&workbench=appearance');
  await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  const applied=await page.evaluate(()=>__debug.command({type:'appearance',hairStyle:'female-ponytail-v1',hairColor:'brown'}));
  assert(applied.applied);
  await page.evaluate(()=>__debug.camera('inspect-half-side'));
  await page.waitForTimeout(700);
  const result=await capture(page,{build,out:path.join(out,'collision-observer'),triggerSit:true});
  assert.equal(result.status,'captured');
  await page.screenshot({path:path.join(out,'seated.png')});
  report.frames=result.capture.frames.length;report.wrappersRestored=result.capture.wrappersRestored;
  assert.deepEqual(report.errors,[]);report.status='capture-complete-not-visual-pass';
 }catch(error){report.status='failed';report.error=String(error.stack??error);process.exitCode=1;}
 finally{
  const video=page.video();await context.close();await video.saveAs(path.join(out,'normal1x-instrumented.webm'));await video.delete();await browser.close();
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 }
 console.log(JSON.stringify(report));
})();
