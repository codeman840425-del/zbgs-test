import {readFileSync,writeFileSync} from 'node:fs';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
const dir=new URL('../../assets-source/video-motion-v2/',import.meta.url),bytes=readFileSync(new URL('video-squat-dvids-wrists-v2.glb',dir));
const model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const clip=model.animations.find(a=>a.name==='Video_Squat_DVIDS_Wrists_Once_v2');
if(!clip?.validate())throw Error('Invalid clip');
const mixer=new T.AnimationMixer(model.scene);mixer.clipAction(clip).setLoop(T.LoopOnce,1).play();
const samples=[];for(let i=0;i<240;i++){const t=i*1001/30000;mixer.setTime(t);model.scene.updateMatrixWorld(true);samples.push({t,left:model.scene.getObjectByName('hand_l').getWorldQuaternion(new T.Quaternion()).toArray(),right:model.scene.getObjectByName('hand_r').getWorldQuaternion(new T.Quaternion()).toArray()});}
writeFileSync(new URL('three-readback.json',dir),JSON.stringify({clip:clip.name,duration:clip.duration,tracks:clip.tracks.length,samples},null,2));console.log('Actual Three parse/mixer 240 samples passed; not visual acceptance');
