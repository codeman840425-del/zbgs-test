/** Browser-only M1 probes. Does not import product code or change its poses. */
export function installM1Probes(options = {}) {
  const d = window.__debug;
  if (!d?.ready) throw new Error("M1: room debug interface is not ready");
  const a = d.avatar(), vrm = a.vrm, root = a.root;
  const profile = a.getAssetProfile?.() ?? a.assetProfile ?? a.profile ?? {};
  const explicitMeshIds=new Set(Object.values(profile.meshRoles??{}).filter(Array.isArray).flat());
  const warnings = new Set();
  const roleCache = new WeakMap(), footIndexCache = new WeakMap();
  const vec = () => root.position.clone().set(0, 0, 0);
  const visible = mesh => { for (let o=mesh;o;o=o.parent) if (!o.visible) return false; return true; };
  function meshes() {
    const result = new Set();
    root.traverse(o => { if (o.isMesh) result.add(o); });
    if (a.skirt?.isMesh) result.add(a.skirt);
    d.scene.traverse(o => { if (o.isMesh && (o.userData?.assetRole||explicitMeshIds.has(o.name)||explicitMeshIds.has(o.uuid))) result.add(o); });
    return [...result];
  }
  function role(mesh) {
    if (mesh.userData?.assetRole) return mesh.userData.assetRole;
    for (const [name, ids] of Object.entries(profile.meshRoles ?? {}))
      if (Array.isArray(ids) && ids.some(id => id === mesh.name || id === mesh.uuid)) return name;
    if (mesh === a.skirt) return "skirt";
    if(roleCache.has(mesh))return roleCache.get(mesh);
    const text = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(m=>m?.name??"").join(" ");
    if (/shoe|boot|footwear/i.test(text)){roleCache.set(mesh,"footwear");return "footwear";}
    if (/skin/i.test(text)){roleCache.set(mesh,"body");return "body";}
    warnings.add(`Unclassified mesh: ${mesh.name}; provide assetRole/meshRoles for garment-specific checks`);
    return "unknown";
  }
  const semantic = new Map();
  for (const name of Object.keys(vrm.humanoid.normalizedHumanBones)) {
    const node = vrm.humanoid.getRawBoneNode(name);
    if (node) semantic.set(node, name);
  }
  function weights(mesh, index) {
    if (!mesh.isSkinnedMesh) return [];
    const joints=mesh.geometry.attributes.skinIndex, values=mesh.geometry.attributes.skinWeight, result=[];
    for (let k=0;k<4;k++) {
      const weight=values.getComponent(index,k);
      if (weight > 1e-5) result.push({bone:semantic.get(mesh.skeleton.bones[joints.getComponent(index,k)])??"unmapped",weight});
    }
    return result;
  }
  const indexCache = new WeakMap();
  function indices(mesh) {
    if (!indexCache.has(mesh.geometry)) {
      const g=mesh.geometry, start=g.drawRange.start||0, end=Math.min(g.index?.count??g.attributes.position.count,start+(g.drawRange.count??Infinity));
      indexCache.set(g,[...new Set(Array.from({length:end-start},(_,n)=>g.index?g.index.getX(start+n):start+n))]);
    }
    return indexCache.get(mesh.geometry);
  }
  function refresh() { root.updateMatrixWorld(true); for(const mesh of meshes()){mesh.updateWorldMatrix(true,false);if(mesh.isSkinnedMesh)mesh.skeleton.update();} }
  function point(mesh,index) { return mesh.getVertexPosition(index,vec()).applyMatrix4(mesh.matrixWorld); }
  const history = new Map();
  let lastFootSample = null;
  function feet() {
    refresh();
    const now=performance.now(),sampleIntervalMs=lastFootSample===null?null:now-lastFootSample;lastFootSample=now;
    const state=d.snapshot(), floorY=options.floorY??profile.floorY??0;
    return ["left","right"].map(side=>{
      const candidates=[];
      for(const mesh of meshes())if(visible(mesh)&&mesh.isSkinnedMesh){
        const meshRole=role(mesh);
        let cache=footIndexCache.get(mesh);
        if(!cache||cache.geometry!==mesh.geometry){cache={geometry:mesh.geometry};for(const s of ["left","right"])cache[s]=indices(mesh).filter(index=>weights(mesh,index).filter(w=>w.bone===s+"Foot"||w.bone===s+"Toes"||(meshRole==="footwear"&&w.bone===s+"LowerLeg")).reduce((sum,w)=>sum+w.weight,0)>=.5);footIndexCache.set(mesh,cache);}
        for(const index of cache[side])candidates.push({mesh,index,role:meshRole});
      }
      const shoe=candidates.filter(v=>v.role==="footwear"), surface=shoe.length?shoe:candidates.filter(v=>v.role==="body");
      if(!surface.length){warnings.add(`${side}: no semantically classified foot surface; no ankle fallback`);return {side,measured:false,candidateCount:candidates.length};}
      let lowest=null,minY=Infinity,maxY=-Infinity,finite=true;
      for(const item of surface){const p=point(item.mesh,item.index),key=item.mesh.uuid+":"+item.index,previous=history.get(key);history.set(key,p.clone());finite=finite&&p.toArray().every(Number.isFinite);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);if(!lowest||p.y<lowest.world[1])lowest={mesh:item.mesh.name,vertex:item.index,world:p.toArray(),delta:previous?p.clone().sub(previous).toArray():null};}
      const solver=state.feet?.find(f=>f.side===side);
      return {side,measured:true,kind:shoe.length?"footwear":"barefoot-body",sampleIntervalMs,sampleVertices:surface.length,surfaceMeshes:[...new Set(surface.map(v=>v.mesh.name))],finite,minHeight:minY-floorY,maxHeight:maxY-floorY,lowest,solverContact:solver?.contact??null,solverContactPoint:solver?.contactPoint??null,solverSlip:solver?.slip??null};
    });
  }
  function chair() {
    const colliders=d.chairColliders?.();
    if(!colliders?.length)throw new Error("M1: chairColliders missing; no coordinate/children-index fallback");
    return colliders.map(c=>{
      if(!c.mesh||!c.localBox)throw new Error("M1: named chair collider must expose mesh and localBox");
      c.mesh.updateWorldMatrix(true,false);
      return {name:c.name,box:c.localBox,matrix:c.mesh.matrixWorld.clone(),inverse:c.mesh.matrixWorld.clone().invert()};
    });
  }
  function seat() {
    refresh();const colliders=chair(),seat=colliders.find(c=>/seat/i.test(c.name));
    if(!seat)throw new Error("M1: no semantic seat collider");
    const results=[];
    for(const mesh of meshes())if(visible(mesh)){
      const collisions=Object.fromEntries(colliders.map(c=>[c.name,{vertices:0,maxInteriorDepth:0,examples:[]}]));
      let pelvisGap=Infinity,pelvisVertices=0,nonFiniteVertices=0;const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
      for(const index of indices(mesh)){
        const p=point(mesh,index),influences=weights(mesh,index),s=p.clone().applyMatrix4(seat.inverse);
        const coordinates=p.toArray();if(!coordinates.every(Number.isFinite)){nonFiniteVertices++;continue;}for(let axis=0;axis<3;axis++){bounds.min[axis]=Math.min(bounds.min[axis],coordinates[axis]);bounds.max[axis]=Math.max(bounds.max[axis],coordinates[axis]);}
        const pelvisWeight=influences.filter(w=>["hips","leftUpperLeg","rightUpperLeg"].includes(w.bone)).reduce((sum,w)=>sum+w.weight,0);
        if(pelvisWeight>.25&&s.x>=seat.box.min.x&&s.x<=seat.box.max.x&&s.z>=seat.box.min.z&&s.z<=seat.box.max.z){pelvisVertices++;pelvisGap=Math.min(pelvisGap,s.y-seat.box.max.y);}
        for(const collider of colliders){const q=p.clone().applyMatrix4(collider.inverse),b=collider.box,depth=Math.min(q.x-b.min.x,b.max.x-q.x,q.y-b.min.y,b.max.y-q.y,q.z-b.min.z,b.max.z-q.z);
          if(depth>1e-5){const hit=collisions[collider.name];hit.vertices++;hit.maxInteriorDepth=Math.max(hit.maxInteriorDepth,depth);if(hit.examples.length<6)hit.examples.push({vertex:index,world:p.toArray(),influences});}
        }
      }
      results.push({mesh:mesh.name,role:role(mesh),nonFiniteVertices,bounds,pelvisVertices,minPelvisLocalGap:Number.isFinite(pelvisGap)?pelvisGap:null,collisions});
    }
    return {state:d.snapshot(),colliders:colliders.map(c=>({name:c.name,min:c.box.min.toArray(),max:c.box.max.toArray(),matrix:c.matrix.toArray()})),meshes:results,limitations:"Actual referenced vertices in collider-local boxes; not swept/triangle collision. Pelvis group includes upper thighs; inspect examples and continuous video."};
  }
  function inventory() {
    refresh();return {build:d.buildInfo,profile,primaryVrmMeta:vrm.meta,assetUrls:performance.getEntriesByType("resource").filter(e=>/\.vrm(?:$|\?)/i.test(e.name)).map(e=>e.name),humanoidBones:[...semantic.values()],meshes:meshes().map(m=>({name:m.name,uuid:m.uuid,role:role(m),visible:visible(m),skinned:!!m.isSkinnedMesh,referencedVertices:indices(m).length})),feet:feet(),warnings:[...warnings]};
  }
  function pose(){
    refresh();const result={};
    for(const name of ["hips","spine","chest","head",...["left","right"].flatMap(side=>["UpperLeg","LowerLeg","Foot","UpperArm","LowerArm","Hand"].map(part=>side+part))]){
      const node=vrm.humanoid.getNormalizedBoneNode(name),raw=vrm.humanoid.getRawBoneNode(name);if(!node)continue;const p=node.getWorldPosition(vec());result[name]={world:p.toArray(),local:root.worldToLocal(p.clone()).toArray(),rawError:raw?p.distanceTo(raw.getWorldPosition(vec())):null};
    }return result;
  }
  let trace=null,footTrace=null;
  const controller=d.game.scene.getScene("CharacterStudio"),originalCommand=controller.command;
  controller.command=function(command){if(trace&&command.type==="walk")trace.events.push({type:"command",t:performance.now(),command,root:root.position.toArray(),yaw:controller.yaw});return originalCommand.call(this,command);};
  const onPointer=e=>{if(trace&&e.target===d.game.canvas)trace.events.push({type:"pointerup",t:performance.now()});};
  document.addEventListener("pointerup",onPointer,true);
  let alive=true;
  const tick=()=>{if(!alive)return;if(trace)trace.frames.push({t:performance.now(),position:root.position.toArray(),yaw:controller.yaw,target:controller.target?.slice(),pathTurn:controller.pathTurn,phase:d.motion().getMetrics().phase});
    if(footTrace){const start=performance.now(),state=d.snapshot();footTrace.frames.push({t:start,position:root.position.toArray(),yaw:controller.yaw,mode:state.mode,speed:state.speed,phase:state.motion?.phase,feet:feet(),hip:pose().hips,probeCpuMs:performance.now()-start});if(footTrace.frames.length>=footTrace.maxFrames){footTrace.truncated=true;footTrace.active=false;}}
    if(footTrace?.active===false)footTrace=null;
    requestAnimationFrame(tick);};requestAnimationFrame(tick);
  let completedFootTrace=null;
  return window.__m1qa={inventory,feet,seat,pose,warnings:()=>[...warnings],resetHistory:()=>{history.clear();lastFootSample=null;},startFootTrace(label,maxFrames=12000){history.clear();lastFootSample=null;completedFootTrace=footTrace={label,maxFrames,active:true,frames:[],limitations:"Every rendered sample regardless of solver contact. Lowest-point delta follows the same vertex from previous sample, not consecutive lowest vertices. CPU surface probes perturb frame time; not a performance benchmark."};},stopFootTrace(){const result=footTrace??completedFootTrace;footTrace=null;completedFootTrace=null;return result;},startTrace:label=>trace={label,events:[],frames:[]},stopTrace:()=>{const result=trace;trace=null;return result;},project(x,z){const p=root.position.clone().set(x,options.floorY??profile.floorY??0,z).project(d.cameraObject()),b=d.game.canvas.getBoundingClientRect();return {x:b.left+(p.x+1)*b.width/2,y:b.top+(1-p.y)*b.height/2};},dispose(){alive=false;trace=null;footTrace=null;controller.command=originalCommand;document.removeEventListener("pointerup",onPointer,true);}};
}
