const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const [base,folder]=process.argv.slice(2);
(async()=>{
 const out=await projectOutput(folder,await productionRoot());
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const report={status:'incomplete',errors:[],media:[]};
 let session;
 try{
  session=await launchQABrowser(out,{channel:'chrome'});
  const page=await session.browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>report.errors.push(e.message));
  report.build=await fetch(base+'build-info.json').then(r=>r.json());await page.goto(base+'native-production.html');
  const videos=page.locator('video[data-native-chain^="m2-production-fixed-v2/"]');assert.equal(await videos.count(),2);
  for(let i=0;i<2;i++){
   const video=videos.nth(i);await video.scrollIntoViewIfNeeded();await video.evaluate(async v=>{v.muted=true;v.currentTime=0;v.playbackRate=1;await v.play();});
   await page.waitForFunction(i=>{const v=[...document.querySelectorAll('video[data-native-chain^="m2-production-fixed-v2/"]')][i];return v.ended;},i,{timeout:20000});
   const row=await video.evaluate(v=>({url:v.currentSrc,duration:v.duration,playbackRate:v.playbackRate,ended:v.ended}));assert.equal(row.playbackRate,1);report.media.push(row);
  }
  const links=await page.locator('[data-production-result]').evaluateAll(nodes=>nodes.map(n=>n.href));assert.equal(links.length,2);
  report.downloads=[];for(const url of links){const response=await fetch(url);assert(response.ok);const record=await response.json();report.downloads.push({url,id:record.identity.id,revision:record.revision,sha:record.integrity.recordSha256});}
  assert.equal(report.downloads[0].id,report.downloads[1].id);assert.equal(report.downloads[1].revision,report.downloads[0].revision+1);
  await page.screenshot({path:path.join(out,'production-media.png')});assert.equal(report.errors.length,0);report.status='passed';
 }catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
 finally{
  try{await session?.close();}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,build:report.build?.shortId,failure:report.failure}));}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
