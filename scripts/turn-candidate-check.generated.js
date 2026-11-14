async(page)=>{
 const runs=[];
 for(const port of [5184,5186]){
  await page.goto('http://127.0.0.1:'+port+'/');await page.waitForFunction(()=>__debug?.ready);
  runs.push(await page.evaluate(()=>{
   const d=__debug;d.setPaused(true);d.reset();d.setBodyMode('base');d.setOutfit(0);d.setSpeed(.85);d.setPlaybackRate(1);d.view('front');d.advance(.5);d.walkTo(-.5,2.8);
   for(let i=0;i<300&&d.snapshot().distance<.65;i++)d.advance(1/120);
   const start=d.snapshot();d.walkTo(-.5,-.8);const trace=[];
   const root=d.avatar().root,vec=root.position.clone();
   for(let i=0;i<1100;i++){
    d.advance(1/120);const s=d.snapshot();const feet=s.feet.map(f=>({side:f.side,contact:f.contact,actual:f.actual,local:root.worldToLocal(vec.fromArray(f.actual)).toArray(),support:f.supportActual,point:f.contactPoint,clamp:f.reachClamp}));
    trace.push({t:s.simulationTime,position:s.position,yaw:s.facing,speed:s.speed,pathTurn:s.pathTurn,turning:s.motion.turning,moving:s.motion.moving,phase:s.phase,turnPhase:s.motion.turnPhase,stopTime:s.motion.stopTime,gait:s.motion.gait,feet});
    if(!s.target&&s.mode==='idle')break;
   }
   const sideSign=Math.sign(trace[0].feet[0].local[0]-trace[0].feet[1].local[0]);
   let minLateral=1,maxJump=0,clamps=0;
   for(let i=0;i<trace.length;i++){
    minLateral=Math.min(minLateral,sideSign*(trace[i].feet[0].local[0]-trace[i].feet[1].local[0]));
    clamps+=trace[i].feet.filter(f=>f.clamp).length;
    if(i)for(let j=0;j<2;j++)maxJump=Math.max(maxJump,Math.hypot(...trace[i].feet[j].actual.map((x,k)=>x-trace[i-1].feet[j].actual[k])));
   }
   return{build:d.buildInfo,start:{position:start.position,yaw:start.facing,phase:start.phase},minLateral,maxJump,clamps,trace,end:d.snapshot()};
  }));
 }
 return runs;
}
