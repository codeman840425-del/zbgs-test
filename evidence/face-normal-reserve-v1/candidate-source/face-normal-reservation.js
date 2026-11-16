import * as THREE from 'three';

// Runtime-only storage preparation for the two exact original assets. The
// original file SHA and every subsequent recipe/attribute check stay unchanged.
const profiles = {
  '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95': { prefix:'F00_000_00_', count:2055, targets:56 },
  '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff': { prefix:'M00_000_00_', count:2056, targets:54 },
};
const parts=['FaceMouth_00_FACE','EyeWhite_00_EYE','FaceEyeline_00_FACE','FaceEyelash_00_FACE','FaceBrow_00_FACE','Face_00_SKIN'];
const reserved=new WeakMap();
export const reservedNormalCacheKey = geometry => reserved.get(geometry);

// Must run after validated parsing and BEFORE any render/compile can create a
// morph texture. Three r187 only invalidates that cache when target count changes.
export function reserveFaceNormalLayout(vrm, avatarSha256) {
  const profile=profiles[avatarSha256];
  if(!profile)return {reserved:false,reason:'body-not-admitted'};
  const names=new Set(parts.map(p=>profile.prefix+p)),seen=new Set(),geometries=new Set();
  vrm.scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const matching=materials.map(m=>m.name.replace(/ \(Outline\)$/, '')).filter(n=>names.has(n));
    if(!matching.length)return;
    if(materials.some(m=>!names.has(m.name.replace(/ \(Outline\)$/, ''))))throw Error('Mixed face reservation primitive');
    matching.forEach(n=>seen.add(n));geometries.add(mesh.geometry);
  });
  if(seen.size!==names.size)throw Error('Missing face reservation primitive');
  if([...geometries].every(g=>reserved.has(g)))return {reserved:true,alreadyPrepared:true};
  let firstNormal=null;
  for(const g of geometries){
    if(reserved.has(g)||!g.morphTargetsRelative||g.morphAttributes.normal!==undefined||g.morphAttributes.color!==undefined||
       g.attributes.position?.count!==profile.count||g.attributes.normal?.count!==profile.count||
       g.morphAttributes.position?.length!==profile.targets||
       g.morphAttributes.position.some(a=>a.count!==profile.count||a.itemSize!==3))throw Error('Unexpected original face morph layout');
    const n=g.attributes.normal;
    if(firstNormal){for(let i=0;i<n.count;i++)for(let c=0;c<3;c++)if(n.getComponent(i,c)!==firstNormal.getComponent(i,c))throw Error('Face normals not shared source values');}
    else firstNormal=n;
  }
  // One actor-owned immutable zero vector buffer is sufficient for every layer.
  // Three's packed morph texture still allocates each geometry and target layer.
  const zero=new THREE.BufferAttribute(new Float32Array(profile.count*3),3);
  const targets=Array.from({length:profile.targets},()=>zero);
  for(const g of geometries){g.morphAttributes.normal=targets;reserved.set(g,targets);}
  return {reserved:true,geometryCount:geometries.size,zeroBufferBytes:zero.array.byteLength,targetCount:profile.targets};
}
