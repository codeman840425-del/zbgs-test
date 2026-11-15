const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_DIR || path.resolve(__dirname, '../../../prototype/node_modules/playwright'));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.goto('https://amarilloarts.itch.io/blender-chan/purchase');
    await page.getByText('No thanks, just take me to the downloads', { exact: true }).click();
    const row = page.locator('.upload').filter({ hasText: 'BlenderChan - Free.blend' });
    await row.waitFor();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 45000 }),
      row.getByText('Download', { exact: true }).click(),
    ]);
    await download.saveAs(path.join(__dirname, 'BlenderChan-Free.blend'));
    const failure = await download.failure();
    if (failure) throw new Error(failure);
    console.log('Downloaded free .blend; verify manifest SHA before inspection.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
