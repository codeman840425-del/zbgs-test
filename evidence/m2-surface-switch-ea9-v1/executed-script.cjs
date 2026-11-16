const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,destination]=process.argv.slice(2),out=path.resolve(destination);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}}),p=await ctx.newPage();
 const r={build,status:'running',checks:[],errors:[]};p.on('pageerror',e=>r.errors.push(String(e)));
 const state=()=>p.evaluate(()=>({uuid:__debug.avatar().root.uuid,body:__debug.avatar().profile.bodyType,appearance:__debug.avatar().appearance.getState(),sameDocument:document===__savedDocument}));
 try{
  await p.goto(url+'?body=female&workbench=appearance');await p.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
  r.identity=await verifyCandidate(p,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  const layers=[{id:'freckles',opacity:1},{id:'blush',opacity:.65}];
  await p.evaluate(()=>{window.__savedDocument=document;__debug.camera('inspect-face-front');});
  assert((await p.evaluate(surfaceLayers=>__debug.command({type:'appearance',surfaceLayers}),layers)).applied);
  await p.waitForTimeout(700);await p.screenshot({path:path.join(out,'female.png')});
  const male=await p.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'male'}));assert(male.applied,JSON.stringify(male));
  await p.waitForTimeout(700);let s=await state();assert(s.sameDocument);assert.equal(s.body,'male');assert.deepEqual(s.appearance.surfaceLayers,layers);await p.screenshot({path:path.join(out,'male.png')});
  r.checks.push({name:'female to male retains both semantic layer selections with exact male maps',passed:true,result:male,state:s});
  const before=await state(),bad=await p.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'m2-male-lower-leg-v1'}));assert.equal(bad.applied,false);const after=await state();assert.equal(after.uuid,before.uuid);assert.equal(after.body,'male');assert.deepEqual(after.appearance.surfaceLayers,layers);
  r.checks.push({name:'unsupported derived fit rejects body swap and preserves original whole actor',passed:true,result:bad,before,after});
  const female=await p.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'female'}));assert(female.applied);s=await state();assert.deepEqual(s.appearance.surfaceLayers,layers);assert(s.sameDocument);
  assert((await p.evaluate(()=>__debug.command({type:'appearance',surfaceLayers:[]}))).applied);
  const derivative=await p.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'m2-male-lower-leg-v1'}));assert(derivative.applied,JSON.stringify(derivative));s=await state();assert.equal(s.body,'m2-male-lower-leg-v1');assert.deepEqual(s.appearance.surfaceLayers,[]);
  r.checks.push({name:'explicit unload allows unrelated body; no stale face layers migrate',passed:true,result:derivative,state:s});
  await p.waitForTimeout(500);await p.screenshot({path:path.join(out,'explicit-unload-derived.png')});
  assert.deepEqual(r.errors,[]);r.status='technical-checks-passed-visual-pending';
 }catch(e){r.status='failed-or-incomplete';r.error=String(e);throw e;}
 finally{const video=p.video();await ctx.close();await video.saveAs(path.join(out,'normal1x.webm'));await video.delete();await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(r,null,2));}
 console.log(JSON.stringify({out,status:r.status}));
})().catch(e=>{console.error(e);process.exitCode=1;});
