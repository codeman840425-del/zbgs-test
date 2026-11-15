const fs=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,output]=process.argv.slice(2),out=path.resolve(output);
(async()=>{
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const core=await fs.readFile('prototype/node_modules/three/build/three.core.js','utf8');
  await page.route('**/__qa_three_core.mjs',r=>r.fulfill({contentType:'text/javascript',body:core}));
  await page.goto(base+'?body=female');await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
  const identity=await verifyCandidate(page,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  const result=await page.evaluate(async()=>{
   const {Raycaster}=await import('/__qa_three_core.mjs'),fit=await(await fetch('/assets/body-coverage-risk-v1/female-top.json')).json();
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar(),V=a.root.position.constructor;
   d.reset();d.setPaused(true);d.setBodyMode('base');d.setOutfit(1);d.setDynamics(true);d.setCorrections('full');
   let body;const tops=[];a.root.traverse(m=>{if(m.userData.assetRole==='body')body=m;if(m.userData.assetRole==='top')tops.push(m)});
   const complete=body.geometry;d.setBodyMode('dressed');const render=body.geometry;
   const rows=[],failures=[],images=[],tasks=[];let tick=0;
   const sample=stage=>{
    if(tick++%12)return;
    a.root.updateMatrixWorld(true);for(const m of [body,...tops]){m.computeBoundingSphere();m.computeBoundingBox();}
    const vertices=new Map();for(const id of fit.selectedVertices)vertices.set(id,body.getVertexPosition(id,new V()).applyMatrix4(body.matrixWorld));
    const target=a.vrm.humanoid.getRawBoneNode('hips').getWorldPosition(new V()).add(new V(0,.12,0));
    let visible=0,misses=0,maxLayerDistance=0;
    for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.5,Math.PI*1.75]){
     const yaw=c.yaw+angle,camera=target.clone().add(new V(Math.sin(yaw)*1.3,.2,Math.cos(yaw)*1.3));
     for(const edge of fit.sourceBoundaryEdges){
      const point=vertices.get(edge[0]).clone().add(vertices.get(edge[1])).multiplyScalar(.5),distance=camera.distanceTo(point),ray=new Raycaster(camera,point.clone().sub(camera).normalize());ray.layers.enableAll();
      body.geometry=complete;const hit=ray.intersectObject(body,false)[0];body.geometry=render;
      if(!hit||Math.abs(hit.distance-distance)>.001)continue;
      visible++;
      const cover=ray.intersectObjects(tops,false).find(h=>Math.abs(h.distance-distance)<=.03);
      if(cover)maxLayerDistance=Math.max(maxLayerDistance,Math.abs(cover.distance-distance));
      else{
       misses++;failures.push({stage,t:c.simulationTime,edge,angle,point:point.toArray()});
       if(images.length<4){const cam=d.cameraObject().clone();cam.position.copy(camera);cam.lookAt(target);cam.updateProjectionMatrix();cam.updateMatrixWorld(true);d.renderer.render(d.scene,cam);images.push({stage,t:c.simulationTime,angle,png:d.renderer.domElement.toDataURL('image/png').split(',')[1]});}
      }
     }
    }
    rows.push({stage,t:c.simulationTime,visible,misses,maxLayerDistance});
   };
   const step=stage=>{c.simulate(1/120);sample(stage)};
   const request=(kind,payload,stage)=>{const id='coverage:'+stage;d.request({requestId:id,kind,payload,timeoutSeconds:30});for(let i=0;i<3600;i++){step(stage);const task=d.tasks().get(id);if(['completed','failed','cancelled'].includes(task?.state)){tasks.push(task);if(task.state!=='completed')throw Error(JSON.stringify(task));return;}}throw Error('Task incomplete '+stage)};
   a.root.position.set(-3.8,0,2.2);a.root.rotation.y=c.yaw=Math.PI/2;c.turnPolicy.reset(c.yaw);d.motion().reset();a.update(0);
   for(let i=0;i<30;i++)step('stand');c.setSpeed(2.4);request('walk',{x:3.8,z:2.2},'run');request('sit',{},'approach-sit');for(let i=0;i<120;i++)step('sit-hold');request('idle',{},'rise');request('turn',{rotationRadians:Math.PI*2},'turn');request('walk',{x:-.5,z:1.8},'clear-space');
   request('dance',{danceId:d.motion().getDances().find(x=>x.playback==='once-then-idle').id},'dance');
   const isolation=[];
   const peer=await d.loadComparison('female');peer.avatar.setOutfit(1);const before=peer.avatar.getOutfitInfo().equipment.bodyCoverage;
   a.setDebugBody(true);const after=peer.avatar.getOutfitInfo().equipment.bodyCoverage;
   isolation.push({name:'second female unaffected by first body mode',passed:before.active&&after.active&&after.renderFaces===7480});
   a.setDebugBody(false);peer.avatar.setDebugBody(true);isolation.push({name:'second restores full body independently',passed:peer.avatar.getOutfitInfo().equipment.bodyCoverage.renderFaces===7732&&a.getOutfitInfo().equipment.bodyCoverage.active});d.removeComparison();
   const male=await d.loadComparison('male');isolation.push({name:'male receives no female mask',passed:male.avatar.getOutfitInfo().equipment.bodyCoverage===null});d.removeComparison();
   return {rows,failures,images,tasks,isolation,boundaryEdges:fit.sourceBoundaryEdges.length,scope:'10Hz at 120Hz simulation, six actor-relative viewpoints, authored boundary-edge midpoints. For source-body-visible points, require top ray within 30mm. Finite perimeter screening only, not complete holes/CCD/continuous naturalness or fit proof.'};
  });
  for(let i=0;i<result.images.length;i++){await fs.writeFile(path.join(out,'failure-'+i+'.png'),Buffer.from(result.images[i].png,'base64'));delete result.images[i].png;}
  const stages={};for(const r of result.rows){const s=stages[r.stage]??={poses:0,visibleSamples:0,misses:0,maxLayerDistanceM:0};s.poses++;s.visibleSamples+=r.visible;s.misses+=r.misses;s.maxLayerDistanceM=Math.max(s.maxLayerDistanceM,r.maxLayerDistance);}
  await fs.writeFile(path.join(out,'samples.json.gz'),zlib.gzipSync(JSON.stringify({build,identity,...result})));
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({build,stages,isolation:result.isolation,failures:result.failures.length,boundaryEdges:result.boundaryEdges,scope:result.scope},null,2));
  console.log(JSON.stringify({build,stages,failures:result.failures.length,isolation:result.isolation}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
