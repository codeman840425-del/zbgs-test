const {chromium}=require('../../prototype/node_modules/playwright');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');

const [packageArg,outArg]=process.argv.slice(2),root=path.resolve(packageArg),out=path.resolve(outArg);
const report={package:root,status:'running',checks:[],limits:['Software rendering; not ordinary-PC, character or offline npm-install proof']};
let server,context,url,createdOut=false;
const errors=[];
const run=args=>execFileSync(process.execPath,[path.join(root,'edit.mjs'),...args],{cwd:root,encoding:'utf8',stdio:'pipe'});
const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));

async function open(){
  context=await chromium.launchPersistentContext(path.join(out,'profile'),{headless:true,viewport:{width:1440,height:1000},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(()=>window.company?.ready&&company.buildInfo);
  return page;
}

async function check(name,fn){report.checks.push({name,passed:true,result:await fn()});}

function parseEditError(error){
  try{return JSON.parse(error.stderr).code;}catch(cause){throw Object.assign(error,{editStderr:error.stderr,parseError:cause});}
}

async function main(){
  await fs.mkdir(out);createdOut=true;report.harnessSha256=createHash('sha256').update(await fs.readFile(__filename)).digest('hex');
  const manifest=await readJson(path.join(root,'transfer-manifest.json'));report.build=manifest.buildId;
  await check('All independent package files match their transfer manifest',async()=>{
    for(const file of manifest.files){
      const bytes=await fs.readFile(path.join(root,file.path));
      assert.equal(bytes.length,file.bytes,file.path);
      assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);
    }
    return{files:manifest.files.length};
  });

  await check('Independent edit rejects a non-ceiling height without producing a partial result',async()=>{
    const bad=path.join(out,'invalid-height.ops.json'),target=path.join(out,'must-not-exist');
    await fs.writeFile(bad,JSON.stringify([{type:'move',id:'ceiling-acoustic/primary',transform:{position:[0,2.7,0],yaw:0}}]));
    let code;
    try{run(['apply',path.join(root,'data/save.json'),bad,target]);}
    catch(error){code=parseEditError(error);}
    assert.equal(code,'invalid-ceiling-fit');
    await assert.rejects(fs.access(target));
    return{rejection:code};
  });

  const operations=path.join(out,'move-and-replace.ops.json'),editedDir=path.join(out,'edited');
  await fs.writeFile(operations,JSON.stringify([
    {type:'move',id:'ceiling-acoustic/primary',transform:{position:[1.1,2.8,-.6],yaw:Math.PI/2}},
    {type:'replace-resource',id:'ceiling-acoustic/primary',resource:{id:'ceiling-acoustic-felt',version:1}},
  ]));
  const editedResult=JSON.parse(run(['apply',path.join(root,'data/save.json'),operations,editedDir]));
  const editedSave=path.join(editedDir,'save.json'),editedEnvelope=await readJson(editedSave),edited=editedEnvelope.document;
  const original=(await readJson(path.join(root,'data/save.json'))).document;
  const editedPrimary=edited.nodes.find(node=>node.id==='ceiling-acoustic/primary'),originalTable=original.nodes.find(node=>node.id==='ceiling-acoustic/table');
  assert.deepEqual(editedPrimary.transform,{position:[1.1,2.8,-.6],yaw:Math.PI/2});
  assert.deepEqual(editedPrimary.resource,{id:'ceiling-acoustic-felt',version:1});
  assert.deepEqual(edited.nodes.find(node=>node.id==='ceiling-acoustic/table').transform,originalTable.transform);

  server=spawn(process.execPath,[path.join(root,'serve.mjs')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  url=await new Promise((resolve,reject)=>{
    let text='';const timeout=setTimeout(()=>reject(Error('No server URL')),10000);
    server.on('error',reject);server.stdout.on('data',chunk=>{text+=chunk;const match=text.match(/http:\/\/127\.0\.0\.1:\d+\/company\.html/);if(match){clearTimeout(timeout);resolve(match[0]);}});
  });

  let page=await open();
  await check('Independent viewer loads the edited package and exposes the moved model at the real 2.5–2.8m envelope',async()=>{
    const requests=[];page.on('request',request=>requests.push(request.url()));
    await page.locator('#file').setInputFiles(editedSave);
    await page.waitForFunction(id=>company.session.document.id===id&&!document.getElementById('save').disabled,edited.id);
    assert.deepEqual(await page.evaluate(()=>company.session.document),edited);
    assert.equal(await page.evaluate(()=>company.buildInfo.shortId),manifest.buildId);
    const bounds=await page.evaluate(id=>{
      const root=company.session.scene.root.getObjectByName(id),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
      if(!root)throw Error(`Missing scene object ${id}`);
      root.updateMatrixWorld(true);
      root.traverse(node=>{
        const attribute=node.geometry?.getAttribute?.('position');if(!attribute)return;
        const matrix=node.matrixWorld.elements;
        for(let i=0;i<attribute.count;i++){
          const x=attribute.getX(i),y=attribute.getY(i),z=attribute.getZ(i);
          const world=[matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]];
          for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],world[axis]);max[axis]=Math.max(max[axis],world[axis]);}
        }
      });
      return{min,max};
    },'ceiling-acoustic/primary');
    assert(Math.abs(bounds.min[1]-2.5)<1e-5,JSON.stringify(bounds));
    assert(Math.abs(bounds.max[1]-2.8)<1e-5,JSON.stringify(bounds));
    assert(requests.every(request=>request.startsWith(new URL(url).origin)||request.startsWith('data:')||request.startsWith('blob:')));
    assert(requests.some(request=>request.includes('/ceiling-acoustic-v1/')));
    return{edited:editedResult,requests:requests.filter(request=>request.endsWith('.glb')),bounds};
  });

  await check('Room and ceiling views toggle the actual top installation without changing the document',async()=>{
    const floor=edited.nodes.find(node=>node.kind==='floor').id,room=edited.nodes.find(node=>node.kind==='room').id;
    await page.evaluate(async({floor,room})=>{await company.showSpace('room',floor,room);company.view('ceiling');},{floor,room});
    const visible=await page.evaluate(id=>Boolean(company.session.scene.root.getObjectByName(id)?.visible),'ceiling-acoustic/primary');
    assert.equal(visible,true);
    await page.screenshot({path:path.join(out,'independent-ceiling-acoustic.png')});
    const before=await page.evaluate(()=>JSON.stringify(company.session.document));
    await page.evaluate(()=>company.view('top'));
    const hidden=await page.evaluate(id=>Boolean(company.session.scene.root.getObjectByName(id)?.visible),'ceiling-acoustic/primary');
    assert.equal(hidden,false);
    assert.equal(await page.evaluate(()=>JSON.stringify(company.session.document)),before);
    return{ceilingVisible:visible,topVisible:hidden,documentUnchanged:true};
  });

  await page.evaluate(()=>company.save());
  await check('Closing and reopening the independent browser restores the saved edit and allows ceiling viewing again',async()=>{
    await context.close();context=null;page=await open();
    await page.waitForFunction(id=>company.session.document.id===id&&!document.getElementById('save').disabled,edited.id);
    assert.deepEqual(await page.evaluate(()=>company.session.document),edited);
    const floor=edited.nodes.find(node=>node.kind==='floor').id,room=edited.nodes.find(node=>node.kind==='room').id;
    await page.evaluate(async({floor,room})=>{await company.showSpace('room',floor,room);company.view('ceiling');},{floor,room});
    assert.equal(await page.evaluate(id=>Boolean(company.session.scene.root.getObjectByName(id)?.visible),'ceiling-acoustic/primary'),true);
    assert.deepEqual(await page.evaluate(()=>company.session.document),edited);
    assert.deepEqual(errors,[]);
    return{nodes:edited.nodes.length,resource:editedPrimary.resource,transform:editedPrimary.transform};
  });
  report.status='passed';
}

main().catch(error=>{report.status='failed';report.error=error.stack;process.exitCode=1;}).finally(async()=>{
  if(context)await context.close();if(server)server.kill();report.pageErrors=errors;
  if(createdOut)await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,error:report.error,out}));
});
