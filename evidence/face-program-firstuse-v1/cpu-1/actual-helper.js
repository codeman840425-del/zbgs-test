function createFaceGeometryWarmup(renderer,scene) {
  const entries=new Map(),batches=new Set();let disposed=false;
  let contextProperties=renderer.properties,contextGL=renderer.getContext();
  const layout=a=>[a.count,a.itemSize,a.normalized,a.gpuType,(a.array||a.data?.array)?.constructor.name];
  const key=({mesh,geometry})=>JSON.stringify([
    mesh.uuid,!!mesh.isSkinnedMesh,!!mesh.isInstancedMesh,
    Object.keys(geometry.attributes).sort().map(name=>[name,layout(geometry.attributes[name])]),
    Object.keys(geometry.morphAttributes).sort().map(name=>[name,geometry.morphAttributes[name].map(layout)]),
    geometry.morphTargetsRelative,geometry.groups,
    (Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>[m.uuid,m.version]),
  ]);
  const release=entry=>{if(entry.released)return;entry.released=true;for(const material of entry.materials)material.dispose();};
  const current=entry=>{const materials=Array.isArray(entry.mesh.material)?entry.mesh.material:[entry.mesh.material];return materials.length===entry.originals.length&&materials.every((m,i)=>m===entry.originals[i].material&&m.version===entry.originals[i].version);};
  const forget=entry=>{if(entries.get(entry.signature)===entry)entries.delete(entry.signature);release(entry);};
  // Context lifetime belongs to the shared actor cache, not one geometry request.
  const invalidate=reason=>{
    for(const batch of batches)batch.abort(reason);
    for(const entry of entries.values())release(entry);
    entries.clear();
  };
  const contextChanged=()=>{
    invalidate(Error('Face preparation WebGL context changed'));
    contextProperties=renderer.properties;contextGL=renderer.getContext();
  };
  renderer.domElement.addEventListener('webglcontextlost',contextChanged);
  renderer.domElement.addEventListener('webglcontextrestored',contextChanged);


  return {
    prepare(parts) {
      if(disposed)return Promise.reject(Error('人物已卸载'));
      if(renderer.properties!==contextProperties||renderer.getContext()!==contextGL)contextChanged();
      if(contextGL.isContextLost()){contextChanged();return Promise.reject(Error('Face preparation WebGL context lost'));}
      const requests=new Map(parts.map(part=>[key(part),part]));
      const waits=[],fresh=[],staging=new THREE.Scene();
      try {
        for(const [signature,{mesh,geometry}] of requests){
          const existing=entries.get(signature);if(existing){waits.push(existing.promise);continue;}
          const entry={signature,mesh,originals:[],materials:[],settled:false,released:false,promise:null};fresh.push(entry);
          const copy=mesh.clone(false);copy.geometry=geometry;
          const originals=Array.isArray(mesh.material)?mesh.material:[mesh.material];
          entry.originals=originals.map(material=>({material,version:material.version}));
          const materials=originals.map(m=>{const clone=m.clone();entry.materials.push(clone);return clone;});
          copy.material=Array.isArray(mesh.material)?materials:materials[0];staging.add(copy);
        }
      }catch(error){for(const entry of fresh)release(entry);return Promise.reject(error);}
      if(fresh.length){
        const batch=new AbortController();batches.add(batch);
        const promise=Promise.resolve().then(()=>{
          if(disposed)throw Error('人物已卸载');
          return prepareFaceProgramFirstUse({renderer,materials:fresh.flatMap(entry=>entry.materials),signal:batch.signal,
            compile:()=>renderer.compileAsync(staging,new THREE.PerspectiveCamera(),scene)});
        }).then(()=>{
          if(batch.signal.aborted)throw batch.signal.reason;
          for(const entry of fresh){
            entry.settled=true;
            if(disposed||!current(entry)){forget(entry);continue;}
            // Evict obsolete material versions across every layout only after
            // a current batch succeeds. Pending work releases itself on settle.
            for(const other of entries.values())if(other.mesh===entry.mesh&&other.settled&&!current(other))forget(other);
          }
        }).catch(error=>{
          // A failed new batch must not release any earlier successful variant
          // or a different pending batch from this actor.
          for(const entry of fresh){entry.settled=true;if(entries.get(entry.signature)===entry)entries.delete(entry.signature);release(entry);}
          throw error;
        }).finally(()=>batches.delete(batch));
        for(const entry of fresh){entry.promise=promise;entries.set(entry.signature,entry);}
        waits.push(promise);
      }
      return Promise.all(waits).then(()=>undefined);
    },
    dispose(){
      if(disposed)return;disposed=true;
      renderer.domElement.removeEventListener('webglcontextlost',contextChanged);
      renderer.domElement.removeEventListener('webglcontextrestored',contextChanged);
      invalidate(Error('人物已卸载'));
    },
  };
}

