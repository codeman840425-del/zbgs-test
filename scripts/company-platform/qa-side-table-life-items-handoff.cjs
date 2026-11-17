const {chromium}=require('../../prototype/node_modules/playwright');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [packageArg,outArg]=process.argv.slice(2),root=path.resolve(packageArg),out=path.resolve(outArg);
const report={package:root,status:'running',checks:[],limits:['Software rendering; not ordinary-PC, character or offline npm-install proof']};
let createdOut=false;
let server,context,url;const errors=[];
const run=args=>execFileSync(process.execPath,[path.join(root,'edit.mjs'),...args],{cwd:root,encoding:'utf8',stdio:'pipe'});
async function open(){context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);return page;}
async function check(name,fn){report.checks.push({name,passed:true,result:await fn()});}
(async()=>{
  await fs.mkdir(out);createdOut=true;const manifest=JSON.parse(await fs.readFile(path.join(root,'transfer-manifest.json')));report.build=manifest.buildId;
  await check('All independent package files match their manifest, including editable external source and license',async()=>{
    for(const file of manifest.files){const bytes=await fs.readFile(path.join(root,file.path));assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
    const source=manifest.files.filter(f=>f.path.includes('assets-source/company-side-table-life-items-v1/'));
    assert(source.some(f=>f.path.endsWith('.obj')));assert(source.some(f=>f.path.endsWith('.glb')));assert(source.some(f=>/license/i.test(f.path)));
    return{files:manifest.files.length,source};
  });
  await check('Independent edit rejects overhang and rotates the table with an attached off-centre ornament',async()=>{
    const bad=path.join(out,'invalid.ops.json'),good=path.join(out,'move.ops.json');
    await fs.writeFile(bad,JSON.stringify([{type:'move',id:'life-items/primary',transform:{position:[.14,.5,0],yaw:0}}]));
    let code;try{run(['apply',path.join(root,'data/save.json'),bad,path.join(out,'must-not-exist')]);}catch(e){code=JSON.parse(e.stderr).code;}
    assert.equal(code,'invalid-support-fit');await assert.rejects(fs.access(path.join(out,'must-not-exist')));
    await fs.writeFile(good,JSON.stringify([
      {type:'move',id:'life-items/primary',transform:{position:[.04,.5,.01],yaw:0}},
      {type:'move',id:'life-items/table',transform:{position:[.7,0,-.4],yaw:Math.PI/2}},
      {type:'replace-resource',id:'life-items/primary',resource:{id:'side-table-life-pen-notebook',version:1}},
    ]));
    return{rejection:code,edited:JSON.parse(run(['apply',path.join(root,'data/save.json'),good,path.join(out,'edited')]))};
  });
  server=spawn(process.execPath,[path.join(root,'serve.mjs')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  url=await new Promise((resolve,reject)=>{let text='';const timeout=setTimeout(()=>reject(Error('No server URL')),10000);server.on('error',reject);server.stdout.on('data',chunk=>{text+=chunk;const match=text.match(/http:\/\/127\.0\.0\.1:\d+\/company\.html/);if(match){clearTimeout(timeout);resolve(match[0]);}});});
  let page=await open();const edited=JSON.parse(await fs.readFile(path.join(out,'edited/save.json'))).document;
  await check('Independent viewer loads edited external models from its own package and saves real attachment transforms',async()=>{
    const requests=[];page.on('request',r=>requests.push(r.url()));await page.locator('#file').setInputFiles(path.join(out,'edited/save.json'));
    await page.waitForFunction(id=>company.session.document.id===id&&!document.getElementById('save').disabled,edited.id);
    assert.deepEqual(await page.evaluate(()=>company.session.document),edited);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),manifest.buildId);
    const world=await page.evaluate(()=>company.session.scene.root.getObjectByName('life-items/primary').getWorldPosition(company.camera.position.clone()).toArray());world.forEach((v,i)=>assert(Math.abs(v-[.71,.5,-.44][i])<1e-6));
    await page.evaluate(()=>company.save());assert(requests.every(u=>u.startsWith(new URL(url).origin)||u.startsWith('data:')||u.startsWith('blob:')));
    assert(requests.some(u=>u.includes('/side-table-life-items-v1/')));await page.evaluate(()=>company.showAppearanceSample('side-table-life-items',3));await page.screenshot({path:path.join(out,'independent-life-items.png')});
    return{requests:requests.filter(u=>u.endsWith('.glb')),world};
  });
  await check('Separate browser restart restores exact external references and child identity',async()=>{
    await context.close();context=null;page=await open();assert.deepEqual(await page.evaluate(()=>company.session.document),edited);assert.deepEqual(errors,[]);
    return{nodes:edited.nodes.length,attachments:edited.nodes.filter(n=>n.attachment).length};
  });report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)server.kill();report.pageErrors=errors;if(createdOut)await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
