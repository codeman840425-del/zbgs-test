function createFaceGeometryWarmup(renderer,scene) {
  const entries=new Map();let disposed=false;
  const layout=a=>[a.count,a.itemSize,a.normalized,a.gpuType,(a.array||a.data?.array)?.constructor.name];
  const key=({mesh,geometry})=>JSON.stringify([
    mesh.uuid,!!mesh.isSkinnedMesh,!!mesh.isInstancedMesh,
    Object.keys(geometry.attributes).sort().map(name=>[name,layout(geometry.attributes[name])]),
    Object.keys(geometry.morphAttributes).sort().map(name=>[name,geometry.morphAttributes[name].map(layout)]),
    geometry.morphTargetsRelative,geometry.groups,
    (Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>[m.uuid,m.version]),
  ]);
  const release=entry=>{if(entry.released)return;entry.released=true;for(const material of entry.materials)material.dispose();};
  return {
    prepare(parts) {
      if(disposed)return Promise.reject(Error('人物已卸载'));
      const requests=new Map(parts.map(part=>[key(part),part]));
      const waits=[],fresh=[],staging=new THREE.Scene();
      try {
        for(const [signature,{mesh,geometry}] of requests){
          const existing=entries.get(signature);if(existing){waits.push(existing.promise);continue;}
          const entry={signature,materials:[],settled:false,released:false,promise:null};fresh.push(entry);
          const copy=mesh.clone(false);copy.geometry=geometry;
          const originals=Array.isArray(mesh.material)?mesh.material:[mesh.material];
          const materials=originals.map(m=>{const clone=m.clone();entry.materials.push(clone);return clone;});
          copy.material=Array.isArray(mesh.material)?materials:materials[0];staging.add(copy);
        }
      }catch(error){for(const entry of fresh)release(entry);return Promise.reject(error);}
      if(fresh.length){
        const promise=Promise.resolve().then(()=>{if(disposed)throw Error('人物已卸载');return renderer.compileAsync(staging,new THREE.PerspectiveCamera(),scene);}).then(()=>{
          for(const entry of fresh){entry.settled=true;if(disposed)release(entry);}
        },error=>{
          // A failed new batch must not release any earlier successful variant
          // or a different pending batch from this actor.
          for(const entry of fresh){entry.settled=true;if(entries.get(entry.signature)===entry)entries.delete(entry.signature);release(entry);}
          throw error;
        });
        for(const entry of fresh){entry.promise=promise;entries.set(entry.signature,entry);}
        waits.push(promise);
      }
      return Promise.all(waits).then(()=>undefined);
    },
    dispose(){if(disposed)return;disposed=true;for(const entry of entries.values())if(entry.settled)release(entry);entries.clear();},
  };
}

