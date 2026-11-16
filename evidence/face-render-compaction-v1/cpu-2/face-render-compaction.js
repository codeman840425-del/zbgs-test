import * as THREE from 'three';
import {VRMUtils} from '@pixiv/three-vrm';

const ADMITTED = new Set([
  '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95',
  '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',
]);

// The caller has verified the complete avatar bytes. Never rewrite source pins:
// canonical geometry remains the sole input to the existing recipe operators.
export function createFaceRenderCompaction({vrm, avatarSha256}) {
  if (!ADMITTED.has(avatarSha256)) return null;
  const meshes=[];
  vrm.scene.traverse(mesh=>{if(mesh.isMesh&&mesh.geometry.morphAttributes.position?.length)meshes.push(mesh);});
  const parent=meshes[0]?.parent, children=[];
  parent?.traverse(mesh=>{if(mesh.isMesh)children.push(mesh);});
  if(meshes.length!==9||meshes.some(mesh=>mesh.parent!==parent)||children.length!==meshes.length||children.some(mesh=>!meshes.includes(mesh)))
    throw Error('Face render compaction source scope mismatch');
  const bySource=new Map(),byMesh=new Map();let disposed=false;

  // Public utility owns/disposes only this working geometry, never canonical.
  function compactWorking(working, expectedMap) {
    const proxy=new THREE.Mesh(working,null);
    try {
      VRMUtils.removeUnnecessaryVertices(proxy);
      const compact=proxy.geometry, index=compact.index;
      if(!index||compact.attributes.position.count!==expectedMap.length||index.count!==working.index.count)
        throw Error('Face compaction count mismatch');
      for(let i=0;i<index.count;i++)
        if(expectedMap[index.getX(i)]!==working.index.getX(i))throw Error('Face compaction index mapping mismatch');
      return compact;
    } catch(error) {
      proxy.geometry.dispose();
      throw error;
    }
  }
  try {
    for(const mesh of meshes){
      const sourceGeometry=mesh.geometry;let record=bySource.get(sourceGeometry);
      if(!record){
        if(!sourceGeometry.index)throw Error('Face compaction requires indexed source');
        const newToOld=Array.from(new Set(Array.from({length:sourceGeometry.index.count},(_,i)=>sourceGeometry.index.getX(i)))).sort((a,b)=>a-b);
        if(newToOld.some(i=>!Number.isInteger(i)||i<0||i>=sourceGeometry.attributes.position.count))throw Error('Face source index invalid');
        const renderGeometry=compactWorking(sourceGeometry.clone(),newToOld);
        record={sourceGeometry,renderGeometry,newToOld,meshes:[]};bySource.set(sourceGeometry,record);
      }
      record.meshes.push(mesh);byMesh.set(mesh,record);
    }
    // Atomic initial assignment; skeleton, materials and expression mesh references stay put.
    for(const [mesh,record]of byMesh)mesh.geometry=record.renderGeometry;
  }catch(error){for(const record of bySource.values())record.renderGeometry.dispose();throw error;}
  return {
    sourceFor(mesh){return byMesh.get(mesh)||null;},
    compactEdited(sourceGeometry,working){
      if(disposed)throw Error('Face render compaction disposed');
      const record=bySource.get(sourceGeometry);
      if(!record)throw Error('Unknown canonical Face geometry');
      return compactWorking(working,record.newToOld);
    },
    getState(){return{enabled:true,records:[...bySource.values()].map(r=>({sourceVertices:r.sourceGeometry.attributes.position.count,renderVertices:r.renderGeometry.attributes.position.count,newToOld:[...r.newToOld]}))};},
    dispose(){
      if(disposed)return;disposed=true;
      // FacialGeometry disposes its edited geometries first. Restoring source
      // here lets the existing actor deepDispose own canonical exactly as before.
      for(const [mesh,record]of byMesh)mesh.geometry=record.sourceGeometry;
      for(const record of bySource.values())record.renderGeometry.dispose();
    },
  };
}
