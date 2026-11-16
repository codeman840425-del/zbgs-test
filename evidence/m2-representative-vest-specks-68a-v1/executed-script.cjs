// Diagnostic only: paused, same camera and pose; never changes source or delivery.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,destination,indexFile]=process.argv.slice(2);
(async()=>{
 const out=path.resolve(destination);await fs.mkdir(out,{recursive:false});
 const index=JSON.parse(await fs.readFile(indexFile,'utf8'));
 const report={build,status:'incomplete',scope:'Paused layer attribution only; not a fix or animation acceptance',cases:[]};
 await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const id of ['female-round-full-v2','female-soft-wide-v2']){
  const spec=index.presets.find(p=>p.id===id);assert(spec);
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
  const row={id,shots:[],errors:[]};report.cases.push(row);
  page.on('pageerror',e=>row.errors.push(String(e)));
  await page.goto(url+'?workbench=appearance&body='+id);
  await page.waitForFunction(()=>window.__debug?.ready&&document.querySelector('#appearance-form')?.getAttribute('aria-busy')==='false',null,{timeout:60000});
  row.identity=await verifyCandidate(page,{build,assetId:spec.profile.id,sha256:spec.profile.sha256});
  await page.evaluate(()=>{__debug.setPaused(true);__debug.camera('inspect-half-front');});
  row.roles=await page.evaluate(()=>{const a=__debug.avatar();window.__speckMeshes={};for(const role of ['pants','body','top'])window.__speckMeshes[role]=a.profile.meshRoles[role].map(id=>a.root.getObjectByProperty('uuid',id)).filter(Boolean).map(mesh=>({mesh,visible:mesh.visible}));return Object.fromEntries(Object.entries(__speckMeshes).map(([role,items])=>[role,items.map(({mesh,visible})=>({uuid:mesh.uuid,name:mesh.name,visible,materials:(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>m.name)}))]));});
  for(const hide of ['none','pants','body','top','restored']){
   await page.evaluate(hide=>{for(const [role,items]of Object.entries(__speckMeshes))for(const {mesh,visible}of items)mesh.visible=hide===role?false:visible;},hide);
   await page.waitForTimeout(150);
   const file=id+'-'+hide+'.png';await page.locator('#stage').screenshot({path:path.join(out,file)});row.shots.push({hide,file});
  }
  row.restored=await page.evaluate(()=>Object.values(__speckMeshes).flat().every(({mesh,visible})=>mesh.visible===visible));
  assert(row.restored);assert.deepEqual(row.errors,[]);await context.close();
 }
 report.status='captured-attribution-pending';
 }catch(e){report.error=String(e.stack||e);process.exitCode=1;}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error}));}
})();
