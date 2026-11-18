const {chromium} = require('../prototype/node_modules/playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');

async function main() {
  const [base, build, output] = process.argv.slice(2);
  assert.ok(output, 'Expected workbench URL, build and new report path');
  const browser = await chromium.launch({channel:'chrome'});
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.waitForFunction(() => window.__debug?.ready);
    await page.getByRole('tab',{name:'检查',exact:true}).click();
    const [review] = await Promise.all([page.waitForEvent('popup'),
      page.getByRole('link',{name:'入座时的发尾动态对照'}).click()]);
    review.on('pageerror', error => errors.push(error.message));
    await review.waitForURL('**/reviews/native-hair-motion/');
    await review.getByRole('heading',{name:'入座时的发尾动态'}).waitFor();
    const videos = [];
    for (const video of await review.locator('video').all()) {
      videos.push(await video.evaluate(async el => {
        el.muted = true;
        await el.play();
        await new Promise((resolve, reject) => {
          if (el.currentTime > 0) return resolve();
          const timer = setTimeout(() => reject(Error('No playback progress for ' + el.currentSrc)),8000);
          el.ontimeupdate = () => {
            if (el.currentTime <= 0) return;
            clearTimeout(timer); el.ontimeupdate = null; resolve();
          };
        });
        el.pause();
        return {url:el.currentSrc, advanced:el.currentTime > 0, width:el.videoWidth};
      }));
    }
    assert.ok(videos.length === 2 && videos.every(video => video.width && video.advanced), JSON.stringify(videos));
    await review.getByRole('link',{name:'体验面颊样件'}).click();
    await review.waitForFunction(() => window.__debug?.ready);
    const state = await review.evaluate(() => ({fit:__debug.avatar().nativeHairCenterFit,
      build:__debug.buildInfo.shortId, body:__debug.avatar().profile.bodyType}));
    assert.equal(state.fit,'native-hair-upper-chest-v1');
    assert.equal(state.build,build);
    assert.equal(state.body,'native-contour-cheek-b-v1');
    assert.deepEqual(errors,[]);
    await fs.writeFile(output, JSON.stringify({state,videos,errors},null,2)+'\n',{flag:'wx'});
    console.log(state);
  } finally {
    await browser.close();
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
