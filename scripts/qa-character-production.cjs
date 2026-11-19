const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const [base,outArg]=process.argv.slice(2);
(async()=>{
 const out=await projectOutput(outArg,await productionRoot());
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const report={status:'incomplete',checks:[],errors:[]};
 let session,page;
 const request=(operation,values)=>({schema:'character-production-request-v1',operation,...values});
 const production=r=>page.evaluate(async r=>{try{return await __recordConsumer.production(r);}catch(e){return{ok:false,code:e.code,reason:e.message,field:e.field,editIndex:e.editIndex};}},r);
 const capture=()=>page.evaluate(async()=>{const actor=[...__recordConsumer.actors.values()][0];return{root:actor.avatar.root.uuid,record:await actor.capture(),children:__recordConsumer.scene.children.length};});
 try{
  session=await launchQABrowser(out,{channel:'chrome'});
  page=await session.browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(base+'record-consumer.html?production=1');await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:60000});report.build=await page.evaluate(()=>__recordConsumer.buildInfo);
  for(const bodyType of ['native-female-face-v1','native-male-7586-v1','male']){
   const result=await production(request('query',{bodyType}));assert(result.ok);assert.equal(result.query.liveAccessories.mic.status,'registered');assert.equal(result.query.liveAccessories.glasses.status,'registered');report.checks.push({query:bodyType,outfits:result.query.outfits.length});
  }
  const original=JSON.parse(await fs.readFile('prototype/public/assets/record-consumer-v1/native-male.json','utf8'));
  assert((await page.evaluate(record=>__recordConsumer.selectGroup(0,[record]),original)).items.every(i=>i.status==='completed'));
  const before=await capture();
  const bad=await production(request('edit',{record:original,edits:[{domain:'appearance',values:{eyeColor:'green'}},{domain:'appearance',values:{hairColor:'not-a-real-color'}}]}));assert.equal(bad.ok,false);assert.equal(bad.editIndex,1);
  const after=await capture();assert.equal(after.root,before.root);assert.equal(after.children,before.children);for(const key of ['appearanceRecipe','liveAccessories','equipmentMaterials'])assert.deepEqual(after.record[key],before.record[key]);report.checks.push('late invalid edit discards candidate and leaves visible original unchanged');
  const edited=await production(request('edit',{record:original,edits:[{domain:'appearance',values:{eyeColor:'green',eyebrowColor:'brown'}},{domain:'liveAccessory',kind:'glasses',enabled:false}]}));assert(edited.ok);assert.deepEqual(edited.record.identity,original.identity);assert.equal(edited.record.revision,original.revision+1);assert.deepEqual(edited.record.provenance,original.provenance);await fs.writeFile(path.join(out,'edited-native-male.json'),JSON.stringify(edited.record));
  const validated=await production(request('validate',{record:edited.record}));assert(validated.ok);assert.deepEqual(validated.record,edited.record);report.checks.push('real edit preserves identity/provenance and advances one revision; validation keeps record exact');
  const nullEdits=await production(request('edit',{record:original,edits:null}));assert.equal(nullEdits.ok,false);assert.equal(nullEdits.field,'edits');
  const missingId=await production(request('create',{bodyType:'male',identity:{name:'missing id',gender:'male'}}));assert.equal(missingId.ok,false);assert.equal(missingId.field,'identity.id');report.checks.push('null edits and absent stable ID reject');
  const badVersion=structuredClone(original);badVersion.schema='unsupported';assert.equal((await production(request('validate',{record:badVersion}))).ok,false);
  const shorts=JSON.parse(await fs.readFile('prototype/public/assets/record-consumer-v1/male-material.json','utf8'));
  const material=shorts.equipmentMaterials.selections.find(row=>row.selection!==null);assert(material);
  const reset=await production(request('edit',{record:shorts,edits:[{domain:'material',equipmentId:material.equipmentId,recipeId:null}]}));assert(reset.ok);assert.equal(reset.record.equipmentMaterials.selections.find(row=>row.equipmentId===material.equipmentId).selection,null);await fs.writeFile(path.join(out,'material-reset.json'),JSON.stringify(reset.record));report.checks.push('material reset is captured with exact garment identity');
  let release,hit;const gate=new Promise(r=>release=r),requested=new Promise(r=>hit=r);
  await page.route('**/assets/foundation/base-male-roundtrip.vrm',async route=>{hit();await gate;await route.continue();});
  await page.evaluate(r=>{window.__oldProduction=__recordConsumer.production(r).then(value=>value,error=>({ok:false,code:error.code,reason:error.message}));},request('create',{bodyType:'male',identity:{id:'cancelled-production',name:'cancelled',gender:'male'}}));
  await Promise.race([requested,new Promise((_,reject)=>setTimeout(()=>reject(Error('No pending body request')),15000))]);
  const newer=await production(request('query',{bodyType:'native-female-face-v1'}));assert(newer.ok);release();
  const stale=await page.evaluate(()=>window.__oldProduction);assert.equal(stale.ok,false);assert.equal(stale.code,'production-cancelled');await page.unroute('**/assets/foundation/base-male-roundtrip.vrm');assert.equal((await capture()).root,before.root);report.checks.push('new request cancels an actual pending model load; late result never replaces visible actor');
  await page.screenshot({path:path.join(out,'original-retained.png')});assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.status='passed';
 }catch(e){report.failure=String(e.stack||e);process.exitCode=1;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{
  try{await session?.close();}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,failure:report.failure,checks:report.checks}));}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
