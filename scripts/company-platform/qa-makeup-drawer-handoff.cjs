const {chromium}=require('../../prototype/node_modules/playwright');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [packageArg,outArg]=process.argv.slice(2),root=path.resolve(packageArg),out=path.resolve(outArg),report={status:'running',package:root,checks:[],limits:['SwiftShader independent package use; no C3 or ordinary-device claim']};
let server,context,url;
const run=args=>execFileSync(process.execPath,[path.join(root,'edit.mjs'),...args],{cwd:root,encoding:'utf8',stdio:'pipe'});
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await context.newPage();await page.goto(url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);return page;}
async function check(name,fn){report.checks.push({name,passed:true,result:await fn()});}
(async()=>{
 await fs.mkdir(out);const manifest=JSON.parse(await fs.readFile(path.join(root,'transfer-manifest.json')));report.build=manifest.buildId;
 await check('All standalone manifest bytes match before editing',async()=>{for(const f of manifest.files){const b=await fs.readFile(path.join(root,f.path));assert.equal(b.length,f.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256);}return{files:manifest.files.length};});
 await check('Standalone edit changes one storage and its opening state; unpaired movement is rejected without a partial output',async()=>{
  const good=path.join(out,'replace.ops.json'),bad=path.join(out,'invalid.ops.json');
  await fs.writeFile(good,JSON.stringify([{type:'replace-resource',id:'makeup-drawer/primary/insert',resource:{id:'makeup-drawer-case',version:1}},{type:'set-state',id:'makeup-drawer/primary',state:{openFraction:.83}}]));
  await fs.writeFile(bad,JSON.stringify([{type:'move',id:'vanity/primary',transform:{position:[0,0,0],yaw:0}}]));
  let code;try{run(['apply',path.join(root,'data/save.json'),bad,path.join(out,'must-not-exist')]);}catch(e){code=JSON.parse(e.stderr).code;}assert(code);await assert.rejects(fs.access(path.join(out,'must-not-exist')));
  return{rejection:code,edited:JSON.parse(run(['apply',path.join(root,'data/save.json'),good,path.join(out,'edited')]))};
 });
 server=spawn(process.execPath,[path.join(root,'serve.mjs')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});url=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('No package URL')),10000);server.once('error',reject);server.stdout.on('data',chunk=>{text+=chunk;const m=text.match(/http:\/\/127\.0\.0\.1:\d+\/company\.html/);if(m){clearTimeout(timer);resolve(m[0]);}});});
 let page=await open(),edited=JSON.parse(await fs.readFile(path.join(out,'edited/save.json'))).document;
 await check('Imported independent two-room scene loads actual models, preserves child state and requests only package resources',async()=>{
  const requests=[];page.on('request',r=>requests.push(r.url()));await page.locator('#file').setInputFiles(path.join(out,'edited/save.json'));await page.waitForFunction(id=>company.session.document.id===id&&!document.getElementById('save').disabled,edited.id);
  assert.deepEqual(await page.evaluate(()=>company.session.document),edited);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),manifest.buildId);
  const actual=await page.evaluate(()=>{company.setPreviewClock(33330);const a=company.session.scene.root.getObjectByName('vanity/primary'),b=company.session.scene.root.getObjectByName('makeup-drawer/primary');return{tableMesh:!!a?.getObjectByName('vanity-top'),storagePresent:!!b?.getObjectByName('cabinet-drawer-slide')};});assert(actual.tableMesh&&actual.storagePresent);
  await page.evaluate(()=>company.showSpace('floor',company.session.document.nodes[0].id));await page.evaluate(()=>company.drawHostFrame());await page.waitForTimeout(80);await page.screenshot({path:path.join(out,'independent-makeup-drawer.png')});await page.evaluate(()=>company.save());
  assert(requests.every(u=>u.startsWith(new URL(url).origin)||u.startsWith('data:')||u.startsWith('blob:')));return{actual,modelRequests:requests.filter(u=>u.endsWith('.glb'))};
 });
 await check('Complete edited company survives a separate browser process and both room views',async()=>{await context.close();context=null;page=await open();assert.deepEqual(await page.evaluate(()=>company.session.document),edited);for(const room of edited.nodes.filter(n=>n.kind==='room'))await page.evaluate(id=>company.showSpace('room',company.session.document.nodes[0].id,id),room.id);assert.equal(edited.nodes.find(n=>n.id==='makeup-drawer/primary').state.openFraction,.83);assert.equal(edited.nodes.find(n=>n.id==='makeup-drawer/secondary').state.openFraction,.25);assert.deepEqual(edited.nodes.find(n=>n.id==='makeup-drawer/primary/insert/content').transform.position,[0,.01,-.045]);return{rooms:2};});
 report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)server.kill();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
