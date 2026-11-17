const {chromium}=require('../../prototype/node_modules/playwright'),{serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(dist),encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:path.resolve(dist),encoding:'utf8'}).trim())throw Error('Recording requires clean fixed source');
let server,browser,context,video,page;const report={sourceCommit,build,playbackSpeed:1,steps:[],limits:['SwiftShader functional recording; ordinary-PC, character C3 and human acceptance are not claimed.']};
(async()=>{
 await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'raw'),size:{width:1440,height:1000}}});page=await context.newPage();video=page.video();
 await page.goto(server.url);await page.waitForFunction(()=>window.company?.editor&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);const start=Date.now();
 async function idle(){await page.waitForFunction(()=>!document.querySelector('#mode-room').disabled);}
 async function step(name){await idle();await page.waitForTimeout(1700);await page.screenshot({path:path.join(out,name+'.png')});report.steps.push({name,seconds:(Date.now()-start)/1000});}
 await step('01-room');await page.locator('#edit-instance').selectOption('lounge/sofa');await step('02-selected-sofa');
 const options=await page.locator('#edit-look option').evaluateAll(o=>o.map(v=>v.value));
 for(let i=1;i<4;i++){await page.locator('#edit-look').selectOption(options[i]);await step(`03-look-${i}`);}
 await page.locator('#edit-rotate').click();await step('04-rotated');
 await page.locator('#edit-fields details summary').click();await page.locator('#edit-x').fill('1.5');await page.locator('#edit-position').click();await step('05-position');
 await page.locator('#edit-fields details summary').click();await page.locator('#add-panel>summary').click();await page.locator('#add-branch').selectOption('side-table');await page.locator('#add-look').selectOption('side-table-round@1');await page.locator('#add-center').click();await step('06-added');
 await page.locator('#edit-move').click();await idle();const point=await page.evaluate(()=>{const p=company.camera.position.clone().set(.8,0,1.2).project(company.camera),r=document.querySelector('#stage canvas').getBoundingClientRect();return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};});await page.mouse.click(point.x,point.y);await step('07-click-move');
 await page.locator('#mode-sample').click();await step('08-sample-space');await page.locator('#sample-branch').selectOption('side-table');await page.locator('#sample-look').selectOption('2');await page.locator('#sample-show').click();await step('09-independent-look');
 await page.locator('#mode-room').click();await step('10-room-preserved');await page.locator('#save').click();await idle();const saved=await page.evaluate(()=>company.session.document);
 await page.reload();await page.waitForFunction(()=>window.company?.editor&&company.buildInfo);assert.deepEqual(await page.evaluate(()=>company.session.document),saved);await step('11-restored');report.status='recorded';report.seconds=(Date.now()-start)/1000;
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{await context?.close();if(video){await video.saveAs(path.join(out,'facility-editor-normal1x.webm'));await video.delete();}await browser?.close();await server?.close();await fs.writeFile(path.join(out,'recording.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
