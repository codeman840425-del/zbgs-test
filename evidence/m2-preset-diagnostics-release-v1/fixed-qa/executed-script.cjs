// Actual UI paths only; this does not approve the diagnostic geometry.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [url,build,outPath]=process.argv.slice(2);
if(!url||!build||!outPath)throw Error('URL exact-build new-output-directory required');
(async()=>{
 const out=path.resolve(outPath);await fs.mkdir(out,{recursive:false});
 await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 p.on('pageerror',e=>errors.push(String(e)));
 const ready=()=>p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-fields').disabled,null,{timeout:60000});
 const waitBody=id=>p.waitForFunction(id=>__debug.avatar().profile.bodyType===id&&!document.querySelector('#appearance-fields').disabled,id);
 const report={url,build,errors,scope:'Preset UI separation, switch, direct URL and return; no geometry or motion acceptance'};
 try{
  await p.goto(url+'?workbench=appearance');await ready();
  assert.equal(await p.evaluate(()=>__debug.buildInfo.shortId),build);
  report.femaleOptions=await p.locator('#appearance-body option').evaluateAll(ns=>ns.map(n=>n.value));
  assert.deepEqual(report.femaleOptions,['female','m1a-jaw-v1','m1a-waisthip-v1']);
  assert.equal(await p.locator('#workbench-diagnostic-warning').isVisible(),false);
  await p.screenshot({path:path.join(out,'normal.png')});
  await p.locator('#appearance-open-diagnostics').click();
  assert.equal(await p.locator('#workbench-failed-presets').evaluate(n=>n.open),true);
  report.diagnosticCount=await p.locator('#workbench-diagnostic-body option').count()-1;
  assert.equal(report.diagnosticCount,15);
  await p.locator('#workbench-diagnostic-body').selectOption('male-long-lean-axial-head-v1');
  await waitBody('male-long-lean-axial-head-v1');
  assert.equal(await p.locator('#workbench-diagnostic-warning').isVisible(),true);
  await p.locator('[data-inspect-framing=half]').click();
  await p.screenshot({path:path.join(out,'diagnostic-warning.png')});
  report.warning=await p.locator('#workbench-diagnostic-warning').innerText();
  assert.match(await p.locator('#workbench-preview-info').innerText(),/尖锥下颌已明确不可用/);
  await p.locator('#workbench-diagnostic-return').click();await waitBody('male');
  assert.equal(await p.locator('#workbench-diagnostic-warning').isVisible(),false);
  assert.equal(await p.locator('#appearance-body option').count(),3);
  await p.goto(url+'?workbench=appearance&body=female-round-full-v2');await ready();
  assert.equal(await p.locator('#workbench-diagnostic-warning').isVisible(),true);
  report.directURLBody=await p.evaluate(()=>__debug.avatar().profile.bodyType);
  await p.locator('#workbench-diagnostic-return').click();await waitBody('female');
  await p.locator('[data-appearance-group=male]').click();await waitBody('male');
  assert.equal(await p.locator('#workbench-diagnostic-warning').isVisible(),false);
  assert.deepEqual(errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.error=String(e);process.exitCode=1;}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})();
