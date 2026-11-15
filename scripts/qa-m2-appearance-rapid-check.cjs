// Correct the original QA's invalid total mesh == 1 premise. Preserve that failure.
const { chromium }=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve('evidence/m2-appearance-workbench-b44b5af53491/rapid-corrected');await fs.mkdir(out,{recursive:true});
 const report={scope:'One replacement plus retained hidden original, not one total hair mesh. No product changes. Original failing assertion remains archived.',errors:[]};
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>report.errors.push(String(e)));
  await page.goto('http://127.0.0.1:4196/?body=female&workbench=appearance');await page.waitForFunction(()=>__debug?.ready);
  report.identity=await verifyCandidate(page,{build:'b44b5af53491',assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  await page.route('**/assets/m2-hairstyle-v1/manifest.json',async r=>{await new Promise(x=>setTimeout(x,180));await r.continue();});
  report.actual=await page.evaluate(async()=>{
   const d=__debug,a=d.avatar(),head=a.vrm.humanoid.getRawBoneNode('head');const original=[];a.root.traverse(o=>{if(o.isMesh&&o.userData.assetRole==='hair')original.push(o);});
   const p1=d.command({type:'appearance',hairStyle:'female-bob-v1'}),p2=d.command({type:'appearance',hairStyle:'original'}),p3=d.command({type:'appearance',hairStyle:'female-bob-v1'}),p4=d.command({type:'appearance',hairColor:'black'});
   const responses=await Promise.all([p1,p2,p3,p4]);
   const describe=()=>{const meshes=[];a.root.traverse(o=>{if(o.isMesh&&o.userData.assetRole==='hair'){let visible=true;for(let p=o;p;p=p.parent)visible&&=p.visible;meshes.push({name:o.name,uuid:o.uuid,isOriginal:original.includes(o),ownVisible:o.visible,effectiveVisible:visible,underRawHead:!!(function(){for(let p=o;p;p=p.parent)if(p===head)return true;return false;})()});}});return{state:a.appearance.getState(),meshes,rawHead:head.name};};
   const fitted=describe();await d.command({type:'appearance',hairStyle:'original'});const restored=describe();return{responses,fitted,restored};
  });
  const {fitted,restored}=report.actual;assert.equal(fitted.state.hairStyle,'female-bob-v1');assert.equal(fitted.state.hairColor,'black');assert.equal(fitted.state.loading,false);assert.equal(fitted.state.replacementSHA256,'3dcf01957d8ab72dfc128c6950f0e9600c2c7b801ea774a612058dc4b5d68110');
  assert.equal(fitted.meshes.filter(x=>!x.isOriginal).length,1);assert(fitted.meshes.filter(x=>x.isOriginal).every(x=>!x.effectiveVisible));assert(fitted.meshes.filter(x=>!x.isOriginal).every(x=>x.effectiveVisible&&x.underRawHead));
  assert(restored.meshes.filter(x=>x.isOriginal).every(x=>x.effectiveVisible));assert(restored.meshes.filter(x=>!x.isOriginal).every(x=>!x.effectiveVisible));assert.equal(restored.state.hairColor,'black');assert.equal(report.errors.length,0);report.passed=true;
 }catch(e){report.failure=String(e);throw e;}finally{await browser.close();await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
