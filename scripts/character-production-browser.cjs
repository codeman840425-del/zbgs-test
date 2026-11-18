const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {outputPaths,parseRequest,batchEdits,batchCreates,itemError,BATCH_SCHEMA,BATCH_CREATE_SCHEMA}=require('./character-production-cli.cjs');

function verifyCreatedRecord(job,record){
 assert.deepEqual(record.identity,job.identity,'created identity');
 assert.equal(record.revision,1,'created revision');
 const {base,equipment}=record.appearanceRecipe;
 assert.equal(base.bodyType,job.bodyType,'created body');
 assert.deepEqual(record.nativeHairCenter,job.nativeHairCenter??undefined,'created hair fit');
 const outfit=job.edits?.findLast(edit=>edit.domain==='outfit');
 if(!outfit?.selection){
  assert.equal(equipment.index,outfit?.index??0,'created outfit index');
  return;
 }
 assert.equal(base.sha256,outfit.selection.bodySha256,'created outfit body');
 assert.equal(equipment.role,outfit.selection.role,'created outfit role');
 const byId=(a,b)=>a.id.localeCompare(b.id);
 const actual=Object.values(equipment.resources).map(({id,slot,sha256})=>({id,slot,sha256})).sort(byId);
 assert.deepEqual(actual,[...outfit.selection.equipment].sort(byId),'created outfit resources');
}

async function produceBatch(jobs,items,evidence,produce){
 const records=[];
 for(const [index,job] of jobs.entries()){
  const source=job.record,id=(source??job).identity.id;
  const item={index,id};
  if(source)Object.assign(item,{sourceRevision:source.revision,sourceSha256:source.integrity.recordSha256});
  items.push(item);
  try{
   const directory=evidence&&path.join(evidence,'item-'+index);
   if(directory)await fs.mkdir(directory);
   const result=await produce(job,item,directory);
   assert(result.record,'Batch production returned no character record');
   records.push(result.record);
  }catch(error){throw itemError(error,index,id);}
 }
 return records;
}
module.exports={verifyCreatedRecord,produceBatch};

if(require.main===module)(async()=>{
 const [base,requestFile,outputArg,expectedDigest,evidenceArg]=process.argv.slice(2);
 const {out:output,evidence}=await outputPaths(outputArg,evidenceArg);
 const {writeFresh}=await import('./runtime-package/files.mjs');
 const {canonicalJson}=await import('../prototype/src/character-record.js');
 const bytes=await fs.readFile(requestFile), request=parseRequest(bytes);
 const batchEdit=request?.schema===BATCH_SCHEMA,batchCreate=request?.schema===BATCH_CREATE_SCHEMA;
 const batch=batchEdit||batchCreate;
 if(evidence){await fs.mkdir(evidence,{recursive:false});await fs.writeFile(path.join(evidence,'request.json'),bytes,{flag:'wx'});await fs.copyFile(__filename,path.join(evidence,'executed-script.cjs'));}
 const report={status:'incomplete',publication:'The CLI receipt records final output publication.',expectedDigest,operation:batchEdit?'batch-edit':batchCreate?'batch-create':request.operation,errors:[],requests:[],limitations:['Actual resource preparation and short idle/talking playback only; not full new-asset motion acceptance.','Development machine, not ordinary-PC performance.']};
 let browser,page,serialized,receipt,failure;
 try{
  const jobs=batchEdit?await batchEdits(request):batchCreate?await batchCreates(request):[request];
  browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(base))report.requests.push({path:new URL(r.url()).pathname,status:r.status()});});
  await page.goto(base+'record-consumer.html?production=1');await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:120000});
  report.build=await page.evaluate(()=>__recordConsumer.buildInfo);assert.equal(report.build.sourceDigest,expectedDigest);
  async function produce(job,item,directory){
  const result=await page.evaluate(async request=>{try{return await __recordConsumer.production(request);}catch(e){return{ok:false,code:e.code??'production-error',reason:e.message,field:e.field,editIndex:e.editIndex};}},job);
  item.result=result;
  if(!result.ok)throw Object.assign(new Error(result.reason),{code:result.code,field:result.field,editIndex:result.editIndex});
  if(result.record){
   item.loaded=await page.evaluate(record=>__recordConsumer.selectGroup(0,[record]),result.record);
   assert.equal(item.loaded.items[0].status,'completed',JSON.stringify(item.loaded));
   const readback=await page.evaluate(()=>[...__recordConsumer.actors.values()][0].capture());
   for(const key of ['appearanceRecipe','liveAccessories','nativeHairCenter'])assert.equal(canonicalJson(readback[key]),canonicalJson(result.record[key]),key);
   if(result.record.equipmentMaterials)assert.equal(canonicalJson(readback.equipmentMaterials),canonicalJson(result.record.equipmentMaterials));
   else assert(readback.equipmentMaterials.selections.every(row=>row.selection===null));
   if(batch){
    const record=result.record, source=job.record;
    const bound=await page.evaluate(()=>{const [actor]=__recordConsumer.actors.values();return {id:actor.identity.id,revision:actor.revision,hash:actor.recordSha256};});
    if(batchCreate){
     verifyCreatedRecord(job,record);
    }else{
     assert.equal(record.revision,source.revision+1);
     for(const key of ['identity','createdAt','provenance','nativeHairCenter'])assert.deepEqual(record[key],source[key],key);
     assert.deepEqual(record.appearanceRecipe.base,source.appearanceRecipe.base);
    }
    assert.deepEqual(bound,{id:record.identity.id,revision:record.revision,hash:record.integrity.recordSha256});
    for(const key of ['identity','provenance','resourceIdentities'])assert.deepEqual(readback[key],record[key],key);
    item.bound=bound;
   }
   if(directory){
    await page.evaluate(()=>{const stream=__recordConsumer.renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});window.__productionFilm={stream,chunks,recorder,done:new Promise(resolve=>recorder.onstop=resolve)};recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start();});
    await page.waitForTimeout(6000);
    const data=await page.evaluate(async()=>{const f=__productionFilm;f.recorder.stop();await f.done;f.stream.getTracks().forEach(t=>t.stop());return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(f.chunks,{type:'video/webm'}));});});
    await fs.writeFile(path.join(directory,'produced-1x.webm'),Buffer.from(data.split(',')[1],'base64'));await page.screenshot({path:path.join(directory,'produced.png')});
   }
   item.readback={identity:readback.identity,lookMatched:true};
  }
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  if(result.record){const {parseRuntimeCharacterRecord}=await import('../prototype/src/character-runtime-record.js');parseRuntimeCharacterRecord(JSON.stringify(result.record));}
  return result;
  }
  if(batch){
   report.items=[];
   const records=await produceBatch(jobs,report.items,evidence,produce);
   serialized=JSON.stringify(records);
   receipt={ok:true,operation:report.operation,output,build:report.build.shortId,items:report.items.map(item=>item.bound)};
  }else{
   const result=await produce(jobs[0],report,evidence);
   serialized=JSON.stringify(result.record??result.query);
   receipt={ok:true,operation:request.operation,output,build:report.build.shortId,...(result.record?{id:result.record.identity.id,revision:result.record.revision,recordSha256:result.record.integrity.recordSha256}:{}),validation:result.validation};
  }
 }catch(error){
  failure=error;
  if(evidence&&page)await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});
 }
 try{await browser?.close();}catch(error){failure??=error;}
 if(!failure&&report.errors.length)failure=Error(report.errors.join('\n'));
 report.status=failure?'failed':'validated-before-publication';
 if(failure)report.failure={code:failure.code??'production-failed',reason:failure.message,field:failure.field,editIndex:failure.editIndex,itemIndex:failure.itemIndex,recordId:failure.recordId};
 if(evidence)await fs.writeFile(path.join(evidence,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
 if(failure)throw failure;
 await writeFresh(output,Buffer.from(serialized,'utf8'));
 console.log(JSON.stringify(receipt));
})().catch(e=>{console.error(JSON.stringify({ok:false,code:e.code??'production-failed',reason:e.message,field:e.field,editIndex:e.editIndex,itemIndex:e.itemIndex,recordId:e.recordId}));process.exitCode=1;});
