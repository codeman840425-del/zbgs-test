const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const {verifyCandidate,prepareOutput,writeFailure}=require('./qa-m1-common.cjs');
(async()=>{
 const expectedBuild=process.argv[4]||process.env.QA_M1_BUILD,identity=expectedBuild?{build:expectedBuild,sha256:process.env.QA_M1_ASSET_SHA||'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95',assetId:process.env.QA_M1_ASSET_ID||'beta-base-female-m1'}:null;
 const out=identity?await prepareOutput(identity.build,process.argv[3]||'foot-lock'):path.resolve(process.argv[3]||'output/playwright/m1-foot-lock');await fs.mkdir(out,{recursive:true});let initialGate;const errors=[];
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto(process.argv[2]||'http://127.0.0.1:5173');await page.waitForFunction(()=>__debug?.ready);
  if(identity)initialGate=await verifyCandidate(page,identity);
  await fs.writeFile(path.join(out,'start-manifest.json'),JSON.stringify({initialGate,expected:identity,mode:identity?'fixed-candidate':'development-only'},null,2));
  const report=await page.evaluate(async()=>{
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar(),m=d.motion(),runs=[];c.paused=true;
   const calibration=m.getFootLockCalibration();
   const meshes=new Map();a.vrm.scene.traverse(o=>{if(o.isSkinnedMesh)meshes.set(o.uuid,o)});
   const actualPatch=(side,kind)=>{
    const refs=calibration.find(f=>f.side===side).selection.patches[kind];
    const points=refs.map(({mesh,vertex})=>{const obj=meshes.get(mesh);return obj.getVertexPosition(vertex,obj.position.clone()).applyMatrix4(obj.matrixWorld)});
    const min=Math.min(...points.map(p=>p.y));let sum=0,y=0;
    for(const p of points){const w=Math.exp(-(p.y-min)/.001);sum+=w;y+=p.y*w}
    return [points.reduce((s,p)=>s+p.x,0)/points.length,y/sum,points.reduce((s,p)=>s+p.z,0)/points.length];
   };
   for(const speed of [.35,.85,1.5])for(const moveRoot of [false,true])for(const correction of ['raw','full']){
    c.reset();c.paused=true;d.setBodyMode('base');d.setDynamics(false);m.setCorrections({footIK:correction==='full',pelvis:correction==='full'});
    const dt=1/120,rows=[],supportStarts=[null,null];let previous=null,maxStep=0,maxVelocity=0,maxContactTravel=0,maxCorrection=0,maxActualPatchTravel=0,maxStanceDrift=0,minPatchY=Infinity,worst=null;
    const frames=Math.ceil(5*1.3/speed/dt);
    for(let i=0;i<frames;i++){
     if(moveRoot)a.root.position.z+=speed*dt;
     m.update(dt,{action:'walk',moving:true,distanceDelta:speed*dt,speed,treadmill:!moveRoot});a.vrm.update(dt);a.root.updateMatrixWorld(true);
     for(const mesh of meshes.values())mesh.skeleton.update();
     const s=m.getMetrics();const row={t:(i+1)*dt,phase:s.phase,gait:s.gait,stride:s.stride,feet:s.feet.map(f=>{
      const bone=a.vrm.humanoid.getRawBoneNode(f.side+'Foot');return{side:f.side,p:bone.getWorldPosition(bone.position.clone()).toArray(),contact:f.contact,kind:f.contactPoint,heights:f.authoredSoleHeights,correction:f.swingCorrection,travel:f.contactTravel,clamped:f.reachClamp,patches:{heel:actualPatch(f.side,'heel'),toe:actualPatch(f.side,'toe')}};})};
     if(i>180&&previous)for(let k=0;k<2;k++){
      const f=row.feet[k],p=previous.feet[k],step=Math.hypot(...f.p.map((v,j)=>v-p.p[j]));
      if(step>maxStep){maxStep=step;worst={before:previous,after:row,side:k};}maxVelocity=Math.max(maxVelocity,step/dt);
      maxContactTravel=Math.max(maxContactTravel,f.travel);maxCorrection=Math.max(maxCorrection,Math.hypot(...f.correction));
      minPatchY=Math.min(minPatchY,f.patches.heel[1],f.patches.toe[1]);
      if(f.contact&&p.contact&&f.kind===p.kind&&f.patches[f.kind]){
       const from=p.patches[f.kind],to=f.patches[f.kind];
       maxActualPatchTravel=Math.max(maxActualPatchTravel,Math.hypot(to[0]-from[0],to[1]-from[1],to[2]-from[2]+(moveRoot?0:speed*dt)));
       supportStarts[k]??={point:from.slice(),frame:i-1,kind:f.kind};
       const start=supportStarts[k];
       maxStanceDrift=Math.max(maxStanceDrift,Math.hypot(to[0]-start.point[0],to[2]-start.point[2]+(moveRoot?0:speed*dt*(i-start.frame))));
      }else supportStarts[k]=null;
     }
     rows.push(row);previous=row;
    }
    runs.push({speed,moveRoot,correction,maxStep,maxVelocity,maxContactTravel,maxActualPatchTravel,maxStanceDrift,minPatchY,maxCorrection,worst,rows});
   }
   const assetBytes=await(await fetch(a.profile.url)).arrayBuffer();
   const actualBodySha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',assetBytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
   return{build:d.buildInfo,actualBodySha,asset:a.profile,calibration:m.getFootLockCalibration(),kind:'fixed dt 120Hz actual VRM; 5 cycles per run; treadmill support moves backward, path translates root forward; source raw vs full IK; CPU skin patches measured after updateMatrixWorld + skeleton.update',runs};
  });
  report.initialGate=initialGate;report.finalGate=identity?await verifyCandidate(page,identity):null;report.errors=errors;await fs.writeFile(path.join(out,'matrix.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.runs.map(({rows,worst,...r})=>r),null,2));
  if(process.argv[4]&&report.build.shortId!==process.argv[4])throw new Error('Build identity mismatch');
  if(report.actualBodySha!=='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95')throw new Error('Unexpected body asset');
  const failed=report.runs.filter(r=>{
   if(r.correction!=='full')return false;
   const raw=report.runs.find(x=>x.correction==='raw'&&x.moveRoot===r.moveRoot&&x.speed===r.speed);
   return r.maxStep>raw.maxStep*1.35+.002||r.maxActualPatchTravel>.003||r.maxStanceDrift>.015||r.minPatchY<-.006||r.maxCorrection>.12;
  });
  if(failed.length||errors.length)throw new Error('Foot-lock continuity/contact regression or pageerror: '+failed.map(r=>r.speed+'/'+r.moveRoot).join(', '));
 }catch(error){await writeFailure(out,error,{initialGate,errors});throw error;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
