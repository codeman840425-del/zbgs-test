const {chromium}=require('../prototype/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  page.on('pageerror',e=>console.error('PAGEERROR',e));
  await page.goto('http://127.0.0.1:4277/?workbench=appearance');
  await page.waitForFunction(()=>__debug.ready&&!document.querySelector('#appearance-fields').disabled);
  await page.evaluate(()=>{window.qaDocumentMarker='same-document';});
  await page.screenshot({path:'experiments/m2-appearance-workbench-v6/initial-1366.png'});
  await page.selectOption('#appearance-eye-color','blue');
  await page.waitForFunction(()=>!document.querySelector('#appearance-fields').disabled);
  await page.selectOption('#appearance-body','m1a-jaw-v1');
  await page.waitForFunction(()=>!document.querySelector('#appearance-fields').disabled);
  console.log('jaw',await page.locator('#appearance-status').textContent());
  assert.equal(await page.evaluate(()=>__debug.avatar().profile.bodyType),'m1a-jaw-v1');
  assert.equal(await page.evaluate(()=>window.qaDocumentMarker),'same-document');
  assert.equal(await page.evaluate(()=>__debug.avatar().appearance.getState().eyeColor),'blue');
  await page.locator('[data-appearance-group="male"]').click();
  await page.waitForFunction(()=>!document.querySelector('#appearance-fields').disabled);
  console.log('male',await page.locator('#appearance-status').textContent());
  assert.equal(await page.evaluate(()=>__debug.avatar().profile.bodyType),'male');
  await page.selectOption('#appearance-hair-style','male-sidepart-v1');
  await page.waitForFunction(()=>!document.querySelector('#appearance-fields').disabled);
  await page.selectOption('#appearance-hair-color','brown');
  await page.waitForFunction(()=>!document.querySelector('#appearance-fields').disabled);
  await page.screenshot({path:'experiments/m2-appearance-workbench-v6/male-1366.png'});
  await page.locator('#workbench-tab-actions').click();
  await page.screenshot({path:'experiments/m2-appearance-workbench-v6/actions-1366.png'});
  console.log(await page.evaluate(()=>({appearance:__debug.snapshot().appearance,body:__debug.avatar().profile.bodyType,marker:window.qaDocumentMarker})));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
