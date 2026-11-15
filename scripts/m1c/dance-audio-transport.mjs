// Isolated QA player only. Product main/motion remain untouched.
import {mapDanceAudio,createDanceAudioObserver} from './dance-audio-mapping.mjs';
export async function waitForAudioClock({context,output=context.destination,now=()=>performance.now(),nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve)),timeoutMs=3000}){
  // Exercise the real render graph silently after explicit user activation.
  // state=running alone can precede the hardware render clock by >100 ms.
  const probe=context.createBufferSource();probe.buffer=context.createBuffer(1,128,context.sampleRate);probe.loop=true;probe.connect(output);
  const startWall=now(),startContext=context.currentTime,samples=[];let last=startContext,advances=0;
  probe.start();
  try{
    while(now()-startWall<timeoutMs){
      await nextFrame();const current=context.currentTime;
      samples.push({wallMs:now(),contextTime:current,state:context.state});
      if(context.state==='running'&&current>last){advances++;last=current;}
      if(advances>=3&&current-startContext>=.04)return{startWallMs:startWall,startContextTime:startContext,readyWallMs:now(),readyContextTime:current,advances,samples,method:'Silent connected source; actual render clock advances >=40ms on >=3 observations. Not a speaker-latency calibration.'};
    }
    throw Error('Audio render clock did not advance after activation');
  }finally{probe.stop();probe.disconnect();}
}
export function createDanceAudioTransport({context,buffer,output=context.destination,offsetSeconds=0}){
  const gain=context.createGain();gain.gain.value=.35;gain.connect(output);
  const config={audioDurationSeconds:buffer.duration,loop:true,offsetSeconds};
  let source=null,anchor=null,previous=null,disposed=false,version=0;
  const observer=createDanceAudioObserver(config),events=[];
  function stop(reason){
    if(source){source.onended=null;source.stop();source.disconnect();events.push({kind:'stop',reason,contextTime:context.currentTime});}
    source=null;anchor=null;
  }
  function estimatedPosition(){
    if(!anchor)return null;
    const elapsed=Math.max(0,context.currentTime-anchor.contextTime)*anchor.rate;
    return (anchor.offset+elapsed)%buffer.duration;
  }
  return {
    update(metrics,controls){
      if(disposed)throw Error('Disposed QA audio transport');
      const mapped=mapDanceAudio(metrics,config,controls);
      const reset=previous&&(mapped.danceId!==previous.danceId||mapped.danceClock<previous.danceClock-1e-9);
      const rateChange=anchor&&anchor.rate!==mapped.playbackRate;
      if(!mapped.shouldPlay||context.state!=='running')stop(mapped.status==='playing'?'context-'+context.state:mapped.status);
      else if(!source||reset||rateChange){
        stop(reset?'dance-reset':rateChange?'rate-change':'start');
        source=context.createBufferSource();source.buffer=buffer;source.loop=true;
        source.loopStart=0;source.loopEnd=buffer.duration;source.playbackRate.value=mapped.playbackRate;source.connect(gain);
        anchor={contextTime:context.currentTime,offset:mapped.targetSeconds,rate:mapped.playbackRate};
        source.start(anchor.contextTime,anchor.offset);version++;
        events.push({kind:'start',reason:reset?'dance-reset':rateChange?'rate-change':'resume-or-cue',...anchor,version});
      }
      // Independent AudioContext clock extrapolation, NOT measured speaker playhead.
      // No seek/re-anchor on ordinary frames: drift remains visible in evidence.
      const estimated=estimatedPosition();
      const observed=observer.observe(metrics,controls,estimated);
      previous=mapped;
      return {mapped,observed,sourceActive:!!source,version,contextState:context.state,contextTime:context.currentTime,
        estimatedBufferPosition:estimated,positionMethod:'AudioBufferSource start anchor + independent AudioContext.currentTime; estimate, not device playhead',
        outputTimestamp:context.getOutputTimestamp?.()??null,baseLatency:context.baseLatency??null,outputLatency:context.outputLatency??null,
        latencyMeaning:'Browser-reported estimates; not acoustic or display latency measurement'};
    },
    setOffset(seconds){if(!Number.isFinite(seconds))throw TypeError('Finite offset required');if(config.offsetSeconds===seconds)return;stop('offset-change');config.offsetSeconds=seconds;observer.reset();previous=null;},
    getEvents(){return events.slice();},
    dispose(){if(disposed)return;stop('dispose');gain.disconnect();disposed=true;},
  };
}
