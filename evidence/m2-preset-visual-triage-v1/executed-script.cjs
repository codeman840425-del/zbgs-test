// Static visual triage of the fixed workbench. No video or action acceptance.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,destination]=process.argv.slice(2);
assert.equal(url,'http://127.0.0.1:4196/');
assert.equal(build,'83decd027116');
const out=path.resolve(destination);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const originals={female:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95',male:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'};
const expectedV2=['female-round-full-v2','female-square-athletic-v2','female-soft-wide-v2','male-wide-muscular-v2','male-round-stocky-v2','male-angular-athletic-v2'];

(async()=>{
 await fs.mkdir(out,{recursive:false});
 await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const report={schema:'nine-preset-static-visual-capture-v1',build,url,status:'capturing',cases:[],
  expectedCases:9,expectedViews:['half-front','face-front','face-side'],videoRecorded:false,
  visualReview:'pending-actual-image-inspection',animationAcceptanceClaimed:false};
 const save=()=>fs.writeFile(path.join(out,'capture-report.json'),JSON.stringify(report,null,2)+'\n');
 const browser=await chromium.launch({channel:'chrome',headless:false});
 try{
  const request=await browser.newContext();
  const json=async resource=>{
   const response=await request.request.get(new URL(resource,url).href);assert(response.ok());
   const bytes=await response.body();return {resource,sha256:hash(bytes),data:JSON.parse(bytes)};
  };
  const index=await json('/assets/m2-representative-batch-v2/runtime-index.json');
  const axial=await json('/assets/m2-axial-head-runtime-v1/runtime-index.json');
  assert.deepEqual(index.data.presets.map(p=>p.id).sort(),expectedV2.slice().sort());
  assert.deepEqual(axial.data.presets.map(p=>p.id),['male-long-lean-axial-head-v1']);
  report.servedIndexes=[index,axial];
  const cases=[...['female','male'].map(sex=>({id:sex,sex,profile:{id:sex==='female'?'beta-base-female-m1':'beta-base-male-m1b',sha256:originals[sex]}})),
   ...index.data.presets,...axial.data.presets];
  await request.close();
  for(const spec of cases){
   const dir=path.join(out,spec.id);await fs.mkdir(dir);
   const context=await browser.newContext({viewport:{width:1600,height:1050},deviceScaleFactor:1});
   const page=await context.newPage();
   const row={body:spec.id,sex:spec.sex,referenceOriginalSHA256:originals[spec.sex],status:'loading',errors:[],views:[]};
   report.cases.push(row);page.on('pageerror',e=>row.errors.push(String(e)));
   try{
    await page.goto(new URL('?workbench=appearance&body='+encodeURIComponent(spec.id),url).href);
    await page.waitForFunction(()=>window.__debug?.ready&&__debug.avatar?.()&&!document.querySelector('#appearance-fields')?.disabled,null,{timeout:90000});
    row.identity=await verifyCandidate(page,{build,assetId:spec.profile.id,sha256:spec.profile.sha256});
    await page.locator('[data-workbench-tab=actions]').click();
    await page.locator('[data-expression=neutral]').click();
    await page.waitForTimeout(300);
    await page.waitForFunction(()=>{
     const a=__debug.avatar(),e=a.vrm.expressionManager;
     if((e?.getValue('blink')??0)>.001)return false;
     __debug.setPaused(true);return true;
    });
    row.loadedState=await page.evaluate(()=>{
     const a=__debug.avatar(),r=__debug.renderer,gl=r.getContext();
     return {profile:a.profile,appearance:a.appearance.getState(),outfit:a.getOutfitInfo(),snapshot:__debug.snapshot(),
      diagnosticBody:document.querySelector('#workbench-diagnostic-body')?.value,
      expressions:a.vrm.expressionManager.expressions.map(e=>({name:e.expressionName,value:a.vrm.expressionManager.getValue(e.expressionName)})),
      render:{type:r.constructor.name,vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER)}};
    });
    if(!['female','male'].includes(spec.id))assert.equal(row.loadedState.diagnosticBody,spec.id);
    await page.locator('[data-workbench-tab=appearance]').click();
    for(const [framing,direction] of [['half','front'],['face','front'],['face','side']]){
     await page.locator(`[data-inspect-framing=${framing}]`).click();
     await page.locator(`[data-inspect-direction=${direction}]`).click();
     await page.waitForTimeout(250);
     const name=framing+'-'+direction;
     await page.screenshot({path:path.join(dir,name+'.png')});
     await page.locator('.viewport').screenshot({path:path.join(dir,name+'-stage.png')});
     row.views.push({name,camera:'inspect-'+name,stage:name+'-stage.png',page:name+'.png',
      cameraState:await page.evaluate(()=>({url:location.href,snapshot:__debug.snapshot()}))});
    }
    assert.deepEqual(row.errors,[]);row.status='static-frames-captured-visual-review-pending';
   }catch(e){row.status='capture-failed';row.error=String(e.stack??e);await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});}
   finally{await context.close();await save();}
  }
  report.status=report.cases.every(c=>c.status==='static-frames-captured-visual-review-pending')?'nine-static-captures-complete-review-pending':'incomplete-capture';
 }catch(e){report.status='capture-failed';report.error=String(e.stack??e);}
 finally{await browser.close();await save();}
 console.log(JSON.stringify({status:report.status,cases:report.cases.length,error:report.error}));
 if(report.status!=='nine-static-captures-complete-review-pending')process.exitCode=1;
})();
