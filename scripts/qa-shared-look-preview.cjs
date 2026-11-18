// Check the human review link through the actual workbench, on a temporary server.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('../prototype/node_modules/playwright');
const [base, build, output] = process.argv.slice(2);

(async () => {
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const report = {build, views:[], videos:[], errors:[]};
  try {
    for (const body of ['female', 'male', 'native-contour-roundness-a-v1', 'native-male-7586-v1']) {
      const page = await browser.newPage();
      page.on('pageerror', error => report.errors.push(error.message));
      await page.goto(base + '/?workbench=appearance&body=' + body);
      await page.waitForFunction(() => window.__debug?.ready, null, {timeout:90000});
      assert.equal(await page.evaluate(() => window.__debug.buildInfo.shortId), build);
      await page.locator('#workbench-tab-inspection').click();
      const link = page.locator('a[href="/reviews/shared-looks/"]');
      assert.equal(await link.isVisible(), true);
      const loaded = await page.evaluate(() => {
        const {bodyType, id, sha256} = window.__debug.avatar().profile;
        return {bodyType, id, sha256};
      });
      assert.equal(loaded.bodyType, body);
      report.views.push(loaded);
      if (!report.videos.length) {
        const [review] = await Promise.all([page.waitForEvent('popup'), link.click()]);
        await review.waitForLoadState();
        assert.equal(await review.locator('code').innerText(), '7809b98bd700');
        const videos = review.locator('video');
        assert.equal(await videos.count(), 3);
        for (const video of await videos.all()) {
          const sample = await video.evaluate(async element => {
            element.muted = true;
            await element.play();
            return new Promise((resolve, reject) => {
              const timer = setTimeout(() => reject(new Error('No sustained media playback')), 15000);
              function check() {
                if (element.currentTime < 1) return;
                clearTimeout(timer);
                element.removeEventListener('timeupdate', check);
                element.pause();
                resolve({src:element.getAttribute('src'), seconds:element.currentTime,
                         rate:element.playbackRate, width:element.videoWidth, height:element.videoHeight});
              }
              element.addEventListener('timeupdate', check);
            });
          });
          assert.equal(sample.rate, 1);
          assert.ok(sample.width && sample.height);
          report.videos.push(sample);
        }
      }
      await page.context().close();
    }
    assert.deepEqual(report.errors, []);
    await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n', {flag:'wx'});
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
