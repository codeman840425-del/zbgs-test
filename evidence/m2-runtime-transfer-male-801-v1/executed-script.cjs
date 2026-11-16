// Cold-load a copied runtime package using only its own HTTP root. No HMR,
// author directories, DOM controls or production resource fallback are used.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [bundleArg,recipeArg,build,body,output]=process.argv.slice(2);
assert(['male','female'].includes(body),'Explicit original body required');
const root=path.resolve(bundleArg),out=path.resolve(output);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css',
 '.json':'application/json','.glb':'model/gltf-binary','.vrm':'model/gltf-binary',
 '.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.wasm':'application/wasm'};
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const recipe=JSON.parse(await fs.readFile(recipeArg,'utf8'));
 const bundle=JSON.parse(await fs.readFile(path.join(root,'runtime-package.json'),'utf8'));
 const materialInput=JSON.parse(await fs.readFile(path.join(root,'material-selections.json'),'utf8'));
 const materialSelections=Array.isArray(materialInput)?materialInput:materialInput.selections;
 assert(Array.isArray(materialSelections),'Explicit material selection domain required');
 const declared=new Map(bundle.files.map(row=>[row.path,row]));
 assert.equal(declared.size,bundle.files.length,'No duplicate runtime paths');
 for(const [relative,entry] of declared){
  assert(!path.isAbsolute(relative)&&!relative.split('/').includes('..'),'Relative package paths required');
  const bytes=await fs.readFile(path.join(root,relative));
  assert.equal(bytes.length,entry.bytes,relative);assert.equal(hash(bytes),entry.sha256,relative);
 }
 assert.equal(recipe.base.bodyType,body);
 const report={build,body,recipeSha256:hash(Buffer.from(JSON.stringify(recipe))),checks:[],requests:[],errors:[],
  scope:'Copied runtime directory, explicit saved look, existing controller recipe/material/motion paths. No DOM input, compression or ordinary-PC performance pass.'};
 const server=http.createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
   const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
   assert(file.startsWith(root+path.sep),'Path escapes runtime root');
   const real=await fs.realpath(file);assert(real.startsWith(root+path.sep),'Symlink escapes runtime root');
   const bytes=await fs.readFile(real);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Package resource missing');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 let context,page;
 const open=async(label,video=false)=>{
  const dir=path.join(out,label);await fs.mkdir(dir);
  context=await browser.newContext({viewport:{width:1440,height:900},...(video?{recordVideo:{dir,size:{width:1440,height:900}}}:{})});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin && !['blob:','data:'].includes(url.protocol)){report.errors.push('External dependency '+url.href);return route.abort();}
   return route.continue();
  });
  page.on('response',r=>{const u=new URL(r.url());if(u.origin===origin)report.requests.push({phase:label,path:u.pathname,status:r.status()});});
  await page.goto(origin+'/?body='+body+'&workbench=appearance&view=room');
  await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  return dir;
 };
 const apply=async()=>{
  const result=await page.evaluate(recipe=>__debug.importAppearanceRecipe(JSON.stringify(recipe)),recipe);
  assert.equal(result.applied,true);assert.deepEqual(JSON.parse(await page.evaluate(()=>__debug.exportAppearanceRecipe())),recipe);
  report.materials=[];
  for(const selection of materialSelections){
   const r=await page.evaluate(s=>__debug.avatar().setMaterialRecipe(s.equipmentId,s.recipeId),selection);
   assert.equal(r.applied,true);
   const state=await page.evaluate(id=>__debug.avatar().getMaterialRecipeState(id),selection.equipmentId);
   assert.equal(state.active.recipeId,selection.recipeId);report.materials.push(state);
  }
 };
 try{
  const dir=await open('cold-chain',true);
  report.identity=await verifyCandidate(page,{build,assetId:body==='male'?'beta-base-male-m1b':'beta-base-female-m1',sha256:recipe.base.sha256});
  await apply();report.checks.push('Cold copied package imports exact saved appearance through shared runtime');
  await page.evaluate(()=>{__debug.camera('room');__debug.setPlaybackRate(1);__debug.setPaused(false);});
  const idle=()=>page.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.target&&!s.pending;},null,{timeout:45000});
  await page.evaluate(()=>{__debug.setSpeed(1.05);__debug.walkTo(1,1.8);});await idle();
  await page.evaluate(()=>{__debug.setSpeed(2.2);__debug.walkTo(-1,1.8);});await idle();
  await page.evaluate(()=>__debug.action('sit'));await page.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:45000});
  await page.waitForTimeout(700);await page.screenshot({path:path.join(dir,'seated.png')});
  await page.evaluate(()=>__debug.action('stand'));await idle();
  await page.evaluate(()=>__debug.request({requestId:'package-dance',kind:'dance',payload:{danceId:'dance-technical-once-v1'}}));
  await page.waitForFunction(()=>__debug.tasks().get('package-dance')?.state==='completed',null,{timeout:25000});await idle();
  await page.screenshot({path:path.join(dir,'finished.png')});report.checks.push('Copied action/config dependencies run walk, run, sit, rise and technical dance at 1x');
  const video=page.video();await context.close();await video.saveAs(path.join(dir,'normal1x.webm'));context=null;
  await open('fresh-context');await apply();report.checks.push('New browser context restores final record from file without prior local storage');
  await page.screenshot({path:path.join(out,'fresh-context','restored.png')});
  assert.deepEqual(report.requests.filter(r=>r.status>=400),[]);assert.deepEqual(report.errors,[]);
  report.checks.push('All actual requests served by package alone without author-machine fallback');
  report.requestedFiles=[];
  for(const name of [...new Set(report.requests.map(r=>r.path))].sort()){
   const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));const bytes=await fs.readFile(file);
   const relative=path.relative(root,file).replaceAll('\\','/'),entry=declared.get(relative);
   assert(entry,'Runtime requested undeclared dependency '+relative);
   assert.equal(hash(bytes),entry.sha256,relative);
   report.requestedFiles.push({path:relative,bytes:bytes.length,sha256:hash(bytes)});
  }
  report.checks.push('Every runtime requested file matches the source-derived package manifest SHA');
  if(body==='male'){
   assert(!declared.has('assets/m2-onepiece-v1/author-export.glb'),'Negative case requires omitted onePiece');
   const previous=await page.evaluate(()=>__debug.exportAppearanceRecipe());
   report.omittedSelection=await page.evaluate(async()=>{try{return await __debug.command({type:'outfit',value:5});}catch(e){return{applied:false,reason:String(e)};}});
   assert.equal(report.omittedSelection.applied,false);
   assert.match(report.omittedSelection.reason,/404|missing|load|HTTP/i);
   assert.equal(await page.evaluate(()=>__debug.exportAppearanceRecipe()),previous);
   report.checks.push('Metadata-only omitted outfit fails explicitly and preserves complete current appearance');
  }
  report.status='technical-checks-passed-visual-pending';
 }catch(error){report.status='failed';report.failure=String(error);report.stack=error.stack;process.exitCode=1;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{
  await context?.close();await browser.close();await new Promise(resolve=>server.close(resolve));
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 }
 console.log(JSON.stringify({out,status:report.status,checks:report.checks,failure:report.failure}));
})().catch(error=>{console.error(error);process.exitCode=1;});
