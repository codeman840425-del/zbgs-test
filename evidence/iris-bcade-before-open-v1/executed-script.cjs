const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const BASE=process.argv[2],BUILD=process.argv[3],OUT=path.resolve(process.argv[4]);
(async()=>{await fs.mkdir(OUT,{recursive:false});await fs.copyFile(__filename,path.join(OUT,'executed-script.cjs'));
 const r={build:BUILD,errors:[],shots:[],limits:['Fixed normal face view and labelled FOV18 diagnostic close-up','Static color review only; does not prove expression or movement quality']};
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const body of ['female','male']){
  const p=await browser.newPage({viewport:{width:1600,height:1000}});p.on('pageerror',e=>r.errors.push(String(e)));
  await p.goto(BASE+'?workbench=appearance&body='+body);await p.waitForFunction(()=>window.__debug?.ready);
  assert.equal(await p.evaluate(()=>__debug.buildInfo.shortId),BUILD);
  await p.evaluate(()=>{__debug.reset();__debug.setPaused(true);__debug.camera('inspect-face-front')});
  for(const [id,value] of [['#appearance-hair-color','blonde'],['#appearance-skin-tone','warm']]){await p.selectOption(id,value);await p.waitForFunction(()=>!document.querySelector('#appearance-fields').disabled)}
  for(const color of ['original','green','brown','blue','violet']){
   await p.selectOption('#appearance-eye-color',color);await p.waitForFunction(()=>!document.querySelector('#appearance-fields').disabled);assert.equal(await p.evaluate(()=>__debug.avatar().appearance.getState().eyeColor),color);
   for(const fov of [36,18]){await p.evaluate(fov=>{const c=__debug.cameraObject();c.fov=fov;c.updateProjectionMatrix();const a=__debug.avatar(),em=a.vrm.expressionManager;for(const e of em.expressions)em.setValue(e.expressionName,0);a.livePresentation.refreshEyeBlinkCompatibility();a.root.updateMatrixWorld(true)},fov);await p.waitForTimeout(100);const expressions=await p.evaluate(()=>{const em=__debug.avatar().vrm.expressionManager;return Object.fromEntries(em.expressions.map(e=>[e.expressionName,em.getValue(e.expressionName)]))});assert.equal(expressions.blink,0);const file=body+'-'+color+'-fov'+fov+'.png';await p.screenshot({path:path.join(OUT,file)});r.shots.push({body,color,fov,file,expressions});}
  }
  await p.close();
 }assert.equal(r.errors.length,0);r.status='captured-awaiting-visual-review';}
 catch(e){r.status='failure-preserved';r.failure=String(e);process.exitCode=1;console.error(e)}
 finally{await browser.close();await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(r,null,2));console.log(JSON.stringify({out:OUT,status:r.status,shots:r.shots.length,errors:r.errors}));}
})().catch(e=>{console.error(e);process.exitCode=1});
