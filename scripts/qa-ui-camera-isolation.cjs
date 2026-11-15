// Native Playwright input; read-only listeners. No simulated DOM events/camera rewrites after setup.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {expectations,prepareOutput,verifyCandidate}=require('./qa-m1-common.cjs');
(async()=>{
 const expected=expectations(),out=await prepareOutput(expected.build,'ui-camera-isolation-'+Date.now());
 const {chromium}=require('../prototype/node_modules/playwright');
 const browser=await chromium.launch({channel:'chrome',headless:false}),page=await browser.newPage({viewport:{width:1440,height:900}});
 const r={build:expected.build,checks:[],errors:[],limit:'Bounded native UI/canvas inputs; not provenance proof for historical unexplained input.'};
 page.on('pageerror',e=>r.errors.push(e.message));
 const sample=()=>page.evaluate(()=>{const s=__debug.snapshot();return {camera:s.camera,root:s.position,mode:s.mode,target:s.target,path:s.path,outfit:s.outfit,active:__debug.tasks().active(),history:__debug.tasks().history()};});
 const check=(name,ok,details)=>{r.checks.push({name,passed:!!ok,details});assert(ok,name);};
 try{
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});r.initialGate=await verifyCandidate(page,expected);
  await page.evaluate(()=>{__debug.game.scene.getScene('CharacterStudio').cameraPreset('room',true);window.__inputAudit={events:[],frames:[],run:true};
   const label=n=>n?.nodeType===1?n.tagName+(n.id?'#'+n.id:'')+(n.dataset?.outfit?'[data-outfit='+n.dataset.outfit+']':''):n===window?'window':'document';
   for(const type of ['wheel','pointerdown','pointermove','pointerup','click'])document.addEventListener(type,e=>__inputAudit.events.push({type,t:performance.now(),trusted:e.isTrusted,target:label(e.target),path:e.composedPath().map(label),deltaY:e.deltaY,x:e.clientX,y:e.clientY}),{capture:true,passive:true});
   function f(t){if(!__inputAudit.run)return;const s=__debug.snapshot();__inputAudit.frames.push({t,camera:s.camera,root:s.position,mode:s.mode});requestAnimationFrame(f);}requestAnimationFrame(f);
  });
  await page.waitForTimeout(250);r.before=await sample();
  const ui=page.locator('[data-outfit="1"]');await ui.click();await page.waitForTimeout(150);const box=await ui.boundingBox();assert(box);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,100);await page.waitForTimeout(250);r.afterUI=await sample();
  check('native sidebar outfit click applied',r.afterUI.outfit===1);
  check('sidebar click/wheel did not change camera',JSON.stringify(r.before.camera)===JSON.stringify(r.afterUI.camera));
  check('sidebar click/wheel did not move root or start task',JSON.stringify(r.before.root)===JSON.stringify(r.afterUI.root)&&r.afterUI.mode==='idle'&&!r.afterUI.active&&r.afterUI.history.length===r.before.history.length);
  const canvas=await page.locator('#phaser-stage canvas').boundingBox();assert(canvas);await page.mouse.move(canvas.x+canvas.width*.5,canvas.y+canvas.height*.5);await page.mouse.wheel(0,-100);await page.waitForTimeout(250);r.afterCanvas=await sample();
  const before=r.afterUI.camera,after=r.afterCanvas.camera;r.zoomRatios=after.position.map((v,i)=>(v-after.target[i])/(before.position[i]-before.target[i]));
  check('canvas wheel native dolly0.95',r.zoomRatios.every(n=>Math.abs(n-.95)<1e-10));
  check('wheel did not start room walk',JSON.stringify(r.afterUI.root)===JSON.stringify(r.afterCanvas.root)&&r.afterCanvas.mode==='idle'&&!r.afterCanvas.active&&r.afterCanvas.history.length===r.before.history.length);
  r.finalGate=await verifyCandidate(page,expected);check('no pageerror',!r.errors.length);r.passed=true;
 }catch(e){r.failure=String(e);process.exitCode=1;}finally{
  r.trace=await page.evaluate(()=>{if(!window.__inputAudit)return null;__inputAudit.run=false;return __inputAudit;}).catch(()=>null);
  if(r.trace){r.nativeWheelEvents=r.trace.events.filter(e=>e.type==='wheel');r.allWheelTrusted=r.nativeWheelEvents.every(e=>e.trusted);}
  await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(r,null,2));console.log(out);console.log(JSON.stringify({passed:r.passed,checks:r.checks,zoomRatios:r.zoomRatios,nativeWheelEvents:r.nativeWheelEvents,failure:r.failure},null,2));
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
