// A real existing-resource failure probe; run unchanged against before/after fixed builds.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,folder]=process.argv.slice(2),out=path.resolve(folder);
const expectDefect=process.argv.includes('--expect-defect');
const identity={build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'};
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={build,expectDefect,errors:[],scope:'Same original male; valid authored v6 target from existing face/hair/outfit assets. Delayed then failed hair GLB request. Does not simulate target-PC performance.'};
 let context,p,release;
 const open=async record=>{const c=await browser.newContext({viewport:{width:1440,height:900},...(record?{recordVideo:{dir:out,size:{width:1440,height:900}}}:{})});const page=await c.newPage();page.on('pageerror',e=>report.errors.push(String(e)));await page.goto(base+'?body=male&workbench=appearance');await page.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-fields').disabled,null,{timeout:60000});return [c,page];};
 const visible=async()=>p.evaluate(async()=>{
  const a=__debug.avatar(),g=a.facialGeometry.getState(),s=a.appearance.getState(),bytes=[];
  a.vrm.scene.traverse(n=>{if(n.isMesh&&n.geometry?.morphAttributes.position?.length)bytes.push(new Uint8Array(n.geometry.attributes.position.array.buffer));});
  const hash=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(v=>v.toString(16).padStart(2,'0')).join('');
  return{body:a.profile.bodyType,faceHashes:await Promise.all(bytes.map(hash)),geometry:{mouthWidth:g.mouthWidth,browSample:g.browSample,noseSample:g.noseSample,eyeSample:g.eyeSample},appearance:Object.fromEntries(['hairStyle','hairColor','skinTone','eyeColor','lipColor'].map(k=>[k,s[k]])),outfit:__debug.snapshot().outfit,attached:Boolean(a.root.parent),rootVisible:a.root.visible};
 });
 try{
  [context,p]=await open(false);report.identity=await verifyCandidate(p,identity);
  const source=await fs.readFile(path.join(__dirname,'../evidence/m2-character-presets-a-v1/static-2/recipes/male-b.v5.json'),'utf8');
  assert.equal((await p.evaluate(text=>__debug.importAppearanceRecipe(text),source)).applied,true);
  assert.equal((await p.evaluate(()=>__debug.command({type:'appearance',hairStyle:'male-sidepart-v1',hairColor:'brown'}))).applied,true);
  await p.locator('[data-outfit="4"]').click();
  const target=await p.evaluate(()=>__debug.exportAppearanceRecipe());await fs.writeFile(path.join(out,'target-v6.json'),target);await context.close();
  [context,p]=await open(true);await verifyCandidate(p,identity);await p.evaluate(()=>{__debug.view('inspect-face-front');__debug.setPlaybackRate(1);__debug.setPaused(false);});
  report.before=await visible();await p.screenshot({path:path.join(out,'before.png')});
  let hit;const intercepted=new Promise(resolve=>hit=resolve),held=new Promise(resolve=>release=resolve);
  await p.route('**/assets/m2-male-hairstyle-v1/male-sidepart.glb',async route=>{hit();await held;await route.fulfill({status:503,body:'intentional whole-look hair failure'});});
  await p.evaluate(text=>{window.__lookProbe={done:false};__debug.importAppearanceRecipe(text).then(result=>Object.assign(__lookProbe,{done:true,result})).catch(e=>Object.assign(__lookProbe,{done:true,error:String(e)}));},target);
  await Promise.race([intercepted,new Promise((_,reject)=>setTimeout(()=>reject(Error('Expected actual hair request not intercepted')),15000))]);
  await p.waitForTimeout(700);report.during=await visible();await p.screenshot({path:path.join(out,'during-prepare.png')});
  report.partialVisible=JSON.stringify(report.before)!==JSON.stringify(report.during);
  release();await p.waitForFunction(()=>__lookProbe.done,null,{timeout:20000});report.result=await p.evaluate(()=>__lookProbe);report.after=await visible();
  await p.screenshot({path:path.join(out,'after-failure.png')});assert.deepEqual(report.after,report.before,'Failure must restore/retain full original visible state');
  assert.equal(report.during.attached,true);assert.equal(report.during.rootVisible,true);
  assert.equal(report.partialVisible,expectDefect,expectDefect?'Baseline defect must actually reproduce':'Preparing or failing whole look changed visible original');
  report.status=expectDefect?'baseline-defect-reproduced':'delayed-failure-preserves-whole-look';
 }catch(e){report.status='failed';report.error=String(e);process.exitCode=1;}
 finally{release?.();if(context){const v=p.video();await context.close();if(v)await v.saveAs(path.join(out,'normal1x.webm'));}await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({status:report.status,partialVisible:report.partialVisible,error:report.error,out}));
})().catch(e=>{console.error(e);process.exitCode=1;});
