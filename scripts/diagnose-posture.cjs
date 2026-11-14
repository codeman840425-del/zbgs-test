const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:false});
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 await page.goto('http://127.0.0.1:5173/');
 await page.waitForFunction(()=>window.__debug?.ready);
 await page.waitForTimeout(1000);
 await page.evaluate(()=>{__debug.reset();__debug.pause();});
 const before=await page.evaluate(()=>{
  const a=__debug.avatar(),v=a.vrm;
  return Object.fromEntries(['hips','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot'].map(n=>[n,a.root.worldToLocal(v.humanoid.getNormalizedBoneNode(n).getWorldPosition(a.root.position.clone())).toArray()]));
 });
 await page.screenshot({path:'output/playwright/posture-before.png'});
 const source=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {loadRetargetedMotions}=await import('/src/motion-source.js');
  const a=__debug.avatar(),v=a.vrm;v.humanoid.resetNormalizedPose();v.scene.updateWorldMatrix(true,true);
  const motions=await loadRetargetedMotions(v),mixer=new THREE.AnimationMixer(v.scene);
  const action=mixer.clipAction(motions.clips.idle);action.play();mixer.setTime(0.5);v.update(0);
  return Object.fromEntries(['hips','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot'].map(n=>[n,a.root.worldToLocal(v.humanoid.getNormalizedBoneNode(n).getWorldPosition(a.root.position.clone())).toArray()]));
 });
 await page.waitForTimeout(100);await page.screenshot({path:'output/playwright/posture-source.png'});
 console.log(JSON.stringify({before,source},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
