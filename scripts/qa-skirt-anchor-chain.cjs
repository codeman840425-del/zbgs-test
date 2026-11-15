// Actual source skin is the independent reference, not the old corrective.
const fs=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,output]=process.argv.slice(2),out=path.resolve(output);
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'?body=female');await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
  const identity=await verifyCandidate(page,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  const result=await page.evaluate(()=>{
   const d=__debug,a=d.avatar(),c=d.game.scene.getScene('CharacterStudio'),V=a.root.position.constructor;
   d.reset();d.setPaused(true);d.setOutfit(1);d.setDynamics(true);d.setCorrections('full');
   const mesh=d.scene.getObjectByName('M1_UniformSkirt_Constrained'),source=mesh.parent.children.find(m=>m.isSkinnedMesh&&m.geometry.attributes.position.count===mesh.geometry.attributes.position.count);
   const hips=a.vrm.humanoid.getRawBoneNode('hips'),inv=source.skeleton.boneInverses[source.skeleton.bones.indexOf(hips)],g=source.geometry;
   const refs=Array.from({length:g.attributes.position.count},(_,i)=>new V().fromBufferAttribute(g.attributes.position,i).applyMatrix4(source.bindMatrix).applyMatrix4(inv));
   const fixed=refs.map((r,i)=>r.y>=.09?i:-1).filter(i=>i>=0),isFixed=new Set(fixed),edgeKeys=new Set(),edges=[];
   for(let f=0;f<g.index.count;f+=3)for(let k=0;k<3;k++){
    const i=g.index.getX(f+k),j=g.index.getX(f+(k+1)%3),key=[Math.min(i,j),Math.max(i,j)].join(':');
    if(isFixed.has(i)===isFixed.has(j)||edgeKeys.has(key))continue;
    edgeKeys.add(key);edges.push({i,j,rest:refs[i].distanceTo(refs[j])});
   }
   const rows=[],tasks=[];let previous=null;
   function capture(stage){
    a.root.updateMatrixWorld(true);
    const world=Array.from({length:refs.length},(_,i)=>new V().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld));
    const local=world.map(v=>a.root.worldToLocal(v.clone()));
    let maxError=0,worstId=null;
    for(const i of fixed){const e=source.getVertexPosition(i,new V()).applyMatrix4(source.matrixWorld).distanceTo(world[i]);if(e>maxError){maxError=e;worstId=i;}}
    const boundaries=edges.map(e=>({i:e.i,j:e.j,ratio:world[e.i].distanceTo(world[e.j])/e.rest}));
    const maxBoundaryRatio=Math.max(...boundaries.map(e=>e.ratio));
    const maxBoundaryStep=previous&&previous.stage===stage?Math.max(...edges.flatMap(e=>[e.i,e.j]).map(i=>local[i].distanceTo(previous.local[i]))):null;
    rows.push({stage,t:c.simulationTime,maxError,worstId,maxBoundaryRatio,maxBoundaryStep,mode:c.mode,garment:d.motion().getMetrics().action,skirt:a.getOutfitInfo().equipment.skirtDynamics});
    previous={stage,local};
   }
   function step(stage){c.simulate(1/120);capture(stage);}
   function request(kind,payload,stage,max=3600){
    const id='anchor:'+stage,r=d.request({requestId:id,kind,payload,timeoutSeconds:30});
    if(r.status==='rejected')throw Error(JSON.stringify(r));
    for(let i=0;i<max;i++){step(stage);const t=d.tasks().get(id);if(['completed','failed','cancelled'].includes(t?.state)){tasks.push(t);if(t.state!=='completed')throw Error(JSON.stringify(t));return;}}
    throw Error('Did not finish '+stage);
   }
   a.root.position.set(-3.8,0,2.2);a.root.rotation.y=c.yaw=Math.PI/2;c.turnPolicy.reset(c.yaw);d.motion().reset();a.update(0);
   for(let i=0;i<30;i++)step('stand');c.setSpeed(2.4);request('walk',{x:3.8,z:2.2},'run');
   request('sit',{},'approach-sit');for(let i=0;i<120;i++)step('sit-hold');request('idle',{},'rise');
   request('turn',{rotationRadians:Math.PI*2},'turn');request('walk',{x:-.5,z:1.8},'clear-space');
   const dance=d.motion().getDances().find(x=>x.playback==='once-then-idle');request('dance',{danceId:dance.id},'dance');
   return {fixedCount:fixed.length,vertexCount:refs.length,boundaryEdges:edges,rows,tasks};
  });
  const stages={};for(const r of result.rows){const s=stages[r.stage]??={samples:0,maxAnchorErrorM:0,maxBoundaryRatio:0,maxBoundaryStepM:0};s.samples++;s.maxAnchorErrorM=Math.max(s.maxAnchorErrorM,r.maxError);s.maxBoundaryRatio=Math.max(s.maxBoundaryRatio,r.maxBoundaryRatio);s.maxBoundaryStepM=Math.max(s.maxBoundaryStepM,r.maxBoundaryStep||0);}
  const report={build,identity,errors,stages,fixedCount:result.fixedCount,vertices:result.vertexCount,boundaryEdges:result.boundaryEdges.length,anchorPass:Object.values(stages).every(s=>s.maxAnchorErrorM<2e-7),scope:'Every fixed render vertex including duplicates against actual source.getVertexPosition; every120Hz controller step. Boundary ratios/steps are diagnostics, not visual pass, body/chair/self collision or render performance.'};
  await fs.writeFile(path.join(out,'trace.json.gz'),zlib.gzipSync(JSON.stringify(result)));
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
