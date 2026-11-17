import * as THREE from 'three';
// Only the central body adapts in length. Plug cross-section and 35mm ends stay fixed.
export function adaptCableGeometry(visual,route){
  visual.updateMatrixWorld(true);
  const inverse=visual.matrixWorld.clone().invert();
  visual.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const matrix=inverse.clone().multiply(mesh.matrixWorld),positions=mesh.geometry.attributes.position;
    for(let i=0;i<positions.count;i++){
      const p=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(matrix),x=p.x;
      const along=x<=-.665?x+.7:x>=.665?route.length+x-.7:.035+(x+.665)/1.33*(route.length-.07);
      // Local +X follows port A, local +Y remains up. This basis is right handed.
      const lateral=[-route.direction[2],0,route.direction[0]];
      positions.setXYZ(i,...route.a.map((v,j)=>v+along*route.direction[j]+(j===1?p.y:0)+p.z*lateral[j]));
    }
    mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.set(1,1,1);mesh.updateMatrix();
    positions.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
  });
  visual.updateMatrixWorld(true);
  visual.userData.cableRoute=structuredClone(route);
}

// Reject a route through a third device using its actual imported geometry bounds.
// A conservative corridor may reject a narrow empty gap; it never silently reroutes.
export function validateCableVisualPlacement(facilities,routes,fail){
  for(const [id,route]of routes){
    const cable=facilities.get(id);if(!cable)continue;
    const parent=facilities.get(route.parentId),inverse=parent.root.matrixWorld.clone().invert();
    const bounds=new THREE.Box3().setFromObject(cable.visual).applyMatrix4(inverse);
    const endpointIds=new Set([cable.node.cableLink.a.deviceId,cable.node.cableLink.b.deviceId]);
    for(const other of facilities.values()){
      if(other.id===id||other.id===parent.id||endpointIds.has(other.id)||other.floorId!==cable.floorId)continue;
      const box=new THREE.Box3().setFromObject(other.visual).applyMatrix4(inverse);
      if(bounds.min.toArray().every((v,i)=>v<box.max.getComponent(i)-.0001&&bounds.max.getComponent(i)>box.min.getComponent(i)+.0001))
        fail('cable-route-obstructed',id,`Actual cable corridor intersects ${other.id}`);
    }
  }
}
