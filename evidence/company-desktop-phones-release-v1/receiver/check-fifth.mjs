import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createInterface } from 'node:readline';
const [trialArg, candidateArg, outputArg] = process.argv.slice(2);
const trial=path.resolve(trialArg),candidate=path.resolve(candidateArg),out=path.resolve(outputArg);
const {chromium}=createRequire(path.join(trial,'source/prototype/package.json'))('playwright');
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async name=>JSON.parse(await fs.readFile(path.join(candidate,name),'utf8'));
const manifest=await read('transfer-manifest.json'), initial=await read('data/save.json');
const same=(a,b)=>assert.deepEqual(a,b);
const phone='phone-home/ground/live/station-1/phone', ref={id:'phone-static-compact-cradle',version:2};
const item=initial.document.nodes.find(r=>r.id===phone);same(item.resource,ref);
const resource=await read('source/prototype/public/company-assets/phone-static-v1/phone-static-compact-cradle/v2/resource.json');
const pin=manifest.files.find(r=>r.path==='viewer'+resource.asset.url);
const original=await fs.readFile(path.join(candidate,pin.path));assert.equal(hash(original),pin.sha256);
const rental=await fs.readFile(path.join(candidate,'data/rooms/phone-rental/save.json'));
assert(rental.equals(await fs.readFile(path.join(trial,'data/rooms/phone-rental/save.json'))));
await fs.mkdir(out);
const profile=await fs.mkdtemp(path.join(out,'chromium-profile-'));
const report={build:manifest.buildId,sourceDigest:manifest.sourceDigest,manifestSha256:hash(await fs.readFile(path.join(candidate,'transfer-manifest.json'))),ref,phone,roomSave:hash(await fs.readFile(path.join(candidate,'data/save.json'))),rentalSave:hash(rental),glb:pin,observations:[],browserErrors:[]};
const server=spawn(process.execPath,['serve.mjs','0'],{cwd:candidate,stdio:['ignore','pipe','inherit'],windowsHide:true});
let context,page,responses;
async function launch(url){
 context=await chromium.launchPersistentContext(profile,{headless:true,viewport:{width:1500,height:950},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 page=context.pages()[0];responses=[];
 page.on('pageerror',e=>report.browserErrors.push(e.message));
 page.on('response',r=>responses.push(r));
 await page.goto(url);
 await page.waitForFunction(()=>window.company?.editor && company.session.document.id==='phone-home' && document.querySelector('#status').dataset.error==='false');
 assert.equal(await page.evaluate(()=>company.buildInfo.sourceDigest),report.sourceDigest);
}
async function close(){
 if(!context)return;
 const browser=context.browser();await context.close();if(browser)assert(!browser.isConnected());context=null;
}
async function view(){
 await page.locator('#room').selectOption('phone-home/ground/live');
 await page.locator('.view-toolbar [data-view="room"]').click();
 await page.locator('#tool-selection').click();
 await page.locator('#edit-instance').selectOption(phone);
 await page.evaluate(id=>{
  const {session,camera}=company;const obj=session.scene.root.getObjectByName(id);
  const world=xyz=>obj.localToWorld(camera.position.clone().fromArray(xyz));
  camera.position.copy(world([.20,.26,.54]));camera.lookAt(world([-.09,.11,.025]));camera.updateMatrixWorld(true);
  session.scene.setWallView({mode:'cutaway',cameraPosition:camera.position.toArray()});company.drawHostFrame();
 },phone);
}
async function observe(label,expected){
 const state=await page.evaluate(id=>{
  const {session,camera}=company,entity=session.document.nodes.find(n=>n.id===id),obj=session.scene.root.getObjectByName(id),names=[];
  let screen;session.scene.root.traverseVisible(mesh=>{if(mesh.isMesh&&obj.getObjectById(mesh.id)){const name=mesh.userData.name||mesh.name;names.push(name);if(name==='phone-screen')screen=mesh;}});
  const mat=screen.material, geom=screen.geometry;
  geom.computeBoundingBox();const p=geom.boundingBox.getCenter(camera.position.clone());
  screen.localToWorld(p);p.project(camera);const box=company.renderer.domElement.getBoundingClientRect();
  return {ref:entity.resource,on:entity.state.on,names,parent:obj.parent.name,pose:obj.matrixWorld.toArray(),geometry:geom.type,triangles:(geom.index?.count??geom.attributes.position.count)/3,map:[mat.map.image.width,mat.map.image.height],color:mat.color.getHexString(),emissive:mat.emissive.getHexString(),intensity:mat.emissiveIntensity,center:[box.left+(p.x+1)*box.width/2,box.top+(1-p.y)*box.height/2],renderError:company.renderStatus().lastRenderError};
 },phone);
 same(state.ref,ref);same(state.on,expected);same(state.parent,item.parentId);same(state.renderError,null);
 for(const name of ['phone-dovetail-base','phone-dovetail-step','phone-dovetail-lip','phone-body-authored','phone-screen'])assert(state.names.includes(name),name);
 assert(state.triangles>=2);assert(state.map.every(v=>v>=32));
 const display=resource.display.screen;assert.equal(state.intensity,expected?display.onIntensity:0);
 assert.equal(state.color,(expected?display.onColor:display.offColor).slice(1));assert.equal(state.emissive,expected?display.emissive.slice(1):'000000');
 assert(state.center[0]>0&&state.center[0]<1500&&state.center[1]>0&&state.center[1]<950);
 const image=label+'.png';await page.screenshot({path:path.join(out,image)});
 report.observations.push({label,image,...state});
}
async function glbResponse(){
 const response=responses.find(r=>new URL(r.url()).pathname===resource.asset.url);assert.equal(response?.status(),200);
 const bytes=await response.body();assert(bytes.equals(original));return hash(bytes);
}
try{
 const lines=createInterface({input:server.stdout});const [url]=await once(lines,'line',{signal:AbortSignal.timeout(20000)});lines.close();server.stdout.resume();
 const local=new URL(url);assert(local.port&&local.hostname==='127.0.0.1');await launch(local.href);
 same(await page.evaluate(()=>company.session.document),initial.document);
 await view();await observe('01-lit',true);report.firstRequest=await glbResponse();
 await page.locator('#edit-states').getByRole('button',{name:/^电源[：:]/}).click();
 await page.waitForFunction(id=>company.session.document.nodes.find(x=>x.id===id).state.on===false,phone);
 await observe('02-off',false);
 const expected=structuredClone(initial.document);expected.revision++;
 expected.nodes.find(x=>x.id===phone).state.on=false;same(await page.evaluate(()=>company.session.document),expected);
 await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-state').dataset.dirty==='false');
 const saved=await page.evaluate(()=>company.session.readSavedText('phone-home'));const envelope=JSON.parse(saved);same(envelope.document,expected);
 const resourcePin=envelope.dependencies.resources.find(p=>p.id===ref.id&&p.version===ref.version);const issuedPin=initial.dependencies.resources.find(p=>p.id===ref.id&&p.version===ref.version);same(resourcePin,issuedPin);
 await fs.writeFile(path.join(out,'saved-off.json'),saved);report.savedSha256=hash(saved);report.savedDependency=resourcePin;
 await close();local.search='';await launch(local.href);
 assert.equal(await page.locator('#status').textContent(),'已恢复上次保存的方案。');
 same(await page.evaluate(()=>company.session.document),expected);same(await page.evaluate(()=>company.session.readSavedText('phone-home')),saved);
 assert(!responses.some(r=>new URL(r.url()).pathname.startsWith('/delivery-')));
 await view();await observe('03-restored-off',false);report.coldRequest=await glbResponse();
 same(report.observations[0].pose,report.observations[2].pose);same(report.browserErrors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
finally{await close();server.kill();await fs.rm(profile,{recursive:true,force:true});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
