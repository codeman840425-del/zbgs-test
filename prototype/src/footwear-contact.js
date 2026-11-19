import {Matrix4,Quaternion,Vector3} from 'three';

const V=Vector3;
const surfaces=['heel','toe'];
const isLeg=name=>/(?:LowerLeg|Foot|Toes)$/.test(name);

// Capture the actor's reference frames once, before the motion mixer poses the
// legs. Later loads may occur with the actor seated, walking, translated or
// turned. Their authored bind matrices still refer to these same bone frames.
export function createFootwearSampler(vrm,root,nodes,feet){
  const rootReference=root.matrixWorld.clone(),inverseRoot=rootReference.clone().invert();
  const rawReference=new Map(),normalized=new Map();
  const referencePose=new Map();
  for(const [name,node] of Object.entries(nodes)){
    const raw=vrm.humanoid.getRawBoneNode?.(name);
    if(!raw)continue;
    rawReference.set(raw,raw.matrixWorld.clone());
    normalized.set(raw,{name,node,inverseRest:node.matrixWorld.clone().invert()});
    referencePose.set(node,node.matrixWorld.clone());
  }
  const references=feet.map(f=>{
    const frame=node=>({position:node.getWorldPosition(new V()),inverseRotation:node.getWorldQuaternion(new Quaternion()).invert()});
    return {foot:frame(f.foot),toe:f.toe?frame(f.toe):null};
  });
  function sampleVertices(meshes,initial){
    const vertices=[];
    for(const mesh of meshes){
      if(!mesh.isSkinnedMesh)continue;
      const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
      const ids=mesh.geometry.index?new Set(mesh.geometry.index.array):Array.from({length:position.count},(_,i)=>i);
      mesh.skeleton.update();
      for(const vertexIndex of ids){
        const influences=[],world=new V();
        const bindPoint=new V().fromBufferAttribute(position,vertexIndex).applyMatrix4(mesh.bindMatrix);
        for(let k=0;k<4;k++){
          const weight=skinWeight.getComponent(vertexIndex,k);
          if(weight<=1e-6)continue;
          const index=skinIndex.getComponent(vertexIndex,k),raw=mesh.skeleton.bones[index];
          const source=normalized.get(raw);
          if(source)influences.push({...source,weight});
          // Equipment is bound in attached mode. Its inverse world transform
          // cancels in world space, leaving the authored bind and bone matrices.
          if(!initial&&rawReference.has(raw))world.addScaledVector(
            bindPoint.clone().applyMatrix4(mesh.skeleton.boneInverses[index]).applyMatrix4(rawReference.get(raw)),weight);
        }
        if(initial)mesh.getVertexPosition(vertexIndex,world).applyMatrix4(mesh.matrixWorld);
        vertices.push({local:world.clone().applyMatrix4(inverseRoot),world,influences,mesh,vertexIndex});
      }
    }
    return vertices;
  }
  function build(item,initial){
    const meshes=[];
    if(item){
      if(!Array.isArray(item.meshes)||!item.meshes.length)throw Error('Footwear requires loaded meshes');
      meshes.push(...item.meshes);
    }else{
      vrm.scene.traverseVisible(mesh=>{
        if(mesh.isSkinnedMesh&&[mesh.material].flat().some(m=>/Shoes/i.test(m?.name)))meshes.push(mesh);
      });
    }
    const all=sampleVertices(meshes,initial);
    return feet.map((foot,index)=>{
      const total=p=>p.influences.reduce((sum,i)=>sum+i.weight,0);
      const belongs=p=>p.influences.reduce((sum,i)=>sum+(i.name.startsWith(foot.side)&&isLeg(i.name)?i.weight:0),0)>.999;
      const same=all.filter(p=>belongs(p)&&total(p)>.999);
      const legacy=all.filter(p=>Math.abs(p.local.x-foot.local.x)<.07&&total(p)>.999);
      const audit={legacyVertexCount:legacy.length,legacyForeignVertexCount:legacy.filter(p=>!belongs(p)).length,
        selectedVertexCount:all.filter(belongs).length,patches:{}};
      const fit={soleSelectionAudit:audit,soleOffsets:{heel:foot.soleOffsets.heel.clone(),toe:foot.soleOffsets.toe.clone()},
        toeOffset:foot.toeOffset?.clone()??null,restSoleOffsets:undefined,soleSamples:undefined,landmarkMethod:undefined,
        minRestY:0};
      if(same.length>=8){
        fit.minRestY=Math.min(...same.map(p=>p.local.y));
        for(const kind of surfaces){
          const region=same.filter(p=>kind==='heel'?p.local.z<=foot.local.z+.015:p.local.z>=foot.local.z+.015);
          if(!region.length)continue;
          const bottom=Math.min(...region.map(p=>p.local.y));
          const low=region.filter(p=>p.local.y<bottom+.012);
          audit.patches[kind]=low.map(p=>({mesh:p.mesh.uuid,vertex:p.vertexIndex}));
          const center=low.reduce((v,p)=>v.add(p.local),new V()).divideScalar(low.length);
          const frames=references[index],owner=kind==='toe'&&frames.toe?frames.toe:frames.foot;
          const offset=center.applyMatrix4(rootReference).sub(owner.position).applyQuaternion(owner.inverseRotation);
          if(kind==='toe'&&frames.toe)fit.toeOffset.copy(offset);else fit.soleOffsets[kind].copy(offset);
          // Each local input belongs to an actual influence and is invariant
          // across clips. Live evaluation returns world space; a cached clip
          // frame below returns root space without moving the actor or mixer.
          const weighted=low.map(p=>p.influences.map(i=>({...i,bind:p.world.clone().applyMatrix4(i.inverseRest)})));
          const points=weighted.map(()=>new V()),scratch=new V();
          const evaluate=(frame)=>{
            let minY=Infinity;
            for(let j=0;j<points.length;j++){
              const out=points[j].set(0,0,0);
              for(const i of weighted[j]){
                const mat=frame?frame.get(i.node):i.node.matrixWorld;
                if(!mat)throw Error('Unsupported shoe contact influence in clip: '+i.name);
                out.addScaledVector(scratch.copy(i.bind).applyMatrix4(mat),i.weight);
              }
              minY=Math.min(minY,out.y);
            }
            let totalWeight=0,x=0,y=0,z=0;
            for(const p of points){
              const w=Math.exp(-(p.y-minY)/.001);
              totalWeight+=w;y+=p.y*w;x+=p.x;z+=p.z;
            }
            return new V(x/points.length,y/totalWeight,z/points.length);
          };
          (fit.soleSamples??={})[kind]=evaluate;
          // The initial solve may be in a different world transform from the
          // current pose. Build the rest lever in the recorded neutral frames.
          const restPoint=evaluate(referencePose);
          (fit.restSoleOffsets??={})[kind]=restPoint.sub(frames.foot.position).applyQuaternion(frames.foot.inverseRotation);
          fit.landmarkMethod='weighted Shoes patch XZ + outsole soft-min Y (1 mm)';
        }
      }
      return fit;
    });
  }
  const legNodes=Object.entries(nodes).filter(([name])=>isLeg(name)).map(([,node])=>node);
  function captureFrame(){
    const inverse=new Matrix4().copy(root.matrixWorld).invert();
    return new Map(legNodes.map(node=>[node,new Matrix4().multiplyMatrices(inverse,node.matrixWorld)]));
  }
  return {build,captureFrame};
}
