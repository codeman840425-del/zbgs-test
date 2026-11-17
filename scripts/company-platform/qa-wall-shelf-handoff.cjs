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
  await check('All independent package files match their manifest, including editable wall-shelf parameters and original child source/license',async()=>{
    for(const file of manifest.files){const bytes=await fs.readFile(path.join(root,file.path));assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
    const source=manifest.files.filter(f=>f.path.includes('assets-source/company-side-table-life-items-v1/'));
    assert(manifest.files.some(f=>f.path.endsWith('assets-source/company-wall-shelf-v1/parameters.json')));assert(manifest.files.some(f=>f.path.endsWith('scripts/company-platform/build-wall-shelf.mjs')));assert(source.some(f=>f.path.endsWith('.obj')));assert(source.some(f=>f.path.endsWith('.glb')));assert(source.some(f=>/license/i.test(f.path)));
    return{files:manifest.files.length,source};
  });
  await check('Independent edit rejects unsupported child and moves the full wall shelf to the side wall',async()=>{
    const bad=path.join(out,'invalid.ops.json'),good=path.join(out,'move.ops.json');
    await fs.writeFile(bad,JSON.stringify([{type:'move',id:'wall-shelf/cup',transform:{position:[.38,.35,.19],yaw:0}}]));
    let code;try{run(['apply',path.join(root,'data/save.json'),bad,path.join(out,'must-not-exist')]);}catch(e){code=JSON.parse(e.stderr).code;}
    assert.equal(code,'invalid-support-fit');await assert.rejects(fs.access(path.join(out,'must-not-exist')));
    await fs.writeFile(good,JSON.stringify([
      {type:'move',id:'wall-shelf/cup',transform:{position:[-.22,.35,.19],yaw:Math.PI/2}},
      {type:'move',id:'wall-shelf/primary',transform:{position:[3.4,.35,.4],yaw:Math.PI*1.5}},
      {type:'replace-resource',id:'wall-shelf/primary',resource:{id:'wall-shelf-back-panel',version:1}},
    ]));
    return{rejection:code,edited:JSON.parse(run(['apply',path.join(root,'data/save.json'),good,path.join(out,'edited')]))};
  });
  server=spawn(process.execPath,[path.join(root,'serve.mjs')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  url=await new Promise((resolve,reject)=>{let text='';const timeout=setTimeout(()=>reject(Error('No server URL')),10000);server.on('error',reject);server.stdout.on('data',chunk=>{text+=chunk;const match=text.match(/http:\/\/127\.0\.0\.1:\d+\/company\.html/);if(match){clearTimeout(timeout);resolve(match[0]);}});});
  let page=await open();const edited=JSON.parse(await fs.readFile(path.join(out,'edited/save.json'))).document;
  await check('Independent viewer loads edited shelf and children from its own package and saves their real transforms',async()=>{
    const requests=[];page.on('request',r=>requests.push(r.url()));await page.locator('#file').setInputFiles(path.join(out,'edited/save.json'));
    await page.waitForFunction(id=>company.session.document.id===id&&!document.getElementById('save').disabled,edited.id);
    assert.deepEqual(await page.evaluate(()=>company.session.document),edited);assert.equal(await page.evaluate(()=>company.buildInfo.shortId),manifest.buildId);
    const world=await page.evaluate(()=>company.session.scene.root.getObjectByName('wall-shelf/cup').getWorldPosition(company.camera.position.clone()).toArray());world.forEach((v,i)=>assert(Math.abs(v-[3.21,.7,.18][i])<1e-6));
    await page.evaluate(()=>company.save());assert(requests.every(u=>u.startsWith(new URL(url).origin)||u.startsWith('data:')||u.startsWith('blob:')));
    assert(requests.some(u=>u.includes('/wall-shelf-v1/')));await page.evaluate(()=>company.showAppearanceSample('wall-shelf',3));await page.screenshot({path:path.join(out,'independent-wall-shelf.png')});
    return{requests:requests.filter(u=>u.endsWith('.glb')),world};
  });
  await check('Separate browser restart restores exact shelf and child references and identity',async()=>{
    await context.close();context=null;page=await open();assert.deepEqual(await page.evaluate(()=>company.session.document),edited);assert.deepEqual(errors,[]);
    return{nodes:edited.nodes.length,attachments:edited.nodes.filter(n=>n.attachment).length};
  });report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;}).finally(async()=>{if(context)await context.close();if(server)server.kill();report.pageErrors=errors;if(createdOut)await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,error:report.error,out}));});
