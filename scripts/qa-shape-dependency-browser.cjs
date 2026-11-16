// Bounded true-browser dependency checks, not a body editing feature.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,folder]=process.argv.slice(2),out=path.resolve(folder),baseline=process.argv.includes('--expect-gap');
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}}),page=await context.newPage();
 const report={build,baseline,checks:[],errors:[],scope:'Original male + exact onePiece. Actual geometry mutation is a diagnostic negative case, not an admitted new body parameter.'};
 page.on('pageerror',e=>report.errors.push(String(e)));
 try{
  await page.goto(base+'?body=male&workbench=appearance');await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  report.identity=await verifyCandidate(page,{build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'});
  await page.evaluate(()=>{__debug.view('inspect-face-front');__debug.setPlaybackRate(1);__debug.setPaused(false);});
  const original=await page.evaluate(()=>__debug.avatar().facialGeometry.getState().geometryIdentity);
  const before=await page.evaluate(()=>__debug.exportAppearanceRecipe());
  report.faceChange=await page.evaluate(()=>__debug.avatar().facialGeometry.set({mouthWidth:.12}));assert.equal(report.faceChange.applied,true);
  await page.waitForTimeout(1200);
  await page.evaluate(()=>__debug.setOutfit(5));assert.equal(await page.evaluate(()=>__debug.snapshot().outfit),5);
  report.checks.push('actual mouth change keeps unrelated Body garment dependency usable');
  report.faceReset=await page.evaluate(()=>__debug.avatar().facialGeometry.set({reset:true}));assert.equal(report.faceReset.applied,true);
  if(!baseline)assert.deepEqual(await page.evaluate(()=>__debug.avatar().facialGeometry.getState().geometryIdentity),original);
  await page.waitForTimeout(1000);await page.evaluate(()=>__debug.setOutfit(0));
  assert.equal(await page.evaluate(()=>__debug.exportAppearanceRecipe()),before);
  report.checks.push('old full appearance recipe restored');
  report.mutation=await page.evaluate(()=>{
   const d=__debug,a=d.avatar(),uuid=a.getAssetProfile().meshRoles.body[0],mesh=a.root.getObjectByProperty('uuid',uuid),attribute=mesh.geometry.attributes.position;
   const old=attribute.getX(0),oldVersion=attribute.version,previousOutfit=d.snapshot().outfit;let result;
   try{
    attribute.setX(0,old+.03);attribute.needsUpdate=true;
    try{d.setOutfit(5);result={accepted:true};}catch(e){result={accepted:false,error:String(e)};}
    return{...result,baseSha256:a.profile.sha256,oldVersion,changedVersion:attribute.version,delta:attribute.getX(0)-old,previousOutfit,afterOutfit:d.snapshot().outfit};
   }finally{attribute.setX(0,old);attribute.needsUpdate=true;}
  });
  assert(report.mutation.delta>.029);assert(report.mutation.changedVersion>report.mutation.oldVersion);
  if(baseline)assert.equal(report.mutation.accepted,true);
  else{assert.equal(report.mutation.accepted,false);assert.equal(report.mutation.afterOutfit,report.mutation.previousOutfit);}
  report.checks.push(baseline?'confirmed same base SHA permits changed Body without fit check':'actual changed Body rejected before outfit changes');
  // Discard this deliberately altered instance using the normal character path.
  for(const bodyType of ['female','male']){const result=await page.evaluate(bodyType=>__debug.command({type:'bodySelect',bodyType}),bodyType);assert.equal(result.applied,true);}
  await page.evaluate(()=>{__debug.view('inspect-full-front');__debug.setOutfit(5);});await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(()=>__debug.snapshot().outfit),5);report.checks.push('normal body replacement recovers exact registered fit');
  if(!baseline){
   await page.evaluate(()=>{__debug.view('inspect-full-side');__debug.action('sit');});
   await page.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:30000});
   await page.evaluate(()=>__debug.setOutfit(0));await page.waitForTimeout(300);
   await page.evaluate(()=>__debug.setOutfit(5));await page.waitForTimeout(700);
   assert.equal(await page.evaluate(()=>__debug.snapshot().outfit),5);
   report.checks.push('seated bone pose is not confused with rest-shape mutation; uniform/onePiece switch succeeds');
  }
  report.status=baseline?'confirmed-gap':'passed';await page.screenshot({path:path.join(out,'restored.png')});
 }catch(e){report.status='failed';report.error=String(e);process.exitCode=1;}
 finally{const video=page.video();await context.close();await video.saveAs(path.join(out,'normal1x.webm'));await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({out,status:report.status,checks:report.checks,mutation:report.mutation,error:report.error}));
})().catch(e=>{console.error(e);process.exitCode=1;});
