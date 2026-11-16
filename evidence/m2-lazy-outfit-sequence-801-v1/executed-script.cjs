// Exercise the existing sequence consumer with a short bounded step list.
// This is an integration regression, not a complete M1 motion acceptance film.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,folder]=process.argv.slice(2),out=path.resolve(folder);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={build,cases:[],scope:'Existing room sequence consumer with bounded outfit/idle/walk steps. Delayed first garment selection and cancellation. No new controller or visual naturalness certification.'};
 let releasePending;
 try{for(const cancel of [false,true]){
  const dir=path.join(out,cancel?'cancel':'complete');await fs.mkdir(dir);
  const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}}),p=await context.newPage();
  const r={cancel,errors:[]};report.cases.push(r);p.on('pageerror',e=>r.errors.push(String(e)));
  try{
   await p.goto(base+'?body=female&workbench=appearance');await p.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
   r.identity=await verifyCandidate(p,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
   let started,release;const requested=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);releasePending=release;
   const config=await import('../prototype/src/foundation-profiles.js');
   const manifest=JSON.parse(await fs.readFile(path.resolve(__dirname,'../prototype/public/assets/m1/equipment.json'),'utf8'));
   const item=manifest.items.find(item=>item.id===config.foundationProfile('female').ids.skirt);
   const skirtURL=new URL(item.url,base+'/assets/m1/equipment.json').pathname;
   await p.route('**'+skirtURL,async route=>{started();await gate;await route.continue();});
   await p.evaluate(()=>{
    const c=__debug.game.scene.scenes.find(scene=>typeof scene.nextStep==='function');
    c.cancelSequence();c.sequence=[{type:'outfit',v:1},{type:'action',name:'idle',duration:.5},{type:'outfit',v:0},{type:'walk',p:[1,1.8],label:'按需换装后行走'}];c.sequenceIndex=-1;c.nextStep();
   });
   let timer;try{await Promise.race([requested,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Sequence never requested first skirt')),15000);})]);}finally{clearTimeout(timer);}
   r.pending=await p.evaluate(()=>({outfit:__debug.snapshot().outfit,index:__debug.snapshot().sequenceIndex,length:__debug.snapshot().sequenceLength}));
   assert.equal(r.pending.outfit,0);assert.equal(r.pending.index,0);
   if(cancel)await p.evaluate(()=>__debug.walkTo(-1,1.8));
   release();
   if(cancel){
    await p.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.target&&!s.pending;},null,{timeout:30000});
    await p.waitForTimeout(500);r.final=await p.evaluate(()=>({outfit:__debug.snapshot().outfit,index:__debug.snapshot().sequenceIndex,length:__debug.snapshot().sequenceLength,position:__debug.snapshot().position}));
    assert.equal(r.final.outfit,0);assert.equal(r.final.length,0);assert.equal(r.final.index,-1);
   }else{
    await p.waitForFunction(()=>__debug.snapshot().outfit===1,null,{timeout:15000});
    await p.waitForFunction(()=>__debug.snapshot().sequenceLength===0,null,{timeout:30000});
    r.final=await p.evaluate(()=>({outfit:__debug.snapshot().outfit,position:__debug.snapshot().position}));assert.equal(r.final.outfit,0);
   }
   assert.equal(r.errors.length,0);r.status='passed';await p.screenshot({path:path.join(dir,'finished.png')});
  }catch(error){r.status='failed';r.error=String(error);process.exitCode=1;await p.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});throw error;}
  finally{releasePending?.();const video=p.video();await context.close();await video.saveAs(path.join(dir,'normal1x.webm'));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 }}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({out,cases:report.cases.map(r=>({cancel:r.cancel,status:r.status,error:r.error}))}));
})().catch(error=>{console.error(error);process.exitCode=1;});
