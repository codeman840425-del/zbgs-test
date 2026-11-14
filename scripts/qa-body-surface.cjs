// Diagnostic only: replace the existing skin material, hide outer clothes in an isolated page.
// Never imported by the product. An incomplete base body must not be shipped as a mode.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const out=path.resolve('output/playwright/body-surface');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:false});
 const page=await browser.newPage({viewport:{width:1440,height:1080}});
 try{
  await page.goto(process.argv[2]||'http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__debug?.ready);
  await page.addStyleTag({content:'.viewport{height:850px!important;min-height:850px!important}'});
  await page.evaluate(async()=>{
   const THREE=await import('/node_modules/three/build/three.module.js');
   __debug.reset();__debug.setOutfit(0);__debug.setPaused(true);
   const a=__debug.avatar();a.vrm.humanoid.resetNormalizedPose();a.vrm.update(0);a.root.updateMatrixWorld(true);
   window.__bodyReport=[];
   a.root.traverse(o=>{
    if(!o.isMesh)return;
    const mats=Array.isArray(o.material)?o.material:[o.material],names=mats.map(m=>m.name);
    if(names.some(n=>n==='Body_00_SKIN')){
      o.material=new THREE.MeshBasicMaterial({color:0x39454f,side:THREE.DoubleSide,transparent:false,opacity:1,depthWrite:true});
      // Existing duplicate outline groups refer to material 1, which no longer exists.
      o.geometry=o.geometry.clone();o.geometry.clearGroups();
    }
    if(names.some(n=>/^Tops_|^Bottoms_/.test(n)))o.visible=false;
    window.__bodyReport.push({mesh:o.name,sourceMaterials:names,visible:o.visible});
   });
   a.skirt.visible=false;
   const r=__debug.renderer,draw=r.render;window.__bodyAngle=0;
   r.render=function(scene,camera){
    const yaw=a.root.rotation.y+window.__bodyAngle,p=a.root.position;
    camera.position.set(p.x+Math.sin(yaw)*2.7,1.2,p.z+Math.cos(yaw)*2.7);camera.lookAt(p.x,.9,p.z);
    return draw.call(this,scene,camera);
   };
  });
  for(const [name,angle]of [['front',0],['side',Math.PI/2],['back',Math.PI]]){
   await page.evaluate(a=>window.__bodyAngle=a,angle);await page.waitForTimeout(120);
   await page.locator('.viewport').screenshot({path:path.join(out,name+'.png')});
  }
  await fs.writeFile(path.join(out,'runtime.json'),JSON.stringify({url:page.url(),diagnosticOnly:true,meshes:await page.evaluate(()=>window.__bodyReport)},null,2));
  console.log(out);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
