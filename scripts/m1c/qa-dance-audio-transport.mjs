// Offline lifecycle tests: fake AudioContext, never sound/browser.
import assert from 'node:assert/strict';
import {createDanceAudioTransport,waitForAudioClock} from './dance-audio-transport.mjs';
import {makeBeatWav,beatPCM} from './generate-beat-pcm.mjs';
class FakeContext{
  currentTime=0;state='running';destination={};nodes=[];
  createGain(){return{gain:{value:0},connect(){},disconnect(){}};}
  createBuffer(){return{};}
  createBufferSource(){const n={playbackRate:{value:1},stopped:false,connect(){},disconnect(){},start(t,o){this.started=[t,o];},stop(){assert(!this.stopped);this.stopped=true;}};this.nodes.push(n);return n;}
}
const metrics=(time,action='dance',id='source')=>({action,dance:{id,time,duration:1,playback:'loop'}});
const c=new FakeContext(),p=createDanceAudioTransport({context:c,buffer:{duration:2}}),checks=[];
p.update(metrics(0),{playbackRate:1});c.currentTime=.5;
let r=p.update(metrics(.45),{playbackRate:1});assert.equal(r.estimatedBufferPosition,.5);assert(Math.abs(r.observed.driftSeconds-.05)<1e-9);assert.equal(c.nodes.length,1);
checks.push('Independent context-clock drift is exposed, not self-compared or silently corrected');
c.currentTime=1.1;p.update(metrics(1.05),{});assert.equal(c.nodes.length,1);
c.currentTime=2.1;r=p.update(metrics(2.05),{});assert.equal(c.nodes.length,1);assert(Math.abs(r.estimatedBufferPosition-.1)<1e-9);
checks.push('Clip and audio loop boundaries do not restart source');
r=p.update(metrics(2.05),{paused:true});assert(!r.sourceActive);c.currentTime=3;r=p.update(metrics(2.05),{paused:true});assert.equal(r.estimatedBufferPosition,null);
r=p.update(metrics(2.05),{playbackRate:.25});assert.equal(c.nodes.length,2);c.currentTime=3.4;r=p.update(metrics(2.15),{playbackRate:.25});assert(Math.abs(r.observed.driftSeconds)<1e-9);
checks.push('Pause stops source; quarter-rate resume anchors once with no double rate');
p.setOffset(-.25);r=p.update(metrics(.1),{});assert(!r.sourceActive);r=p.update(metrics(.3),{});assert(r.sourceActive);assert(Math.abs(r.estimatedBufferPosition-.05)<1e-9);
p.setOffset(.4);r=p.update(metrics(.3),{});assert(Math.abs(r.estimatedBufferPosition-.7)<1e-9);
const count=c.nodes.length;p.update(metrics(.02),{});assert.equal(c.nodes.length,count+1);
checks.push('Positive/negative offset, clock reset and source re-anchor');
r=p.update(metrics(.02,'idle'),{});assert(!r.sourceActive);
p.update(metrics(.1),{});c.state='suspended';r=p.update(metrics(.1),{});assert(!r.sourceActive);c.state='running';r=p.update(metrics(.1),{});assert(r.sourceActive);
p.dispose();p.dispose();assert(c.nodes.every(n=>n.stopped));assert.throws(()=>p.update(metrics(0),{}),/Disposed/);
const c2=new FakeContext(),p2=createDanceAudioTransport({context:c2,buffer:{duration:2}});assert(p2.update(metrics(0),{}).sourceActive);p2.dispose();
checks.push('Inactive/context suspension/dispose cleanly stop; independent instance unaffected');
const wav=makeBeatWav();assert(wav.equals(makeBeatWav()));assert.equal(wav.length,192044);assert.equal(wav.toString('ascii',0,4),'RIFF');
const pcm=beatPCM();assert(pcm.some(v=>v!==0));assert(pcm.slice(4800,20000).every(v=>v===0));assert(Math.max(...pcm.slice(0,3000))<=.3*32767);
checks.push('Original 2s PCM reproducible, non-silent clicks and silent intervals');
let wall=0;const warm=new FakeContext();
const gate=await waitForAudioClock({context:warm,now:()=>wall,nextFrame:async()=>{wall+=10;if(wall>120)warm.currentTime+=.01;}});
assert(gate.readyWallMs>=160);assert(gate.readyContextTime>=.04);assert(warm.nodes[0].stopped);
const stalled=new FakeContext();wall=0;
await assert.rejects(waitForAudioClock({context:stalled,now:()=>wall,nextFrame:async()=>{wall+=10;},timeoutMs:50}),/did not advance/);assert(stalled.nodes[0].stopped);
checks.push('Running-but-stalled startup is gated by actual clock advancement; timeout releases silent probe');
console.log(JSON.stringify({passed:true,checks,browserStarted:false,audioPlayed:false,scope:'Mock lifecycle and deterministic PCM only; actual WebAudio/latency/listening NOT tested'},null,2));
