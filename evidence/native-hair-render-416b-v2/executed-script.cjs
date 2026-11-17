// Same fixed build, pose and camera: full author source versus independent hair.
// The source overlay is a diagnostic reference, never a production replacement.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const esbuild=require('../prototype/node_modules/esbuild');
const [directory,output]=process.argv.slice(2);
if(!directory||!output)throw Error('Pass fixed dist and fresh evidence directory');
const repo=path.resolve(__dirname,'..'),digest=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const root=path.resolve(directory),out=path.resolve(output);await fs.mkdir(out,{recursive:false});
 await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const build=JSON.parse(await fs.readFile(path.join(root,'build-info.json'),'utf8'));
 const source=await fs.readFile(path.join(__dirname,'native-hair-reference-loader.mjs'),'utf8');
 const compiled=Buffer.from((await esbuild.build({stdin:{contents:source,resolveDir:repo,sourcefile:'reference.js'},nodePaths:[path.join(repo,'prototype/node_modules')],bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].contents);
 await fs.writeFile(path.join(out,'reference-loader.mjs'),compiled);
 const bytes=await fs.readFile(path.join(repo,'assets-source/native-vroid-hairset-study-v1/generated/male-hairset001.vrm'));
 const sourceSHA='dab423674f42d3e6e79eb1b8aa1375e5b664e11bf130d093c14f78c5d3967238';assert.equal(digest(bytes),sourceSHA);
 const report={build,status:'incomplete',sourceSHA,loaderSHA:digest(compiled),pairs:[],errors:[],scope:'Paused neutral same-pose material/shape comparison; full author reference vs shared-factory independent hairstyle. No dynamic or contact equivalence claim.'};
 let server,browser,page;
 try{
  server=require('node:http').createServer(async(req,res)=>{try{
   const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
   if(!file.startsWith(root+path.sep))throw Error('path');
   const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
   res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));
  }catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
  page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>report.errors.push(String(e)));
  await page.route('**/__hair_reference__/loader.mjs',r=>r.fulfill({contentType:'text/javascript',body:compiled}));
  await page.route('**/__hair_reference__/model.vrm',r=>r.fulfill({contentType:'model/gltf-binary',body:bytes}));
  await page.goto(`http://127.0.0.1:${server.address().port}/?workbench=appearance&body=native-male-7586-v1`);
  await page.waitForFunction(()=>__debug.ready,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build.shortId);
  await page.evaluate(()=>{__debug.setPaused(true);__debug.avatar().vrm.expressionManager.resetValues();__debug.avatar().vrm.expressionManager.update();});
  await page.locator('#appearance-hair-style').selectOption('native-male-hairset001-v1');
  await page.waitForFunction(()=>__debug.avatar().appearance.getState().hairStyle==='native-male-hairset001-v1'&&!__debug.avatar().appearance.getState().loading,null,{timeout:60000});
  report.appearance=await page.evaluate(()=>__debug.avatar().appearance.getState());
  report.reference=await page.evaluate(async hash=>(await import('/__hair_reference__/loader.mjs')).install(hash),sourceSHA);
  await page.evaluate(()=>{__debug.avatar().appearance.resetDynamics();__hairReference.reset();});
  for(const camera of ['inspect-full-front','inspect-full-side','inspect-full-back','inspect-face-front']){
   await page.evaluate(c=>__debug.camera(c),camera);await page.waitForTimeout(100);
   const pair={camera};
   for(const [label,reference] of [['author',true],['independent',false]]){
    await page.evaluate(v=>__hairReference.show(v),reference);await page.waitForTimeout(100);
    const file=camera+'-'+label+'.png';await page.screenshot({path:path.join(out,file)});pair[label]=file;
   }
   report.pairs.push(pair);
  }
  report.referenceSummary=await page.evaluate(()=>__hairReference.summary());
  assert.equal(report.referenceSummary.maxNormalizedError,0);
  await page.evaluate(()=>__hairReference.dispose());
  const restored=await page.evaluate(async()=>{const a=__debug.avatar();await a.appearance.set({hairStyle:'original'});return a.appearance.getState();});
  assert.equal(restored.effectiveHairStyle,'original');report.originalRestored=restored;
  await page.screenshot({path:path.join(out,'original-restored.png')});
  assert.deepEqual(report.errors,[]);report.status='rendered-comparison-recorded-visual-review-required';
 }catch(error){report.status='failed';report.error=String(error.stack||error);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,build:build.shortId,error:report.error}));}
})();
