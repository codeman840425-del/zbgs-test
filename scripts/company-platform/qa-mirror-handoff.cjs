const {chromium}=require('../../prototype/node_modules/playwright');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [packageArg,outArg]=process.argv.slice(2),root=path.resolve(packageArg),out=path.resolve(outArg),report={status:'running',package:root,checks:[],limits:['SwiftShader; not ordinary-PC, role or offline npm installation proof']};
let server,context,url;
const run=args=>execFileSync(process.execPath,[path.join(root,'edit.mjs'),...args],{cwd:root,encoding:'utf8',stdio:'pipe'});
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await context.newPage();await page.goto(url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);return page;}
async function check(name,fn){report.checks.push({name,passed:true,result:await fn()});}
(async()=>{
 await fs.mkdir(out);const manifest=JSON.parse(await fs.readFile(path.join(root,'transfer-manifest.json')));report.build=manifest.buildId;
 await check('All standalone package files match the manifest',async()=>{for(const f of manifest.files){const b=await fs.readFile(path.join(root,f.path));assert.equal(b.length,f.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256);}return{files:manifest.files.length};});
 await check('Independent edit replaces a compatible mirror and rejects invalid mounting without output',async()=>{
  const good=path.join(out,'replace.ops.json'),bad=path.join(out,'invalid.ops.json');
  await fs.writeFile(good,JSON.stringify([{type:'replace-resource',id:'mirror/primary',resource:{id:'mirror-grid',version:1}}]));
  await fs.writeFile(bad,JSON.stringify([{type:'move',id:'mirror/primary',transform:{position:[0,0,0],yaw:0}}]));
  let code;try{run(['apply',path.join(root,'data/save.json'),bad,path.join(out,'must-not-exist')]);}catch(e){code=JSON.parse(e.stderr).code;}assert(code);await assert.rejects(fs.access(path.join(out,'must-not-exist')));
  return{rejection:code,edited:JSON.parse(run(['apply',path.join(root,'data/save.json'),good,path.join(out,'edited')]))};
 });
 server=spawn(process.execPath,[path.join(root,'serve.mjs')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});url=await new Promise((resolve,reject)=>{let text='';const timeout=setTimeout(()=>reject(Error('No server URL')),10000);server.on('error',reject);server.stdout.on('data',chunk=>{text+=chunk;const m=text.match(/http:\/\/127\.0\.0\.1:\d+\/company\.html/);if(m){clearTimeout(timeout);resolve(m[0]);}});});
 let page=await open(),edited=JSON.parse(await fs.readFile(path.join(out,'edited/save.json'))).document;
 await check('Independent viewer reflects its own scene and saves the edited resource without producer requests',async()=>{
  const requests=[];page.on('request',r=>requests.push(r.url()));await page.locator('#file').setInputFiles(path.join(out,'edited/save.json'));await page.waitForFunction(id=>company.session.document.id===id&&!document.getElementById('save').disabled,edited.id);
  await page.evaluate(()=>{company.camera.position.set(1.2,1.4,.5);company.camera.lookAt(1.2,1.4,-2.499);company.camera.updateMatrixWorld();company.session.scene.setWallView({mode:'full'});});await page.waitForFunction(()=>company.session.scene.mirrorBindings().some(b=>b.fresh));
  assert.deepEqual(await page.evaluate(()=>company.session.document),edited);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),manifest.buildId);await page.evaluate(()=>company.save());
  assert(requests.every(u=>u.startsWith(new URL(url).origin)||u.startsWith('data:')||u.startsWith('blob:')));await page.screenshot({path:path.join(out,'independent-mirror.png')});return{requests:requests.filter(u=>u.endsWith('.glb')),mirrors:await page.evaluate(()=>company.session.scene.mirrorBindings().map(b=>b.snapshot()))};
 });
 await check('Separate browser restart preserves the complete edited document',async()=>{await context.close();context=null;page=await open();assert.deepEqual(await page.evaluate(()=>company.session.document),edited);return{resource:edited.nodes.find(n=>n.id==='mirror/primary').resource};});
 report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)server.kill();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
