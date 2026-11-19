import {inspectGlassPartitionModel} from './glass-partition-geometry.js';

const role='glass-partition';
const construction=new Set(['clear','frosted','tinted','framed']);
const empty=value=>value && typeof value==='object' && !Array.isArray(value) && !Object.keys(value).length;
const pair=(value,x,z)=>Array.isArray(value) && value.length===2 && value[0]===x && value[1]===z;
const verifiedPanes=new WeakMap();

function defaultFail(code,path,message){throw Object.assign(new Error(message),{code,path});}

export function validateGlassPartitionResource(card,fail=defaultFail,location=card.id) {
  if (card.mount!=='floor-and-ceiling' && card.mountRole!==role && card.productionBranch!==role && card.glassPartition===undefined) return;
  const mount=card.mounting, foot=card.footprint, axes=card.coordinates, glass=card.glassPartition;
  if (card.mount!=='floor-and-ceiling' || card.mountRole!==role || card.productionBranch!==role ||
      card.parent!=='room.floor+room.ceiling' || card.category!=='decor' || card.asset?.format!=='glb' ||
      mount?.origin!=='bottom' || mount.width!==2.4 || mount.height!==2.8 || mount.depth!==.08 ||
      axes?.units!=='metres' || axes.up!=='+Y' || axes.forward!=='+Z' ||
      foot?.blocking!==true || foot.polygon!==undefined || !pair(foot.center,0,0) || !pair(foot.halfSize,1.2,.04) ||
      !construction.has(glass?.construction) || glass.configuration!=='static' ||
      !Array.isArray(card.usePoints) || card.usePoints.length || !empty(card.stateDefaults) ||
      !empty(card.stateSchema??{}) || !empty(card.stateSemantics??{}) ||
      ['movingParts','movingProfile','surface','supportSurfaces','supportMotion','capacity'].some(key=>card[key]!=null))
    fail('invalid-glass-partition',location,'Expected a static 2.40 × 2.80 × 0.08 m glazed partition fixed to both room surfaces with its full blocking footprint.');
}

function transparentMaterial(mesh){
  const material=mesh?.material;
  return mesh?.isMesh && material?.visible && material.transparent && material.opacity>0 && material.opacity<1;
}

// The immutable template has already passed fetch identity checks. Its rays run
// once here. Only this factory's own deep clones inherit verified sight panes.
export function prepareGlassPartitionClone(scene,card,THREE,fail=defaultFail){
  validateGlassPartitionResource(card,fail);
  if(card.mountRole!==role)return;
  inspectGlassPartitionModel(scene,card,THREE,fail);
  const originals=new WeakSet();
  scene.traverseVisible(mesh=>{
    if(mesh.userData.glazingRole==='pane' && transparentMaterial(mesh))originals.add(mesh);
  });
  return initialize=>{
    const root=scene.clone(true);
    // Object3D.copy reproduces children in source order; duplicate names,
    // shared geometry and hand-authored extras do not establish identity.
    function pairNodes(source,copy){
      initialize(copy);
      if(originals.has(source))verifiedPanes.set(copy,copy.material);
      source.children.forEach((child,index)=>pairNodes(child,copy.children[index]));
    }
    pairNodes(scene,root);
    return root;
  };
}

export function isGlassPartitionSightPane(mesh){
  return Boolean(transparentMaterial(mesh) && verifiedPanes.get(mesh)===mesh.material);
}
