// Actual fixed-browser checks for actor replacement and masked palette ownership.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const base=process.env.QA_URL||'http://127.0.0.1:4277/';
const build=process.env.QA_BUILD;
if(!/^[a-f0-9]{12}$/.test(build||''))throw Error('Explicit QA_BUILD required');
const out=path.resolve(process.env.QA_OUT||'evidence/appearance-transactions-'+build);
(async()=>{
 await fs.mkdir(out,{recursive:true});
 try{await fs.access(path.join(out,'report.json'));throw Error('Refuse overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={build,base,started:new Date().toISOString(),checks:[],errors:[],environment:{browser:browser.version(),viewport:[1366,768],kind:'development machine headless browser; not ordinary-PC acceptance'}};
 const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(String(e)));
 const save=()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 const check=async(name,fn)=>{try{report.checks.push({name,passed:true,result:await fn()});}catch(e){report.checks.push({name,passed:false,error:String(e)});throw e;}finally{await save();}};
 const switchBody=async body=>{const r=await page.evaluate(body=>__debug.command({type:'bodySelect',bodyType:body}),body);assert(r.applied,JSON.stringify(r));return r;};
 try{
  await page.goto(base+'?workbench=appearance');
  await page.waitForFunction(()=>__debug.ready&&!document.querySelector('#appearance-fields').disabled);
  assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build);
  await check('failed body load retains visible actor, mixer and camera',async()=>{
   await page.evaluate(()=>{__debug.setPaused(true);window.oldActor=__debug.avatar();window.oldMotion=__debug.motion();window.oldCamera=__debug.snapshot().camera;});
   await page.route('**/base-male-roundtrip.vrm',r=>r.fulfill({status:503,body:'intentional test failure'}));
   const result=await page.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'male'}));assert.equal(result.applied,false);
   const state=await page.evaluate(()=>({sameActor:__debug.avatar()===oldActor,sameMotion:__debug.motion()===oldMotion,visible:oldActor.root.parent===__debug.scene,camera:__debug.snapshot().camera,loading:__debug.snapshot().bodySelection.loading}));
   assert(state.sameActor&&state.sameMotion&&state.visible&&!state.loading);assert.deepEqual(state.camera,await page.evaluate(()=>oldCamera));
   await page.unroute('**/base-male-roundtrip.vrm');return{result,state};
  });
  await check('latest body selection cancels older detached load',async()=>{
   await page.route('**/base-male-roundtrip.vrm',async r=>{await new Promise(resolve=>setTimeout(resolve,450));await r.continue();});
   const result=await page.evaluate(async()=>{const a=__debug.command({type:'bodySelect',bodyType:'male'});const b=__debug.command({type:'bodySelect',bodyType:'female'});return{a:await a,b:await b,body:__debug.avatar().profile.bodyType,same:__debug.avatar()===oldActor};});
   assert(result.a.cancelled&&result.b.applied&&result.same,JSON.stringify(result));assert.equal(result.body,'female');await page.unroute('**/base-male-roundtrip.vrm');return result;
  });
  await check('late failed body load reports cancellation after a newer choice',async()=>{
   let release,hit;const held=new Promise(resolve=>release=resolve),arrived=new Promise(resolve=>hit=resolve);
   const pattern='**/base-male-roundtrip.vrm';
   await page.route(pattern,async route=>{hit();await held;await route.fulfill({status:503,body:'intentional late obsolete load failure'});});
   try{
    await page.evaluate(()=>{window.__lateBody={done:false};__debug.command({type:'bodySelect',bodyType:'male'}).then(result=>Object.assign(__lateBody,{done:true,result}));});
    await arrived;const latest=await page.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'female'}));
    release();await page.waitForFunction(()=>__lateBody.done);
    const result=await page.evaluate(()=>({old:__lateBody.result,body:__debug.avatar().profile.bodyType,same:__debug.avatar()===oldActor,selection:__debug.snapshot().bodySelection}));
    assert.equal(latest.applied,true);assert.equal(result.old.cancelled,true,JSON.stringify(result));assert(result.same);assert.equal(result.body,'female');return{latest,...result};
   }finally{release();await page.unroute(pattern);}
  });
  await check('skirt to male fallback updates actual and pressed outfit',async()=>{
   await page.evaluate(()=>__debug.setOutfit(1));const result=await switchBody('male');
   const actual=await page.evaluate(()=>({outfit:__debug.snapshot().outfit,buttons:[...document.querySelectorAll('[data-outfit]')].map(b=>({id:b.dataset.outfit,pressed:b.getAttribute('aria-pressed'),hidden:b.hidden}))}));
   assert.equal(actual.outfit,0);assert.equal(actual.buttons.find(b=>b.id==='0').pressed,'true');assert.equal(actual.buttons.find(b=>b.id==='1').pressed,'false');return{result,actual};
  });
  for(const body of ['male','female']){
   await switchBody(body);
   await check(body+' palette preserves every outside-mask and alpha byte, reset restores references',async()=>page.evaluate(async()=>{
    const a=__debug.avatar();await a.appearance.set({reset:true});
    const manifest=await(await fetch('/assets/appearance-color-v3/runtime-manifest.json')).json();
    const v=manifest.variants.find(v=>v.avatarSha256===a.profile.sha256);
    const pixels=image=>{const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
    const rows=[];
    for(const [part,d] of Object.entries(v.parts)){
     const image=await createImageBitmap(await(await fetch(d.maskUrl)).blob());const mask=pixels(image);image.close();
     const mats=new Set();a.vrm.scene.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m&&(m.name===d.materialName||m.name===d.materialName+' (Outline)'))mats.add(m);});
     for(const mat of mats)rows.push({part,mat,map:mat.map,shade:mat.shadeMultiplyTexture,pixels:pixels(mat.map.image),mask});
    }
    const applied=await a.appearance.set({eyeColor:'blue',lipColor:'rose'});if(!applied.applied)throw Error(applied.reason);
    const summary=[];
    for(const r of rows){const next=pixels(r.mat.map.image);let protectedChanges=0,alphaChanges=0,changedInside=0;for(let i=0;i<next.length;i+=4){if(next[i+3]!==r.pixels[i+3])alphaChanges++;const changed=[0,1,2].some(k=>next[i+k]!==r.pixels[i+k]);if(changed){if(r.mask[i])changedInside++;else protectedChanges++;}}if(protectedChanges||alphaChanges||!changedInside)throw Error(JSON.stringify({part:r.part,protectedChanges,alphaChanges,changedInside}));summary.push({part:r.part,protectedChanges,alphaChanges,changedInside,ownSource:r.mat.map.source!==r.map.source});}
    await a.appearance.set({reset:true});for(const r of rows)if(r.mat.map!==r.map||r.mat.shadeMultiplyTexture!==r.shade)throw Error('Reference restore failed');return{summary,restored:true};
   }));
  }
  await check('palette load failure preserves old colors and retries',async()=>{
   await switchBody('male');
   await page.route('**/male-iris-mask.png',r=>r.fulfill({status:503,body:'intentional test failure'}));
   const fail=await page.evaluate(()=>__debug.command({type:'appearance',eyeColor:'violet'}));assert.equal(fail.applied,false);
   assert.equal(await page.evaluate(()=>__debug.avatar().appearance.getState().eyeColor),'original');
   await page.unroute('**/male-iris-mask.png');const retry=await page.evaluate(()=>__debug.command({type:'appearance',eyeColor:'violet'}));assert(retry.applied);return{fail,retry};
  });
  await check('two real instances keep independent hair, facial texture and palette state',async()=>{
   await page.evaluate(()=>__debug.loadComparison('male'));
   const result=await page.evaluate(async()=>{
    const a=__debug.avatar(),b=__debug.comparison().avatar;const before=b.appearance.getState();
    await a.appearance.set({hairStyle:'male-sidepart-v1',hairColor:'black',eyeColor:'green',lipColor:'coral'});
    const after=b.appearance.getState();const mats=v=>{const s=new Set();v.scene.traverse(o=>{for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m)s.add(m);});return s;};const ma=mats(a.vrm),mb=mats(b.vrm);
    return{before,after,sharedMaterials:[...ma].filter(m=>mb.has(m)).length,primary:a.appearance.getState()};
   });assert.deepEqual(result.after,result.before);assert.equal(result.sharedMaterials,0);await page.evaluate(()=>__debug.removeComparison());return result;
  });
  await check('switch while sitting ends old task and releases seat safely',async()=>{
   await page.evaluate(()=>{__debug.reset();__debug.setPaused(false);__debug.setPlaybackRate(1);__debug.command({type:'action',name:'sit',requestId:'switch-sit'});});
   await page.waitForFunction(()=>__debug.tasks().get('switch-sit')?.state==='completed',null,{timeout:25000});
   const result=await switchBody('female');
   const s=await page.evaluate(()=>__debug.snapshot());assert.equal(s.mode,'idle');assert(!s.pending&&!s.seatAlign);assert.deepEqual(s.position,s.chair.approach);return{result,mode:s.mode,position:s.position,seat:s.seatLeases};
  });
  await check('rapid appearance requests keep latest intent without new actor',async()=>{
   const result=await page.evaluate(async()=>{const a=__debug.avatar();const r=await Promise.all([a.appearance.set({reset:true}),a.appearance.set({hairColor:'black',eyeColor:'blue'}),a.appearance.set({hairColor:'brown',eyeColor:'green',lipColor:'rose'})]);return{r,state:a.appearance.getState(),same:__debug.avatar()===a};});assert(result.same);assert.equal(result.state.hairColor,'brown');assert.equal(result.state.eyeColor,'green');assert.equal(result.state.lipColor,'rose');return result;
  });
  report.status=report.errors.length?'failed':'passed';
 }catch(e){report.status='failed';report.fatal=String(e);process.exitCode=1;}
 finally{await context.close();await browser.close();report.finished=new Date().toISOString();await save();console.log(out);}
})();
