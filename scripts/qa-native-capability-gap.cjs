// Actual fixed workbench controls; no fit bypasses or production mutation.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const assert=require('node:assert/strict');
const out=path.resolve(process.argv[2]||'evidence/native-capability-gap-987-v1');
const expectConnected=process.argv.includes('--expect-accessories');
const expectedBuild=process.argv.find(x=>x.startsWith('--build='))?.slice(8);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={status:'incomplete',scope:'Actual controls and failure reproduction, not full motion or appearance acceptance',cases:[]};
 try{
  for(const body of ['female','native-female-843ac-v1','native-female-face-v1','native-female-waist-v1','native-male-7586-v1']){
   const page=await browser.newPage({viewport:{width:1440,height:1000}}),row={body,errors:[],accessories:{}};
   page.on('pageerror',e=>row.errors.push(String(e)));
   await page.goto('http://127.0.0.1:4196/?workbench=appearance&body='+body+'&view=inspect-half-front');
   await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});
   row.initial=await page.evaluate(()=>({build:__debug.buildInfo.shortId,body:__debug.avatar().profile.bodyType,sha:__debug.avatar().profile.sha256,choices:__debug.queryAppearanceCandidates(),dances:__debug.motion().getDances(),live:__debug.avatar().livePresentation.getState()}));
   if(expectedBuild)assert.equal(row.initial.build,expectedBuild);
   if(expectConnected)delete row.initial.choices; // Large binding tables belong to source evidence.
   await page.locator('[data-workbench-tab="actions"]').click();
   for(const kind of ['mic','glasses']){
    await page.locator('[data-accessory-kind="'+kind+'"]').click();
    await page.waitForFunction(k=>!['loading'].includes(__debug.avatar().livePresentation.getState().accessories[k].status),kind,{timeout:30000});
    row.accessories[kind]=await page.evaluate(k=>({state:__debug.avatar().livePresentation.getState().accessories[k],message:document.querySelector('[data-accessory-status="'+k+'"]').textContent}),kind);
    if(expectConnected)assert.equal(row.accessories[kind].state.loaded,true,row.accessories[kind].message);
    if(row.accessories[kind].state.loaded)await page.locator('[data-accessory-kind="'+kind+'"]').click();
   }
   await page.locator('#speaking-button').click();await page.waitForTimeout(600);
   row.speaking=await page.evaluate(()=>__debug.avatar().livePresentation.getState().speaking);
   await page.getByRole('button',{name:'看向镜头',exact:true}).click();
   row.gaze=await page.evaluate(()=>__debug.avatar().livePresentation.getState().gaze);
   if(expectConnected){assert(row.speaking&&row.gaze);assert.equal(row.errors.length,0);if(body.startsWith('native-'))assert(row.initial.dances.some(d=>d.id==='native-rokoko-5359146-30s-v2'));}
   await page.screenshot({path:path.join(out,body+'-actions.png')});
   await page.locator('[data-workbench-tab="appearance"]').click();
   row.controls=await page.locator('#appearance-hair,#appearance-hair-color,#appearance-skin-tone,#appearance-eye-color,#appearance-lip-color,#appearance-eyebrow-color').evaluateAll(nodes=>nodes.map(n=>({id:n.id,disabled:n.disabled,choices:[...n.options].map(o=>({value:o.value,label:o.textContent}))})));
   await page.screenshot({path:path.join(out,body+'-appearance.png')});
   report.cases.push(row);await page.close();
   await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
  report.status=expectConnected?'actual-controls-connected-visual-limits-retained':'gaps-reproduced-not-fixed';
 }catch(e){report.failure=String(e.stack||e);process.exitCode=1;}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,cases:report.cases.map(x=>({body:x.body,accessories:x.accessories,dances:x.initial.dances.map(d=>d.id)})),failure:report.failure}));}
})();
