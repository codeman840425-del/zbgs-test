const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../../prototype/node_modules/playwright');
const {serve}=require('./serve.cjs');
const root=path.resolve(__dirname,'../..'),dist=path.resolve(process.argv[2]||path.join(root,'prototype/dist-company'));
const out=path.resolve(process.argv[3]||path.join(root,'evidence/company-facility-editor-browser-v1'));
let server,context,page;const errors=[],report={checks:[],limitations:['Browser software rendering; no ordinary-PC performance or character C3 claim.']};
async function open(){
 context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url);await page.waitForFunction(()=>window.company?.editor&&company.buildInfo,{timeout:30000});await idle();
}
async function idle(){await page.waitForFunction(()=>window.company?.editor&&!document.querySelector('#mode-room').disabled);}
async function doc(){return page.evaluate(()=>company.session.document);}
async function shot(name){await page.screenshot({path:path.join(out,name+'.png')});}
async function click(id){await page.locator('#'+id).click();await idle();}
async function choose(id,value){await page.locator('#'+id).selectOption(value);await idle();}
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});console.log(name);await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2));}
(async()=>{
 await fs.mkdir(out,{recursive:true});const info=JSON.parse(await fs.readFile(path.join(dist,'company-build-info.json')));report.build=info;server=await serve(dist,info.shortId,{manifest:'company-build-info.json',entry:'company.html'});await open();
 await check('Room layouts and sample scenes have separate entry points and visible contextual controls',async()=>{
   assert.equal(await page.locator('#mode-room').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#sample-browser').isVisible(),false);
   const labels=await page.locator('#layout option').allTextContents();assert(!labels.some(x=>x.includes('四款')));assert(await page.locator('#save').isVisible());
   const duplicateIds=await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((x,i)=>ids.indexOf(x)!==i);});assert.deepEqual(duplicateIds,[]);await shot('01-room-layout');return labels;
 });
 await check('Selecting a real room object swaps four actual looks in place, keeping identity and camera',async()=>{
   await choose('edit-instance','lounge/sofa');const before=await doc(),camera=await page.evaluate(()=>company.camera.position.toArray());
   const values=await page.locator('#edit-look option').evaluateAll(nodes=>nodes.map(n=>n.value));assert(values.length>=4,JSON.stringify(values));
   const rows=[];for(const value of values.slice(0,4)){await choose('edit-look',value);const d=await doc(),n=d.nodes.find(n=>n.id==='lounge/sofa');assert.equal(d.id,before.id);assert.equal(`${n.resource.id}@${n.resource.version}`,value);assert.deepEqual(n.transform,before.nodes.find(item=>item.id==='lounge/sofa').transform);assert.deepEqual(await page.evaluate(()=>company.camera.position.toArray()),camera);rows.push(n);}
   await shot('02-sofa-swapped');return rows;
 });
 await check('Rotate and move the selected object through actual UI; invalid placement preserves scene and save',async()=>{
   const before=await doc();await click('edit-rotate');let after=await doc();assert.equal(after.nodes.find(n=>n.id==='lounge/sofa').transform.yaw,Math.PI/2);
   await page.locator('#edit-fields details summary').click();await page.locator('#edit-x').fill('1.5');await click('edit-position');after=await doc();assert.equal(after.nodes.find(n=>n.id==='lounge/sofa').transform.position[0],1.5);
   await click('save');const saved=await page.evaluate(()=>({...localStorage}));await page.locator('#edit-x').fill('99');await click('edit-position');assert.deepEqual(await doc(),after);assert.deepEqual(await page.evaluate(()=>({...localStorage})),saved);assert.equal(await page.locator('#edit-message').getAttribute('data-error'),'true');await shot('03-invalid-preserves');return{before,after};
 });
 await check('New facility is added to current company, can be moved and rotated; sample visits preserve unsaved edits',async()=>{
   await page.locator('#add-panel>summary').click();await choose('add-branch','side-table');await choose('add-look','side-table-round@1');await click('add-center');
   let d=await doc(),n=d.nodes.find(n=>n.id.includes('/side-table-round'));assert(n,'No added side table');const id=n.id;assert.equal(d.id,'small-home-company');
   await page.locator('#edit-x').fill('0.6');await page.locator('#edit-z').fill('1.4');await click('edit-position');await click('edit-rotate');d=await doc();n=d.nodes.find(n=>n.id===id);assert.deepEqual(n.transform.position,[.6,0,1.4]);assert.equal(n.transform.yaw,Math.PI/2);await shot('04-added-and-moved');
   const draft=await doc();await click('mode-sample');assert.equal(await page.locator('#sample-browser').isVisible(),true);assert(!(await page.locator('#layout option').allTextContents()).includes('民房 · 一套工位'));
   await choose('sample-branch','side-table');await choose('sample-look','2');await click('sample-show');assert.notEqual((await doc()).id,draft.id);await shot('05-separate-sample');
   await click('mode-room');assert.deepEqual(await doc(),draft);await shot('06-returned-draft');return {id,document:draft};
 });
 await check('Click selection and click-to-move operate on real scene objects; different room layouts retain drafts',async()=>{
   const target=await page.evaluate(()=>company.session.document.nodes.find(n=>n.id.includes('/side-table-round')).id);
   await page.locator('#edit-instance').selectOption('');
   const pixel=await page.evaluate(id=>{const o=company.session.scene.root.getObjectByName(id),p=company.camera.position.clone().set(0,.48,0);o.localToWorld(p);p.project(company.camera);const r=document.querySelector('#stage canvas').getBoundingClientRect();return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};},target);
   await page.mouse.click(pixel.x,pixel.y);await idle();assert.equal(await page.locator('#edit-instance').inputValue(),target);
   await click('edit-move');const movePixel=await page.evaluate(()=>{const p=company.camera.position.clone().set(.8,0,1.2).project(company.camera),r=document.querySelector('#stage canvas').getBoundingClientRect();return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};});
   await page.mouse.click(movePixel.x,movePixel.y);await idle();const draft=await doc();assert.deepEqual(draft.nodes.find(n=>n.id===target).transform.position,[.8,0,1.2]);
   await choose('layout','studio');assert.notEqual((await doc()).id,draft.id);await choose('layout','smallHome');assert.deepEqual(await doc(),draft);return draft;
 });
 await check('Saved room survives closing the whole browser and restores the selected placement data',async()=>{
   await click('save');const before=await doc();await fs.writeFile(path.join(out,'company-layout.company.json'),await page.evaluate(()=>company.export()));await context.close();context=null;await open();assert.deepEqual(await doc(),before);assert.equal(await page.locator('#mode-room').getAttribute('aria-pressed'),'true');await shot('07-browser-reopened');return before;
 });
 await check('Small viewport keeps navigation, placement and save controls accessible',async()=>{
   await page.setViewportSize({width:760,height:900});await shot('08-small-viewport');assert(await page.locator('#save').isVisible());assert(await page.locator('#mode-room').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));return{width:760};
 });
 assert.deepEqual(errors,[]);report.status='passed';
})().catch(async e=>{report.status='failed';report.error={message:e.message,stack:e.stack};console.error(e);if(page)await shot('failure').catch(()=>{});process.exitCode=1;}).finally(async()=>{report.errors=errors;await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await context?.close();await server?.close();});
