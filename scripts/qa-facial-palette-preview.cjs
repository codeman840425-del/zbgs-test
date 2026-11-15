const { chromium } = require('../prototype/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const body of ['female','male']) {
      const page = await browser.newPage({viewport:{width:1600,height:1000}});
      page.on('pageerror', error => console.error('PAGEERROR', error));
      await page.goto('http://127.0.0.1:4277/?workbench=appearance&body=' + body);
      await page.waitForFunction(() => __debug.ready);
      for (const [eye, lip] of [['blue','rose'],['green','coral'],['violet','mauve']]) {
        await page.selectOption('#appearance-eye-color', eye);
        await page.waitForFunction(() => !document.querySelector('#appearance-fields').disabled);
        await page.selectOption('#appearance-lip-color', lip);
        await page.waitForFunction(() => !document.querySelector('#appearance-fields').disabled);
        await page.waitForTimeout(250);
        console.log(body, eye, lip, await page.locator('#appearance-status').textContent());
        await page.screenshot({path:'experiments/m2-appearance-workbench-v5/' + body + '-' + eye + '-' + lip + '.png'});
      }
      console.log(await page.evaluate(() => __debug.snapshot().appearance));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
