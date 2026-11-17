// Horizontal rectangular support contracts. No physics, actors or occupancy state.
import {partOffset} from './moving-parts.js';
import {MAKEUP_STORAGE_PROFILE,validateMakeupStorageResource} from './makeup-storage-data.js';
import {validateSideTableResource} from './side-table-data.js';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const pair = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const EPS = 1e-6;

export function validateSupportResource(resource, fail, path = resource.id) {
  validateSideTableResource(resource,fail,path);
  validateMakeupStorageResource(resource,fail,path);
  if (resource.supportSurfaces === undefined) {
    if (resource.supportNodes !== undefined) fail('invalid-support-contract', path, 'Support mesh bindings require supportSurfaces');
  } else {
    const surfaces = resource.supportSurfaces, names = resource.supportNodes;
    if (!Array.isArray(surfaces) || !surfaces.length || !object(names))
      fail('invalid-support-contract', path, 'Expected nonempty supportSurfaces and supportNodes map');
    const ids = new Set();
    for (const s of surfaces) {
      if (!object(s) || Object.keys(s).some(k => !['id', 'center', 'topY', 'halfSize', 'clearanceHeight'].includes(k)) ||
          typeof s.id !== 'string' || !ID.test(s.id) || ids.has(s.id) || !pair(s.center) ||
          !pair(s.halfSize) || !s.halfSize.every(n => n > 0 && n <= 10) ||
          !Number.isFinite(s.topY) || s.topY <= 0 || s.topY > 2.8 ||
          !Number.isFinite(s.clearanceHeight) || s.clearanceHeight <= 0 || s.clearanceHeight > 2.8)
        fail('invalid-support-contract', path, 'Support IDs, plane, size and clearance must be finite and unique');
      ids.add(s.id);
      if (typeof names[s.id] !== 'string' || !names[s.id])
        fail('invalid-support-contract', `${path}.${s.id}`, 'Each support requires a named actual mesh');
      const fp = resource.footprint;
      if (fp?.blocking && (!pair(fp.center) || !pair(fp.halfSize) ||
          s.halfSize.some((h, i) => Math.abs(s.center[i] - fp.center[i]) + h > fp.halfSize[i] + EPS)))
        fail('invalid-support-contract', `${path}.${s.id}`, 'Support patch must be inside the parent footprint');
    }
    if (Object.keys(names).length !== ids.size || Object.keys(names).some(id => !ids.has(id)) ||
        new Set(Object.values(names)).size !== ids.size)
      fail('invalid-support-contract', path, 'Support bindings must be exact and one-to-one');
  }
  if (resource.mount === 'support-surface') {
    const m = resource.mounting;
    if (!object(m) || m.origin !== 'bottom' || ![m.width, m.depth, m.height].every(n => Number.isFinite(n) && n > 0) ||
        resource.footprint?.blocking || (resource.usePoints || []).length)
      fail('invalid-support-contract', path, 'Supported props require a bottom-centred positive envelope without ground blocking/use points');
  }
}

function supportPart(resource,surfaceId) {
  const id=resource?.supportMotion?.[surfaceId];
  return id===undefined ? null : resource.movingParts.find(part=>part.id===id);
}

/** Persisted transforms remain at rest. Derived and rendered locals use this same adapter. */
export function effectiveSupportTransform(node,parent,parentResource) {
  const local={position:[...node.transform.position],yaw:node.transform.yaw};
  const part=supportPart(parentResource,node.attachment?.surfaceId);
  if (part) local.position[2]+=partOffset(part,{...parentResource.stateDefaults,...parent.state});
  return local;
}

export function validateSupportAttachments(nodes, resources, fail) {
  const attached = [];
  for (const node of nodes.values()) {
    const resource = resources.get(`${node.resource?.id}@${node.resource?.version}`);
    if (node.attachment !== undefined && (node.kind !== 'facility' || resource?.mount !== 'support-surface'))
      fail('invalid-support-attachment', node.id, 'Only support-surface facilities may declare an attachment');
    if (resource?.mount !== 'support-surface') continue;
    const attachment = node.attachment, parent = nodes.get(node.parentId);
    if (!object(attachment) || Object.keys(attachment).length !== 1 || typeof attachment.surfaceId !== 'string' ||
        parent?.kind !== 'facility')
      fail('invalid-support-attachment', node.id, 'Attach to a parent facility and select exactly one surfaceId');
    const parentResource = resources.get(`${parent.resource?.id}@${parent.resource?.version}`);
    const surface = parentResource?.supportSurfaces?.find(s => s.id === attachment.surfaceId);
    if (!surface) fail('missing-support-surface', node.id, `Parent has no support surface ${attachment.surfaceId}`);
    const [x, y, z] = node.transform.position, m = resource.mounting;
    const swapped = Math.abs(Math.sin(node.transform.yaw)) > .5;
    const halfX = (swapped ? m.depth : m.width) / 2, halfZ = (swapped ? m.width : m.depth) / 2;
    if (Math.abs(y - surface.topY) > EPS || Math.abs(x - surface.center[0]) + halfX > surface.halfSize[0] + EPS ||
        Math.abs(z - surface.center[1]) + halfZ > surface.halfSize[1] + EPS || m.height > surface.clearanceHeight + EPS)
      fail('invalid-support-fit', node.id, 'Whole rotated prop must rest on the selected surface and fit its clear space');
    const part=supportPart(parentResource,attachment.surfaceId),range=part?.translationRange||[0,0];
    const box = {id: node.id, parentId: parent.id, min: [x - halfX, y, z - halfZ], max: [x + halfX, y + m.height, z + halfZ]};
    const sweptMin=[box.min[0],box.min[1],box.min[2]+range[0]],sweptMax=[box.max[0],box.max[1],box.max[2]+range[1]];
    if (parentResource.movingProfile===MAKEUP_STORAGE_PROFILE) {
      const envelope=parentResource.mounting,minimum=[-envelope.width/2,0,-envelope.depth/2],maximum=[envelope.width/2,envelope.height,envelope.depth/2];
      if (sweptMin.some((v,i)=>v<minimum[i]-EPS||sweptMax[i]>maximum[i]+EPS))
        fail('invalid-support-motion-fit',node.id,'The entire content motion must remain within the parent reserved mounting box');
    }
    for (const other of attached) if (other.parentId===parent.id) {
      // Children on the same moving part translate together. Different parts
      // compare their full continuous relative travel, not sampled endpoints.
      const sameMotion=other.partId===(part?.id||null);
      const low=sameMotion ? box.min : sweptMin,high=sameMotion ? box.max : sweptMax;
      const otherLow=sameMotion ? other.min : other.sweptMin,otherHigh=sameMotion ? other.max : other.sweptMax;
      if (low.every((v,i)=>v<otherHigh[i]-EPS&&high[i]>otherLow[i]+EPS))
        fail('overlapping-supported-props',node.id,`Supported motion envelope overlaps ${other.id}`);
    }
    Object.assign(box,{partId:part?.id||null,sweptMin,sweptMax});
    attached.push(box);
  }
  return attached;
}
