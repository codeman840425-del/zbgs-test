// Runs inside a Playwright page on the live room actor.
function seatedContact() {
  const debug = globalThis.__debug;
  const actor = debug?.avatar?.(), state = debug?.snapshot?.();
  const seat = debug?.scene?.getObjectByName('RepresentativeChair')?.children[0];
  if (!actor?.vrm?.scene || !seat?.geometry || state?.mode !== 'sit' || state.motion.sitProgress !== 1)
    throw Error('Expected an equipped actor in the settled room seat');
  const entries = Object.values(actor.getEquipmentRecipe(state.outfit));
  const bottom = entries.find(item => item.slot === 'bottom');
  const shoes = entries.find(item => item.slot === 'shoes');
  if (!bottom || !shoes) throw Error('Selected outfit has no pants or shoes');
  seat.geometry.computeBoundingBox();
  const box = seat.geometry.boundingBox;
  const point = seat.position.clone();
  const seatTopY = seat.localToWorld(point.set(0, box.max.y, 0)).y;
  // The room floor has its top at world y = 0. Rugs and other surfaces are separate.
  const floorY = 0;
  actor.root.updateMatrixWorld(true);
  let soleY = Infinity, gap = Infinity, count = 0, pantsVertices = 0, shoeVertices = 0;
  let bottomPointWorld = null, solePointWorld = null;
  actor.vrm.scene.traverseVisible(mesh => {
    const id = mesh.parent?.userData.equipmentId;
    if (!mesh.isSkinnedMesh || (id !== bottom.id && id !== shoes.id)) return;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      mesh.getVertexPosition(i, point);
      const {x, y, z} = mesh.localToWorld(point);
      if (![x, y, z].every(Number.isFinite)) throw Error('Non-finite equipped world vertex');
      if (id === shoes.id) {
        shoeVertices++;
        if (y < soleY) {soleY = y; solePointWorld = [x, y, z];}
      } else {
        pantsVertices++;
        seat.worldToLocal(point);
        if (point.x < box.min.x || point.x > box.max.x || point.z < box.min.z || point.z > box.max.z) continue;
        count++;
        if (y - seatTopY < gap) {gap = y - seatTopY; bottomPointWorld = [x, y, z];}
      }
    }
  });
  return {mode:state.mode, sitProgress:state.motion.sitProgress, simulationTime:state.simulationTime, seatTopY, floorY,
    body:{bodyType:actor.profile.bodyType, sha256:actor.profile.sha256},
    equipment:{pants:{id:bottom.id, sha256:bottom.sha256}, shoes:{id:shoes.id, sha256:shoes.sha256}},
    garmentGapMetres:Number.isFinite(gap) ? gap : null, bottomVerticesOverSeat:count, pantsVertices, bottomPointWorld,
    soleMinimumY:Number.isFinite(soleY) ? soleY : null, soleGapMetres:Number.isFinite(soleY) ? soleY - floorY : null,
    shoeVertices, solePointWorld};
}

module.exports = {seatedContact};
