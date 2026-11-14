const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:false}),page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto(process.argv[2]||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.__debug?.ready);
  const initial=await page.evaluate(()=>{
   const d=window.__debug,a=d.avatar(),meshes=[];window.__qaVertices=[];
   a.root.traverse(o=>{if(!o.isSkinnedMesh)return;
    const w=o.geometry.getAttribute('skinWeight'),j=o.geometry.getAttribute('skinIndex');let mixed=0,maxError=0;
    for(let i=0;i<w.count;i++){const ws=[w.getX(i),w.getY(i),w.getZ(i),w.getW(i)],js=[j.getX(i),j.getY(i),j.getZ(i),j.getW(i)];mixed+=new Set(js.filter((_,k)=>ws[k]>1e-5)).size>1;maxError=Math.max(maxError,Math.abs(ws.reduce((a,b)=>a+b,0)-1));}
    meshes.push({name:o.name,vertices:w.count,mixed,maxWeightSumError:maxError,bones:o.skeleton.bones.length});
    for(let i=0;i<w.count;i+=Math.max(1,Math.floor(w.count/100)))window.__qaVertices.push({mesh:o,index:i,p:o.getVertexPosition(i,o.position.clone()).toArray()});
   });return {snapshot:d.snapshot(),meshes};
  });
  await page.evaluate(()=>{window.__debug.setOutfit(1);window.__debug.action('dance');});
  const samples=[];
  for(let i=0;i<100;i++){
   await page.waitForTimeout(100);
   samples.push(await page.evaluate(()=>{const d=window.__debug;let deformation=0;
    for(const {mesh,index,p}of window.__qaVertices){const v=mesh.getVertexPosition(index,mesh.position.clone());deformation=Math.max(deformation,Math.hypot(v.x-p[0],v.y-p[1],v.z-p[2]));}
    return {snapshot:d.snapshot(),maxMeshLocalDeformation:deformation};
   }));
  }
  const report={browser:browser.version(),viewport:{width:1440,height:960},errors,initial,samples,limitations:'Desktop Chrome, concurrent local work possible. Frame interval/render submission are not GPU time. No mobile/target-device validation.'};
  const out=path.resolve(__dirname,'../output/playwright/actual-avatar-inspection.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify({errors,meshes:initial.meshes.length,vertices:initial.meshes.reduce((s,m)=>s+m.vertices,0),mixed:initial.meshes.reduce((s,m)=>s+m.mixed,0),maxWeightError:Math.max(...initial.meshes.map(m=>m.maxWeightSumError)),maxDeformation:Math.max(...samples.map(s=>s.maxMeshLocalDeformation)),last:samples.at(-1).snapshot},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
