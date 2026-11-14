// Regression: braking/retargeting must not compress an entire support transfer
// into the small remaining yaw angle. This is a clock check, not visual QA.
import assert from 'node:assert/strict';
import {createTurnPolicy} from '../prototype/src/turn-policy.js';
const records=[];
for(const hz of [30,60,120]) for(const command of ['stop','retarget']) {
  const p=createTurnPolicy(),dt=1/hz;
  p.reset(0);p.requestHeading(Math.PI);
  let edited=false,previous=p.sample(),maximum=0,activeFrames=0;
  for(let frame=0;frame<hz*8;frame++) {
    if(!edited&&previous.progress>.3) {
      command==='stop'?p.stop():p.requestHeading(previous.yaw-.46);
      edited=true;
    }
    const row=p.update(dt);
    if(row.active&&previous.active&&row.stepId===previous.stepId&&row.kind!=='pivot') {
      const advance=row.progress-previous.progress;
      assert(advance>=-1e-10,'A committed foot transfer ran backwards');
      assert(advance<=dt/.6+1e-10,'Small remaining yaw compressed foot transfer');
      maximum=Math.max(maximum,advance/dt);
    }
    if(!row.active)break;
    activeFrames++;previous=row;
  }
  assert(edited);assert(!p.sample().active,'Edited turn never completed');
  records.push({hz,command,maximumPhaseRate:maximum,activeSeconds:activeFrames/hz});
}
console.log(JSON.stringify({passed:true,scope:'Planner transfer time only; actual legs and normal-speed footage require separate checks',records},null,2));
