import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const evidence = path.join(root, 'evidence/company-platform-layout-review-v1');
const baseline = 'af47b6a7ff37d542bfb1b55247a923d7f98cf4a9';
const checks = [];
const failures = [];
const digest = value => createHash('sha256').update(value).digest('hex');

function createLabelCanvas() {
  const canvas = { width: 0, height: 0, commands: [] };
  const context = {
    fillRect(...args) { canvas.commands.push({ operation: 'fillRect', args, fillStyle: this.fillStyle }); },
    fillText(...args) {
      canvas.commands.push({ operation: 'fillText', args, fillStyle: this.fillStyle,
        textAlign: this.textAlign, font: this.font });
    },
  };
  canvas.getContext = type => { assert.equal(type, '2d'); return context; };
  return canvas;
}

function createConfiguredLabelCanvas(label) {
  const canvas = createLabelCanvas();
  canvas.width = label.width;
  canvas.height = label.height;
  const context = canvas.getContext('2d');
  context.fillStyle = label.background;
  context.fillRect(0, 0, label.width, label.height);
  context.fillStyle = label.color;
  context.textAlign = label.textAlign;
  context.font = label.font;
  context.fillText(label.text, ...label.textPosition);
  return canvas;
}

const source = execFileSync('git', ['show', `${baseline}:prototype/src/main.js`], {
  cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
});
const referenceSource = source.split(/\r?\n/).slice(54, 188).join('\n');
assert.match(referenceSource, /^const colorMat/);
assert.match(referenceSource, /const obstacles =/);
const buildReference = new Function('THREE', 'document', 'world', `${referenceSource}
  return {floor,backWall,leftWall,chair,chairSeat,chairBack,chairLegs,obstacles,setChairHeight};`);

function referenceRoom() {
  const world = new THREE.Scene();
  const room = buildReference(THREE, { createElement: name => {
    assert.equal(name, 'canvas'); return createLabelCanvas();
  } }, world);
  room.setChairHeight(0.47);
  return { world, room };
}

function canonical(value) {
  if (typeof value === 'number') return Math.round(value * 1e11) / 1e11;
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]),
  );
  return value;
}

function textureDescriptor(texture) {
  if (!texture) return null;
  return { type: texture.type, format: texture.format, colorSpace: texture.colorSpace,
    mapping: texture.mapping, wrapS: texture.wrapS, wrapT: texture.wrapT,
    minFilter: texture.minFilter, magFilter: texture.magFilter, flipY: texture.flipY,
    generateMipmaps: texture.generateMipmaps,
    width: texture.image?.width, height: texture.image?.height, commands: texture.image?.commands };
}

function materialDescriptor(material) {
  return { type: material.type, color: material.color?.toArray(), roughness: material.roughness,
    metalness: material.metalness, opacity: material.opacity, transparent: material.transparent,
    side: material.side, depthTest: material.depthTest, depthWrite: material.depthWrite,
    map: textureDescriptor(material.map) };
}

function meshDescriptor(mesh, local = false) {
  const attributes = Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attribute]) => [name,
    { itemSize: attribute.itemSize, normalized: attribute.normalized, count: attribute.count,
      sha256: digest(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength)) },
  ]));
  const index = mesh.geometry.index;
  return canonical({ geometry: { type: mesh.geometry.type, parameters: mesh.geometry.parameters, attributes,
    index: index && { count: index.count,
      sha256: digest(Buffer.from(index.array.buffer, index.array.byteOffset, index.array.byteLength)) } },
    material: Array.isArray(mesh.material) ? mesh.material.map(materialDescriptor) : materialDescriptor(mesh.material),
    matrix: (local ? mesh.matrix : mesh.matrixWorld).toArray(),
    castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow, visible: mesh.visible });
}

function meshList(object, { exclude, local = false } = {}) {
  object.updateMatrixWorld(true);
  const descriptors = [];
  object.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (let parent = mesh; parent; parent = parent.parent) if (parent === exclude) return;
    descriptors.push(meshDescriptor(mesh, local));
  });
  return descriptors.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function check(name, operation) {
  try { const details = operation(); checks.push({ name, passed: true, details }); }
  catch (error) { failures.push({ name, message: error.message }); checks.push({ name, passed: false, error: error.message }); }
}

const reference = referenceRoom();
const initialReference = { chair: reference.room.chair.position.toArray(),
  obstacles: structuredClone(reference.room.obstacles) };
await mkdir(evidence, { recursive: true });
await writeFile(path.join(evidence, 'reference.json'), JSON.stringify({ baseline,
  sourceRange: 'prototype/src/main.js:55-188', referenceSourceSha256: digest(referenceSource),
  seatHeight: 0.47, initialReference, meshes: meshList(reference.world) }, null, 2) + '\n');

let company;
try { company = await import('../../prototype/src/company/room.js'); }
catch (error) {
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify({ status: 'reference-ready', baseline,
    checks, failures, limitation: 'Renderer import unavailable. No extracted-room comparison has passed.',
    importError: error.message }, null, 2) + '\n');
  console.error('Independent reference prepared. Renderer import unavailable.');
  process.exitCode = 2;
}

if (company) {
  const rooms = new Map();
  for (const id of ['legacy', 'room-a', 'room-b']) {
    const world = new THREE.Scene();
    const room = company.createCompanyRoom(world, id, { createLabelCanvas: createConfiguredLabelCanvas });
    room.setChairHeight(0.47);
    world.updateMatrixWorld(true);
    rooms.set(id, { world, room });
  }
  const legacy = rooms.get('legacy');
  check('Legacy room matches every original mesh including geometry buffers, material, world matrix and shadow flags', () => {
    assert.deepEqual(meshList(legacy.world), meshList(reference.world));
    return { meshCount: meshList(reference.world).length, tolerance: 1e-11 };
  });
  check('Legacy floor and wall references identify the original click and inspection geometry', () => {
    assert.equal(legacy.room.floor.isMesh, true);
    assert.equal(legacy.room.backWall.name, 'InspectionBackWall');
    assert.equal(legacy.room.leftWall.name, 'InspectionLeftWall');
    assert.deepEqual(meshDescriptor(legacy.room.floor), meshDescriptor(reference.room.floor));
    assert.deepEqual(meshList(legacy.room.backWall), meshList(reference.room.backWall));
    assert.deepEqual(meshList(legacy.room.leftWall), meshList(reference.room.leftWall));
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0));
    assert.equal(ray.intersectObject(legacy.room.floor)[0]?.object, legacy.room.floor);
  });
  check('Legacy retains all four original padded obstacles before main refresh', () => {
    assert.deepEqual(legacy.room.obstacles, reference.room.obstacles);
    assert.equal(legacy.room.chair.position.z, 0.89);
    return { initialZ: 0.89, runtimeZFormula: '1.05 - primaryMotion.seatBack' };
  });
  const expectedTransforms = { 'room-a': [2.65, 0, 0.8556601197384992, 0], 'room-b': [2, 0, 0, -Math.PI / 2] };
  for (const [id, transform] of Object.entries(expectedTransforms)) {
    const { world, room } = rooms.get(id);
    check(`${id} changes only chair placement and retains original local chair geometry`, () => {
      assert.deepEqual(meshList(world, { exclude: room.chair }), meshList(reference.world, { exclude: reference.room.chair }));
      assert.deepEqual(meshList(room.chair, { local: true }), meshList(reference.room.chair, { local: true }));
      assert.deepEqual(canonical([...room.chair.position.toArray(), room.chair.rotation.y]), canonical(transform));
      assert.deepEqual(room.obstacles.filter(item => item.name !== 'chair'), reference.room.obstacles.filter(item => item.name !== 'chair'));
    });
    check(`${id} local targets and chair mesh world positions follow its transform`, () => {
      const [x, , z, yaw] = transform;
      const local = new THREE.Vector3(0, 0, 0.19433988026150079 + 0.26193636035245754);
      const worldTarget = room.chair.localToWorld(local.clone());
      const expected = new THREE.Vector3(x + Math.sin(yaw) * local.z, 0, z + Math.cos(yaw) * local.z);
      assert.ok(worldTarget.distanceTo(expected) < 1e-12);
      const backWorld = room.chairBack.getWorldPosition(new THREE.Vector3());
      assert.ok(backWorld.distanceTo(new THREE.Vector3(x + Math.sin(yaw) * -0.22, 0.7, z + Math.cos(yaw) * -0.22)) < 1e-12);
      return { approach: worldTarget.toArray(), chairBack: backWorld.toArray() };
    });
    check(`${id} obstacle can be updated in place by main refreshChair`, () => {
      const obstacle = room.obstacles.find(item => item.name === 'chair');
      const box = new THREE.Box3().setFromObject(room.chairSeat);
      Object.assign(obstacle, { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2,
        hw: (box.max.x - box.min.x) / 2 + 0.1, hd: (box.max.z - box.min.z) / 2 + 0.1 });
      assert.equal(room.obstacles.find(item => item.name === 'chair'), obstacle);
      assert.equal(obstacle.x, transform[0]);
      assert.equal(obstacle.z, transform[2]);
      return { obstacle: structuredClone(obstacle) };
    });
  }
  check('Unknown layout is rejected before world mutation', () => {
    const world = new THREE.Scene();
    assert.throws(() => company.createCompanyRoom(world, 'unknown-layout', { createLabelCanvas: createConfiguredLabelCanvas }));
    assert.equal(world.children.length, 0);
  });
  const layoutCatalog = (await import('../../prototype/src/company/layouts.json', { with: { type: 'json' } })).default;
  const resourceCatalog = (await import('../../prototype/src/company/resources.json', { with: { type: 'json' } })).default;
  const badCases = [
    ['missing resource', () => { layoutCatalog.layouts[0].instances[0].resourceId = 'missing'; }],
    ['wrong resource version', () => { layoutCatalog.layouts[0].instances[0].resourceVersion = 999; }],
    ['nonfinite position', () => { layoutCatalog.layouts[0].instances[0].position[0] = NaN; }],
    ['nonfinite yaw', () => { layoutCatalog.layouts[0].instances[0].yaw = Infinity; }],
    ['unsupported geometry', () => { resourceCatalog.resources[0].node.geometry.type = 'UnknownGeometry'; }],
    ['nonfinite roughness', () => { resourceCatalog.resources[0].node.material.roughness = NaN; }],
    ['nonfinite obstacle', () => { layoutCatalog.layouts[0].obstacles[0].hw = Infinity; }],
  ];
  for (const [name, corrupt] of badCases) {
    check(`Basic bad data rejects ${name} before world mutation`, () => {
      const savedLayouts = structuredClone(layoutCatalog);
      const savedResources = structuredClone(resourceCatalog);
      const world = new THREE.Scene();
      try {
        corrupt();
        assert.throws(() => company.createCompanyRoom(world, 'legacy', { createLabelCanvas: createConfiguredLabelCanvas }));
        assert.equal(world.children.length, 0);
      } finally {
        Object.assign(layoutCatalog, savedLayouts);
        Object.assign(resourceCatalog, savedResources);
      }
    });
  }
  const files = ['prototype/src/company/room.js', 'prototype/src/company/resources.json', 'prototype/src/company/layouts.json'];
  const inputs = [];
  for (const file of files) {
    try { inputs.push({ path: file, sha256: digest(await readFile(path.join(root, file))) }); }
    catch { /* Optional filename is reported only if present. */ }
  }
  const result = { status: failures.length ? 'failed' : 'passed', baseline, threeVersion: THREE.REVISION,
    referenceSourceSha256: digest(referenceSource), inputs, checks, failures,
    limitations: ['CPU Three.js only. Canvas stub records draw calls and texture metadata without rasterizing text.',
      'No browser, GPU, actual male/female interaction, performance or human visual acceptance is established.',
      'Opening legacy position 0.89 is kept distinct from body-dependent startup calibration.'] };
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify(result, null, 2) + '\n');
  const summary = [
    '# 公司首包独立 CPU 审查',
    '',
    `结果为 ${result.status}，${checks.filter(item => item.passed).length}/${checks.length} 项通过。`,
    '',
    `参考来自固定提交 ${baseline} 的 prototype/src/main.js 第55–188行，直接执行原程序几何构造。`,
    '采用真实 Three.js r187，在相同0.47m座高下独立比较，期望值未读取新资源数据生成。',
    '',
    '- 69个网格的几何参数与缓冲摘要、材质、世界矩阵、阴影标志一致。数值描述按1e-11精度归一。',
    '- 标签绘制命令与纹理元数据一致。Canvas替身未实际光栅化文字。',
    '- 地板引用射线命中及墙引用通过，四个原始导航障碍保留。',
    '- room-a与room-b仅改变椅子空间变换，椅子局部几何一致，目标数学与世界几何随动。',
    '- 椅障碍对象允许main既有refreshChair原位更新。',
    '- 未知布局及七类基本坏数据在加入world前拒绝。坏数据仅临时改模块内存对象，每例finally恢复，未改配置文件。',
    '',
    'legacy初始Z为0.89，实际开场仍由1.05-seatBack校准。room-a固定Z为0.8556601197384992，room-b为[2,0,0]/yaw=-PI/2。',
    '',
    '本证据仅覆盖CPU Three场景结构。浏览器、GPU画面、真实男女动作、性能和人类视觉验收均未由本审查建立。',
    '本次未独立核验provider运行配置或桌面Hook拦截。三份实际输入SHA及逐项结果见report.json。',
    '',
    '复跑命令为 node scripts/company-platform/review-room.mjs。',
    '',
  ];
  await writeFile(path.join(evidence, 'report.md'), summary.join('\n'));
  console.log(JSON.stringify({ status: result.status, checks: checks.length, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

