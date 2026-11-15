// Original procedural QA sound: four sine clicks, 120 BPM, two-second loop.
// No samples, music recording or third-party sound assets. CC0-1.0 dedication.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
export function beatPCM(sampleRate=48000){
  const pcm=new Int16Array(sampleRate*2);
  for(let beat=0;beat<4;beat++)for(let i=0;i<sampleRate*.055;i++){
    const t=i/sampleRate,attack=Math.min(1,t/.002),envelope=attack*Math.exp(-t/ .012);
    pcm[Math.round(beat*.5*sampleRate)+i]=Math.round(32767*.3*envelope*Math.sin(2*Math.PI*(beat===0?880:440)*t));
  }
  return pcm;
}
export function makeBeatWav(){
  const pcm=beatPCM(),wav=Buffer.alloc(44+pcm.length*2);
  wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
  wav.write('data',36);wav.writeUInt32LE(pcm.length*2,40);
  for(let i=0;i<pcm.length;i++)wav.writeInt16LE(pcm[i],44+i*2);
  return wav;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const dir=path.resolve('assets-source/m1c-audio-qa');await fs.mkdir(dir,{recursive:true});
  const wav=makeBeatWav();await fs.writeFile(path.join(dir,'original-beat-120bpm.wav'),wav);
  await fs.writeFile(path.join(dir,'source.json'),JSON.stringify({id:'original-beat-120bpm-v1',license:'CC0-1.0',author:'Project procedural QA generator',generator:'scripts/m1c/generate-beat-pcm.mjs',sampleRate:48000,channels:1,encoding:'PCM16 little-endian',durationSeconds:2,bpm:120,beatOnsetsSeconds:[0,.5,1,1.5],frequenciesHz:[880,440,440,440],peakAmplitude:.3,sha256:crypto.createHash('sha256').update(wav).digest('hex'),bytes:wav.length,purpose:'Synthetic QA timing cue, not authored choreography/music sync'},null,2));
  console.log('Generated original 2-second PCM; no playback');
}
