import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
const root=new URL('../../',import.meta.url),dir=new URL('assets-source/video-motion-v1/',root);
const bytes=readFileSync(new URL('video-squat-dvids-v1.glb',dir));
const model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const clip=THREE.AnimationClip.findByName(model.animations,'Video_Squat_DVIDS_Once_v1');
if(!clip || !clip.validate())throw Error('Invalid clip');
const mixer=new THREE.AnimationMixer(model.scene);mixer.clipAction(clip).setLoop(THREE.LoopOnce,1).play();
const samples=[];
for(const t of [0,2.5,3.2,3.6,4.2,6.3,7.9746]){
  mixer.setTime(t);model.scene.updateMatrixWorld(true);
  samples.push({time:t,bones:Object.fromEntries(['pelvis','hand_l','hand_r','foot_l','foot_r'].map(name=>[name,model.scene.getObjectByName(name).getWorldPosition(new THREE.Vector3()).toArray()]))});
}
const report={kind:'Actual Three GLTFLoader + AnimationMixer parse, not game acceptance',clip:clip.name,duration:clip.duration,tracks:clip.tracks.length,samples};
writeFileSync(new URL('three-readback.json',dir),JSON.stringify(report,null,2));
console.log(JSON.stringify({clip:clip.name,duration:clip.duration,tracks:clip.tracks.length,samples:samples.length}));
