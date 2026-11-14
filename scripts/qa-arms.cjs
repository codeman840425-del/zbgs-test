const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const out=path.resolve(__dirname,'../output/playwright/arms');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:false});
 const context=await browser.newContext({viewport:{width:1440,height:960},recordVideo:{dir:out,size:{width:1440,height:960}}});
 const page=await context.newPage();const samples=[];
 try{
  await page.goto(process.argv[2]||'http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__debug?.ready);
  await page.evaluate(()=>{
   const d=window.__debug,r=d.renderer,render=r.render.bind(r);window.__qaSide=true;
   r.render=(scene,camera)=>{const p=d.avatar().root.position;
    if(window.__qaSide)camera.position.set(p.x+2.6,1.2,p.z+.08);else camera.position.set(p.x+.3,1.4,p.z+2.8);
    camera.lookAt(p.x, .92, p.z);render(scene,camera);
   };
  });
  const capture=async(name)=>{
   samples.push(await page.evaluate(name=>{
    const d=window.__debug,a=d.avatar(),joints={};
    for(const n of ['leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand']){
     const b=a.vrm.humanoid.getRawBoneNode(n);joints[n]=a.root.worldToLocal(b.getWorldPosition(b.position.clone())).toArray();
    }return {name,joints,state:d.snapshot()};
   },name));
   await page.screenshot({path:path.join(out,name+'.png')});
  };
  await page.waitForTimeout(1000);await capture('idle-side');
  await page.evaluate(()=>window.__debug.action('sit'));
  await page.waitForFunction(()=>window.__debug.snapshot().mode==='sit'&&window.__debug.snapshot().motion.sitProgress>.99,{timeout:20000});
  await capture('sit-side');
  await page.evaluate(()=>window.__debug.action('stand'));await page.waitForTimeout(2500);
  await page.evaluate(()=>{window.__debug.reset();window.__debug.action('dance');});
  for(let i=0;i<8;i++){await page.waitForTimeout(500);await capture('dance-side-'+i);}
  await page.evaluate(()=>{window.__qaSide=false;window.__debug.setOutfit(1);});
  for(let i=0;i<8;i++){await page.waitForTimeout(500);await capture('dance-front-'+i);}
  await fs.writeFile(path.join(out,'joints.json'),JSON.stringify(samples,null,2));
 }finally{const v=page.video();await context.close();await v.saveAs(path.join(out,'arms-validation.webm'));await browser.close();}
 console.log('Saved arm side/front validation');
})().catch(e=>{console.error(e);process.exitCode=1});
