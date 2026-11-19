import * as THREE from 'three';

export function hasBaseContact(scene, tolerance=.001) {
  let area = 0;
  const points = [new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  scene.traverse(mesh=>{
    if (!mesh.isMesh) return;
    const geometry=mesh.geometry, positions=geometry.attributes.position, indices=geometry.index;
    for (let i=0; i<(indices?.count ?? positions.count); i+=3) {
      for (let j=0;j<3;j++) points[j].fromBufferAttribute(positions,indices?indices.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld);
      if (!points.every(p=>Math.abs(p.y)<=tolerance)) continue;
      const [a,b,c]=points;
      area+=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/2;
    }
  });
  return area>1e-6;
}
