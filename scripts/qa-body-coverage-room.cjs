const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,output]=process.argv.slice(2),out=path.resolve(output);
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'?body=female');await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
  const identity=await verifyCandidate(page,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  const result=await page.evaluate(()=>{
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar(),V=a.root.position.constructor;
   d.reset();d.setPaused(true);d.setBodyMode('dressed');d.setOutfit(1);d.setDynamics(true);d.setCorrections('full');
   const info=()=>a.getOutfitInfo().equipment.bodyCoverage??null;
   let body;a.root.traverse(m=>{if(m.userData.assetRole==='body')body=m});if(!body)throw Error('No actual body');
   const coverage=info(),initial=body.geometry,checks=[];
   d.setBodyMode('base');const full=body.geometry,fullIndices=Array.from(full.index.array);
   checks.push({name:'complete body restored',passed:full.index.count===7732*3});
   d.setBodyMode('dressed');
   checks.push({name:'render selection matches declared count',passed:body.geometry.index.count===(7732-(coverage?252:0))*3});
   checks.push({name:'same geometry reused',passed:initial===body.geometry});
   const attributes=Object.keys(full.attributes);
   checks.push({name:'all body attributes unchanged',passed:attributes.every(k=>full.attributes[k].array.every((v,i)=>v===body.geometry.attributes[k].array[i]))});
   for(const mode of [0,1,0,1])d.setOutfit(mode);
   checks.push({name:'pants skirt switch retains correct top coverage',passed:body.geometry===initial});
   d.setBodyMode('base');checks.push({name:'full original indices intact after outfit switches',passed:fullIndices.every((v,i)=>v===body.geometry.index.array[i])});d.setBodyMode('dressed');
   const rows=[];
   function capture(label){
    a.root.updateMatrixWorld(true);a.root.traverse(m=>m.skeleton?.update());
    const target=a.vrm.humanoid.getRawBoneNode('hips').getWorldPosition(new V()).add(new V(0,-.05,0)),camera=d.cameraObject().clone(),views=[];
    for(const [view,angle]of [['front',0],['side',Math.PI/2],['back',Math.PI]]){
     const yaw=c.yaw+angle;camera.position.copy(target).add(new V(Math.sin(yaw)*.9,.08,Math.cos(yaw)*.9));camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);d.renderer.render(d.scene,camera);
     views.push({view,camera:camera.position.toArray(),target:target.toArray(),png:d.renderer.domElement.toDataURL('image/png').split(',')[1]});
    }
    rows.push({label,coverage:info(),position:a.root.position.toArray(),yaw:c.yaw,metrics:d.motion().getMetrics(),views});
   }
   a.root.position.set(-3.8,0,2.2);a.root.rotation.y=c.yaw=Math.PI/2;c.turnPolicy.reset(c.yaw);d.motion().reset();a.update(0);capture('stand');
   c.setSpeed(2.4);d.request({requestId:'coverage-run',kind:'walk',payload:{x:3.8,z:2.2},timeoutSeconds:20});for(let i=0;i<85;i++)c.simulate(1/120);capture('run-row14');
   for(let i=0;i<1500&&!['completed','failed'].includes(d.tasks().get('coverage-run')?.state);i++)c.simulate(1/120);
   checks.push({name:'actual run reaches target',passed:d.tasks().get('coverage-run')?.state==='completed'});
   c.action('sit');for(let i=0;i<3600;i++){c.simulate(1/120);if(c.mode==='sit'&&d.motion().getMetrics().sitProgress>.999)break;}capture('sit');
   checks.push({name:'actual sit settled',passed:c.mode==='sit'&&d.motion().getMetrics().sitProgress>.999});
   d.setBodyMode('base');capture('sit-complete-body');d.setBodyMode('dressed');
   c.action('stand');for(let i=0;i<1200&&c.mode!=='idle';i++)c.simulate(1/120);capture('rise-complete');
   checks.push({name:'stand complete',passed:c.mode==='idle'});
   return {checks,rows,coverage,scope:'Actual full body restoration and render attributes; five poses front/side/back. Full contact geometry is kept separately. Not continuous visual acceptance or clothing perimeter pass.'};
  });
  for(const row of result.rows)for(const view of row.views){await fs.writeFile(path.join(out,row.label+'-'+view.view+'.png'),Buffer.from(view.png,'base64'));delete view.png;}
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({build,identity,errors,...result},null,2));
  console.log(JSON.stringify({build,errors,checks:result.checks,coverage:result.coverage}));
  if(errors.length||result.checks.some(c=>!c.passed))throw Error('Room checks failed; evidence retained');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
