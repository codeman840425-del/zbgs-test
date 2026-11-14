/** Continuous whole-turn candidate. No angle slices and no per-step yaw easing.
 * A support pivot + two overlapping weight transfers form one editable phrase.
 * Visual naturalness remains an acceptance item, not a scheduler assertion.
 */
const EPS=1e-8, clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>x*x*(3-2*x);
export const turnAngleDelta=(to,from)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
export const TURN_FULL_ROTATION=Math.PI*2;
export function createTurnPolicy({smallAngle=.27, maxVelocity=3.6, acceleration=14}={}) {
 let yaw=0,goal=0,velocity=0,elapsed=0,serial=0,phrase=null,mode="idle",stopped=false;
 let headingRequest=null, preferredSwing=-1, footYaws=[0,0];
 function reset(at=0,options={}) {
  if(!Number.isFinite(at))throw new TypeError("finite yaw required");
  yaw=goal=at;velocity=elapsed=0;phrase=null;mode="idle";stopped=false;headingRequest=null;
  preferredSwing=[0,1].includes(options.preferredSwing)?options.preferredSwing:-1;footYaws=[at,at];return sample();
 }
 function begin() {
  const angle=goal-yaw;if(Math.abs(angle)<EPS)return;
  const end=yaw+clamp(angle,-Math.PI,Math.PI);
  phrase={id:++serial,start:yaw,end,small:Math.abs(angle)<=smallAngle,
   progress:0,time:0,
   // Opening towards the turn avoids crossing the free leg across support.
   first:preferredSwing>=0?preferredSwing:angle>0?0:1};
 }
 function requestHeading(value) {
  if(!Number.isFinite(value))throw new TypeError("finite heading required");
  if(headingRequest!==null&&Math.abs(turnAngleDelta(value,headingRequest))<EPS)return sample();
  headingRequest=value;goal=yaw+turnAngleDelta(value,yaw);mode="heading";stopped=false;
  if(!phrase)begin();
  else if(phrase.small&&Math.abs(goal-yaw)>smallAngle)begin();
  return sample();
 }
 function requestRotation(value) {
  if(!Number.isFinite(value))throw new TypeError("finite rotation required");
  goal=yaw+value;headingRequest=null;mode="rotation";stopped=false;if(!phrase)begin();return sample();
 }
 function stop(){goal=yaw+Math.sign(velocity)*velocity*velocity/(2*acceleration);stopped=true;headingRequest=null;mode="stop";return sample();}
 function sample(){
  const p=phrase?phrase.progress:1;
  const feet=footYaws.map((angle,index)=>{
   if(!phrase)return {index,contact:true,swing:false,progress:1,blend:1,yaw:angle,landingYaw:angle,lift:0};
   const first=index===phrase.first,a=first?0:.55,b=first?.55:.96;
   const q=clamp((p-a)/(b-a),0,1), swing=!phrase.small&&p>a&&p<b;
   // Position/rotation of a planted sole pivots about an actual toe, not ankle.
   return {index,swing,contact:!swing,progress:q,blend:smooth(q),
    yaw,landingYaw:phrase.end,landingRootYaw:phrase.end,
    lift:swing?Math.sin(Math.PI*q)**2:0,
    pivot:true,window:first?0:1,landed:!phrase.small&&p>=b};
  });
  const transfer=phrase&&!phrase.small?(p<.55?-1:1)*(phrase.first===0?1:-1)*Math.sin(Math.PI*clamp(p<.55?p/.55:(p-.55)/.45,0,1)):0;
  return {active:!!phrase,yaw,targetYaw:phrase?.end??goal,requestedYaw:goal,remaining:goal-yaw,elapsed,stopped,mode,
   angularVelocity:velocity,stepId:phrase?.id??serial,kind:phrase?(phrase.small?"pivot":"whole-turn"):"idle",
   progress:p,stepEndYaw:goal,feet,weightShift:transfer,
   torsoLead:clamp(velocity*.055,-.18,.18)};
 }
 function update(dt){
  if(!Number.isFinite(dt)||dt<0||dt>.05000001)throw new RangeError("substeps <=50ms required");
  if(!phrase)return sample();
  elapsed+=dt;phrase.time+=dt;
  const left=phrase.end-yaw;
  // Continuous bounded angular acceleration. New destinations change the goal,
  // not the phrase phase, support order or angular velocity.
  const desired=Math.sign(left)*Math.min(maxVelocity,Math.sqrt(2*acceleration*Math.abs(left)),Math.abs(left)*10);
  velocity+=clamp(desired-velocity,-acceleration*dt,acceleration*dt);
  const amount=velocity*dt;
  if(Math.abs(amount)>Math.abs(left)&&Math.sign(amount)===Math.sign(left)){yaw=phrase.end;velocity=0;}else yaw+=amount;
  const previousProgress=phrase.progress;
  phrase.progress=clamp((yaw-phrase.start)/(phrase.end-phrase.start),0,1);
  // Foot transfer follows actual angular travel, not a timer that can expire
  // while a new goal is still 150 degrees away. A changed request is committed
  // at the next landing, preserving current swing and root angular velocity.
  const changed=Math.abs(goal-phrase.end)>.001;
  const landing=(previousProgress<.55&&phrase.progress>=.55)||phrase.progress>=.96;
  if(changed&&(phrase.small||landing)){
   if(stopped)goal=yaw+Math.sign(velocity)*velocity*velocity/(2*acceleration);
   preferredSwing=1-phrase.first;begin();
  } else if(Math.abs(phrase.end-yaw)<.001&&Math.abs(velocity)<.01){
   yaw=phrase.end;footYaws=[yaw,yaw];
   if(Math.abs(goal-yaw)>.001){preferredSwing=1-phrase.first;begin();}
   else {yaw=goal;velocity=0;phrase=null;mode="idle";headingRequest=null;}
  }
  return sample();
 }
 return {reset,requestHeading,requestRotation,stop,update,sample};
}
