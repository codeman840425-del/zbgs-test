const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,dest]=process.argv.slice(2),out=path.resolve(dest);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}});
 const report={build,status:'running',samples:[],scope:'Actual settled original female/chair geometry diagnostic, not motion/visual acceptance'};
 try{
  await page.goto(url+'?body=female&workbench=appearance');await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  report.identity=await verifyCandidate(page,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  const selection=await page.evaluate(()=>__debug.command({type:'appearance',hairStyle:'female-ponytail-v1'}));if(!selection.applied)throw Error(JSON.stringify(selection));
  await page.evaluate(()=>{__debug.camera('inspect-half-side');__debug.action('sit');});
  await page.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:45000});
  for(const wait of [500,1000,1500]){
   await page.waitForTimeout(wait);
   report.samples.push(await page.evaluate(()=>{
    const a=__debug.avatar(),boxes=__debug.chairColliders(),result={ms:performance.now(),hair:a.appearance.getState().hairDynamics,chair:__debug.snapshot().chair,
     boxes:boxes.map(b=>({name:b.name,localMin:b.localBox.min.toArray(),localMax:b.localBox.max.toArray(),matrixWorld:b.matrixWorld.toArray(),inverseMatrixWorld:b.inverseMatrixWorld.toArray()})),meshes:[]};
    a.vrm.scene.updateWorldMatrix(true,true);
    a.vrm.scene.traverse(mesh=>{if(!mesh.isSkinnedMesh||mesh.userData.assetRole!=='hair')return;for(let n=mesh;n;n=n.parent)if(!n.visible)return;
     mesh.skeleton.update();const vertices=[],v=mesh.position.clone(),attrs=mesh.geometry.attributes;
     for(let i=0;i<attrs.position.count;i++){mesh.getVertexPosition(i,v);mesh.localToWorld(v);vertices.push({id:i,world:v.toArray(),rest:[attrs.position.getX(i),attrs.position.getY(i),attrs.position.getZ(i)],indices:[0,1,2,3].map(k=>attrs.skinIndex.getComponent(i,k)),weights:[0,1,2,3].map(k=>attrs.skinWeight.getComponent(i,k))});}
     result.meshes.push({name:mesh.name,vertices,triangles:Array.from(mesh.geometry.index.array),bones:mesh.skeleton.bones.map(b=>({name:b.name,world:b.getWorldPosition(v).toArray(),matrixWorld:b.matrixWorld.toArray()}))});
    });return result;
   }));
  }
  await page.screenshot({path:path.join(out,'settled-side.png')});report.status='captured';
 }catch(e){report.error=String(e);throw e;}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({out,status:report.status}));
})().catch(e=>{console.error(e);process.exitCode=1;});
