// Small published-entry smoke check. Full source/visual checks stay in fixed-build evidence.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const build=process.env.QA_BUILD;
const expectedControls=(process.env.QA_CONTROLS||'mouth-width,brow-sample,nose-sample').split(',');
if(!expectedControls.every(id=>/^[a-z][a-z-]+$/.test(id)))throw Error('Invalid QA_CONTROLS');
if(!/^[a-f0-9]{12}$/.test(build||''))throw Error('Set QA_BUILD to the explicit fixed build');
(async()=>{
 const out=path.resolve('evidence/current-workbench-'+build);
 try{await fs.access(path.join(out,'report.json'));throw Error('Refuse overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.mkdir(out,{recursive:true});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const p=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(String(e)));
 const ready=()=>p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-identity-fields').disabled);
 try{
  await p.goto('http://127.0.0.1:4196/?workbench=appearance');await ready();
  const identity=await p.evaluate(()=>__debug.buildInfo.shortId);if(identity!==build)throw Error('Wrong served build');
  await p.evaluate(()=>window.__workbenchDocumentMarker='same-page');
  const controls={};for(const id of expectedControls){controls[id]=await p.locator('#'+id).count();if(controls[id]!==1)throw Error('Missing or duplicated geometry control '+id);}
  const groups=await p.locator('[data-appearance-group]').evaluateAll(ns=>ns.map(n=>({name:n.textContent,pressed:n.getAttribute('aria-pressed')})));
  if(groups.length!==2)throw Error('Expected independent female and male buttons');
  await p.screenshot({path:path.join(out,'female-workbench.png')});
  await p.locator('[data-appearance-group=male]').click();await ready();
  if(await p.evaluate(()=>__debug.avatar().profile.bodyType)!=='male')throw Error('Wrong switched body');
  if(await p.evaluate(()=>window.__workbenchDocumentMarker)!=='same-page')throw Error('Page reloaded');
  const maleHair=await p.locator('#appearance-hair-style option').allTextContents();if(!maleHair.some(x=>x.includes('偏侧')))throw Error('Male hairstyle missing');
  await p.screenshot({path:path.join(out,'male-workbench.png')});
  const tabs=[];for(const tab of ['actions','inspection','appearance']){const control=p.locator('[data-workbench-tab='+tab+']');await control.click();const selected=await control.getAttribute('aria-selected');if(selected!=='true')throw Error('Tab not selected');tabs.push(tab);}
  if(errors.length)throw Error(errors.join('\n'));
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({build,url:p.url(),controls,groups,maleHair,tabs,sameDocument:true,errors,passed:true,scope:'Published identity and UI wiring only; not full animation or visual acceptance'},null,2));
  console.log(JSON.stringify({build,passed:true,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
