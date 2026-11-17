const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [directory,output]=process.argv.slice(2);
if(!directory||!output)throw Error('Pass fixed dist and new evidence directory');
(async()=>{
 const root=path.resolve(directory),out=path.resolve(output);await fs.mkdir(out,{recursive:false});
 await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const build=JSON.parse(await fs.readFile(path.join(root,'build-info.json'),'utf8'));
 const report={build:build.shortId,errors:[],checks:[],status:'incomplete'};let server,browser,page;
 async function checkNativeColorAdmission(){
  const result=await page.evaluate(async()=>{
   const actor=__debug.avatar(),domain=actor.appearance,query=__debug.queryAppearanceCandidates();
   const snapshot=()=>{
    const state=domain.getState(),materials=[];
    actor.vrm.scene.traverse(node=>{if(node.isMesh)for(const m of Array.isArray(node.material)?node.material:[node.material])materials.push([m.uuid,m.color?.toArray(),m.map?.uuid,m.shadeMultiplyTexture?.uuid]);});
    return JSON.stringify({colors:[state.hairColor,state.skinTone,state.eyeColor,state.lipColor],revision:state.revision,materials});
   };
   const before=snapshot(),checks=[];
   for(const [field,value] of Object.entries({hairColor:'brown',skinTone:'deep',eyeColor:actor.profile.bodyType==='native-male-7586-v1'?'blue':'green',lipColor:'rose'})){
    const record=structuredClone(query.defaultRecipe);record.appearance[field]=value;
    const admitted=__debug.admitAppearanceCandidate(record),direct=await domain.set({[field]:value});
    let importRejected=false;try{await __debug.importAppearanceRecipe(JSON.stringify(record));}catch{importRejected=true;}
    checks.push({field,choices:query.appearance[field].choices.map(x=>x.value),admitted,direct,importRejected,unchanged:before===snapshot()});
   }
   const original=await __debug.importAppearanceRecipe(__debug.exportAppearanceRecipe());
   return{bodyType:actor.profile.bodyType,checks,original};
  });
  for(const check of result.checks){assert.deepEqual(check.choices,result.bodyType==='native-male-7586-v1'&&check.field==='eyeColor'?['original','green']:['original']);assert.equal(check.admitted.accepted,false);assert.equal(check.direct.applied,false);assert.equal(check.importRejected,true);assert.equal(check.unchanged,true);}
  assert.equal(result.original.applied,true);(report.colorAdmission??=[]).push(result);
 }
 try{
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
  server=require('node:http').createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),p=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!p.startsWith(root+path.sep))throw Error('invalid path');const bytes=await fs.readFile(p);res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
  page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>report.errors.push(String(e)));
  const url=`http://127.0.0.1:${server.address().port}`;
  await page.goto(url+'/?workbench=appearance');
  await page.waitForFunction(()=>__debug.ready&&document.querySelector('#appearance-body')?.options.length>0,null,{timeout:60000});
  // replaceState updates emit framenavigated too; count only new documents.
  let navigations=0;page.on('request',r=>{if(r.isNavigationRequest()&&r.resourceType()==='document')navigations++;});
  const documentIdentity=await page.evaluate(()=>window.workbenchDocumentIdentity=crypto.randomUUID());
  await page.locator('#appearance-body').selectOption('native-female-843ac-v1');
  await page.waitForFunction(()=>__debug.avatar()?.profile.bodyType==='native-female-843ac-v1'&&!document.querySelector('#appearance-body').disabled,null,{timeout:60000});
  assert.equal(navigations,0);assert.equal(await page.evaluate(()=>window.workbenchDocumentIdentity),documentIdentity);assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build.shortId);
  for(const id of ['appearance-hair-color','appearance-skin-tone','appearance-eye-color','appearance-lip-color'])assert(await page.locator('#'+id).isDisabled(),id);
  await checkNativeColorAdmission();
  await page.evaluate(()=>{__debug.setPaused(true);__debug.camera('inspect-full-front');});
  await page.screenshot({path:path.join(out,'native-workbench.png')});
  report.checks.push('existing female to native candidate without page reload; unverified palette disabled');
  await page.locator('[data-outfit="3"]').click();
  await page.waitForFunction(()=>__debug.avatar().getOutfitInfo().equipment.items.alternateTop?.visible===true);
  await page.locator('[data-workbench-tab="inspection"]').click();
  await page.locator('[data-body-mode="base"]').click();
  await page.waitForFunction(()=>__debug.avatar().getOutfitInfo().equipment.bodyTextureCoverage.covered===false);
  await page.screenshot({path:path.join(out,'native-base.png')});
  await page.locator('[data-body-mode="dressed"]').click();
  await page.waitForFunction(()=>__debug.avatar().getOutfitInfo().equipment.bodyTextureCoverage.covered===true);
  assert.equal(await page.evaluate(()=>__debug.avatar().getOutfitInfo().equipment.items.alternateTop.visible),true);
  report.checks.push('actual outfit buttons and base/dressed restore custom top and coverage');
  await page.locator('[data-workbench-tab="appearance"]').click();
  await page.locator('#appearance-body').selectOption('native-female-face-v1');
  await page.waitForFunction(()=>__debug.avatar()?.profile.bodyType==='native-female-face-v1'&&!document.querySelector('#appearance-body').disabled,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>__debug.avatar().profile.sha256),'cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce');
  await checkNativeColorAdmission();
  report.checks.push('new face uses its exact resource admission, same appearance selector and no inherited untested palette');
  await page.locator('[data-appearance-group="male"]').click();
  await page.waitForFunction(()=>__debug.avatar().profile.bodyType==='male',null,{timeout:60000});
  await page.locator('[data-workbench-tab="appearance"]').click();
  await page.locator('#appearance-body').selectOption('native-male-7586-v1');
  await page.waitForFunction(()=>__debug.avatar()?.profile.bodyType==='native-male-7586-v1'&&!document.querySelector('#appearance-body').disabled,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>__debug.avatar().profile.sha256),'7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81');
  await checkNativeColorAdmission();
  for(const id of ['appearance-hair-color','appearance-skin-tone','appearance-lip-color'])assert(await page.locator('#'+id).isDisabled(),id);
  assert.equal(await page.locator('#appearance-eye-color').isDisabled(),false);
  await page.evaluate(()=>{__debug.setPaused(true);__debug.camera('inspect-full-front');});
  await page.screenshot({path:path.join(out,'native-male-workbench.png')});
  report.checks.push('native male candidate has its own source and unvalidated palette stays disabled');
  await page.locator('[data-appearance-group="female"]').click();
  await page.waitForFunction(()=>__debug.avatar().profile.bodyType==='female',null,{timeout:60000});
  assert.equal(navigations,0);assert.equal(await page.evaluate(()=>window.workbenchDocumentIdentity),documentIdentity);report.checks.push('male and female group switch remains in page');
  const legacyColors=await page.evaluate(async()=>{
   const q=__debug.queryAppearanceCandidates(),a=__debug.avatar().appearance;
   const changed=await a.set({hairColor:'brown',skinTone:'warm',eyeColor:'green',lipColor:'rose'});
   const state=a.getState();const restored=await a.set({reset:true});
   return{choices:Object.fromEntries(['hairColor','skinTone','eyeColor','lipColor'].map(k=>[k,q.appearance[k].choices.length])),changed,colors:[state.hairColor,state.skinTone,state.eyeColor,state.lipColor],restored};
  });
  assert.equal(legacyColors.changed.applied,true);assert.equal(legacyColors.restored.applied,true);
  assert.deepEqual(legacyColors.colors,['brown','warm','green','rose']);assert(Object.values(legacyColors.choices).every(n=>n>1));report.legacyColors=legacyColors;
  await page.goto(url+'/native-production.html');
  assert.equal(await page.locator('a[href*="body=native-female-843ac-v1"]').count(),3);
  assert.equal(await page.locator('a[href*="body=native-female-face-v1"]').count(),1);
  assert.equal(await page.locator('a[href*="body=native-male-7586-v1"]').count(),2);
  assert.equal(await page.locator('[data-native-chain]').count(),12);
  assert((await page.locator('[data-factory-video]').getAttribute('src')).includes('7871-v2'));
  report.media=[];
  for(let i=0;i<12;i++){
   const result=await page.locator('[data-native-chain]').nth(i).evaluate(async video=>{
    video.muted=true;await video.play();await new Promise(r=>setTimeout(r,400));video.pause();
    return{src:video.src,time:video.currentTime,duration:video.duration,rate:video.playbackRate,width:video.videoWidth};
   });
   assert(result.time>0&&result.duration>10&&result.width>0);assert.equal(result.rate,1);report.media.push(result);
  }
  await page.screenshot({path:path.join(out,'native-production-entry.png')});
  report.checks.push('production entry links real candidate and original-build video');
  assert.deepEqual(report.errors,[]);report.status='technical-ui-passed';
 }catch(e){report.status='failed';report.error=String(e.stack||e);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})();
