// Bounded user-path check of the fixed workbench's native production entry.
const { chromium } = require('../prototype/node_modules/playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const [base, build, destination] = process.argv.slice(2);
assert(base && /^[a-f0-9]{12}$/.test(build) && destination);
const out = path.resolve(destination);
(async () => {
  await fs.mkdir(out, {recursive:false});
  await fs.copyFile(__filename, path.join(out,'executed-script.cjs'));
  const result = {build, base, status:'incomplete', errors:[], poses:[], videos:[],
    scope:'Actual fixed workbench link, male/female hot switching, face edit, movement and production media. Development browser only; no full new-body/factory or performance acceptance.'};
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    result.browser = browser.version();
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    const page = await context.newPage();
    context.on('page', p => p.on('pageerror',e=>result.errors.push(String(e))));
    page.on('pageerror', e=>result.errors.push(String(e)));
    await page.goto(new URL('/?workbench=appearance',base).href);
    await page.waitForFunction(()=>window.__debug?.ready && !document.querySelector('#appearance-fields').disabled);
    assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build);
    await page.evaluate(()=>window.nativeEntryDocumentMarker='same-document');
    for(const sex of ['male','female']) {
      await page.locator(`[data-appearance-group=${sex}]`).click();
      await page.waitForFunction(sex=>__debug.avatar().profile.bodyType===sex&&!document.querySelector('#appearance-fields').disabled,sex);
      assert.equal(await page.evaluate(()=>window.nativeEntryDocumentMarker),'same-document');
    }
    const details=page.locator('#appearance-geometry');
    if(!await details.evaluate(node=>node.open)) await details.locator('summary').click();
    await page.locator('#mouth-width-sample').selectOption('0.12');
    await page.waitForFunction(()=>__debug.avatar().facialGeometry.getState().mouthWidth===.12&&!document.querySelector('#appearance-fields').disabled);
    const before=await page.evaluate(()=>__debug.snapshot().position);
    await page.locator('[data-camera=room]').click();
    await page.waitForTimeout(650);
    const box=await page.locator('#phaser-stage canvas').boundingBox();
    await page.mouse.click(box.x+box.width*.52,box.y+box.height*.73);
    await page.waitForFunction(before=>Math.hypot(...__debug.snapshot().position.map((v,i)=>v-before[i]))>.1,before,{timeout:10000});
    result.movement={before,after:await page.evaluate(()=>__debug.snapshot().position)};
    await page.locator('#workbench-tab-inspection').click();
    const link=page.locator('a[href="/native-production.html"]');
    await link.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,'workbench-entry.png')});
    const popup=context.waitForEvent('page');await link.click();const preview=await popup;
    await preview.waitForLoadState();
    for(const pose of ['happy-1','happy-065','neutral','blink','aa']) {
      await preview.locator(`[data-pose="${pose}"]`).click();
      await preview.waitForFunction(pose=>[...document.querySelectorAll('img')].every(img=>img.complete&&img.naturalWidth>0&&img.src.endsWith('/'+pose+'.png')),pose);
      result.poses.push(await preview.locator('img').evaluateAll(images=>images.map(img=>({src:img.src,width:img.naturalWidth,height:img.naturalHeight}))));
    }
    await preview.locator('[data-pose="happy-1"]').click();
    await preview.waitForFunction(()=>[...document.querySelectorAll('img')].every(img=>img.complete&&img.src.endsWith('/happy-1.png')));
    await preview.screenshot({path:path.join(out,'native-close.png'),fullPage:true});
    for(const video of await preview.locator('video').all()) {
      await video.scrollIntoViewIfNeeded();
      await video.evaluate(async v=>{v.muted=true;v.playbackRate=1;await v.play();});
      await preview.waitForFunction(src=>{const v=[...document.querySelectorAll('video')].find(v=>v.currentSrc===src);return v&&v.currentTime>2&&!v.error;},await video.evaluate(v=>v.currentSrc));
      result.videos.push(await video.evaluate(v=>{v.pause();return{src:v.currentSrc,time:v.currentTime,rate:v.playbackRate,width:v.videoWidth,height:v.videoHeight,error:v.error?.code??null};}));
    }
    assert.equal(result.videos.length,2);
    assert.equal(await preview.locator('#media-error').isVisible(),false);
    await preview.setViewportSize({width:700,height:900});
    assert(await preview.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await preview.screenshot({path:path.join(out,'native-narrow.png')});
    assert.deepEqual(result.errors,[]);
    result.status='passed-bounded-entry-check';
  } catch(error) { result.status='failed';result.failure=String(error);process.exitCode=1;console.error(error); }
  finally {await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(result,null,2)+'\n');console.log(result.status);}
})();
