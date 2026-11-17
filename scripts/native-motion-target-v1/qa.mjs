import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '../../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import { parseNormalizedMotion } from '../../prototype/src/normalized-motion.js';

const ROOT=fileURLToPath(new URL('../..', import.meta.url));
const pkg=path.join(ROOT,'assets-source/native-motion-target-v1'), generated=path.join(pkg,'generated-v2'), evidence=path.join(ROOT,'evidence/native-motion-reuse-audit-v1');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sourceFbx='analysis/rokoko-pilot-archive-v1/vendor-output/5359146-frames0000-0719-1080p-end30.fbx';
const cases=[
  ['native-female-843ac-v1','assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm'],
  ['native-female-face-v1','assets-source/native-vroid-geometry-factory-input-v1/generated/female-geometry-face-unmasked.vrm'],
  ['native-female-waist-v1','assets-source/native-vroid-geometry-factory-input-v1/generated/female-geometry-waist-unmasked.vrm'],
  ['native-male-7586-v1','assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm']
];
function strip(bytes){const n=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+n));delete j.images;delete j.textures;delete j.samplers;delete j.materials;for(const m of j.meshes||[])for(const p of m.primitives)delete p.material;const b=Buffer.from(JSON.stringify(j)),pad=Buffer.concat([b,Buffer.alloc((4-b.length%4)%4,32)]),bin=bytes.subarray(20+n),h=Buffer.alloc(20);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(20+pad.length+bin.length,8);h.writeUInt32LE(pad.length,12);h.write('JSON',16);return Buffer.concat([h,pad,bin]);}
async function load(p){const b=fs.readFileSync(p),loader=new GLTFLoader();loader.register(x=>new VRMLoaderPlugin(x));const s=strip(b),r=await loader.parseAsync(s.buffer.slice(s.byteOffset,s.byteOffset+s.byteLength),'');r.userData.vrm.scene.updateMatrixWorld(true);return r.userData.vrm;}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?walk(p):[p]});}
const manifest=JSON.parse(fs.readFileSync(path.join(generated,'manifest.json')));
const result={schema:'native-motion-target-qa-v1',status:'pending',runtimeAccepted:false,source:{path:sourceFbx,sha256:sha(fs.readFileSync(path.join(ROOT,sourceFbx)))},conversion:{correction:manifest.correction,sourceUnits:manifest.sourceUnits,sampleRule:'first valid sample at 1/30, then 2/30..899/30, endpoint repeats 899/30 at 30'},cases:[],repeat:{status:'not-run'}};
for(const [id,rel] of cases){const motionPath=path.join(generated,id,'motion.json'),rigPath=path.join(generated,id,'target-rig.json'),motion=JSON.parse(fs.readFileSync(motionPath)),vrm=await load(path.join(ROOT,rel));const avatar=sha(fs.readFileSync(path.join(ROOT,rel)));if(motion.avatarSha256!==avatar)throw Error(id+' avatar identity');const clip=motion.clip;const parsed=parseNormalizedMotion(motion,vrm,avatar,{clip:clip.name,duration:clip.duration});if(parsed.duration!==30||clip.tracks.length!==53)throw Error(id+' clip shape');for(const t of clip.tracks)if(!t.values.every(Number.isFinite))throw Error(id+' nonfinite');const rig=JSON.parse(fs.readFileSync(rigPath));if(rig.avatarSha256!==avatar||Object.keys(rig.normalizedBones).length!==52)throw Error(id+' rig identity');result.cases.push({id,avatarSha256:avatar,motion:{path:path.relative(ROOT,motionPath).replaceAll('\\','/'),bytes:fs.statSync(motionPath).size,sha256:sha(fs.readFileSync(motionPath))},rig:{path:path.relative(ROOT,rigPath).replaceAll('\\','/'),bytes:fs.statSync(rigPath).size,sha256:sha(fs.readFileSync(rigPath))},normalizedBones:Object.keys(rig.normalizedBones).length,trackCount:clip.tracks.length,duration:clip.duration,parsedDuration:parsed.duration});}
const tmp=path.join(pkg,'.repeat-check-'+process.pid);execFileSync(process.execPath,['scripts/native-motion-target-v1/build.mjs','--out',tmp],{cwd:ROOT,stdio:'ignore'});const first=walk(generated).filter(p=>!p.includes('.repeat-check-')&&!p.endsWith('package-files.json')).map(p=>[path.relative(generated,p),sha(fs.readFileSync(p))]).sort();const second=walk(tmp).filter(p=>!p.endsWith('package-files.json')).map(p=>[path.relative(tmp,p),sha(fs.readFileSync(p))]).sort();result.repeat={status:JSON.stringify(first)===JSON.stringify(second)?'byte-identical':'mismatch',files:first.length};fs.rmSync(tmp,{recursive:true,force:true});if(result.repeat.status!=='byte-identical')throw Error('repeat mismatch');
result.status='source-normalized-candidates-built-not-runtime-admitted';fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'native-motion-target-qa.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
