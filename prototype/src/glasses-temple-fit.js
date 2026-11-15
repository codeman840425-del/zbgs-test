import {Matrix3,Vector3} from 'three';
import registry from './glasses-temple-fit-manifest.json';
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
export function validateTempleProfile(p,bodySHA,accessorySHA){
 if(p?.schema!=='m1.glasses-temple-fit.1'||p.bodySHA256!==bodySHA||p.accessorySHA256!==accessorySHA||!Array.isArray(p.controls)||p.controls.length!==2)return false;
 const names=new Set(['Temple-1','Temple1']);
 for(const c of p.controls){if(!names.delete(c.mesh)||c.vertices!==36||!/^[a-f0-9]{64}$/.test(c.positionSHA256)||c.rings?.length!==4)return false;const ids=new Set();
  for(const r of c.rings){if(r.indices?.length!==9||![r.sourceCenter,r.targetCenter].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite))||r.rotationRowMajor?.length!==9||!r.rotationRowMajor.every(Number.isFinite))return false;
   for(const id of r.indices)if(!Number.isInteger(id)||id<0||id>=36||ids.has(id))return false;else ids.add(id);
   const m=r.rotationRowMajor;for(let i=0;i<3;i++)for(let j=0;j<3;j++){let dot=0;for(let k=0;k<3;k++)dot+=m[i*3+k]*m[j*3+k];if(Math.abs(dot-(i===j?1:0))>1e-8)return false;}
   const det=m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6]);if(Math.abs(det-1)>1e-8)return false;
  }if(ids.size!==36)return false;
 }return names.size===0;
}
export async function fitGlassesTemples(object,{bodySHA256,accessorySHA256,signal}){
 const entry=registry.profiles.find(p=>p.bodySHA256===bodySHA256);
 if(!entry)throw Error('当前基模没有精确匹配的镜腿适配配置；眼镜暂不可用。');
 const response=await fetch(entry.url,{signal,cache:'no-store'});if(!response.ok)throw Error('Glasses fit HTTP '+response.status);
 const bytes=await response.arrayBuffer();if(bytes.byteLength!==entry.bytes||await hash(bytes)!==entry.sha256)throw Error('Glasses fit integrity mismatch');
 const profile=JSON.parse(new TextDecoder().decode(bytes));if(!validateTempleProfile(profile,bodySHA256,accessorySHA256))throw Error('Glasses fit identity/schema mismatch');
 const plans=[];
 try{
  for(const c of profile.controls){const matches=[];object.traverse(m=>{if(m.isMesh&&m.name===c.mesh)matches.push(m);});if(matches.length!==1)throw Error('Ambiguous glasses temple mesh');const mesh=matches[0],source=mesh.geometry,a=source.attributes.position;
   if(a.isInterleavedBufferAttribute||a.count!==c.vertices||a.itemSize!==3||!(a.array instanceof Float32Array)||await hash(a.array.buffer.slice(a.array.byteOffset,a.array.byteOffset+a.array.byteLength))!==c.positionSHA256)throw Error('Glasses temple source geometry mismatch');
   const geometry=source.clone(),position=geometry.attributes.position,p=new Vector3(),rot=new Matrix3();plans.push({mesh,source,geometry});
   for(const r of c.rings){rot.set(...r.rotationRowMajor);for(const i of r.indices){p.fromBufferAttribute(a,i).sub(new Vector3(...r.sourceCenter)).applyMatrix3(rot).add(new Vector3(...r.targetCenter));position.setXYZ(i,p.x,p.y,p.z);}}
   position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  }
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  for(const plan of plans)plan.mesh.geometry=plan.geometry;
  // The parsed asset is private per load. Dispose only replaced source geometries
  // no longer referenced anywhere in this object, never a shared avatar resource.
  const retained=new Set();object.traverse(m=>{if(m.isMesh)retained.add(m.geometry);});for(const source of new Set(plans.map(p=>p.source)))if(!retained.has(source))source.dispose();
  return {status:'fitted-candidate',id:profile.id,sha256:entry.sha256,bodySHA256,accessorySHA256,changedMeshes:plans.map(p=>p.mesh.name),sourceGeometryUnmodified:true,verified:false};
 }catch(e){for(const p of plans)p.geometry.dispose();throw e;}
}
