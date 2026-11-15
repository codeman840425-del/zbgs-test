import * as THREE from 'three';

// Offline target-fitted data uses the same AnimationMixer as source-retargeted
// clips. Never apply UAL rest conversion or the VRM0 basis a second time.
export function parseNormalizedMotion(data, vrm, avatarSha256, entry) {
  if (data.schema !== 'normalized-vrm-motion.1' ||
      data.coordinateSpace !== 'three-vrm-3.5.5-normalized-local-absolute')
    throw Error('Unsupported normalized motion coordinate contract');
  if (!/^[a-f0-9]{64}$/.test(avatarSha256 || '') || data.avatarSha256 !== avatarSha256)
    throw Error('Normalized motion avatar identity mismatch');
  for (const field of ['sourceClipSha256', 'normalizedRigSha256', 'footwearSha256'])
    if (!/^[a-f0-9]{64}$/.test(data[field] || '')) throw Error('Missing motion provenance: '+field);
  const clip=data.clip;
  if (!clip || clip.name!==entry.clip || !Number.isFinite(clip.duration) || clip.duration<=0 ||
      Math.abs(clip.duration-entry.duration)>1e-4 || !Array.isArray(clip.tracks) || !clip.tracks.length)
    throw Error('Invalid normalized motion clip');
  const seen=new Set(), tracks=clip.tracks.map(track=>{
    const match=/^([A-Za-z]+)\.(quaternion|position)$/.exec(track.name || '');
    if (!match || seen.has(track.name)) throw Error('Invalid or repeated normalized track');
    seen.add(track.name);
    const [,semantic,property]=match,bone=vrm.humanoid.getNormalizedBoneNode(semantic);
    if (!bone || (property==='position' && semantic!=='hips')) throw Error('Unsupported normalized bone/property');
    const width=property==='quaternion'?4:3, type=width===4?'quaternion':'vector';
    if (track.type!==type || !Array.isArray(track.times) || track.times.length<2 ||
        !Array.isArray(track.values) || track.values.length!==track.times.length*width ||
        !track.values.every(Number.isFinite) || !track.times.every((t,i)=>Number.isFinite(t)&&t>=0&&t<=clip.duration+1e-4&&(!i||t>track.times[i-1])))
      throw Error('Invalid normalized track samples');
    if (width===4) for(let i=0;i<track.values.length;i+=4)
      if(Math.abs(Math.hypot(...track.values.slice(i,i+4))-1)>1e-3) throw Error('Non-unit normalized rotation');
    return {...track,name:bone.name+'.'+property};
  });
  const parsed=THREE.AnimationClip.parse({...clip,tracks});
  if (!parsed.validate()) throw Error('Normalized clip validation failed');
  return parsed;
}
