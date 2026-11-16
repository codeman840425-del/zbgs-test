// Actual fixed browser: pure admission never mutates the actor or cancels work.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,folder]=process.argv.slice(2),out=path.resolve(folder);
const identities={male:{assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'},female:{assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'}};
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={build,checks:[],errors:[],environment:{browser:browser.version(),viewport:[1440,900],device:'Development Windows host; not ordinary-PC acceptance'}};
 let c,p,release;
 const save=()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 const open=async(body,film=false)=>{
  c=await browser.newContext({viewport:{width:1440,height:900},...(film?{recordVideo:{dir:out,size:{width:1440,height:900}}}:{})});p=await c.newPage();
  p.on('pageerror',e=>report.errors.push(String(e)));
  await p.goto(base+'?workbench=appearance&body='+body);await p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-fields').disabled,null,{timeout:60000});
  await verifyCandidate(p,{build,...identities[body]});
  await p.evaluate(()=>{__debug.view('inspect-face-front');__debug.setPlaybackRate(1);__debug.setPaused(false);});
 };
 const close=async()=>{if(!c)return;const video=p.video();await c.close();if(video)await video.saveAs(path.join(out,'normal1x.webm'));c=null;};
 const state=()=>p.evaluate(()=>({appearance:__debug.avatar().appearance.getState(),geometry:__debug.avatar().facialGeometry.getState(),outfit:__debug.snapshot().outfit}));
 const check=async(name,fn)=>{try{report.checks.push({name,status:'passed',result:await fn()});}catch(e){report.checks.push({name,status:'failed',error:String(e)});throw e;}finally{await save();}};
 try{
  for(const body of ['male','female']){
   await open(body,body==='male');
   const catalog=await p.evaluate(()=>__debug.queryAppearanceCandidates());
   await fs.writeFile(path.join(out,body+'-catalog.json'),JSON.stringify(catalog,null,2));
   const original=await p.evaluate(()=>__debug.exportAppearanceRecipe());
   await check(body+' query and default admission preserve state',async()=>{
    const before=await state();
    const admission=await p.evaluate(()=>__debug.admitAppearanceCandidate(__debug.queryAppearanceCandidates().defaultRecipe));
    assert.equal(admission.accepted,true,JSON.stringify(admission));assert.equal(admission.stage,'static');
    assert.deepEqual(await state(),before);assert.equal(await p.evaluate(()=>__debug.exportAppearanceRecipe()),original);
    return{admission,defaultMatchesInitial:JSON.stringify(JSON.parse(original))===JSON.stringify(catalog.defaultRecipe)};
   });
   if(body==='male'){
    for(const domain of ['mouth','brow']){
     const input=JSON.parse(await fs.readFile(path.join(__dirname,`../evidence/m2-static-admission-baseline-1fa-v1/${domain}-wrong-source-v6.json`),'utf8'));
     await check(domain+' wrong-source rejected before fetch and without state writes',async()=>{
      const before=await state(),requests=[];const listener=r=>{if(r.url().includes('/assets/'))requests.push(r.url());};p.on('request',listener);
      const admission=await p.evaluate(input=>__debug.admitAppearanceCandidate(input),input);
      assert.equal(admission.accepted,false);assert(admission.issues.some(i=>i.field&&i.code&&i.reason));
      const applied=await p.evaluate(async input=>{try{return await __debug.importAppearanceRecipe(JSON.stringify(input));}catch(e){return{error:String(e)};}},input);
      p.off('request',listener);assert(applied.error||applied.applied===false);assert.equal(requests.length,0);assert.deepEqual(await state(),before);
      return{admission,applied,resourceRequests:requests};
     });
    }
    await check('read-only query during held geometry preparation keeps original intent',async()=>{
     const input=JSON.parse(await fs.readFile(path.join(__dirname,'../evidence/m2-static-admission-baseline-1fa-v1/mouth-correct-source-v6.json'),'utf8'));
     let hit;const held=new Promise(r=>release=r),arrived=new Promise(r=>hit=r);
     const pattern='**/mouth-visible-v2/male-mouth-width.recipe.json';
     await p.route(pattern,async route=>{hit();await held;await route.continue();});
     await p.evaluate(input=>{window.__admissionPending={done:false};__debug.importAppearanceRecipe(JSON.stringify(input)).then(result=>Object.assign(__admissionPending,{done:true,result})).catch(e=>Object.assign(__admissionPending,{done:true,error:String(e)}));},input);
     await Promise.race([arrived,new Promise((_,reject)=>setTimeout(()=>reject(Error('Expected real geometry request missing')),15000))]);
     const before=await state();
     const query=await p.evaluate(input=>({catalog:__debug.queryAppearanceCandidates(),admission:__debug.admitAppearanceCandidate(input)}),input);
     assert.equal(query.admission.accepted,true);assert.deepEqual(await state(),before);
     release();await p.waitForFunction(()=>__admissionPending.done,null,{timeout:30000});await p.unroute(pattern);
     const result=await p.evaluate(()=>__admissionPending);assert.equal(result.result?.applied,true,JSON.stringify(result));
     assert.deepEqual(JSON.parse(await p.evaluate(()=>__debug.exportAppearanceRecipe())),input);
     await p.evaluate(()=>__debug.command({type:'speaking',value:true}));await p.waitForTimeout(2500);
     await p.screenshot({path:path.join(out,'male-applied.png')});
     assert.equal((await p.evaluate(text=>__debug.importAppearanceRecipe(text),original)).applied,true);
     assert.deepEqual(JSON.parse(await p.evaluate(()=>__debug.exportAppearanceRecipe())),JSON.parse(original));
     return{result,admission:query.admission,restored:true};
    });
   }
   // A real catalog-produced default must remain a valid loadable recipe.
   await check(body+' catalog default loads and roundtrips',async()=>{
    const r=await p.evaluate(record=>__debug.importAppearanceRecipe(JSON.stringify(record)),catalog.defaultRecipe);assert.equal(r.applied,true);
    assert.deepEqual(JSON.parse(await p.evaluate(()=>__debug.exportAppearanceRecipe())),catalog.defaultRecipe);return r;
   });
   await close();
  }
  // Static acceptance is deliberately not claimed as byte/topology admission.
  await open('male');
  await check('static accepted candidate still rejects corrupted actual resource and retains look',async()=>{
   const input=JSON.parse(await fs.readFile(path.join(__dirname,'../evidence/m2-static-admission-baseline-1fa-v1/brow-correct-source-v6.json'),'utf8'));
   const before=await p.evaluate(()=>__debug.exportAppearanceRecipe());
   const admission=await p.evaluate(input=>__debug.admitAppearanceCandidate(input),input);assert.equal(admission.accepted,true);
   const pattern='**/face-brow-visible-v2/male-brow-height-spacing.recipe.json';
   let hits=0;await p.route('**/face-brow-visible-v2/*.recipe.json',route=>{hits++;return route.fulfill({status:200,body:'{}',contentType:'application/json'});});
   const applied=await p.evaluate(async input=>{try{return await __debug.importAppearanceRecipe(JSON.stringify(input));}catch(e){return{error:String(e)};}},input);
   assert.equal(hits,1);assert(applied.error||applied.applied===false);assert.equal(await p.evaluate(()=>__debug.exportAppearanceRecipe()),before);
   return{admission,applied,corruptedResourceHits:hits};
  });
  assert.equal(report.errors.length,0);report.status='passed';
 }catch(e){report.status='failed';report.error=String(e);process.exitCode=1;if(p)await p.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{release?.();await close();await browser.close();await save();}
 console.log(JSON.stringify({out,status:report.status,checks:report.checks.map(({name,status,error})=>({name,status,error})),error:report.error}));
})().catch(e=>{console.error(e);process.exitCode=1;});
