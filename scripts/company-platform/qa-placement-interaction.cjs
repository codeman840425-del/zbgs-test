const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../../prototype/node_modules/playwright'),{serve}=require('./serve.cjs');
const dist=path.resolve(process.argv[2]||'prototype/dist-company'),out=path.resolve(process.argv[3]||'output/playwright/company-placement-dev1');
let server,context,page;const errors=[],report={checks:[],scope:'Real pointer UI paths, software rendering; no character or target-device performance claim.'};
const idle=()=>page.waitForFunction(()=>window.company?.editor&&!document.querySelector('#mode-room').disabled);
const doc=()=>page.evaluate(()=>company.session.document);
const click=async id=>{await page.locator('#'+id).click();await idle();};
const choose=async(id,value)=>{await page.locator('#'+id).selectOption(value);await idle();};
const shot=async name=>page.screenshot({path:path.join(out,name+'.png')});
const snap=()=>page.evaluate(()=>company.editor.placement.snapshot());
const camera=()=>page.evaluate(()=>({position:company.camera.position.toArray(),quaternion:company.camera.quaternion.toArray()}));
const screen=position=>page.evaluate(p=>{const s=company.editor.placement.snapshot(),c=company.renderer.domElement.getBoundingClientRect(),v=company.camera.position.clone().fromArray(p).applyMatrix4(company.camera.matrixWorld.clone().fromArray(s.parentMatrix)).project(company.camera);return{x:c.left+(v.x+1)*c.width/2,y:c.top+(1-v.y)*c.height/2};},position);
const drag=async(a,b)=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});await page.mouse.up();await idle();};
async function arm(){await click('edit-move');await page.waitForFunction(()=>company.editor.placement.snapshot()?.complete,{},{timeout:120000});}
async function check(name,fn){const observed=await fn();report.checks.push({name,passed:true,observed});console.log(name);}
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},...(process.env.COMPANY_RECORD==='1'?{recordVideo:{dir:path.join(out,'normal-speed-video'),size:{width:1440,height:1000}}}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await idle();await page.waitForFunction(()=>company.buildInfo);}
(async()=>{await fs.mkdir(out,{recursive:true});report.recording={enabled:process.env.COMPANY_RECORD==='1',playbackSpeed:1,clock:'real wall clock, no video speed transform'};report.build=JSON.parse(await fs.readFile(path.join(dist,'company-build-info.json')));server=await serve(dist,report.build.shortId,{manifest:'company-build-info.json',entry:'company.html'});await open();
await choose('layout','studio');await click('tool-add');await choose('add-branch','side-table');await choose('add-look','side-table-round@1');await click('add-center');await click('tool-selection');const id=(await doc()).nodes.find(n=>n.id.includes('/side-table-round')).id;await choose('edit-instance',id);await page.locator('#placement-tools>summary').click();
await check('Locked camera and checked green/red coordinates; invalid drag preserves document and save',async()=>{
 await click('save');const before=await doc(),saved=await page.evaluate(()=>JSON.stringify(localStorage));await arm();const s=await snap();assert(s.cells.some(c=>c.valid)&&s.cells.some(c=>c.valid===false));await shot('01-regions');
 const green=s.cells.find(c=>c.valid&&Math.abs(c.position[0])<1.5&&c.position[2]>1),red=s.cells.find(c=>c.valid===false&&c.position[0]>2.6&&Math.abs(c.position[2])<1);assert(green&&red);const a=await screen(green.position),b=await screen(red.position),locked=await camera();await page.mouse.move(a.x,a.y);await page.mouse.wheel(0,500);await drag(a,b);assert.deepEqual(await camera(),locked);assert.deepEqual(await doc(),before);assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),saved);assert.equal(await page.locator('#placement-status').getAttribute('data-valid'),'false');await shot('02-invalid');return{checked:s.checked,total:s.total,red:red.position};
});
await check('Left drag commits green snapped position and exits lock; Esc abandons a pending edit',async()=>{
 let s=await snap();const green=s.cells.find(c=>c.valid&&c.position[0]<-1.4&&c.position[2]>1),p=await screen(green.position);await drag({x:p.x+20,y:p.y+10},p);assert.deepEqual((await doc()).nodes.find(n=>n.id===id).transform.position,green.position);assert.equal(await snap(),null);assert.equal(await page.locator('#save-state').textContent(),'有未保存修改');const before=await doc();await arm();await page.keyboard.press('Escape');assert.equal(await snap(),null);assert.deepEqual(await doc(),before);await shot('03-placed');return{position:green.position};
});
await check('Right menu rotates without camera pan, drag menu recomputes, deletes with existing identity semantics',async()=>{
 const pixel=await page.evaluate(id=>{const obj=company.session.scene.root.getObjectByName(id),v=company.camera.position.clone().set(0,.35,0).applyMatrix4(obj.matrixWorld).project(company.camera),r=company.renderer.domElement.getBoundingClientRect();return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};},id);
 const beforeCamera=await camera();await page.mouse.click(pixel.x,pixel.y,{button:'right'});assert(await page.locator('#facility-context-menu').isVisible());assert.deepEqual(await camera(),beforeCamera);const before=(await doc()).nodes.find(n=>n.id===id);await page.getByRole('menuitem',{name:'旋转 90°'}).click();await idle();assert.equal((await doc()).nodes.find(n=>n.id===id).transform.yaw,(before.transform.yaw+Math.PI/2)%(Math.PI*2));
 await arm();const s=await snap(),green=s.cells.find(c=>c.valid&&c.position[2]>1),p=await screen(green.position);await page.mouse.click(p.x,p.y,{button:'right'});await page.getByRole('menuitem',{name:'旋转 90°'}).click();assert.notEqual((await snap()).yaw,s.yaw);await page.keyboard.press('Escape');await shot('04-context');
 await page.mouse.click(pixel.x,pixel.y,{button:'right'});await page.getByRole('menuitem',{name:'删除物品'}).click();await idle();assert(!(await doc()).nodes.some(n=>n.id===id));return{id};
});
await check('Wall and support placement use their actual plane and retain locked coordinates',async()=>{
 const results=[];
 for(const branch of ['analog-clock','analog-clock-shelf']){
  await click('mode-sample');await choose('sample-branch',branch);await click('sample-show');
  const id=await page.locator('#edit-instance').inputValue(),before=(await doc()).nodes.find(n=>n.id===id);
  await page.locator('#placement-tools>summary').click();const began=Date.now();await arm();const s=await snap();
  assert.equal(s.step,.1);assert(s.cells.some(c=>c.valid));assert(s.cells.some(c=>c.valid===false));
  const valid=s.cells.filter(c=>c.valid&&JSON.stringify(c.position)!==JSON.stringify(before.transform.position));
  let target,p;
  for(const c of valid){const q=await screen(c.position);if(q.y>340&&q.y<760){target=c;p=q;break;}}
  assert(target,'Visible legal point exists');await page.mouse.move(p.x,p.y);await shot('05-'+branch);await drag({x:p.x+6,y:p.y+6},p);
  const after=(await doc()).nodes.find(n=>n.id===id);assert.deepEqual(after.transform.position,target.position);
  if(branch==='analog-clock'){assert.equal(after.transform.yaw,before.transform.yaw);assert.equal(after.transform.position[2],before.transform.position[2]);}
  else assert.equal(after.transform.position[1],before.transform.position[1]);
  results.push({branch,id,position:after.transform.position,mapAndDragMs:Date.now()-began});
 }
 return results;
});
await check('Missing portal stays unavailable; required workstation parts cannot be deleted',async()=>{
 await click('mode-room');await choose('layout','smallHome');await page.evaluate(async()=>{const old=structuredClone(company.layouts.smallHome);old.nodes.filter(n=>n.kind==='floor').forEach(n=>delete n.exteriorEntrances);await company.load(old);});await idle();await click('tool-add');await choose('add-branch','door-frame');assert(await page.locator('#add-place').isDisabled());assert((await page.locator('#add-note').textContent()).includes('真实门洞'));
 await click('tool-selection');const child=(await doc()).nodes.find(n=>n.stationId);assert(child);await choose('edit-instance',child.id);await page.locator('#placement-tools>summary').click();assert(await page.locator('#edit-remove').isDisabled());return{protected:child.id};
});
await check('Drag-add and whole workstation move retain stable children and rejected points',async()=>{
 await choose('layout','studio');await click('tool-add');await choose('add-branch','plant');await click('add-place');await page.waitForFunction(()=>company.editor.placement.snapshot()?.complete,{},{timeout:120000});
 await choose('add-look',await page.locator('#add-look').inputValue());assert.equal(await snap(),null);await click('add-place');await page.waitForFunction(()=>company.editor.placement.snapshot()?.complete,{},{timeout:120000});
 const before=await doc(),s=await snap(),green=s.cells.find(c=>c.valid&&c.position[0]<-1&&c.position[2]>1),p=await screen(green.position);assert(green);await drag({x:p.x+5,y:p.y+5},p);
 let after=await doc();const added=after.nodes.find(n=>!before.nodes.some(b=>b.id===n.id));assert(added);assert.deepEqual(added.transform.position,green.position);
 await click('tool-selection');const station=after.nodes.find(n=>n.kind==='workstation');await choose('edit-instance',station.id);await page.locator('#placement-tools>summary').click();const children=after.nodes.filter(n=>n.stationId===station.id);await arm();
 const map=await snap(),target=map.cells.find(c=>c.valid&&Math.hypot(c.position[0]-station.transform.position[0],c.position[2]-station.transform.position[2])>.15);assert(target,JSON.stringify({original:station.transform,valid:map.cells.filter(c=>c.valid),errors:[...new Set(map.cells.map(c=>c.error))]}));const q=await screen(target.position);await drag({x:q.x+5,y:q.y+5},q);after=await doc();assert.deepEqual(after.nodes.filter(n=>n.stationId===station.id),children);assert.deepEqual(after.nodes.find(n=>n.id===station.id).transform.position,target.position);return{added:added.id,station:station.id,children:children.length};
});
await check('Save and browser restart preserve committed layout only',async()=>{await click('save');const saved=await doc();await context.close();context=null;await open();assert.deepEqual(await doc(),saved);assert.equal(await snap(),null);return{document:saved.id,revision:saved.revision};});
assert.deepEqual(errors,[]);report.status='passed';})().catch(async error=>{report.status='failed';report.error={message:error.message,stack:error.stack};console.error(error);await shot('failure').catch(()=>{});process.exitCode=1;}).finally(async()=>{report.errors=errors;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await context?.close();await server?.close();});
