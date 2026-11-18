import * as THREE from 'three';
import {CompanyError} from './document.js';
import {trackTexture} from './image-ownership.js';

function releaseTree(root) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    for(const material of object.material?[object.material].flat():[]) {
      materials.add(material);
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  for(const value of textures)value.dispose();
  for(const value of materials)value.dispose();
  for(const value of geometries)value.dispose();
}

function ownedFinishMaterial(finish,assetLibrary) {
  if(!assetLibrary)throw new CompanyError('asset-library-required',finish.id,'Preload the exact surface material before applying it');
  const instance=assetLibrary.instantiate(finish.resource);
  let material;const textures=new Map();
  try {
    const mesh=instance.nodes.get(finish.resource.finish.materialNode);
    if(!mesh?.isMesh||Array.isArray(mesh.material)||!mesh.material?.map?.isTexture)
      throw new CompanyError('invalid-finish-material',finish.id,'The registered finish node must have one material and a decoded color texture');
    material=mesh.material.clone();
    for(const [property,texture]of Object.entries(mesh.material))if(texture?.isTexture) {
      if(texture.channel!==0)throw new CompanyError('unsupported-finish-uv',finish.id,'Structural finishes currently use the primary UV channel');
      if(!textures.has(texture)) {
        const copy=texture.clone();
        copy.source=new THREE.TextureSource(texture.image);
        trackTexture(copy);
        copy.wrapS=THREE.RepeatWrapping;copy.wrapT=THREE.RepeatWrapping;
        copy.offset.set(0,0);copy.center.set(0,0);
        copy.repeat.set(1/finish.tileMeters[0],1/finish.tileMeters[1]);
        copy.rotation=finish.quarterTurns*Math.PI/2;copy.matrixAutoUpdate=true;
        copy.updateMatrix();copy.needsUpdate=true;textures.set(texture,copy);
      }
      material[property]=textures.get(texture);
    }
    material.name=`Surface:${finish.resource.id}@${finish.resource.version}`;
    return material;
  } catch(error) {
    for(const texture of textures.values())texture.dispose();material?.dispose();throw error;
  } finally {releaseTree(instance.root);}
}

export function surfaceMaterialFor(finish, assetLibrary, materials) {
  if (!materials.has(finish.id)) materials.set(finish.id, ownedFinishMaterial(finish, assetLibrary));
  return materials.get(finish.id);
}

// Structure retains its original geometry and collision. Meter-based UVs are
// anchored to the entire room side, so portal-separated segments do not restart.
export function applySurfaceFinish(mesh,finish,region,boundary,assetLibrary,materials) {
  if(!finish)return;
  const positions=mesh.geometry.getAttribute('position'),uv=mesh.geometry.getAttribute('uv');
  if(!positions||!uv)throw new CompanyError('missing-finish-uv',finish.id,'The structural mesh needs position and UV attributes');
  const {width,depth}=region.bounds,surface=finish.surface;
  const face={floor:2,ceiling:3,north:4,south:5,west:0,east:1}[surface];
  if(face===undefined)throw new CompanyError('unsupported-finish-surface',finish.id,surface);
  for(let index=0;index<positions.count;index++) {
    const x=positions.getX(index)+(boundary?.position[0]||0);
    const y=positions.getY(index)+(boundary?.position[1]||0);
    const z=positions.getZ(index)+(boundary?.position[2]||0);
    const u=surface==='south'?width/2-x:surface==='west'?depth/2-z:surface==='east'?z+depth/2:x+width/2;
    const v=['floor','ceiling'].includes(surface)?depth/2-z:y;
    uv.setXY(index,u,v);
  }
  uv.needsUpdate=true;
  const material=surfaceMaterialFor(finish,assetLibrary,materials);
  const faces=Array.isArray(mesh.material)?[...mesh.material]:Array(6).fill(mesh.material);
  faces[face]=material;mesh.material=faces;
  mesh.userData.finish={id:finish.id,surface,resource:{id:finish.resource.id,version:finish.resource.version},
    tileMeters:[...finish.tileMeters],quarterTurns:finish.quarterTurns,face};
}

export function describeSurfaceMeshes(meshes) {
  return meshes.filter(mesh=>mesh.userData.finish).map(mesh=>{
    const finish=mesh.userData.finish,material=mesh.material[finish.face],uv=mesh.geometry.getAttribute('uv');
    const samples=[];
    // BoxGeometry has four distinct vertices per face, preserving all seams.
    for(let index=finish.face*4;index<finish.face*4+4;index++)samples.push([uv.getX(index),uv.getY(index)]);
    return {mesh:mesh.name,regionId:mesh.userData.roomId,...structuredClone(finish),visible:mesh.visible,
      meterUV:samples,repeat:material.map.repeat.toArray(),rotation:material.map.rotation,
      textureSize:[material.map.image.width,material.map.image.height]};
  });
}
