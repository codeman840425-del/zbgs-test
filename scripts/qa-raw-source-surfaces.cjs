// Observe an already dressed candidate without driving the scene or changing its pose.
const BODY_SHA256 = 'ab9af434a229283c192546486f9e6eb9cd855bf7d8d45b5037ac211938cb903c';
const EQUIPMENT_ID = 'raw-male-ab9a-uniform-pants-v1';
const EQUIPMENT_SHA256 = '849d1b87cbe08dbec1b8d76cda4dd329cd76151df2e0320de803a6e982fd7de0';
const MATERIAL = 'M00_001_01_Bottoms_01_CLOTH';
const TRIANGLES = 1624;
const WEIGHT_TOLERANCE = 1e-6;

async function sampleRawSourceSurfaces(page, {
  label = '', sampleCount = 1, intervalMs = 80, expectedBuild, requireTimeAdvance = sampleCount > 1,
} = {}) {
  if (!Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > 120 ||
      !Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 1000 ||
      (sampleCount - 1) * intervalMs > 12_000) throw new Error('Invalid raw pants sampling window');
  if (expectedBuild !== undefined && !/^[a-f0-9]{12}$/.test(expectedBuild)) throw new Error('Invalid expected build');
  return page.evaluate(observeSurfaces, {
    bodySha256: BODY_SHA256, equipmentId: EQUIPMENT_ID, equipmentSha256: EQUIPMENT_SHA256,
    materialName: MATERIAL, triangleCount: TRIANGLES, weightTolerance: WEIGHT_TOLERANCE,
    label, sampleCount, intervalMs, expectedBuild, requireTimeAdvance,
  });
}

// This function runs in the page. All Three objects come from the active game actor.
async function observeSurfaces(options) {
  function check(condition, message) {
    if (!condition) throw new Error('Raw source pants QA: ' + message);
  }
  const debug = globalThis.__debug;
  check(debug?.ready && typeof debug.avatar === 'function' && typeof debug.snapshot === 'function', 'live room debug API unavailable');
  const avatar = debug.avatar();
  check(avatar?.vrm?.scene && avatar.root && avatar.getOutfitInfo && avatar.getEquipmentRecipe, 'active VRM or equipment API unavailable');
  const build = debug.buildInfo?.shortId ?? null;
  check(!options.expectedBuild || options.expectedBuild === build, 'active build does not match the requested build');
  const profile = avatar.profile;
  check(profile?.sha256 === options.bodySha256 && typeof profile.bodyType === 'string', 'active body is not the exact ab9a source');

  function selectedEquipment() {
    const outfit = avatar.getOutfitInfo();
    const bottom = Object.values(avatar.getEquipmentRecipe(outfit.index)).filter(entry => entry.slot === 'bottom');
    check(!outfit.equipment?.debugBody && bottom.length === 1 && bottom[0].id === options.equipmentId &&
      bottom[0].sha256 === options.equipmentSha256 && bottom[0].compatibleAvatarSha256 === options.bodySha256,
    'active dressed outfit does not select the exact raw pants');
    return {outfit, entry: bottom[0]};
  }
  const {outfit, entry} = selectedEquipment();
  const materialName = options.materialName;
  const outlineName = materialName + ' (Outline)';
  const attachedName = 'Equipment:' + options.equipmentId;
  const camera = debug.cameraObject?.();

  function hasAncestor(node, parent) {
    for (let item = node; item; item = item.parent) if (item === parent) return true;
    return false;
  }

  function equipmentContainer(node) {
    for (let item = node.parent; item && item !== avatar.root; item = item.parent) {
      if (item.name.startsWith('Equipment:')) return item;
    }
    return null;
  }

  function materials(mesh) {
    return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  }

  function visible(mesh, material) {
    if (material?.visible === false || material?.colorWrite === false || material?.opacity === 0 ||
        (camera?.layers && !camera.layers.test(mesh.layers))) return false;
    for (let node = mesh; node; node = node.parent) if (node.visible === false) return false;
    return true;
  }

  function discover() {
    const containers = [], source = [], attached = [], others = [];
    avatar.root.traverse(node => {
      if (node.name === attachedName) containers.push(node);
      if (!node.isMesh) return;
      const container = equipmentContainer(node);
      const matching = materials(node).filter(material => material?.name === materialName || material?.name === outlineName);
      if (container?.name === attachedName) attached.push(node);
      else if (matching.length && !container && hasAncestor(node, avatar.vrm.scene)) source.push(node);
      else if (matching.some(material => visible(node, material))) others.push(node);
    });
    check(containers.length === 1 && containers[0].userData?.equipmentId === options.equipmentId,
      'expected exactly one identified pants attachment');
    check(source.length > 0 && attached.length > 0, 'missing source or attached pants mesh');
    check(!others.length, 'another visible mesh carries the original pants material');
    return {source, attached, attachment: containers[0]};
  }

  function makePart(mesh, owner) {
    const geometry = mesh.geometry, index = geometry?.index, skeleton = mesh.skeleton;
    check(mesh.isSkinnedMesh && index && skeleton?.bones?.length && typeof mesh.getVertexPosition === 'function',
      `${owner} pants are not an indexed, readable skinned mesh`);
    const attributes = geometry.attributes;
    const names = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'];
    check(names.every(name => attributes[name]?.getComponent && attributes[name].count === attributes.position.count),
      `${owner} pants vertex streams unavailable`);
    const drawStart = geometry.drawRange.start;
    const drawEnd = Math.min(index.count, drawStart + geometry.drawRange.count);
    const geometryGroups = Array.isArray(mesh.material) ? geometry.groups : [{start: 0, count: index.count, materialIndex: 0}];
    const ranges = geometryGroups.map(group => ({
      slot: group.materialIndex, start: Math.max(drawStart, group.start), end: Math.min(drawEnd, group.start + group.count),
    })).filter(range => range.start < range.end && materials(mesh)[range.slot]?.name === materialName);
    check(ranges.length > 0, `${owner} pants have no active base material draw range`);
    check(ranges.every(({start, end}) => Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 &&
      end <= index.count && start % 3 === 0 && end % 3 === 0), `${owner} pants index range is not triangle-aligned`);
    return {mesh, geometry, skeleton, index, attributes, ranges};
  }

  function surfaceTopology(meshes, owner) {
    const triangles = new Map(), parts = meshes.map(mesh => makePart(mesh, owner));
    let vertices = 0;
    for (const part of parts) {
      const refs = new Map(), {mesh, skeleton, attributes, index, ranges} = part;
      function vertex(i) {
        check(Number.isInteger(i) && i >= 0 && i < attributes.position.count, `${owner} pants index is out of bounds`);
        if (refs.has(i)) return refs.get(i);
        const read = (name, size) => Array.from({length: size}, (_, slot) => attributes[name].getComponent(i, slot));
        const position = read('position', 3), normal = read('normal', 3), uv = read('uv', 2);
        const jointIndices = read('skinIndex', 4), weights = read('skinWeight', 4);
        check([...position, ...normal, ...uv, ...weights].every(Number.isFinite) && weights.every(weight => weight >= 0),
          `${owner} pants have invalid vertex values`);
        const weightsByBone = new Map();
        for (const [slot, weight] of weights.entries()) {
          if (!weight) continue;
          const bone = skeleton.bones[jointIndices[slot]];
          check(bone?.uuid && hasAncestor(bone, avatar.vrm.scene), `${owner} pants do not bind to a live source bone`);
          weightsByBone.set(bone.uuid, (weightsByBone.get(bone.uuid) ?? 0) + weight);
        }
        check(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) <= options.weightTolerance,
          `${owner} pants have non-normalized skin weights`);
        const bones = [...weightsByBone.keys()].sort();
        const key = [position, normal, uv, bones].join('/');
        const value = {mesh, i, key, weights: bones.map(bone => weightsByBone.get(bone))};
        refs.set(i, value);
        return value;
      }
      for (const {start, end} of ranges) {
        for (let offset = start; offset < end; offset += 3) {
          const face = [0, 1, 2].map(corner => vertex(index.getX(offset + corner)));
          check(new Set(face.map(point => point.key)).size === 3, `${owner} pants include an ambiguous triangle`);
          // Match actual corners across local indices, order changes and merged material groups.
          const first = face.reduce((min, point, corner) => point.key < face[min].key ? corner : min, 0);
          const ordered = [...face.slice(first), ...face.slice(0, first)];
          const key = ordered.map(point => point.key).join('|');
          check(!triangles.has(key), `${owner} pants contain duplicate triangle surfaces`);
          triangles.set(key, ordered);
        }
      }
      vertices += refs.size;
    }
    check(triangles.size === options.triangleCount, `${owner} pants have ${triangles.size} instead of ${options.triangleCount} triangles`);
    return {triangles, vertices, parts};
  }

  const initial = discover();
  const source = surfaceTopology(initial.source, 'source');
  const attached = surfaceTopology(initial.attached, 'attached');
  const correspondences = new Map();
  let maxWeightDeviation = 0;
  for (const [key, face] of source.triangles) {
    const other = attached.triangles.get(key);
    check(other, 'source and attached triangle corners or live bone identity differ');
    for (const [corner, point] of face.entries()) {
      const match = other[corner];
      const weightDeviation = Math.max(...point.weights.map((weight, slot) => Math.abs(weight - match.weights[slot])));
      check(Number.isFinite(weightDeviation) && weightDeviation <= options.weightTolerance, 'corresponding skin weights differ');
      maxWeightDeviation = Math.max(maxWeightDeviation, weightDeviation);
      if (!correspondences.has(point)) correspondences.set(point, new Set());
      correspondences.get(point).add(match);
    }
  }
  const pairs = [...correspondences].flatMap(([left, matches]) => [...matches].map(right => [left, right]));
  check(pairs.length > 0, 'no corresponding skinned vertices');

  function capture() {
    check(debug.ready && debug.avatar() === avatar && (debug.buildInfo?.shortId ?? null) === build, 'active actor or build changed during sampling');
    check(selectedEquipment().outfit.index === outfit.index, 'active outfit changed during sampling');
    const current = discover();
    check(current.attachment === initial.attachment && ['source', 'attached'].every(key =>
      current[key].length === initial[key].length && current[key].every((mesh, i) => mesh === initial[key][i])),
    'source or attached meshes changed during sampling');
    for (const part of [...source.parts, ...attached.parts]) {
      check(part.mesh.geometry === part.geometry && part.mesh.skeleton === part.skeleton, 'pants geometry or skin changed during sampling');
    }
    check(source.parts.every(({mesh}) => materials(mesh).every(material =>
      ![materialName, outlineName].includes(material?.name) || !visible(mesh, material))), 'embedded pants are still visible');
    check(attached.parts.every(({mesh, ranges}) => ranges.every(range => {
      const material = materials(mesh)[range.slot];
      return material?.name === materialName && visible(mesh, material);
    })), 'independent pants are not fully visible');

    avatar.root.updateWorldMatrix(true, false);
    avatar.root.updateMatrixWorld(true);
    const sourcePoint = avatar.root.position.clone(), attachedPoint = avatar.root.position.clone();
    let squaredSum = 0, sum = 0, max = -1, worst;
    for (const [left, right] of pairs) {
      left.mesh.getVertexPosition(left.i, sourcePoint).applyMatrix4(left.mesh.matrixWorld);
      right.mesh.getVertexPosition(right.i, attachedPoint).applyMatrix4(right.mesh.matrixWorld);
      const distance = sourcePoint.distanceTo(attachedPoint);
      check(Number.isFinite(distance), 'non-finite posed vertex distance');
      squaredSum += distance * distance;
      sum += distance;
      if (distance > max) {
        max = distance;
        worst = {sourceIndex: left.i, attachedIndex: right.i, source: sourcePoint.toArray(), attached: attachedPoint.toArray()};
      }
    }
    const snapshot = debug.snapshot();
    check(Number.isFinite(snapshot?.simulationTime), 'game simulation clock unavailable');
    return {wallTimeMs: performance.now(), simulationTime: snapshot.simulationTime, mode: snapshot.mode ?? null,
      modeTime: snapshot.modeTime ?? null, actionTime: snapshot.motion?.actionTime ?? null, paused: snapshot.paused ?? null,
      maxDeviationMeters: max, meanDeviationMeters: sum / pairs.length,
      rmsDeviationMeters: Math.sqrt(squaredSum / pairs.length), worst};
  }

  const samples = [capture()];
  for (let i = 1; i < options.sampleCount; i++) {
    await new Promise(resolve => setTimeout(resolve, options.intervalMs));
    samples.push(capture());
  }
  const uniqueSimulationTimes = new Set(samples.map(sample => sample.simulationTime)).size;
  if (options.requireTimeAdvance) check(uniqueSimulationTimes > 1 && samples.at(-1).simulationTime > samples[0].simulationTime,
    'game simulation did not advance during the sampling window');
  const describe = ({mesh, ranges}) => ({name: mesh.name, uuid: mesh.uuid, ranges});
  return {schema: 'raw-source-pants-surface-sampling-v1', label: options.label, build,
    body: {id: profile.id, bodyType: profile.bodyType, sha256: profile.sha256, url: profile.url},
    equipment: {id: entry.id, sha256: entry.sha256, fitId: entry.fitId ?? null, outfitIndex: outfit.index},
    visibility: {sourceHidden: true, attachedVisible: true, visibleDuplicateFound: false},
    source: {triangleCount: source.triangles.size, referencedVertices: source.vertices, meshes: source.parts.map(describe)},
    attached: {triangleCount: attached.triangles.size, referencedVertices: attached.vertices, meshes: attached.parts.map(describe)},
    pairedVertices: pairs.length, maxWeightDeviation, uniqueSimulationTimes,
    maxDeviationMeters: Math.max(...samples.map(sample => sample.maxDeviationMeters)), samples};
}

module.exports = {sampleRawSourceSurfaces};
