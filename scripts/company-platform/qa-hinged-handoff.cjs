const {chromium}=require('../../prototype/node_modules/playwright');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [packageArg,outArg]=process.argv.slice(2),root=path.resolve(packageArg),out=path.resolve(outArg);
const report={package:root,status:'running',checks:[],limits:['Software rendering; not ordinary-PC, character or offline npm-install proof']};
let server,context,url;
const run=args=>execFileSync(process.execPath,[path.join(root,'edit.mjs'),...args],{cwd:root,encoding:'utf8',stdio:'pipe'});
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await context.newPage();await page.goto(url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);return page;}
async function check(name,fn){report.checks.push({name,passed:true,result:await fn()});}
(async()=>{
  await fs.mkdir(out);const manifest=JSON.parse(await fs.readFile(path.join(root,'transfer-manifest.json')));report.build=manifest.buildId;
  await check('All standalone package files match their manifest',async()=>{
    for(const file of manifest.files){const bytes=await fs.readFile(path.join(root,file.path));assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}return{files:manifest.files.length};
  });
  await check('Standalone edit rejects invalid state and opens a cabinet using pinned dependencies',async()=>{
    const bad=path.join(out,'invalid.ops.json'),good=path.join(out,'attach.ops.json');
    await fs.writeFile(bad,JSON.stringify([{type:'set-state',id:'hinged/cabinet',state:{openFraction:2}}]));
    let code;try{run(['apply',path.join(root,'data/save.json'),bad,path.join(out,'must-not-exist')]);}catch(e){code=JSON.parse(e.stderr).code;}
    assert.equal(code,'invalid-device-state');await assert.rejects(fs.access(path.join(out,'must-not-exist')));
    await fs.writeFile(good,JSON.stringify([{type:'set-state',id:'hinged/cabinet',state:{openFraction:.5}}]));
    return{rejection:code,edited:JSON.parse(run(['apply',path.join(root,'data/save.json'),good,path.join(out,'edited')]))};
  });
  server=spawn(process.execPath,[path.join(root,'serve.mjs')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  url=await new Promise((resolve,reject)=>{let text='';const timeout=setTimeout(()=>reject(Error('No server URL')),10000);server.on('error',reject);server.stdout.on('data',chunk=>{text+=chunk;const match=text.match(/http:\/\/127\.0\.0\.1:\d+\/company\.html/);if(match){clearTimeout(timeout);resolve(match[0]);}});});
  let page=await open(),edited=JSON.parse(await fs.readFile(path.join(out,'edited/save.json'))).document;
  await check('Independent viewer loads edited hinged geometry and saves without source-tree asset requests',async()=>{
    const requests=[];page.on('request',r=>requests.push(r.url()));await page.locator('#file').setInputFiles(path.join(out,'edited/save.json'));await page.waitForFunction(id=>company.session.document.id===id&&!document.getElementById('save').disabled,edited.id);
    assert.deepEqual(await page.evaluate(()=>company.session.document),edited);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),manifest.buildId);
    await page.evaluate(()=>company.save());assert(requests.every(u=>u.startsWith(new URL(url).origin)||u.startsWith('data:')||u.startsWith('blob:')));
    assert(requests.some(u=>u.includes('/hinged-cabinet-v1/')));await page.screenshot({path:path.join(out,'independent-hingeds.png')});return{requests:requests.filter(u=>u.endsWith('.glb'))};
  });
  await check('Separate browser restart restores exact attachment IDs and transforms',async()=>{await context.close();context=null;page=await open();assert.deepEqual(await page.evaluate(()=>company.session.document),edited);return{nodes:edited.nodes.length,attachments:edited.nodes.filter(n=>n.attachment).length};});
  report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)server.kill();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
