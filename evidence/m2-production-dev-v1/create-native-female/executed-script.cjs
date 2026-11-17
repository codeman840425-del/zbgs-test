const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const [base,requestFile,output,expectedDigest,evidence]=process.argv.slice(2);
(async()=>{
 const {writeFresh}=await import('./runtime-package/files.mjs');
 const {canonicalJson}=await import('../prototype/src/character-record.js');
 const bytes=await fs.readFile(requestFile);if(bytes.length>1024*1024)throw Error('Request too large');
 const request=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(evidence){await fs.mkdir(evidence,{recursive:false});await fs.copyFile(requestFile,path.join(evidence,'request.json'));await fs.copyFile(__filename,path.join(evidence,'executed-script.cjs'));}
 const report={status:'incomplete',expectedDigest,operation:request.operation,errors:[],requests:[],limitations:['Actual resource preparation and short idle/talking playback only; not full new-asset motion acceptance.','Development machine, not ordinary-PC performance.']};
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(base))report.requests.push({path:new URL(r.url()).pathname,status:r.status()});});
 try{
  await page.goto(base+'record-consumer.html?production=1');await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:120000});
  report.build=await page.evaluate(()=>__recordConsumer.buildInfo);assert.equal(report.build.sourceDigest,expectedDigest);
  const result=await page.evaluate(async request=>{try{return await __recordConsumer.production(request);}catch(e){return{ok:false,code:e.code??'production-error',reason:e.message,field:e.field,editIndex:e.editIndex};}},request);
  report.result=result;
  if(!result.ok)throw Object.assign(new Error(result.reason),{code:result.code,field:result.field,editIndex:result.editIndex});
  if(result.record){
   report.loaded=await page.evaluate(record=>__recordConsumer.selectGroup(0,[record]),result.record);
   assert.equal(report.loaded.items[0].status,'completed',JSON.stringify(report.loaded));
   const readback=await page.evaluate(()=>[...__recordConsumer.actors.values()][0].capture());
   for(const key of ['appearanceRecipe','liveAccessories'])assert.equal(canonicalJson(readback[key]),canonicalJson(result.record[key]),key);
   if(result.record.equipmentMaterials)assert.equal(canonicalJson(readback.equipmentMaterials),canonicalJson(result.record.equipmentMaterials));
   else assert(readback.equipmentMaterials.selections.every(row=>row.selection===null));
   if(evidence){
    await page.evaluate(()=>{const stream=__recordConsumer.renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});window.__productionFilm={stream,chunks,recorder,done:new Promise(resolve=>recorder.onstop=resolve)};recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start();});
    await page.waitForTimeout(6000);
    const data=await page.evaluate(async()=>{const f=__productionFilm;f.recorder.stop();await f.done;f.stream.getTracks().forEach(t=>t.stop());return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(f.chunks,{type:'video/webm'}));});});
    await fs.writeFile(path.join(evidence,'produced-1x.webm'),Buffer.from(data.split(',')[1],'base64'));await page.screenshot({path:path.join(evidence,'produced.png')});
   }
   report.readback={identity:readback.identity,lookMatched:true};
  }
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  const value=result.record??result.query;
  const serialized=JSON.stringify(value);
  if(result.record){const {parseRuntimeCharacterRecord}=await import('../prototype/src/character-runtime-record.js');parseRuntimeCharacterRecord(serialized);}
  await writeFresh(output,Buffer.from(serialized,'utf8'));
  report.status='passed';
  console.log(JSON.stringify({ok:true,operation:request.operation,output,build:report.build.shortId,...(result.record?{id:result.record.identity.id,revision:result.record.revision,recordSha256:result.record.integrity.recordSha256}:{}),validation:result.validation}));
 }catch(e){report.failure={code:e.code??'production-failed',reason:e.message,field:e.field,editIndex:e.editIndex};if(evidence)await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});console.error(JSON.stringify({ok:false,...report.failure}));process.exitCode=1;}
 finally{await browser.close();if(evidence)await fs.writeFile(path.join(evidence,'report.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(JSON.stringify({ok:false,code:e.code??'production-failed',reason:e.message}));process.exitCode=1;});
