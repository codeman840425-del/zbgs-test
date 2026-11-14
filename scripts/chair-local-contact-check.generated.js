async(page)=>{
 await page.goto(page.url().startsWith('http') ? page.url() : 'http://127.0.0.1:5173/');await page.waitForFunction(()=>__debug?.ready);await page.setViewportSize({width:1440,height:1400});
 const report=await page.evaluate(()=>{
 /** Browser-context probe. Run with page.evaluate(measureSeatContact) after a
 * stable seated pose. Reports vertex/AABB overlap, not triangle collision proof.
 * No Three.js import is necessary: geometry bounding boxes carry the methods.
 */
function measureSeatContact() {
  const debug = window.__debug;
  if (!debug?.ready) throw new Error('Avatar is not ready');
  const state = debug.snapshot();
  const avatar = debug.avatar();
  const chair = debug.scene.getObjectByName('RepresentativeChair') || debug.scene.children.find(o => o.type === 'Group' && Math.abs(o.position.x - 2.65) < .01 && o.children.length === 6);
  if (!chair) throw new Error('Representative chair group not found');
  chair.updateMatrixWorld(true);
  const colliders = chair.children.slice(0, 2).map((mesh, index) => {
    mesh.geometry.computeBoundingBox();
    return { name: index ? 'chairBack' : 'chairSeat', box: mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld), localBox:mesh.geometry.boundingBox.clone(), inverse:mesh.matrixWorld.clone().invert(), matrix:mesh.matrixWorld.clone() };
  });
  const meshes = [];
  avatar.root.updateMatrixWorld(true);
  avatar.root.traverse(mesh => { if (mesh.isMesh && mesh.visible) meshes.push(mesh); });
  if (avatar.skirt?.visible && !meshes.includes(avatar.skirt)) meshes.push(avatar.skirt);
  const result = meshes.map(mesh => {
    mesh.updateMatrixWorld(true);
    const position = avatar.root.position.clone();
    let seatMin = Infinity;
    const overlaps = Object.fromEntries(colliders.map(({name}) => [name, []]));
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      mesh.getVertexPosition(i, position);
      position.applyMatrix4(mesh.matrixWorld);
      const seat = colliders[0].localBox, seatPoint=position.clone().applyMatrix4(colliders[0].inverse);
      if (seatPoint.x >= seat.min.x && seatPoint.x <= seat.max.x && seatPoint.z >= seat.min.z && seatPoint.z <= seat.max.z) seatMin = Math.min(seatMin, position.y);
      for (const {name, localBox, inverse} of colliders) if (localBox.containsPoint(position.clone().applyMatrix4(inverse))) {
        let bones;
        if (mesh.isSkinnedMesh) {
          const joints=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
          bones=[0,1,2,3].filter(k=>weights.getComponent(i,k)>.01).map(k=>({name:mesh.skeleton.bones[joints.getComponent(i,k)].name,weight:weights.getComponent(i,k)}));
        }
        overlaps[name].push({vertex:i,position:position.toArray(),localPosition:position.clone().applyMatrix4(inverse).toArray(),bones});
      }
    }
    return {mesh:mesh.name,vertices:mesh.geometry.attributes.position.count,minYWithinSeatXZ:Number.isFinite(seatMin)?seatMin:null,
      overlapCounts:Object.fromEntries(Object.entries(overlaps).map(([name,points])=>[name,points.length])),overlaps};
  });
  return {date:new Date().toISOString(),mode:state.mode,sitProgress:state.motion.sitProgress,position:state.position,
    colliders:colliders.map(({name,box,localBox,matrix})=>({name,min:box.min.toArray(),max:box.max.toArray(),localMin:localBox.min.toArray(),localMax:localBox.max.toArray(),matrix:matrix.toArray()})),meshes:result,
    limitation:'Actual skinned vertices against chair mesh local boxes after inverse world transform; not swept or full triangle collision. Includes visible clothes, body and skirt.'};
}

 const d=__debug,scenarios=[];
 for(const transform of [{x:2.65,z:.8732500623203105,yaw:0},{x:1.1,z:.2,yaw:Math.PI/4},{x:-1.2,z:.4,yaw:-Math.PI/2}]){
  d.setPaused(true);d.reset();d.setChairTransform(transform);d.setOutfit(1);d.setBodyMode('dressed');d.setDynamics(true);d.action('sit');
  let n=0;while(d.snapshot().mode!=='sit'&&n++<2000)d.advance(1/60);
  const samples=[];
  function sample(){const p=measureSeatContact();return{mode:p.mode,progress:p.sitProgress,position:p.position,meshes:p.meshes.map(m=>({mesh:m.mesh,overlapCounts:m.overlapCounts,examples:Object.fromEntries(Object.entries(m.overlaps).map(([k,v])=>[k,v.slice(0,2)]))}))}}
  for(let i=0;i<19;i++){samples.push(sample());d.advance(1/12);}
  d.action('stand');for(let i=0;i<16;i++){samples.push(sample());d.advance(1/12);}
  scenarios.push({transform,samples});
 }
 return scenarios;
 });return report;
}