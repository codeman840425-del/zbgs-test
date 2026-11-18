const {chromium}=require('../../prototype/node_modules/playwright'),{serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim())throw Error('Recording requires clean fixed source');
let server,browser,context,video,page;const report={sourceCommit,build,playbackSpeed:1,steps:[],limits:['Software Chromium functional recording; not ordinary-PC performance or C3/human acceptance.']};
(async()=>{
 await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw'),size:{width:1440,height:1000}}});page=await context.newPage();video=page.video();
 await page.goto(server.url+'?layout=cables');await page.waitForFunction(()=>window.company?.editor&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);const start=Date.now();
 async function idle(){await page.waitForFunction(()=>!document.querySelector('#mode-room').disabled);}
 async function step(name){await idle();await page.waitForTimeout(1900);await page.screenshot({path:path.join(out,name+'.png')});report.steps.push({name,seconds:(Date.now()-start)/1000});}
 await step('01-device-desk');await page.locator('#edit-instance').selectOption('cable/primary');await page.locator('#edit-focus').click();await step('02-connected');
 for(const [index,id]of ['dual-sleeve','braided-loop','flat-ribbon'].entries()){await page.locator('#edit-look').selectOption('cable-route-'+id+'@1');await step('03-look-'+(index+2));}
 await page.locator('#edit-states button').click();await step('04-disconnected');await page.locator('#edit-states button').click();await step('05-reconnected');
 await page.locator('#edit-instance').selectOption('cable/desk');await idle();await page.locator('#edit-rotate').click();await idle();await page.locator('#edit-focus').click();await step('06-whole-desk-rotated');
 await page.locator('#layout').selectOption('cableAlternate');await idle();await page.locator('#edit-instance').selectOption('cable/primary');await page.locator('#edit-focus').click();await step('07-second-span');
 await page.locator('#edit-states button').click();await page.locator('#save').click();await idle();const saved=await page.evaluate(()=>company.session.document);await step('08-saved-disconnected');
 await page.goto(server.url);await page.waitForFunction(()=>window.company?.editor&&company.buildInfo);assert.deepEqual(await page.evaluate(()=>company.session.document),saved);await page.locator('#edit-instance').selectOption('cable/primary');await page.locator('#edit-focus').click();await step('09-restored');report.elapsedSeconds=(Date.now()-start)/1000;report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;console.error(e);}).finally(async()=>{await context?.close();if(video)await video.saveAs(path.join(out,'cable-normal1x.webm'));await browser?.close();await server?.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status);});
