// Exact frozen-pose on/off comparison. Diagnostic camera only, no asset edits.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [url,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true}),report={build,bodies:[],scope:'Paused exact-pose visibility experiment; no motion/performance acceptance'};
 try{for(const body of ['female','male']){
  const dir=path.join(out,body);await fs.mkdir(dir);const context=await browser.newContext({viewport:{width:1440,height:900}}),p=await context.newPage();
  try{
   await p.goto(url+'?body='+body+'&workbench=appearance');await p.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
   assert.equal(await p.evaluate(()=>__debug.buildInfo.shortId),build);
   assert.equal((await p.evaluate(body=>__debug.setOutfit(body==='male'?6:3),body)).applied,true);
   await p.evaluate(()=>{__debug.camera('inspect-full-side');const cam=__debug.cameraObject(),r=__debug.renderer.domElement;cam.setViewOffset(r.width,r.height,r.width*.35,r.height*.64,r.width*.30,r.height*.31);cam.updateProjectionMatrix();});
   const row={body,poses:[]};report.bodies.push(row);
   for(const pose of ['standing','seated']){
    if(pose==='seated'){await p.evaluate(()=>{__debug.setPaused(false);__debug.action('sit');});await p.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:45000});}
    await p.evaluate(()=>__debug.setPaused(true));await p.waitForTimeout(100);
    const before=await p.evaluate(()=>__debug.snapshot());
    await p.screenshot({path:path.join(dir,pose+'-socks-on.png')});
    const layers=await p.evaluate(()=>{const r=[];__debug.avatar().vrm.scene.traverse(n=>{if(n.userData.equipmentId?.includes('plain-crew-socks')){r.push({id:n.userData.equipmentId,wasVisible:n.visible});n.visible=false;}});return r;});assert.equal(layers.length,1);
    await p.waitForTimeout(100);await p.screenshot({path:path.join(dir,pose+'-socks-off.png')});
    await p.evaluate(()=>__debug.avatar().vrm.scene.traverse(n=>{if(n.userData.equipmentId?.includes('plain-crew-socks'))n.visible=true;}));
    row.poses.push({pose,layers,before,after:await p.evaluate(()=>__debug.snapshot())});
   }
  }finally{await context.close();}
 }}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({out,completedBodies:report.bodies.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
