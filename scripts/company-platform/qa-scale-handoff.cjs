const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {chromium}=require('../../prototype/node_modules/playwright'),{serve}=require('./serve.cjs');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),hash=b=>createHash('sha256').update(b).digest('hex');
let server,context,page;const report={checks:[],package:root};
(async()=>{
 await fs.mkdir(out);const manifest=JSON.parse(await fs.readFile(path.join(root,'transfer-manifest.json')));report.build=manifest.buildId;
 for(const file of manifest.files)assert.equal(hash(await fs.readFile(path.join(root,file.path))),file.sha256,file.path);
 report.checks.push({name:'all packaged manifest files',count:manifest.files.length});
 const fixed=path.join(root,'viewer'),rebuilt=path.join(root,'source/prototype/dist-company');
 async function files(dir,prefix=''){const result=[];for(const e of await fs.readdir(path.join(dir,prefix),{withFileTypes:true})){const name=path.posix.join(prefix,e.name);if(e.isDirectory())result.push(...await files(dir,name));else result.push(name);}return result.sort();}
 const original=await files(fixed);assert.deepEqual(await files(rebuilt),original);
 for(const name of original)assert.equal(hash(await fs.readFile(path.join(fixed,name))),hash(await fs.readFile(path.join(rebuilt,name))),name);
 report.checks.push({name:'independent rebuild runtime bytes',files:original.length});server=await serve(rebuilt,manifest.buildId,{manifest:'company-build-info.json',entry:'company.html'});
 async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});page=await context.newPage();await page.goto(server.url);await page.waitForFunction(()=>window.company?.editor&&company.buildInfo);}
 async function idle(){await page.waitForFunction(()=>!document.querySelector('#mode-room').disabled);}
 await open();await page.locator('#file').setInputFiles(path.join(root,'data/save.json'));await idle();
 const saved=JSON.parse(await fs.readFile(path.join(root,'data/save.json'))).document;
 assert.deepEqual(await page.evaluate(()=>company.session.document),saved);
 const sofa=saved.nodes.find(n=>n.resource?.id==='lounge-sofa'),target=sofa.id;
 await page.evaluate(id=>company.showSpace('room',undefined,id),sofa.parentId);await page.locator('#edit-instance').selectOption(target);await idle();
 const options=await page.locator('#edit-look option').evaluateAll(ns=>ns.map(n=>n.value)),next=options.find(x=>x!==`${sofa.resource.id}@${sofa.resource.version}`);
 assert(next);await page.locator('#edit-look').selectOption(next);await idle();await page.locator('#save').click();await idle();
 const before=await page.evaluate(()=>company.session.document),changed=before.nodes.find(n=>n.id===target);assert.equal(`${changed.resource.id}@${changed.resource.version}`,next);assert.deepEqual(changed.transform,sofa.transform);assert.equal(before.nodes.filter(n=>n.kind==='room').length,32);assert.equal(before.nodes.filter(n=>n.kind==='floor').length,2);
 await page.screenshot({path:path.join(out,'independent-edit.png')});await context.close();context=null;await open();assert.deepEqual(await page.evaluate(()=>company.session.document),before);
 report.checks.push({name:'real packaged multi-floor import, in-place replace, complete save and browser restart',target,document:before});report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;console.error(e);process.exitCode=1;}).finally(async()=>{await context?.close();await server?.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status);});
