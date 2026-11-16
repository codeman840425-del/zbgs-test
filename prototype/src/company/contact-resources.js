import * as THREE from 'three';
import {CompanyError} from './document.js';

function captureMesh(mesh, owned) {
  if (!mesh?.isMesh || !mesh.geometry) throw new CompanyError('missing-contact-mesh',mesh?.name||'contact','Contact must resolve to a real mesh');
  const geometry = mesh.geometry.clone(); owned.geometries.add(geometry);
  const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const material = new THREE.MeshStandardMaterial({color:sourceMaterial?.color?.getHex?.() ?? 0x808080,
    roughness:sourceMaterial?.roughness ?? .85,metalness:sourceMaterial?.metalness ?? 0});
  owned.materials.add(material);
  const copy = new THREE.Mesh(geometry,material);
  copy.name = mesh.name;
  copy.castShadow = false; copy.receiveShadow = false;
  copy.matrixAutoUpdate = false;
  copy.matrix.copy(mesh.matrixWorld);
  copy.matrixWorld.copy(mesh.matrixWorld);
  return copy;
}

function disposeOwned(owned) {
  for (const texture of owned.textures) texture.dispose();
  for (const material of owned.materials) material.dispose();
  for (const geometry of owned.geometries) geometry.dispose();
}

function contactSnapshot(source) {
  return {
    usePointId:source.usePointId, documentId:source.documentId, revision:source.revision,
    facilityId:source.facilityId, resource:{id:source.resource.id,version:source.resource.version},
    facilityTransform:structuredClone(source.facilityTransform), transform:structuredClone(source.transform),
  };
}

// Contact resources are small owned geometry copies. They are independent of
// the currently visible floor and therefore survive presentation disposal.
export function createContactResourceStore({resolveVisible,resolveLogical,captureVisible,captureLogical,assetResources=()=>[]}) {
  const records = new Map(), pending = new Map();
  let disposed = false;
  const live = () => { if (disposed) throw new CompanyError('contact-resources-disposed','contact','Contact resources have been disposed'); };
  function key(source) {
    return JSON.stringify([source.documentId,source.usePointId,source.facilityId,source.resource.id,source.resource.version,
      source.facilityTransform,source.transform]);
  }
  function handle(record) {
    let released = false;
    const active = () => {
      if (released || disposed) throw new CompanyError('contact-handle-invalid',record.source.usePointId,'The contact handle has been released or its scene disposed');
    };
    const result = {
      ...contactSnapshot(record.source),
      get root(){active();return record.root;}, get seat(){active();return record.seat;}, get back(){active();return record.back;},
      get released(){return released || disposed;},
      release() {
        if (released) return;
        released = true;
        if (disposed) return;
        record.refs--;
        if (record.refs<=0) { records.delete(record.key); disposeOwned(record.owned); record.root.removeFromParent(); }
      },
    };
    return Object.freeze(result);
  }
  async function load(source) {
    if (source.resource.asset) await source.preload(source.resource);
    const captured = source.visible ? await captureVisible(source.visible) : await captureLogical(source);
    if (!captured?.seat || !captured?.back) { captured?.dispose?.(); throw new CompanyError('missing-contact-mesh',source.usePointId,'Seat and back must resolve to actual resource meshes'); }
    const owned = {geometries:new Set(),materials:new Set(),textures:new Set()};
    try {
      if (source.isCurrent && !source.isCurrent()) throw new CompanyError('contact-resource-stale',source.usePointId,'The use point changed while its contact resource was loading');
      const root = new THREE.Group(); root.name = `Contact:${source.usePointId}`;
      root.matrixAutoUpdate = false; root.matrix.identity(); root.matrixWorld.identity();
      const seat = captureMesh(captured.seat,owned), back = captureMesh(captured.back,owned);
      root.add(seat,back); root.updateMatrixWorld(true);
      return {key:key(source),source:contactSnapshot(source),owned,root,seat,back,refs:0};
    } catch (error) { disposeOwned(owned); throw error; }
    finally { captured.dispose?.(); }
  }
  async function retainUsePointContact(usePointId) {
    live();
    const visible = resolveVisible(usePointId), source = resolveLogical(usePointId,visible);
    if (!source) throw new CompanyError('unknown-use-point',usePointId,'Choose an existing use point');
    const recordKey = key(source);
    let record = records.get(recordKey);
    if (!record) {
      let task = pending.get(recordKey);
      if (!task) {
        task = load({...source,visible}).then(next => { if (disposed) { disposeOwned(next.owned); next.root.removeFromParent(); throw new CompanyError('contact-resources-disposed',usePointId,'Contact resources have been disposed'); } records.set(recordKey,next); return next; })
          .finally(() => pending.delete(recordKey));
        task.contactResource=source.resource;
        pending.set(recordKey,task);
      }
      record = await task;
    }
    live(); record.refs++; return handle(record);
  }
  function resources() {
    const result = [...assetResources()];
    for (const task of pending.values()) task.contactResource && result.push(task.contactResource);
    const unique = new Map();
    for (const resource of result) if (resource?.id !== undefined) unique.set(`${resource.id}@${resource.version}`,resource);
    return [...unique.values()];
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const record of records.values()) { disposeOwned(record.owned); record.root.removeFromParent(); }
    records.clear();
  }
  function isBusy(usePointId) {
    for (const record of records.values()) if (record.source.usePointId===usePointId && record.refs>0) return true;
    return false;
  }
  return {retainUsePointContact,resources,isBusy,dispose,snapshot:()=>({active:[...records.values()].map(record=>({usePointId:record.source.usePointId,refs:record.refs})),pending:pending.size})};
}
