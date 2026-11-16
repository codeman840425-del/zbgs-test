const {chromium}=require('../../prototype/node_modules/playwright');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [packageArg,outArg]=process.argv.slice(2),root=path.resolve(packageArg),out=path.resolve(outArg);
const report={package:root,status:'running',checks:[],limits:['No character or ordinary-PC acceptance. Dependency installation may use local npm cache and network; not an offline install proof.']};let server,context,url;
async function check(name,fn){const result=await fn();report.checks.push({name,passed:true,result});}
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000}});const page=await context.newPage();await page.goto(url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);return page;}
(async()=>{
 await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
 const manifest=JSON.parse(await fs.readFile(path.join(root,'transfer-manifest.json'),'utf8'));report.build=manifest.buildId;
 await check('Every delivered file still matches its complete package manifest',async()=>{for(const file of manifest.files){const bytes=await fs.readFile(path.join(root,file.path));assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}return{files:manifest.files.length};});
 await check('Standalone data editor rejects disconnected rooms and produces a complete editable save',async()=>{
  const layout=JSON.parse(await fs.readFile(path.join(root,'data/layout.json'),'utf8')),bad=structuredClone(layout);bad.nodes.find(n=>n.kind==='floor').connections=[];
  await fs.writeFile(path.join(out,'disconnected.json'),JSON.stringify(bad));let failure;
  try{execFileSync(process.execPath,[path.join(root,'edit.mjs'),'validate',path.join(out,'disconnected.json')],{cwd:root,encoding:'utf8',stdio:'pipe'});}catch(e){failure=JSON.parse(e.stderr).code;}
  assert.equal(failure,'disconnected-regions');
  const screen=layout.nodes.find(n=>n.resource?.id==='monitor');await fs.writeFile(path.join(out,'operations.json'),JSON.stringify([{type:'set-state',id:screen.id,state:{on:true}}]));
  const result=JSON.parse(execFileSync(process.execPath,[path.join(root,'edit.mjs'),'apply',path.join(root,'data/save.json'),path.join(out,'operations.json'),path.join(out,'edited')],{cwd:root,encoding:'utf8'}));assert.equal(result.floors.length,2);return{rejected:failure,...result};
 });
 server=spawn(process.execPath,[path.join(root,'serve.mjs')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
 url=await new Promise((resolve,reject)=>{let text='';const timeout=setTimeout(()=>reject(Error('Standalone server did not announce its URL')),10000);server.on('error',reject);server.stdout.on('data',chunk=>{text+=chunk;const found=text.match(/http:\/\/127\.0\.0\.1:\d+\/company\.html/);if(found){clearTimeout(timeout);resolve(found[0]);}});server.on('exit',code=>reject(Error('Server exited '+code)));});
 let page=await open();const saved=JSON.parse(await fs.readFile(path.join(root,'data/save.json'),'utf8')).document;
 await check('Packaged HTTP viewer imports the entire delivered company without source-tree resources',async()=>{
  const requests=[];page.on('request',request=>requests.push(request.url()));await page.locator('#file').setInputFiles(path.join(root,'data/save.json'));await page.waitForFunction(id=>company.session.document.id===id&&document.getElementById('save').disabled===false,saved.id);
  assert.deepEqual(await page.evaluate(()=>company.session.document),saved);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),manifest.buildId);
  for(const floor of saved.nodes.filter(n=>n.kind==='floor'))await page.evaluate(id=>company.showSpace('floor',id),floor.id);
  assert(requests.every(request=>request.startsWith(new URL(url).origin)||request.startsWith('blob:')||request.startsWith('data:')));
  await page.screenshot({path:path.join(out,'independent-viewer.png')});return{floors:saved.nodes.filter(n=>n.kind==='floor').length,requests:requests.filter(u=>u.endsWith('.glb'))};
 });
 let edited;
 await check('Package-produced edits can be imported and saved, with all template and resource pins intact',async()=>{
  edited=JSON.parse(await fs.readFile(path.join(out,'edited/save.json'),'utf8')).document;await page.locator('#file').setInputFiles(path.join(out,'edited/save.json'));await page.waitForFunction(revision=>company.session.document.revision===revision&&!document.getElementById('save').disabled,edited.revision);assert.deepEqual(await page.evaluate(()=>company.session.document),edited);await page.evaluate(()=>company.save());return{id:edited.id,revision:edited.revision};
 });
 await check('Independent viewer closes and reopens with the edited multi-floor company',async()=>{await context.close();context=null;page=await open();assert.deepEqual(await page.evaluate(()=>company.session.document),edited);return{companyId:edited.id,allNodes:edited.nodes.length};});
 report.status='passed';
})().catch(error=>{report.status='failed';report.error=error.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)server.kill();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error,output:out}));});
