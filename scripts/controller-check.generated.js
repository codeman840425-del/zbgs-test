async(page)=>{
 await page.setViewportSize({width:1440,height:1400});
 await page.goto(page.url().startsWith('http') ? page.url() : 'http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__debug?.ready);
 const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
 const report=await page.evaluate(()=>{
  const d=__debug, out={};d.setPaused(true);d.setBodyMode('base');d.setSpeed(.85);
  const small=s=>({mode:s.mode,time:s.simulationTime,modeTime:s.modeTime,position:s.position,yaw:s.facing,path:s.path,target:s.target,pending:s.pending,progress:s.motion.sitProgress,danceMix:s.motion.danceMix,collision:s.collision});
  const until=(pred,max=1800)=>{let count=0,maxStep=0,last=d.snapshot().position,collisions=0;while(!pred(d.snapshot())&&count++<max){d.advance(1/60);const s=d.snapshot();maxStep=Math.max(maxStep,Math.hypot(...s.position.map((x,i)=>x-last[i])));last=s.position;if(s.collision)collisions++;}return{count,maxStep,collisions,state:small(d.snapshot())};};
  out.chairs=[];
  for(const transform of [{x:2.65,z:.8732500623203105,yaw:0},{x:1.1,z:.2,yaw:Math.PI/4},{x:-1.2,z:.4,yaw:-Math.PI/2}]){
   d.reset();d.setChairTransform(transform);d.action('sit');const arrival=until(s=>s.mode==='sit'&&s.motion.sitProgress>.999);
   const before=d.snapshot();d.action('sit');const repeat=d.snapshot();
   const local=d.scene.getObjectByName('RepresentativeChair').worldToLocal(d.avatar().root.position.clone()).toArray();
   d.action('stand');const stand=until(s=>s.mode==='idle');out.chairs.push({transform,arrival,local,repeatSame:before.motion.actionTime===repeat.motion.actionTime&&before.modeTime===repeat.modeTime,stand});
  }
  d.reset();d.setChairTransform({x:2.65,z:.8732500623203105,yaw:0});d.walkTo(1.5,2);d.advance(.8);d.walkTo(-2,2.2);out.destinationChange=until(s=>!s.target&&s.mode==='idle');
  d.walkTo(1.5,2);d.advance(.8);const stop=d.snapshot();d.action('idle');d.advance(1);out.abruptStop={before:small(stop),after:small(d.snapshot()),rootDisplacement:Math.hypot(...d.snapshot().position.map((x,i)=>x-stop.position[i]))};
  d.reset();d.action('dance');d.advance(1);d.walkTo(1.2,2);const initial=d.snapshot();d.advance(.4);const middle=d.snapshot();out.danceWalk={initial:small(initial),middle:small(middle),stationaryDuringBlend:initial.position.every((x,i)=>x===middle.position[i]),end:until(s=>s.mode==='idle'&&!s.pending&&!s.target)};
  d.reset();d.action('sit');until(s=>s.mode==='sit'&&s.motion.sitProgress>.35);const pre=d.snapshot();d.walkTo(-1,2);const requested=d.snapshot();d.advance(1/120);const first=d.snapshot();out.sitInterrupt={pre:small(pre),requested:small(requested),first:small(first),progressJump:first.motion.sitProgress-pre.motion.sitProgress,end:until(s=>s.mode==='idle'&&!s.pending&&!s.target)};
  d.reset();d.action('turn');d.advance(.5);const t=d.snapshot();d.action('turn');out.repeatTurn={before:t.modeTime,after:d.snapshot().modeTime};
  d.action('idle');d.reset();d.action('dance');d.advance(.6);const a=d.snapshot();d.action('dance');out.repeatDance={before:a.motion.actionTime,after:d.snapshot().motion.actionTime};
  out.buildInfo=d.buildInfo;
  return out;
 });
 const pausedBefore=await page.evaluate(()=>__debug.snapshot());await page.setViewportSize({width:1280,height:1100});await page.waitForTimeout(300);const pausedAfter=await page.evaluate(()=>__debug.snapshot());
 report.resizePaused={sameTime:pausedBefore.simulationTime===pausedAfter.simulationTime,sameRoot:JSON.stringify(pausedBefore.position)===JSON.stringify(pausedAfter.position),samePhase:pausedBefore.phase===pausedAfter.phase};
 for(const name of ['正面','侧面','背面'])await page.getByRole('button',{name,exact:true}).click();
 report.buttonPenetration=await page.evaluate(()=>({target:__debug.snapshot().target,mode:__debug.snapshot().mode,paused:__debug.snapshot().paused}));
 await page.setViewportSize({width:1440,height:1400});
 report.errors=errors;
 for(const c of report.chairs){if(c.arrival.state.mode!=='sit'||c.arrival.collisions||c.stand.state.mode!=='idle'||!c.repeatSame)throw Error('Chair/state regression');if(Math.abs(c.local[0])>.0005)throw Error('Seat lateral alignment');}
 if(report.abruptStop.rootDisplacement!==0||!report.danceWalk.stationaryDuringBlend||report.sitInterrupt.first.progress>report.sitInterrupt.pre.progress)throw Error('Interruption regression');
 if(report.repeatTurn.before!==report.repeatTurn.after||report.repeatDance.before!==report.repeatDance.after)throw Error('Same-action restarted');
 if(!report.resizePaused.sameTime||!report.resizePaused.sameRoot||report.buttonPenetration.target||errors.length)throw Error('UI/lifecycle regression');
 return report;
}
