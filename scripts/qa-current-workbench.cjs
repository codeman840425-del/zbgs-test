// Small published-entry smoke check. Full source/visual checks stay in fixed-build evidence.
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const fs=require('node:fs/promises'),path=require('node:path');
const build=process.env.QA_BUILD;
const expectedControls=(process.env.QA_CONTROLS||'mouth-width,brow-sample,nose-sample').split(',');
if(!expectedControls.every(id=>/^[a-z][a-z-]+$/.test(id)))throw Error('Invalid QA_CONTROLS');
if(!/^[a-f0-9]{12}$/.test(build||''))throw Error('Set QA_BUILD to the explicit fixed build');
(async()=>{
 const project=await productionRoot();
 const out=await projectOutput(process.argv[2] || path.join(project,'evidence/current-workbench-'+build),project);
 const evidenceFile=name=>projectOutput(path.join(out,name),out);
 await Promise.all(['female-workbench.png','male-workbench.png','report.json','executed-script.cjs'].map(evidenceFile));
 const reportFile=await evidenceFile('report.json');
 try {
   await fs.access(reportFile);
   throw Error('Refuse to overwrite completed workbench evidence: '+reportFile);
 } catch(error) { if(error.code!=='ENOENT')throw error; }


 await fs.mkdir(out,{recursive:true});await fs.copyFile(__filename,await evidenceFile('executed-script.cjs'));
 const session=await launchQABrowser(out,{channel:'chrome',headless:true});
 try{
 const p=await session.browser.newPage({viewport:{width:1600,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(String(e)));
 const ready=()=>p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-identity-fields').disabled);
  const response=await p.goto('http://127.0.0.1:4196/?workbench=appearance');await ready();
  const responseCandidate=response.headers()['x-zbgs-candidate'];if(responseCandidate!==build)throw Error('Wrong public X-ZBGS-Candidate header');
  const servedBuild=await p.evaluate(async()=>{const r=await fetch('/build-info.json',{cache:'no-store'});if(!r.ok)throw Error('Build receipt HTTP '+r.status);return r.json()});if(servedBuild.shortId!==build)throw Error('Wrong public build-info');
  if(await p.evaluate(()=>__debug.avatar().profile.bodyType)!=='female')throw Error('Wrong initial body');
  const identity=await p.evaluate(()=>__debug.buildInfo.shortId);if(identity!==build)throw Error('Wrong served build');
  await p.evaluate(()=>window.__workbenchDocumentMarker='same-page');
  const controls={};for(const id of expectedControls){controls[id]=await p.locator('#'+id).count();if(controls[id]!==1)throw Error('Missing or duplicated geometry control '+id);}
  const groups=await p.locator('[data-appearance-group]').evaluateAll(ns=>ns.map(n=>({name:n.textContent,pressed:n.getAttribute('aria-pressed')})));
  if(groups.length!==2)throw Error('Expected independent female and male buttons');
  await p.screenshot({path:await evidenceFile('female-workbench.png')});
  await p.locator('[data-appearance-group=male]').click();await ready();
  if(await p.evaluate(()=>__debug.avatar().profile.bodyType)!=='male')throw Error('Wrong switched body');
  if(await p.evaluate(()=>window.__workbenchDocumentMarker)!=='same-page')throw Error('Page reloaded');
  const maleHair=await p.locator('#appearance-hair-style option').allTextContents();if(!maleHair.some(x=>x.includes('偏侧')))throw Error('Male hairstyle missing');
  await p.screenshot({path:await evidenceFile('male-workbench.png')});
  const tabs=[];for(const tab of ['actions','inspection','appearance']){const control=p.locator('[data-workbench-tab='+tab+']');await control.click();const selected=await control.getAttribute('aria-selected');if(selected!=='true')throw Error('Tab not selected');tabs.push(tab);}
  if(errors.length)throw Error(errors.join('\n'));
  await fs.writeFile(await evidenceFile('report.json'),JSON.stringify({build,responseCandidate,servedBuild,url:p.url(),controls,groups,maleHair,tabs,sameDocument:true,errors,passed:true,scope:'Published identity and UI wiring only; not full animation or visual acceptance'},null,2));
  console.log(JSON.stringify({build,passed:true,errors}));
 }finally{await session.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
