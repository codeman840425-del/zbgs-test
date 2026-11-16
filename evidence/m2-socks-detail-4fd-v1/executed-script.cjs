// Diagnostic camera crop rendered by the fixed game, not image magnification.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [url,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true}),report={build,bodies:[],scope:'Diagnostic lower-leg camera crop; original full-room1x evidence retained separately. Not performance evidence.'};
 try{for(const body of ['female','male']){
  const dir=path.join(out,body);await fs.mkdir(dir);const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}}),p=await context.newPage();
  try{
   await p.goto(url+'?body='+body+'&workbench=appearance');await p.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
   assert.equal(await p.evaluate(()=>__debug.buildInfo.shortId),build);
   assert.equal((await p.evaluate(body=>__debug.setOutfit(body==='male'?6:3),body)).applied,true);
   const view=await p.evaluate(()=>{__debug.camera('inspect-full-side');__debug.setPlaybackRate(1);const cam=__debug.cameraObject(),r=__debug.renderer.domElement,w=r.width,h=r.height;cam.setViewOffset(w,h,w*.35,h*.64,w*.30,h*.31);cam.updateProjectionMatrix();return{w,h,view:cam.view};});
   await p.waitForTimeout(500);await p.screenshot({path:path.join(dir,'standing-shoe-contact.png')});
   const idle=()=>p.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.pending&&!s.target;},null,{timeout:45000});
   await p.evaluate(()=>{__debug.setSpeed(1.05);__debug.walkTo(1.3,1.8);});await idle();
   await p.evaluate(()=>{__debug.setSpeed(2.2);__debug.walkTo(-1.3,1.8);});await idle();
   await p.evaluate(()=>__debug.action('sit'));await p.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:45000});
   await p.screenshot({path:path.join(dir,'seated-shoe-contact.png')});await p.waitForTimeout(500);
   await p.evaluate(()=>__debug.action('stand'));await idle();
   await p.screenshot({path:path.join(dir,'risen-shoe-contact.png')});
   report.bodies.push({body,view,renderer:await p.evaluate(()=>__debug.snapshot().renderer)});
  }finally{const v=p.video();await context.close();await v.saveAs(path.join(dir,'diagnostic1x.webm'));}
 }}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({out,completedBodies:report.bodies.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
