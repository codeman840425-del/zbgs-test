import {canonicalJson,sha256Hex} from './character-record.js';

const hash=/^[a-f0-9]{64}$/;
const vector=value=>Array.isArray(value) && value.length===3 && value.every(Number.isFinite);
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
function requireValue(test,code='vocal-lip-anchor-invalid'){if(!test)throw Error(code);}

// Keep only source identities. The GLTF parser owns the entire binary and
// dependency graph and must not be retained by the character for future tasks.
export function lipAnchorSourceIdentity(doc) {
  const candidates=[];
  for(const [mesh,definition] of (doc.meshes??[]).entries()) {
    for(const [primitive,p] of definition.primitives.entries()) {
      const material=doc.materials?.[p.material]?.name;
      if(material?.includes('FaceMouth')) candidates.push({mesh,primitive,material,p});
    }
  }
  if(candidates.length!==1)return null;
  const {mesh,primitive,material,p}=candidates[0];
  const owners=doc.nodes.map((n,i)=>n.mesh===mesh?i:-1).filter(i=>i>=0);
  const legacy=doc.extensions?.VRM,modern=doc.extensions?.VRMC_vrm;
  if(owners.length!==1 || !!legacy===!!modern)return null;
  const node=owners[0],preset=legacy?'a':'aa';
  const expressions=legacy?.blendShapeMaster?.blendShapeGroups?.filter(e=>e.presetName===preset);
  const binds=legacy?(expressions?.length===1?expressions[0].binds:null):modern.expressions?.preset?.aa?.morphTargetBinds;
  const bind=binds?.[0],specVersion=(legacy??modern).specVersion;
  if(binds?.length!==1 || !Number.isInteger(bind.index) || !Number.isInteger(p.targets?.[bind.index]?.POSITION) ||
      (legacy?(bind.mesh!==mesh || bind.weight!==100 || specVersion!=='0.0'):(bind.node!==node || bind.weight!==1 || specVersion!=='1.0')))return null;
  const names=p.extras?.targetNames??doc.meshes[mesh].extras?.targetNames;
  const morphTargetName=names?.[bind.index],count=doc.accessors?.[p.attributes.POSITION]?.count;
  const bone=name=>legacy?legacy.humanoid?.humanBones?.find(b=>b.bone===name)?.node:modern.humanoid?.humanBones?.[name]?.node;
  const landmarkNodes={head:bone('head'),leftEye:bone('leftEye'),rightEye:bone('rightEye')};
  if(typeof morphTargetName!=='string' || !Number.isSafeInteger(count) ||
      !Object.values(landmarkNodes).every(i=>Number.isInteger(i)&&doc.nodes[i]))return null;
  return {faceMouth:{node,mesh,primitive,material},landmarkNodes,count,
    source:{extension:legacy?'VRM':'VRMC_vrm',specVersion,preset,bind:{...bind},morphTargetName}};
}

export async function validateLipAnchorDescriptor(data,bodySha256,identity) {
  requireValue(data?.schema==='character-lip-anchor-v1');
  requireValue(hash.test(bodySha256) && data.bodySha256===bodySha256,'vocal-lip-anchor-body-mismatch');
  const {path,...source}=data.source??{};
  requireValue(typeof path==='string' && identity && same(source,identity.source) &&
    same(data.faceMouth,identity.faceMouth) && same(data.landmarkNodes,identity.landmarkNodes),'vocal-lip-anchor-binding-mismatch');
  const ids=data.rimVertexIds;
  requireValue(Array.isArray(ids) && ids.length===32 &&
    ids.every((id,i)=>Number.isSafeInteger(id)&&id>=0&&id<identity.count&&(i===0||id>ids[i-1])),'vocal-lip-anchor-indices-invalid');
  const bytes=new Uint8Array(ids.length*4),view=new DataView(bytes.buffer);
  ids.forEach((id,i)=>view.setUint32(i*4,id,true));
  requireValue(await sha256Hex(bytes)===data.rimVertexIdsSha256,'vocal-lip-anchor-indices-invalid');
  const ref=data.reference;
  requireValue(ref?.coordinates==='raw-head-local metres' && vector(ref.adjacentFaceNormal) &&
    ['neutral','fullVowel'].every(key=>{
      const center=ref[key+'Centroid'],bounds=ref[key+'Bounds'];
      return vector(center) && Array.isArray(bounds) && bounds.length===2 && bounds.every(vector) &&
        center.every((x,i)=>bounds[0][i]<=x && x<=bounds[1][i]);
    }));
  return [...ids];
}

export async function readLipAnchor(pin,bodySha256,identity,signal) {
  requireValue(pin && typeof pin.url==='string' && pin.url.length>0 && Number.isSafeInteger(pin.bytes) && pin.bytes>0 && hash.test(pin.sha256));
  let bytes;
  try {
    const response=await fetch(pin.url,{signal});
    if(!response.ok)throw Error();
    bytes=new Uint8Array(await response.arrayBuffer());
  } catch {throw Error('vocal-lip-anchor-unavailable');}
  requireValue(bytes.length===pin.bytes && await sha256Hex(bytes)===pin.sha256,'vocal-lip-anchor-integrity-mismatch');
  let descriptor;
  try{descriptor=JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('vocal-lip-anchor-invalid');}
  return validateLipAnchorDescriptor(descriptor,bodySha256,identity);
}
