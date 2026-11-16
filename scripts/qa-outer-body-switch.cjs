// Fixed-candidate integration check: old recipe + candidate outer + body replacement.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,folder]=process.argv.slice(2),out=path.resolve(folder);
const onePiece=process.argv.includes('--one-piece'),outfit=onePiece?5:4,role=onePiece?'onePiece':'outer';
const checkGarmentCoverage=process.argv.includes('--garment-coverage');
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const c=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}});
 const p=await c.newPage(),report={build,checks:[],errors:[]};p.on('pageerror',e=>report.errors.push(String(e)));
 const state=()=>p.evaluate(()=>({body:__debug.avatar().profile.bodyType,outfit:__debug.snapshot().outfit,equipment:__debug.avatar().getOutfitInfo().equipment,buttons:[...document.querySelectorAll('[data-outfit]')].map(n=>({index:Number(n.dataset.outfit),active:n.getAttribute('aria-pressed')}))}));
 try{
  await p.goto(base+'?body=male&workbench=appearance');await p.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-fields').disabled,null,{timeout:60000});
  report.identity=await verifyCandidate(p,{build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'});
  await p.locator(`[data-outfit="${outfit}"]`).click();
  await p.waitForFunction(outfit=>__debug.snapshot().outfit===outfit,outfit,{timeout:20000});
  const recipe=await p.evaluate(()=>__debug.exportAppearanceRecipe());
  let s=await state();assert.equal(s.equipment.items[role].visible,true);report.checks.push({label:'male-'+role,state:s});
  if(checkGarmentCoverage){assert.equal(s.equipment.garmentCoverage.active,true);assert.equal(s.equipment.garmentCoverage.hiddenFaces,56);}
  const maleExtraCount=s.buttons.filter(n=>n.index>2).length;
  for(const body of ['female','male']){
   const result=await p.evaluate(body=>__debug.command({type:'bodySelect',bodyType:body}),body);
   assert.equal(result.applied,true,JSON.stringify(result));s=await state();assert.equal(s.body,body);
   const extra=s.buttons.filter(n=>n.index>2);assert.equal(extra.length,body==='male'?maleExtraCount:0);
   assert.equal(Boolean(s.equipment.items[role]?.visible),false);
   if(checkGarmentCoverage)assert.equal(s.equipment.garmentCoverage?.active??false,false);
   report.checks.push({label:'replace-with-'+body,result,state:s});
  }
  assert.equal((await p.evaluate(text=>__debug.importAppearanceRecipe(text),recipe)).applied,true);
  assert.deepEqual(JSON.parse(await p.evaluate(()=>__debug.exportAppearanceRecipe())),JSON.parse(recipe));
  s=await state();assert.equal(s.equipment.items[role].visible,true);
  if(checkGarmentCoverage){assert.equal(s.equipment.garmentCoverage.active,true);assert.equal(s.equipment.garmentCoverage.hiddenFaces,56);}
  if(onePiece)assert.deepEqual(Object.entries(s.equipment.items).filter(([,v])=>v.visible).map(([k])=>k).sort(),['onePiece','shoes']);
  else assert.equal(s.equipment.items.shorts.visible,true);
  assert.deepEqual(s.buttons.filter(n=>n.active==='true').map(n=>n.index),[outfit]);
  report.checks.push({label:'saved-'+role+'-look-restored',state:s});
  // Actual wrong-body resource rejection is already covered by the recipe suite.
  // This check concentrates on successful replacement and UI/gear cleanup only.
  assert.equal(report.errors.length,0);report.status='passed';await p.screenshot({path:path.join(out,'restored.png')});
 }catch(e){report.status='failed';report.error=String(e);process.exitCode=1;}
 finally{const video=p.video();await c.close();await video.saveAs(path.join(out,'normal1x.webm'));await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({status:report.status,error:report.error,checks:report.checks.length,out}));
})().catch(e=>{console.error(e);process.exitCode=1;});
