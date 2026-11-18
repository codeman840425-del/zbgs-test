import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
const [trialArg,deliveryArg,outArg]=process.argv.slice(2);
assert(trialArg&&deliveryArg&&outArg,'Usage: node fifth-browser.mjs TRIAL DERIVED_PACKAGE NEW_OUTPUT');
const trial=path.resolve(trialArg),delivery=path.resolve(deliveryArg),out=path.resolve(outArg);
const {chromium}=await import(pathToFileURL(path.join(trial,'source/prototype/node_modules/playwright/index.mjs')));
const read=async file=>fs.readFile(path.join(delivery,file));
const manifest=JSON.parse(await read('transfer-manifest.json'));
const companyId='mouse-pad-home',roomId=companyId+'/ground/live',station=roomId+'/station-1';
const mouse=station+'/mouse',cable=station+'/mouse-cable',desk=station+'/desk',expected={id:'mouse-pad-compact-mat',version:2};
const hash=b=>createHash('sha256').update(b).digest('hex');
const report={status:'running',build:manifest.buildId,errors:[]};
await fs.mkdir(out);
const server=spawn(process.execPath,['serve.mjs','0'],{cwd:delivery,windowsHide:true,stdio:['ignore','pipe','inherit']});
let context,page,requests;
async function idle(){await page.waitForFunction(()=>window.company?.editor&&company.buildInfo&&!document.querySelector('#mode-room').disabled);assert.equal(await page.locator('#status').getAttribute('data-error'),'false');}
async function open(url){
  context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:900},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  page=context.pages()[0]||await context.newPage();requests=new Map();
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('response',r=>requests.set(new URL(r.url()).pathname,r));
  await page.goto(url);
  await page.waitForFunction(s=>window.company?.session?.document.id===s,companyId);
  await idle();assert.equal(await page.evaluate(()=>company.buildInfo.shortId),manifest.buildId);
  await page.evaluate(async id=>company.showSpace('room',company.session.document.nodes.find(n=>n.id===id).parentId,id),roomId);
}
async function inspect(connected){
  const result=await page.evaluate(({mouse,cable,desk})=>{
    const root=company.session.scene.root,doc=company.session.document,d=doc.nodes.find(n=>n.id===mouse);
    const m=root.getObjectByName(mouse),h=root.getObjectByName(desk),c=root.getObjectByName(cable);
    const resource=company.catalog.resources.find(r=>r.id===d.resource.id&&r.version===d.resource.version);
    const meshNames=[];
    m.traverseVisible(o=>{if(o.isMesh&&o.geometry?.getAttribute('position')?.count)meshNames.push(o.name);});
    let route;c.traverse(o=>{if(o.userData.cableRoute)route=o.userData.cableRoute;});
    const bindings=[...resource.materialSlots.body,...resource.materialSlots.pad,...resource.cablePortNodes.usb.frame,resource.cablePortNodes.usb.backing];
    return {resource:d.resource,bindings,meshNames,attached:m.parent===h,asset:resource.asset,route,link:doc.nodes.find(n=>n.id===cable).cableLink};
  },{mouse,cable,desk});
  assert.deepEqual(result.resource,expected);assert(result.attached);assert(result.bindings.every(name=>result.meshNames.includes(name)));
  assert.equal(result.route.connected,connected);assert(Math.abs(result.route.span-.249)<1e-6);
  assert(Math.abs(result.route.length-(connected?.249:.224))<1e-6);assert.equal(result.link.b.deviceId,mouse);
  const response=requests.get(result.asset.url),bytes=await read('viewer'+result.asset.url);
  assert(response?.ok());assert(bytes.equals(await response.body()));assert.equal(hash(bytes),result.asset.sha256);
  return result;
}
async function close(){await context.close();context=null;}
try{
  const lines=createInterface({input:server.stdout});const [address]=await once(lines,'line',{signal:AbortSignal.timeout(20000)});lines.close();
  const url=new URL(address);assert.equal(url.hostname,'127.0.0.1');assert(Number(url.port)>0);
  url.search='delivery=1';await open(url.href);
  assert.deepEqual(await page.evaluate(()=>company.session.document),JSON.parse(await read('data/save.json')).document);
  await page.locator('#edit-instance').selectOption(mouse);
  const menu=await page.locator('#edit-look option').evaluateAll(ns=>ns.map(n=>n.value));
  assert.equal(menu.length,5);assert(menu.includes('mouse-pad-compact-mat@2'));
  await page.locator('#edit-look').selectOption('mouse-pad-office@1');await idle();
  await page.locator('#edit-look').selectOption('mouse-pad-compact-mat@2');await idle();
  report.connected=await inspect(true);
  await page.evaluate(id=>{
    const d=company.session.scene.root.getObjectByName(id),c=company.camera;
    const local=(x,y,z)=>d.localToWorld(c.position.clone().set(x,y,z));
    c.position.copy(local(.87,1.19,.79));c.lookAt(local(.57,.86,.14));c.updateMatrixWorld();
    company.session.scene.setWallView({mode:'cutaway',cameraPosition:c.position.toArray()});company.drawHostFrame();
  },desk);
  await page.screenshot({path:path.join(out,'fifth-connected.png')});
  await page.locator('#edit-instance').selectOption(cable);
  await page.locator('#edit-states button[aria-pressed="true"]').click();await idle();
  await page.locator('#save').click();await idle();
  const saved=await page.evaluate(()=>company.export());report.savedSha256=hash(saved);
  report.retracted=await inspect(false);await close();
  url.search='';await open(url.href);
  assert.equal(await page.evaluate(()=>company.export()),saved);
  assert.deepEqual(await page.evaluate(()=>company.session.document),JSON.parse(saved).document);
  report.afterRestart=await inspect(false);
  report.menu=menu;report.status='passed';assert.deepEqual(report.errors,[]);
}catch(e){report.status='failed';report.failure=e.stack;console.error(e);process.exitCode=1;}
finally{
  await context?.close();if(server.exitCode===null&&!server.killed){const ended=once(server,'exit');server.kill();await ended;}
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status,report.build,report.savedSha256);
}
