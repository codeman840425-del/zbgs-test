// Compare the retained original embedded top with the independent equipment.
const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,output]=process.argv.slice(2),out=path.resolve(output);
(async()=>{await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(base+'?body=female');await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
 const identity=await verifyCandidate(page,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
 const result=await page.evaluate(()=>{
  const d=__debug,a=d.avatar(),c=d.game.scene.getScene('CharacterStudio'),V=a.root.position.constructor;
  d.reset();d.setPaused(true);d.setOutfit(1);d.setDynamics(true);d.setCorrections('full');
  const original=[],equipped=[];a.root.traverse(m=>{if(!m.isSkinnedMesh)return;const mats=Array.isArray(m.material)?m.material:[m.material];if(!mats.some(x=>/_Tops_/.test(x.name)))return;(m.userData.assetRole==='top'?equipped:original).push(m);});
  if(original.length!==1||equipped.length!==1)throw Error('Ambiguous top mapping '+JSON.stringify({original:original.map(m=>m.name),equipped:equipped.map(m=>m.name)}));
  const src=original[0],dst=equipped[0],p=src.geometry.attributes.position,q=dst.geometry.attributes.position;
  const byPosition=new Map();for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].join(',');if(!byPosition.has(key))byPosition.set(key,[]);byPosition.get(key).push(i);}
  const mapping=Array.from({length:q.count},(_,i)=>{const key=[q.getX(i),q.getY(i),q.getZ(i)].join(','),ids=byPosition.get(key);if(!ids)throw Error('No exact source position for top '+i);return ids;});
  const rows=[];function sample(stage){a.root.updateMatrixWorld(true);let maxError=0,worst=null;for(let i=0;i<q.count;i++){const point=dst.getVertexPosition(i,new V()).applyMatrix4(dst.matrixWorld),error=Math.min(...mapping[i].map(j=>src.getVertexPosition(j,new V()).applyMatrix4(src.matrixWorld).distanceTo(point)));if(error>maxError){maxError=error;worst=i;}}rows.push({stage,time:c.simulationTime,maxWorldErrorM:maxError,worst});}
  a.root.position.set(-3.8,0,2.2);a.root.rotation.y=c.yaw=Math.PI/2;c.turnPolicy.reset(c.yaw);d.motion().reset();a.update(0);sample('stand');
  c.setSpeed(2.4);d.request({requestId:'top-parity-run',kind:'walk',payload:{x:3.8,z:2.2},timeoutSeconds:20});for(let i=0;i<85;i++)c.simulate(1/120);sample('exact-artifact-pose');
  for(let i=0;i<480;i++){c.simulate(1/120);if(i%30===0)sample('run-stop');}
  const id='top-parity-sit';d.request({requestId:id,kind:'sit',timeoutSeconds:30});for(let i=0;i<3000;i++){c.simulate(1/120);if(i%30===0)sample('sit');if(d.tasks().get(id)?.state==='completed')break;}if(d.tasks().get(id)?.state!=='completed')throw Error('Sit did not finish');sample('seated');
  return {original:{name:src.name,vertices:p.count},independent:{name:dst.name,vertices:q.count},rows,scope:'Exact rest-position mapping; closest among coincident seam vertices. World surface parity only, not garment fit or masks.'};
 });
 const report={build,identity,...result,maxWorldErrorM:Math.max(...result.rows.map(x=>x.maxWorldErrorM))};report.pass=report.maxWorldErrorM<1e-6;
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,maxWorldErrorM:report.maxWorldErrorM,samples:report.rows.length}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
