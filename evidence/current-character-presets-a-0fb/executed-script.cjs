const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const out=path.resolve(process.argv[2]);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const report={build:'0fb420e5b124',scope:'Published A evidence page, independent sex buttons, large image and six actual 1x video playback checks; not product or art acceptance.',errors:[],videos:[]};
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true});p.on('pageerror',e=>report.errors.push(String(e)));
  const response=await p.goto('http://127.0.0.1:4174/evidence/m2-character-presets-a-v1/');assert.equal(response.status(),200);
  assert.equal(await p.locator('select#sex').count(),0);
  for(const sex of ['female','male']){
   await p.locator(`[data-select-sex=${sex}]`).click();assert.equal(await p.locator(`[data-select-sex=${sex}]`).getAttribute('aria-pressed'),'true');
   await p.waitForFunction(()=>[...document.querySelectorAll('#cards img')].every(i=>i.complete&&i.naturalWidth));
   await p.screenshot({path:path.join(out,sex+'-gallery.png')});
   await p.locator('.zoom').first().click();assert(await p.locator('dialog').evaluate(d=>d.open));await p.keyboard.press('Escape');assert(!await p.locator('dialog').evaluate(d=>d.open));
   const videos=p.locator('#movies video');assert.equal(await videos.count(),3);
   for(let i=0;i<3;i++){
    const v=videos.nth(i);await v.scrollIntoViewIfNeeded();await v.evaluate(async v=>{v.muted=true;v.playbackRate=1;await v.play()});
    const before=await v.evaluate(v=>v.currentTime);await p.waitForFunction(({i,before})=>{const v=document.querySelectorAll('#movies video')[i];return v.currentTime>before+1.2&&!v.error},{i,before},{timeout:15000});
    const state=await v.evaluate(v=>{v.pause();return{src:v.currentSrc,time:v.currentTime,rate:v.playbackRate,width:v.getBoundingClientRect().width,controls:v.controls,error:v.error?.code||null}});assert(state.width>1000&&state.controls&&state.rate===1&&!state.error);report.videos.push({sex,...state});
   }
  }
  assert.equal(report.errors.length,0);report.status='passed';
 }catch(e){report.status='failed-preserved';report.error=String(e);process.exitCode=1;console.error(e)}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,status:report.status}))}
})();
