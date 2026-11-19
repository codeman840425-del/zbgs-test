import {composeTransform,pointInTransform} from './document.js';

function facilityChain(derived,facilityId) {
  const chain=[];
  for(let node=derived.nodes.get(facilityId);node;node=derived.nodes.get(node.parentId)) {
    chain.unshift({id:node.id,parentId:node.parentId,transform:derived.localTransforms.get(node.id)});
  }
  return chain;
}

// Logical facility input for the existing actor runtime. No Mesh, lease or task
// state is stored here. Coordinates remain available when display is unloaded.
export function describeCompanyUsePoint(document,derived,id) {
  const point=derived.usePoints.find(point=>point.id===id);
  if(!point)return null;
  const facility=derived.facilities.find(facility=>facility.id===point.facilityId);
  const transform=composeTransform(point.world,{position:point.position||[0,0,0],yaw:point.yaw||0});
  const missing=[];
  for(const field of ['approach','exit','capacity','clearance'])if(point[field]===undefined)missing.push(field);
  return structuredClone({
    id:point.id,companyId:document.id,revision:document.revision,
    facilityId:point.facilityId,floorId:point.floorId,roomId:point.roomId,
    resource:facility.node.resource,
    transform,facilityTransform:point.world,
    local:{coordinateSpace:'facility',position:point.position||[0,0,0],yaw:point.yaw||0,
      approach:point.approach??null,exit:point.exit??null},
    // Authored approach/exit are FACILITY-local, not use-point-local. Adding
    // the sofa seat offset a second time would send actors to the wrong place.
    approachPosition:point.approach?pointInTransform(point.world,point.approach):null,
    exitPosition:point.exit?pointInTransform(point.world,point.exit):null,
    ...(point.kind==='standing-vocal'?{kind:point.kind,slotId:point.slotId,transformChain:facilityChain(derived,facility.id),
      performerReferences:point.performerReferences,...(point.heightProfile?{heightProfile:point.heightProfile}:{})}:{seatHeight:point.seatHeight}),capacity:point.capacity??null,
    clearance:point.clearance??null,footprint:facility.resource.footprint??null,
    contact:point.kind==='standing-vocal'?{pickupNodeId:point.pickupNodeId}:{seatNodeId:point.seatNodeId,backNodeId:point.backNodeId},
    missingFields:missing,limitations:[...(point.limits||[]),...(point.limitations||[])],
  });
}
