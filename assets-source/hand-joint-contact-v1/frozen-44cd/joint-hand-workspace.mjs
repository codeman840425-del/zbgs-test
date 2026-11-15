// Finite 5-rail sampling of each measured joint-local 3D cylinder.
// Never a full solid collision test; final actual raw skin is the gate.
import jointProfile from './joint-hand-profile.json';
export function createHandContourWorkspace(THREE,vrm,root,{bodySHA256,expectedSHA256}) {
  if(bodySHA256!==expectedSHA256 || bodySHA256!==jointProfile.bodySHA256 || jointProfile.schema!=='m1.semantic-joint-hand-envelope.1')throw Error('Joint-hand exact-body identity mismatch');
  const states=new Map(),bindings=[];
  for(const side of ['left','right'])states.set(side,{base:[],shifted:[],origin:new THREE.Vector3(),metrics:null});
  for(const p of jointProfile.profiles){
    const bone=vrm.humanoid.getRawBoneNode(p.semantic);if(!bone)throw Error('Missing actual raw hand bone '+p.semantic);
    if(![...p.origin,...p.axis,...p.u,...p.v,p.tmin,p.tmax,p.radiusU,p.radiusV].every(Number.isFinite)||p.radiusU<=0||p.radiusV<=0||p.tmax<=p.tmin)throw Error('Invalid measured joint envelope');
    bindings.push({p,bone,start:new THREE.Vector3(),end:new THREE.Vector3(),U:new THREE.Vector3(),V:new THREE.Vector3()});
  }
  if(bindings.length!==32)throw Error('Incomplete semantic hand profile');
  const axis=new THREE.Vector3(),lateral=new THREE.Vector3(),offset=new THREE.Vector3(),zero=new THREE.Vector3();
  let refreshed=false;
  function support(b,d,out){const a=b.U.dot(d),c=b.V.dot(d),n=Math.hypot(a,c);return n>1e-12?out.copy(b.U).multiplyScalar(a/n).addScaledVector(b.V,c/n):out.set(0,0,0);}
  return {
    refresh(){
      // Existing seatHandSurfaces(true) already synchronized actual raw bone matrices.
      for(const b of bindings){const p=b.p,m=b.bone.matrixWorld;
        b.start.fromArray(p.origin).addScaledVector(new THREE.Vector3(...p.axis),p.tmin).applyMatrix4(m);
        b.end.fromArray(p.origin).addScaledVector(new THREE.Vector3(...p.axis),p.tmax).applyMatrix4(m);
        zero.set(0,0,0).applyMatrix4(m);
        b.U.fromArray(p.u).multiplyScalar(p.radiusU).applyMatrix4(m).sub(zero);
        b.V.fromArray(p.v).multiplyScalar(p.radiusV).applyMatrix4(m).sub(zero);
        if(![...b.start,...b.end,...b.U,...b.V].every(Number.isFinite))throw Error('Nonfinite joint profile transform');
      }refreshed=true;
    },
    project(side,u,v,outward,wrist){
      if(!refreshed)throw Error('Joint profile not refreshed');const state=states.get(side);state.origin.copy(wrist);let used=0;
      const append=(b,sign)=>{state.base[used]||=[new THREE.Vector3(),new THREE.Vector3()];state.base[used][0].copy(b.start).addScaledVector(offset,sign);state.base[used][1].copy(b.end).addScaledVector(offset,sign);used++;};
      for(const b of bindings){if(b.p.side!==side)continue;
        axis.subVectors(b.end,b.start).normalize();lateral.crossVectors(axis,outward);
        if(lateral.lengthSq()<1e-16)lateral.copy(u);else lateral.normalize();
        offset.set(0,0,0);append(b,0);
        support(b,lateral,offset);append(b,1);append(b,-1);
        support(b,outward,offset);append(b,1);append(b,-1);
      }
      state.base.length=used;state.metrics={representation:'joint-local-measured-finite-cylinder-five-rails',railCount:used,jointEnvelopes:16,sourceFaces:jointProfile.sourceFaces.length,skinVerticesSampled:0,sourcePoseUnchanged:true,limits:'Mixed-weight current skin not guaranteed contained; caps sampled at five endpoints, not continuous cap collision'};return state.metrics;
    },
    railsAt(side,wrist){const s=states.get(side),dx=wrist.x-s.origin.x,dy=wrist.y-s.origin.y,dz=wrist.z-s.origin.z;for(let i=0;i<s.base.length;i++){s.shifted[i]||=[new THREE.Vector3(),new THREE.Vector3()];for(let k=0;k<2;k++){const p=s.shifted[i][k],a=s.base[i][k];p.set(a.x+dx,a.y+dy,a.z+dz);}}s.shifted.length=s.base.length;return s.shifted;},
    metrics(side){return states.get(side).metrics;},
  };
}
