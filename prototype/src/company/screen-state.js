import {CompanyError} from './document.js';

// The importer and the renderer resolve the same declared surfaces. Only the
// renderer changes material instances, leaving the imported template reusable.
export function screenMaterials(resource, findNode, path) {
  const screen = resource.display?.screen;
  if (screen === undefined) return [];
  const colors = [screen?.onColor, screen?.offColor, screen?.emissive];
  if (!Array.isArray(screen?.nodes) || !screen.nodes.length ||
      !screen.nodes.every(name => typeof name === 'string' && name.trim()) ||
      new Set(screen.nodes).size !== screen.nodes.length ||
      !Number.isFinite(screen.onIntensity) || screen.onIntensity < 0 || screen.onIntensity > 10 ||
      !colors.every(value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) ||
      typeof resource.stateDefaults?.on !== 'boolean') {
    throw new CompanyError('invalid-display-mapping',path,'Screen requires named surfaces, on/off colors, a bounded emissive intensity and a boolean on state');
  }
  const materials = [];
  for (const name of screen.nodes) {
    const mesh = findNode(name);
    if (!mesh?.isMesh) throw new CompanyError('missing-display-mesh',path+'.'+name,'Screen target must resolve to one mesh');
    const slots = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!slots.length || !slots.every(material => material?.color?.isColor && material.emissive?.isColor)) {
      throw new CompanyError('invalid-display-material',path+'.'+name,'Screen target requires an emissive-capable material');
    }
    materials.push(...slots);
  }
  return materials;
}
