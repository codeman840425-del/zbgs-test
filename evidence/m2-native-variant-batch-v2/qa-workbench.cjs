const {chromium}=require('../../prototype/node_modules/playwright');
const fs=require('node:fs/promises');

const port=4196;

(async()=>{
  const buildInfo=await (await fetch(`http://127.0.0.1:${port}/build-info.json`)).json();
  const report={schema:'m2-native-variant-workbench-check-v1',build:buildInfo.shortId,sourceDigest:buildInfo.sourceDigest,
    sourceCommit:'66d3d2a6e009',port,errors:[],cases:[]};
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const body of ['native-contour-roundness-a-v1','native-contour-cheek-b-v1']) {
      const page=await browser.newPage({viewport:{width:1440,height:1000}});
      const pageErrors=[];
      page.on('pageerror',error=>pageErrors.push(String(error)));
      const url=`http://127.0.0.1:${port}/?body=${body}&workbench=appearance&view=inspect-face-front`;
      const response=await page.goto(url,{waitUntil:'networkidle'});
      await page.waitForSelector('body.appearance-workbench',{timeout:30000});
      const data=await page.evaluate(()=>({
        selectedBody:document.querySelector('#appearance-body')?.value,
        availableBodies:[...document.querySelectorAll('#appearance-body option')].map(option=>option.value),
        matrix:[...document.querySelectorAll('li')].map(item=>item.textContent)
          .filter(text=>text.includes('制服')||text.includes('短裤')),
      }));
      report.cases.push({body,url,httpStatus:response?.status(),pageErrors,selectedBody:data.selectedBody,
        nativeBodies:data.availableBodies.filter(value=>value.startsWith('native-contour-')),matrix:data.matrix});
      report.errors.push(...pageErrors);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  report.status=report.errors.length?'failed':'technical-pass-diagnostic-only';
  await fs.writeFile(__dirname+'/workbench-check.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
