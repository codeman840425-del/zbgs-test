const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [dist,build,outArg]=process.argv.slice(2),out=path.resolve(outArg),report={build,status:'running',checks:[]};let server,browser;
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});}
(async()=>{
 await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);server=await serve(dist,build,{manifest:'company-build-info.json',entry:'company.html'});browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto(server.url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),build);
 await page.evaluate(()=>company.load(company.layouts.building));const original=await page.evaluate(()=>company.session.document);
 await check('Whole-building exterior is lightweight and has zero detailed 3D facilities or cached assets',async()=>{
  const result=await page.evaluate(()=>({view:company.session.scene.view,children:company.session.scene.root.children.length,assets:company.assetLibrary.snapshot(),facilities:company.snapshot().displayedFacilities,canvasHidden:document.getElementById('stage').hidden}));
  assert.equal(result.view.mode,'building');assert.equal(result.children,0);assert.equal(result.facilities,0);assert.equal(result.assets.loadedAssets,0);assert(result.canvasHidden);await page.screenshot({path:path.join(out,'01-building-exterior.png')});return result;
 });
 await check('Keyboard entry animates only the shell transition, without changing company data',async()=>{
  const facade=page.locator('.company-building-view__facade');await facade.focus();await page.keyboard.press('Enter');
  assert(await page.locator('.company-building-view').evaluate(node=>node.classList.contains('is-entering')));
  await page.waitForTimeout(250);await page.screenshot({path:path.join(out,'02-section-transition.png')});await page.waitForTimeout(420);
  assert.equal(await page.locator('.company-building-view__floor').count(),5);assert(await page.locator('.company-building-view__exterior').evaluate(n=>n.hidden&&n.inert));assert.deepEqual(await page.evaluate(()=>company.session.document),original);
  await page.screenshot({path:path.join(out,'03-building-section.png')});return{floors:5,transitionMilliseconds:600};
 });
 await check('Selecting a floor loads its real scene; floor camera stays fixed while dragging',async()=>{
  await page.locator('.company-building-view__floor').filter({hasText:'3层'}).click();await page.waitForFunction(()=>company.session.scene.view.mode==='floor'&&!document.getElementById('save').disabled);
  const before=await page.evaluate(()=>company.camera.position.toArray()),rect=await page.locator('#stage').boundingBox();
  await page.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.45);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.7,rect.y+rect.height*.5,{steps:10});await page.mouse.up();assert.deepEqual(await page.evaluate(()=>company.camera.position.toArray()),before);
  assert.equal(await page.evaluate(()=>company.session.scene.root.children.length>0),true);assert.equal(await page.evaluate(()=>company.assetLibrary.snapshot().loadedAssets),1);await page.screenshot({path:path.join(out,'04-real-floor.png')});return{floorId:await page.evaluate(()=>company.session.scene.view.floorId),locked:true};
 });
 await check('Entering a room enables full 3D viewing and all changes remain presentation only',async()=>{
  const id=await page.locator('#room option').first().getAttribute('value');await page.getByLabel('房间',{exact:true}).selectOption(id);await page.waitForFunction(()=>company.session.scene.view.mode==='room'&&!document.getElementById('save').disabled);
  const before=await page.evaluate(()=>company.camera.position.toArray()),rect=await page.locator('#stage').boundingBox();await page.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.4);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.65,rect.y+rect.height*.5,{steps:10});await page.mouse.up();assert.notDeepEqual(await page.evaluate(()=>company.camera.position.toArray()),before);assert.deepEqual(await page.evaluate(()=>company.session.document),original);await page.screenshot({path:path.join(out,'05-room-3d.png')});return{roomId:id,documentUnchanged:true};
 });
 await check('Return to section/exterior releases detailed resources; small viewport and reduced motion remain usable',async()=>{
  await page.getByRole('button',{name:'返回楼层剖面',exact:true}).click();await page.waitForFunction(()=>company.session.scene.view.mode==='building'&&!document.getElementById('save').disabled);
  assert.equal(await page.evaluate(()=>company.assetLibrary.snapshot().loadedAssets),0);await page.getByRole('button',{name:'返回大楼外观',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('.company-building-view__facade').click();assert.equal(await page.locator('.company-building-view').evaluate(n=>n.classList.contains('is-entering')),false);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'06-small-section.png'),fullPage:true});return{released:true,reducedMotion:true};
 });
 report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await server.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error,output:out}));});
