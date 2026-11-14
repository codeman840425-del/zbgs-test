// QA contract only. No player, timers, DOM or AudioContext; never advances time.
// Input MUST be motion.getMetrics(), whose dance.time is the actual danceClock.
export function mapDanceAudio(metrics,{offsetSeconds=0,audioDurationSeconds,loopStartSeconds=0,loopEndSeconds=audioDurationSeconds,loop=true}={}, {paused=false,playbackRate=1}={}){
  const finite=(n,name)=>{if(!Number.isFinite(n))throw TypeError('Finite '+name+' required');};
  for(const [name,n] of Object.entries({offsetSeconds,audioDurationSeconds,loopStartSeconds,loopEndSeconds,playbackRate}))finite(n,name);
  if(audioDurationSeconds<=0||loopStartSeconds<0||loopEndSeconds>audioDurationSeconds||loopEndSeconds<=loopStartSeconds||playbackRate<=0)throw RangeError('Invalid audio mapping range/rate');
  const dance=metrics?.dance;finite(dance?.time,'actual danceClock');finite(dance?.duration,'dance duration');
  if(dance.time<0||dance.duration<=0||!['loop','once-then-idle'].includes(dance.playback))throw RangeError('Invalid actual dance state');
  // Positive offset seeks ahead into the audio; negative offset delays audio.
  // The animation's own loop NEVER resets the shared unwrapped dance clock.
  const elapsed=dance.time+offsetSeconds,length=loopEndSeconds-loopStartSeconds;
  const onceEnded=dance.playback==='once-then-idle'&&dance.time>=dance.duration;
  const audioEnded=!loop&&elapsed>=length;
  const status=metrics.action!=='dance'?'inactive':onceEnded||audioEnded?'ended':paused?'paused':elapsed<0?'waiting-offset':'playing';
  const cycles=elapsed<0?0:loop?Math.floor(elapsed/length):0;
  const targetSeconds=loopStartSeconds+(elapsed<0?0:loop?elapsed-cycles*length:Math.min(elapsed,length));
  return {danceId:dance.id,danceClock:dance.time,clipTime:dance.playback==='loop'?dance.time%dance.duration:Math.min(dance.time,dance.duration),clipCycle:dance.playback==='loop'?Math.floor(dance.time/dance.duration):0,audioLoopCycle:cycles,targetSeconds,status,shouldPlay:status==='playing',playbackRate,offsetSeconds,audioLoop:loop,loopStartSeconds,loopEndSeconds};
}

export function createDanceAudioObserver(config){
  let previous=null;
  return {observe(metrics,controls={},observedAudioTime=null){
    const sample=mapDanceAudio(metrics,config,controls);
    const restarted=!!previous&&(sample.danceId!==previous.danceId||sample.danceClock<previous.danceClock-1e-9);
    let driftSeconds=null;
    if(observedAudioTime!==null){
      if(!Number.isFinite(observedAudioTime))throw TypeError('Finite observed audio time required');
      driftSeconds=observedAudioTime-sample.targetSeconds;
      if(sample.audioLoop){const length=sample.loopEndSeconds-sample.loopStartSeconds;driftSeconds=((driftSeconds+length/2)%length+length)%length-length/2;}
    }
    const result={...sample,restarted,clockDelta:previous&&!restarted?sample.danceClock-previous.danceClock:null,clipWraps:previous&&!restarted?sample.clipCycle-previous.clipCycle:0,audioWraps:previous&&!restarted?sample.audioLoopCycle-previous.audioLoopCycle:0,driftSeconds,transportObserved:observedAudioTime!==null};
    previous=sample;return result;
  },reset(){previous=null;}};
}
