const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const {pathToFileURL} = require('node:url');
const {productionRoot, projectOutput} = require('./project-output.cjs');

async function run(base, output) {
  const root=await productionRoot(), destination=await projectOutput(output, root);
  const {chromium} = require('../prototype/node_modules/playwright');
  const local=pathToFileURL(path.join(root,'evidence/m2-garment-texture-game-v1/index.html')).href;
  const browser=await chromium.launch({channel:'chrome', headless:true});
  const report={status:'incomplete',browser:browser.version(),checks:[]};
  try {
    report.roomButtons=[];
    for(const [body,index] of [['source-male-ab9a-release-v1',1],['female',5]]) {
      const page=await browser.newPage({viewport:{width:1440,height:900}});
      try {
        const url=new URL('/',base);
        url.search=new URLSearchParams({workbench:'appearance',body});
        await page.goto(url.href);
        await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});
        assert.equal(await page.locator('a[href="/reviews/uniform-texture/"]').count(),1);
        const choice=page.locator('[data-outfit="'+index+'"]');
        assert.equal(await choice.count(),1);
        // Outfit controls live in an existing workbench tab.
        if(!await choice.isVisible()) await page.getByRole('button',{name:'外观',exact:true}).click();
        await choice.click();
        await page.waitForFunction(i=>__debug.avatar().getOutfitInfo().index===i,index);
        await page.locator('[data-outfit="0"]').click();
        await page.waitForFunction(()=>__debug.avatar().getOutfitInfo().index===0);
        report.roomButtons.push({body,index,returnedTo:0});
      } finally {await page.close();}
    }
    for (const [url,width] of [[new URL('/reviews/uniform-texture/',base).href,1250],[local,350]]) {
      const page=await browser.newPage({viewport:{width,height:900}});
      try {
        const errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.goto(url);
        for(const gender of ['male','female']) {
          await page.locator('[data-gender="'+gender+'"]').click();
          await page.waitForFunction(()=>!document.querySelector('#play').disabled,null,{timeout:12000});
          await page.locator('#play').click();
          await page.waitForFunction(()=>[...document.querySelectorAll('video')].every(v=>!v.paused&&v.currentTime>.5));
          await page.locator('#play').click();
          const state=await page.evaluate(async()=>{
            const videos=[...document.querySelectorAll('video')];
            const images=[...document.querySelectorAll('#stills img')];
            for(const image of images){image.loading='eager';await image.decode();}
            return {paused:videos.every(v=>v.paused),times:videos.map(v=>v.currentTime),
              durations:videos.map(v=>v.duration),rates:videos.map(v=>v.playbackRate),
              imageWidths:images.map(i=>i.naturalWidth),viewport:innerWidth,documentWidth:document.documentElement.scrollWidth};
          });
          assert(state.paused&&state.rates.every(r=>r===1));
          assert(state.durations.every(seconds=>seconds>12 && seconds<30));
          assert(state.imageWidths.length===4&&state.imageWidths.every(w=>w>0));
          assert(state.documentWidth<=state.viewport);
          assert(Math.abs(state.times[0]-state.times[1])<.25);
          report.checks.push({protocol:new URL(url).protocol, gender, ...state});
        }
        assert.deepEqual(errors,[]);
      } finally {await page.close();}
    }
    report.status='passed';
  } catch(error) {report.failure=String(error.stack||error); throw error;}
  finally {await browser.close();await fs.writeFile(destination,JSON.stringify(report,null,2),{flag:'wx'});}
}
run(...process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
