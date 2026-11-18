import {Box3, Matrix4, Ray, Triangle, Vector3} from 'three';
import {SIDE_TABLE_IDS} from './side-table-data.js';
import {validateSupportGeometry} from './support-geometry.js';

// The four original Kenney shapes retain their own source-specific tests.
export function isTexturedRoundTable(resource) {
  return resource?.mountRole === 'side-table' && !SIDE_TABLE_IDS.includes(resource.id) &&
    resource.provenance?.sourceDesign === 'textured-round-table';
}

const CONTACT = .001;
const points = triangle => [triangle.a, triangle.b, triangle.c];
const vertexKey = v => [v.x, v.y, v.z].map(n => Math.round(n * 1e6)).join(',');

function islands(faces) {
  const parent = faces.map((_, i) => i);
  function root(i) {
    while (parent[i] !== i) {parent[i] = parent[parent[i]]; i = parent[i];}
    return i;
  }
  const vertices = new Map();
  for (const [i, face] of faces.entries()) for (const vertex of points(face.triangle)) {
    const key = vertexKey(vertex);
    if (vertices.has(key)) parent[root(i)] = root(vertices.get(key));
    else vertices.set(key, i);
  }
  const groups = new Map();
  for (const [i, face] of faces.entries()) {
    const id = root(i);
    if (!groups.has(id)) groups.set(id, {bounds:new Box3(), faces:[]});
    const group = groups.get(id);
    group.bounds.union(face.box);
    group.faces.push(face);
  }
  return [...groups.values()];
}

function contacts(a, b) {
  const closest = new Vector3(), ray = new Ray();
  function reaches(source, target) {
    const corners = points(source);
    for (let i = 0; i < 3; i++) {
      const p = corners[i], q = corners[(i + 1) % 3];
      if (target.closestPointToPoint(p, closest).distanceToSquared(p) <= CONTACT ** 2) return true;
      ray.origin.copy(p);
      ray.direction.subVectors(q, p).normalize();
      if (ray.intersectTriangle(target.a, target.b, target.c, false, closest) &&
          p.distanceToSquared(closest) <= p.distanceToSquared(q)) return true;
    }
    return false;
  }
  if (!a.bounds.intersectsBox(b.bounds)) return false;
  for (const first of a.faces) {
    if (!first.box.intersectsBox(b.bounds)) continue;
    for (const second of b.faces) if (first.box.intersectsBox(second.box) &&
        (reaches(first.triangle, second.triangle) || reaches(second.triangle, first.triangle))) return true;
  }
  return false;
}

// Positive-area overlap of an original top triangle with the reserved rectangle
// means the producer overlaid a patch instead of cutting it into the board.
function areaInsideTop(triangle, halfX, halfZ) {
  let polygon = points(triangle);
  for (const [axis, sign, half] of [['x',1,halfX],['x',-1,halfX],['z',1,halfZ],['z',-1,halfZ]]) {
    const clipped = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i+1) % polygon.length];
      const from = half - p[axis] * sign, to = half - q[axis] * sign;
      if (from >= 0) clipped.push(p);
      if ((from >= 0) !== (to >= 0)) clipped.push(p.clone().lerp(q, from / (from - to)));
    }
    polygon = clipped;
  }
  return Math.abs(polygon.reduce((sum,p,i) => {
    const q = polygon[(i+1) % polygon.length];
    return sum + p.x*q.z - q.x*p.z;
  }, 0)) / 2;
}

function checkRoundBoard(faces, topY, reject) {
  const plane = faces.filter(({triangle}) => points(triangle).every(p => Math.abs(p.y - topY) <= .00001));
  const radius = Math.max(...plane.flatMap(({triangle}) => points(triangle).map(p => Math.hypot(p.x,p.z))));
  const ray = new Ray(new Vector3(),new Vector3(0,-1,0)), hit = new Vector3();
  const crosses = ({triangle}) => ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,hit);
  // A round shelf has visible wood all around the reserved rectangle and
  // a lower face beneath it. Check the incoming triangles, including the
  // annulus where a spurious square tabletop would leave gaps.
  for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI / 16;
    ray.origin.set(.97 * radius * Math.cos(angle),topY + .001,.97 * radius * Math.sin(angle));
    if (!plane.some(crosses)) reject('side-table-board-outline','The upper surface must fill its circular perimeter');
  }
  for (const [x,z] of [[0,0],[.16,.06],[-.16,.06],[.16,-.06],[-.16,-.06]]) {
    ray.origin.set(x,topY - .001,z);
    if (!faces.some(face => crosses(face) && hit.y <= topY - .003 && hit.y >= topY - .08))
      reject('side-table-board-thickness','Expected actual tabletop underside below the load-bearing surface');
  }
  return radius;
}

export function validateTexturedRoundTable(scene, resource, fail) {
  const reject = (code, message) => fail(code, resource.id, message);
  const support = validateSupportGeometry(scene, resource, fail);
  const faces = [], materials = new Set(), ground = [0,0,0,0];
  const surface = resource.supportSurfaces[0], [halfX, halfZ] = surface.halfSize;
  const patchName = resource.supportNodes[surface.id];
  const inverse = scene.matrixWorld.clone().invert();
  let meshes = 0, overlap = 0;
  scene.traverse(node => {
    if (!node.visible) reject('side-table-hidden-part', 'Table geometry must remain visible');
    if (!node.isMesh) return;
    meshes++;
    const {geometry, material} = node, positions = geometry.attributes.position;
    if (!material?.isMeshStandardMaterial || !material.visible || material.transparent || material.opacity !== 1 ||
        material.alphaTest > 0 || ![material.map,material.normalMap,material.roughnessMap,material.metalnessMap].every(t => t?.isTexture))
      reject('side-table-source-material', 'Textured table parts require visible opaque base colour, normal and roughness/metallic maps');
    materials.add(material);
    const transform = new Matrix4().multiplyMatrices(inverse,node.matrixWorld);
    const count = geometry.index?.count ?? positions.count;
    if (count % 3 || geometry.drawRange.start !== 0 || geometry.drawRange.count < count ||
        meshes > 32 || faces.length + count/3 > 2500 || materials.size > 4)
      reject('side-table-budget', 'Expected complete visible triangles within the side-table production budget');
    for (let i = 0; i < count; i += 3) {
      const vertices = [i,i+1,i+2].map(k => new Vector3().fromBufferAttribute(positions,
        geometry.index ? geometry.index.getX(k) : k).applyMatrix4(transform));
      const triangle = new Triangle(...vertices), area = triangle.getArea();
      if (!Number.isFinite(area) || area < 1e-12) reject('side-table-source-triangle','Invalid or degenerate imported triangle');
      if (vertices.every(v => Math.abs(v.y) < CONTACT)) {
        const normal = triangle.getNormal(new Vector3());
        const centre = triangle.getMidpoint(new Vector3());
        if (Math.abs(centre.x) >= halfX/2 && Math.abs(centre.z) >= halfZ/2)
          ground[Number(centre.x > 0) + 2*Number(centre.z > 0)] += area * Math.abs(normal.y);
      }
      if (node.name !== patchName && vertices.every(v => Math.abs(v.y - surface.topY) < .00001))
        overlap += areaInsideTop(triangle, halfX, halfZ);
      faces.push({triangle,box:new Box3().setFromPoints(vertices).expandByScalar(CONTACT / 2)});
    }
  });
  if (overlap > 1e-7) reject('side-table-duplicate-top','Source table surface covers the registered patch twice');
  if (ground.some(area => area < 1e-6)) reject('side-table-floor-support','Expected actual floor contact distributed under the four quarters of the tabletop');
  const topRadius = checkRoundBoard(faces,surface.topY,reject);
  const parts = islands(faces), connected = new Set([0]), queue = [0];
  for (let i = 0; i < queue.length; i++) for (let j = 0; j < parts.length; j++)
    if (!connected.has(j) && contacts(parts[queue[i]], parts[j])) {connected.add(j); queue.push(j);}
  if (connected.size !== parts.length) reject('side-table-detached','An imported surface component is separated from the grounded table');
  return {triangles:faces.length, meshes, materialCount:materials.size, support, topRadius, groundAreaByQuarter:ground, connectedParts:parts.length};
}
