import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import Phaser from "phaser";
import { loadAvatar } from "./assets.js";
import { loadFoundationAvatar } from "./foundation-avatar.js";
import { createMotion } from "./motion.js";
import { loadRetargetedMotions } from "./motion-source.js";
import { createTurnPolicy } from "./turn-policy.js";
import { createBehaviorTasks } from "./behavior-tasks.js";
import { createSeatLeases } from "./seat-lease.js";
import { bindAppearanceWorkbench } from "./appearance-workbench.js";
import { exportAppearanceRecipe, importAppearanceRecipe } from "./appearance-recipe.js";
import "./style.css";

// Phaser owns input, path movement, action sequencing and frame scheduling.
// Three.js is a presentation adapter. It never advances root movement itself.
const stage = document.querySelector("#stage");
const turnLegacy = new URLSearchParams(location.search).has("turnLegacy");
// The selected gait is intent; instantaneous world speed still accelerates.
// Keep the accepted walking acceleration/braking unchanged.
const locomotionAcceleration = Object.freeze({ walk: 1.5, run: 3.4, braking: 2.5 });
const world = new THREE.Scene();
world.background = new THREE.Color("#e7ede3");
world.fog = new THREE.Fog("#e7ede3", 18, 35);
const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 60);
camera.position.set(2.6, 2.2, 4.9);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
stage.append(renderer.domElement);
world.add(new THREE.HemisphereLight(0xe9f4ff, 0xa5aa94, 2.5));
const sunlight = new THREE.DirectionalLight(0xfff0d6, 2.9);
sunlight.position.set(-3, 8, 5);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(2048, 2048);
Object.assign(sunlight.shadow.camera, {
  left: -6,
  right: 6,
  top: 6,
  bottom: -6,
});
sunlight.shadow.bias = -0.00015;
sunlight.shadow.normalBias = 0.015;
world.add(sunlight);
const fill = new THREE.DirectionalLight(0xf5f9ff, 1.1);
fill.position.set(4, 3, 1);
world.add(fill);
const colorMat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });
function cube(w, h, d, x, y, z, color, parent = world) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), colorMat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function round(r, h, x, y, z, color, parent = world) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, 32),
    colorMat(color),
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function labelTexture(text, bg = "#fffaf0", color = "#507b69") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.font = "500 58px Microsoft YaHei";
  ctx.fillText(text, 256, 145);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const floor = cube(9, 0.12, 7, 0, -0.06, 0, "#d7c8ac");
floor.castShadow = false;
for (let z = -3.4; z < 3.5; z += 0.32) {
  const line = cube(9, 0.001, 0.006, 0, 0.002, z, "#c4b99f");
  line.castShadow = false;
}
cube(9, 3.5, 0.12, 0, 1.75, -3.5, "#eceddf");
cube(0.12, 3.5, 7, -4.5, 1.75, 0, "#e0e8d9");
cube(9, 0.09, 0.06, 0, 0.06, -3.4, "#c6cdbd");
cube(0.06, 0.09, 7, -4.4, 0.06, 0, "#c6cdbd");
// Soft window, framed prints and a compact streaming desk.
cube(2.3, 1.65, 0.08, -2.7, 2.1, -3.4, "#b8c8b4");
cube(2.1, 1.45, 0.03, -2.7, 2.1, -3.345, "#e9f6ef");
cube(0.055, 1.45, 0.04, -2.7, 2.1, -3.3, "#becdbb");
cube(2.1, 0.05, 0.04, -2.7, 2.1, -3.3, "#becdbb");
for (let x of [-3.95, -1.45]) {
  const curtain = cube(0.32, 2.0, 0.12, x, 1.9, -3.15, "#c0d2bd");
  curtain.castShadow = false;
}
const poster = new THREE.Mesh(
  new THREE.PlaneGeometry(1.2, 0.6),
  new THREE.MeshBasicMaterial({ map: labelTexture("青禾直播间") }),
);
poster.position.set(0.35, 2.2, -3.42);
world.add(poster);
cube(2.0, 0.1, 1.0, 1.15, 0.79, -1.95, "#d7b994");
for (let x of [0.3, 2])
  for (let z of [-2.35, -1.55]) cube(0.065, 0.74, 0.065, x, 0.37, z, "#a7b3a6");
cube(0.8, 0.5, 0.055, 1.15, 1.18, -2.2, "#6e7b78");
cube(0.73, 0.42, 0.014, 1.15, 1.18, -2.161, "#a4c7bc");
cube(0.06, 0.22, 0.06, 1.15, 0.9, -2.2, "#7d8f87");
cube(0.35, 0.025, 0.2, 1.15, 0.847, -2.14, "#788b80");
cube(0.55, 0.025, 0.18, 1.15, 0.851, -1.74, "#f0ebe0");
round(0.065, 0.14, 1.9, 0.9, -1.75, "#b6cdb8");
const micStand = round(0.018, 0.42, 0.35, 1.05, -1.77, "#607770");
const mic = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.045, 0.1, 6, 12),
  colorMat("#647b72"),
);
mic.position.set(0.35, 1.3, -1.77);
world.add(mic);
// Couch at the far left and a plant. All furniture participates in depth occlusion.
cube(1.9, 0.36, 0.8, -2.9, 0.32, -1.7, "#8fae94");
cube(1.9, 0.6, 0.18, -2.9, 0.72, -2.05, "#a3bca2");
for (let x of [-3.8, -2]) cube(0.15, 0.55, 0.8, x, 0.48, -1.7, "#98b298");
cube(0.46, 0.38, 0.18, -3.35, 0.7, -1.88, "#d9ddc1");
cube(0.42, 0.36, 0.18, -2.65, 0.67, -1.88, "#bacbba");
round(0.23, 0.4, -3.7, 0.2, -2.8, "#c4ac8d");
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2,
    m = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      colorMat(i % 2 ? "#7a9c7a" : "#93ae85"),
    );
  m.scale.set(0.6, 2.3, 0.8);
  m.position.set(
    -3.7 + Math.cos(a) * 0.12,
    0.7 + Math.sin(i * 4) * 0.15,
    -2.8 + Math.sin(a) * 0.12,
  );
  m.rotation.z = Math.cos(a) * 0.4;
  world.add(m);
}
const rug = cube(4.9, 0.012, 3.3, -0.3, 0.007, 1.15, "#dce5d3");
rug.castShadow = false;
// Furniture owns the frame: character +Z and chair +Z both point forward.
const chairBounds = [];
const defaultChair = { x: 2.65, z: 0.89, yaw: 0 };
const chair = new THREE.Group();
chair.name = "RepresentativeChair";
chair.position.set(defaultChair.x, 0, defaultChair.z);
world.add(chair);
let chairSeat = cube(0.55, 0.07, 0.5, 0, 0.44, 0, "#c1b197", chair),
  chairBack = cube(0.55, 0.5, 0.07, 0, 0.73, -0.22, "#cabda5", chair);
const chairLegs = [];
for (let x of [-0.22, 0.22])
  for (let z of [-0.19, 0.19])
    chairLegs.push(cube(0.035, 0.42, 0.035, x, 0.21, z, "#a1aea0", chair));
function setChairHeight(h) {
  if (!Number.isFinite(h)) return;
  chairSeat.position.y = h - 0.035;
  chairBack.position.y = h + 0.23;
  for (const leg of chairLegs) {
    leg.scale.y = (h - 0.07) / 0.42;
    leg.position.y = (h - 0.07) / 2;
  }
}
const obstacles = [
  { name: "desk", x: 1.15, z: -1.95, hw: 1.22, hd: 0.72 },
  { name: "couch", x: -2.9, z: -1.7, hw: 1.22, hd: 0.65 },
  { name: "plant", x: -3.7, z: -2.8, hw: 0.4, hd: 0.4 },
  { name: "chair", x: defaultChair.x, z: defaultChair.z, hw: 0.48, hd: 0.35 },
];
// Cloth uses oriented boxes, while navigation conservatively uses a world AABB.
function chairCollider(mesh, name) {
  mesh.name = name;
  mesh.geometry.computeBoundingBox();
  const localBox = mesh.geometry.boundingBox.clone();
  const inverseMatrixWorld = new THREE.Matrix4();
  const local = new THREE.Vector3();
  return {
    name,
    mesh,
    localBox,
    matrixWorld: mesh.matrixWorld,
    inverseMatrixWorld,
    refresh() {
      inverseMatrixWorld.copy(mesh.matrixWorld).invert();
    },
    projectOut(point, margin = 0) {
      local.copy(point).applyMatrix4(inverseMatrixWorld);
      const lo = localBox.min,
        hi = localBox.max;
      if (
        local.x < lo.x - margin ||
        local.x > hi.x + margin ||
        local.y < lo.y - margin ||
        local.y > hi.y + margin ||
        local.z < lo.z - margin ||
        local.z > hi.z + margin
      )
        return false;
      const faces = [
        [local.x - lo.x + margin, "x", lo.x - margin],
        [hi.x + margin - local.x, "x", hi.x + margin],
        [local.y - lo.y + margin, "y", lo.y - margin],
        [hi.y + margin - local.y, "y", hi.y + margin],
        [local.z - lo.z + margin, "z", lo.z - margin],
        [hi.z + margin - local.z, "z", hi.z + margin],
      ];
      const face = faces.reduce((a, b) => (a[0] < b[0] ? a : b));
      local[face[1]] = face[2];
      point.copy(local).applyMatrix4(mesh.matrixWorld);
      return true;
    },
  };
}
chairBounds.push(
  chairCollider(chairSeat, "chairSeat"),
  chairCollider(chairBack, "chairBack"),
);
function refreshChair() {
  chair.updateMatrixWorld(true);
  chairBounds.forEach((c) => c.refresh());
  const box = new THREE.Box3().setFromObject(chairSeat);
  Object.assign(
    obstacles.find((o) => o.name === "chair"),
    {
      x: (box.min.x + box.max.x) / 2,
      z: (box.min.z + box.max.z) / 2,
      hw: (box.max.x - box.min.x) / 2 + 0.1,
      hd: (box.max.z - box.min.z) / 2 + 0.1,
    },
  );
}
function seatTargets(rig = motion) {
  const back = rig?.getMetrics().seatBack || 0.16;
  const approach = rig?.getSeatApproach() || 0;
  const point = (z) => chair.localToWorld(new THREE.Vector3(0, 0, z)).toArray();
  return {
    yaw: chair.rotation.y,
    seatedAnchor: point(back),
    approach: point(back + approach),
    exit: point(back + approach),
  };
}
function setChairTransform({
  x = chair.position.x,
  z = chair.position.z,
  yaw = chair.rotation.y,
} = {}) {
  if (![x, z, yaw].every(Number.isFinite))
    throw new TypeError("Chair transform must be finite");
  if (
    seatLeases.forSeat("room-chair-1") ||
    controller &&
    (controller.mode === "sit" ||
      controller.mode === "stand" ||
      controller.seatAlign ||
      controller.afterWalk === "sit")
  )
    throw new Error(
      "Move the test chair only while it is unoccupied; finish standing first",
    );
  chair.position.set(x, 0, z);
  chair.rotation.y = yaw;
  refreshChair();
  // A changed obstacle invalidates the previous route, without teleporting actor.
  if (controller?.target) {
    const goal = controller.path.at(-1) || controller.target;
    controller.go(...goal);
  }
  return { position: chair.position.toArray(), ...seatTargets() };
}
const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.12, 0.15, 32),
  new THREE.MeshBasicMaterial({
    color: "#4f9b7a",
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
  }),
);
marker.rotation.x = -Math.PI / 2;
marker.position.y = 0.027;
marker.visible = false;
world.add(marker);
const zero = new THREE.Vector3(),
  v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z),
  clamp = THREE.MathUtils.clamp;
const seatLeases = createSeatLeases();
let comparison = null, comparisonGeneration = 0, comparisonLoading = false;
let avatar = null,
  motion = null,
  controller = null,
  controls = null,
  game = null,
  ready = false,
  loadMs = 0,
  cameraMode = "close",
  cameraTween = null,
  followPosition = new THREE.Vector3(-0.5, 0, 1.15),
  frameMs = [],
  renderMs = [],
  lastMetrics = 0;
const initialPosition = [-0.5, 0, 1.15];
const inspection = { corrections: "full", bodyMode: "dressed", dynamics: true };
const correctionLayers = {
  raw: { footIK: false, pelvis: false },
  ik: { footIK: true, pelvis: false },
  pelvis: { footIK: false, pelvis: true },
  full: { footIK: true, pelvis: true },
};
function updateAvatar(dt) {
  // The asset adapter owns raw-bone synchronization and secondary dynamics.
  avatar.update(dt);
}
function syncInspectionUI() {
  const correctionAvailable = typeof motion?.setCorrections === "function";
  const bodyAvailable = typeof avatar?.setDebugBody === "function";
  const dynamicsAvailable = typeof avatar?.setDynamics === "function";
  const select = document.querySelector("#correction-mode");
  select.disabled = !correctionAvailable;
  select.value = inspection.corrections;
  for (const button of document.querySelectorAll("[data-body-mode]")) {
    button.disabled = !bodyAvailable;
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.bodyMode === inspection.bodyMode),
    );
  }
  const dynamicsButton = document.querySelector("#dynamics-toggle");
  dynamicsButton.disabled = !dynamicsAvailable;
  dynamicsButton.setAttribute("aria-pressed", String(inspection.dynamics));
  dynamicsButton.textContent = `附加动态：${inspection.dynamics ? "开" : "关"}`;
  const info = avatar?.getDebugState?.();
  document.querySelector("#body-mode-note").textContent =
    (info?.description || "基础模式保留原上衣及短裤覆盖，不是完整裸模。") +
    (!inspection.dynamics
      ? " 附加动态当前关闭，仅用于诊断；服装效果验收请打开动态。"
      : "");
  if (info?.baseLabel)
    document.querySelector('[data-body-mode="base"]').textContent =
      info.baseLabel;
}
function setCorrections(name) {
  if (!Object.hasOwn(correctionLayers, name))
    throw new RangeError("Corrections must be raw, ik, pelvis or full");
  if (typeof motion?.setCorrections !== "function")
    throw new Error("Correction diagnostics are not ready");
  motion.setCorrections({ ...correctionLayers[name] });
  // setCorrections refreshes the source pose at the same animation time while
  // retaining support anchors. Do not call normal update(0), which could
  // reinterpret a moving frame as a stopped frame.
  updateAvatar(0);
  avatar.root.updateMatrixWorld(true);
  avatar.updateGarment?.(motion.getMetrics().sitProgress, 0, chairBounds);
  inspection.corrections = name;
  syncInspectionUI();
  updateDebugHelpers();
  renderer.render(world, camera);
}
function setDynamics(value) {
  if (typeof avatar?.setDynamics !== "function")
    throw new Error("Dynamics adapter is not ready");
  inspection.dynamics = Boolean(value);
  avatar.setDynamics(inspection.dynamics);
  syncInspectionUI();
}
function setBodyMode(name) {
  if (name !== "base" && name !== "dressed")
    throw new RangeError("Body mode must be base or dressed");
  if (typeof avatar?.setDebugBody !== "function")
    throw new Error("Body diagnostics are not ready");
  avatar.setDebugBody(name === "base");
  inspection.bodyMode = name;
  // A complete clothed comparison starts with actual secondary dynamics;
  // the separate toggle can still disable them explicitly for diagnosis.
  setDynamics(name === "dressed");
  syncInspectionUI();
}

let helpersVisible = false;
const helperGroup = new THREE.Group();
helperGroup.name = "NormalizedHumanoidDebug";
helperGroup.visible = false;
world.add(helperGroup);
let skeletonLines = null,
  normalizedPairs = [],
  contactMarkers = [];
const fixedViews = new Set(["front", "side", "back"]);
for (const framing of ['face', 'half', 'full'])
  for (const direction of ['front', 'side', 'back']) fixedViews.add(`inspect-${framing}-${direction}`);
function syncViewButtons() {
  for (const button of document.querySelectorAll("[data-view]"))
    button.setAttribute(
      "aria-pressed",
      String(
        button.dataset.view ===
          (fixedViews.has(cameraMode) ? cameraMode : "free"),
      ),
    );
}
function updateFixedCamera() {
  if (!avatar || !fixedViews.has(cameraMode)) return;
  if (cameraMode.startsWith('inspect-')) {
    const [, framing, direction] = cameraMode.split('-');
    const head = avatar.vrm.humanoid.getRawBoneNode('head').getWorldPosition(v3());
    const hips = avatar.vrm.humanoid.getRawBoneNode('hips').getWorldPosition(v3());
    const target = framing === 'face' ? head.add(v3(0, .04, 0)) :
      framing === 'half' ? head.add(hips).multiplyScalar(.5).add(v3(0, .035, 0)) :
      avatar.root.position.clone().add(v3(0, 1.05, 0));
    // Include the taller male's raised hands, not just standing head height.
    const distance = framing === 'face' ? .78 : framing === 'half' ? 1.8 : 4.25;
    const offset = direction === 'front' ? v3(0, 0, distance) : direction === 'back' ? v3(0, 0, -distance) : v3(distance, 0, 0);
    offset.applyAxisAngle(v3(0, 1, 0), avatar.root.rotation.y);
    camera.position.copy(target).add(offset);
    controls?.target.copy(target); camera.lookAt(target); camera.updateMatrixWorld(true);
    return;
  }
  const offset =
    cameraMode === "front"
      ? v3(0, 0.5, 3.2)
      : cameraMode === "back"
        ? v3(0, 0.5, -3.2)
        : v3(3.2, 0.5, 0);
  offset.applyAxisAngle(v3(0, 1, 0), avatar.root.rotation.y);
  const target = avatar.root.position.clone().add(v3(0, 0.85, 0));
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
  controls?.target.copy(target);
  camera.updateMatrixWorld(true);
}
function createDebugHelpers() {
  for (const child of [...helperGroup.children]) {
    child.removeFromParent(); child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach(material => material?.dispose());
  }
  // These are actual normalized humanoid nodes used by the motion/IK adapter,
  // not raw render bones and not a schematic skeleton.
  const nodes = new Set(
    Object.values(avatar.vrm.humanoid.normalizedHumanBones).map((b) => b.node),
  );
  normalizedPairs = [];
  for (const node of nodes) {
    let parent = node.parent;
    while (parent && !nodes.has(parent)) parent = parent.parent;
    if (parent) normalizedPairs.push([parent, node]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(normalizedPairs.length * 6), 3),
  );
  skeletonLines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0x8f42ed,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    }),
  );
  skeletonLines.frustumCulled = false;
  skeletonLines.renderOrder = 1000;
  helperGroup.add(skeletonLines);
  contactMarkers = [0, 1].map(() => {
    const target = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x29bd71, depthTest: false }),
    );
    const actual = new THREE.Mesh(
      new THREE.RingGeometry(0.043, 0.052, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    actual.rotation.x = -Math.PI / 2;
    target.renderOrder = actual.renderOrder = 1001;
    helperGroup.add(target, actual);
    return { target, actual };
  });
  updateDebugHelpers();
}
function updateDebugHelpers() {
  if (!skeletonLines || !motion) return;
  if (!helpersVisible) return;
  avatar.root.updateMatrixWorld(true);
  const attribute = skeletonLines.geometry.attributes.position;
  const point = v3();
  normalizedPairs.forEach(([parent, node], index) => {
    parent.getWorldPosition(point);
    attribute.setXYZ(index * 2, point.x, point.y, point.z);
    node.getWorldPosition(point);
    attribute.setXYZ(index * 2 + 1, point.x, point.y, point.z);
  });
  attribute.needsUpdate = true;
  const feet = motion.getMetrics().feet;
  for (let i = 0; i < contactMarkers.length; i++) {
    const foot = feet[i],
      markers = contactMarkers[i];
    // Use the authored heel/toe support point, never call an ankle target shoe contact.
    const shoeContact = foot.contactPoint && foot.contactPoint !== "ankle";
    const target =
      shoeContact && foot.supportAnchor ? foot.supportAnchor : foot.target;
    const actual =
      shoeContact && foot.supportActual ? foot.supportActual : foot.actual;
    markers.target.position.set(target[0], 0.035, target[2]);
    markers.actual.position.set(actual[0], 0.025, actual[2]);
    markers.target.material.color.set(
      foot.reachClamp || foot.slip > 0.005
        ? 0xe23e45
        : foot.contact
          ? 0x29bd71
          : 0xf29b2d,
    );
  }
}
function setHelpers(value) {
  helpersVisible = Boolean(value);
  helperGroup.visible = helpersVisible;
  document
    .querySelector("#helpers-toggle")
    .setAttribute("aria-pressed", String(helpersVisible));
  document.querySelector("#helpers-toggle").textContent = helpersVisible
    ? "隐藏骨骼与足部辅助"
    : "显示骨骼与足部辅助";
  updateDebugHelpers();
}

// Geometric pursuit radius contracts with the actual remaining target distance.
// Limiting both centripetal acceleration and yaw rate avoids a near-goal orbit.
function movingSteering(angle, distance, speed, maxSpeed) {
  const curvature = 2*Math.sin(Math.min(Math.abs(angle),Math.PI/2))/Math.min(.8,Math.max(distance,.001));
  if(curvature<1e-9) return {desiredSpeed:maxSpeed,yawRate:0,curvature};
  return {
    desiredSpeed:Math.min(maxSpeed,Math.sqrt(4.5/curvature),3.2/curvature),
    yawRate:Math.min(3.2,4.5/Math.max(speed,.001),speed*curvature),
    curvature,
  };
}
// Compare only the two reversal arcs against the existing exact navigation
// obstacles. This is a bounded look-ahead, not an alternative path planner.
function reversalArcClearance(position, yaw, speed, maxSpeed, target, side, intent) {
  const dt = 1 / 60;
  let x = position.x, z = position.z;
  for (let tick = 0; tick < 90; tick++) {
    const dx = target[0]-x, dz = target[1]-z, distance = Math.hypot(dx,dz);
    if(distance < .018) return 1.5;
    let angle = Math.atan2(Math.sin(Math.atan2(dx,dz)-yaw),Math.cos(Math.atan2(dx,dz)-yaw));
    if(Math.abs(angle)>1.3 && Math.sign(angle)!==side) angle += side*Math.PI*2;
    const steering = movingSteering(angle,distance,speed,maxSpeed);
    yaw += clamp(angle,-steering.yawRate*dt,steering.yawRate*dt);
    const desired = Math.min(steering.desiredSpeed,Math.sqrt(2*1.8*distance));
    const acceleration = desired<speed?locomotionAcceleration.braking:locomotionAcceleration[intent];
    speed += clamp(desired-speed,-acceleration*dt,acceleration*dt);
    const travel = Math.min(distance,speed*dt), nx=x+Math.sin(yaw)*travel, nz=z+Math.cos(yaw)*travel;
    if(blocked(nx,nz)||!lineClear([x,z],[nx,nz])) return tick*dt;
    x=nx;z=nz;
  }
  return 1.5;
}
function blocked(x, z) {
  return (
    Math.abs(x) > 4.05 ||
    z < -3.05 ||
    z > 3.05 ||
    obstacles.some((o) => {
      if (!(Math.abs(x - o.x) < o.hw && Math.abs(z - o.z) < o.hd)) return false;
      if (o.name !== "chair") return true;
      const p = chair.worldToLocal(new THREE.Vector3(x, 0, z));
      const b = chairBounds[0].localBox;
      return (
        p.x > b.min.x - 0.1 &&
        p.x < b.max.x + 0.1 &&
        p.z > b.min.z - 0.1 &&
        p.z < b.max.z + 0.1
      );
    })
  );
}
function danceSpaceAvailable(root, radius) {
  const {x,z} = root.position;
  if (Math.abs(x)+radius>4.05 || Math.abs(z)+radius>3.05) return false;
  return !obstacles.some(o => {
    if (o.name === "chair") {
      const p=chair.worldToLocal(new THREE.Vector3(x,0,z)), b=chairBounds[0].localBox;
      return Math.hypot(Math.max(b.min.x-p.x,0,p.x-b.max.x),Math.max(b.min.z-p.z,0,p.z-b.max.z))<radius;
    }
    return Math.hypot(Math.max(Math.abs(x-o.x)-o.hw,0),Math.max(Math.abs(z-o.z)-o.hd,0))<radius;
  });
}
function lineClear(a, b) {
  // Sampling every 6cm missed a 2.9cm crossing at a rotated chair corner.
  // Intersect the entire segment against obstacle interiors instead.
  if (blocked(b[0], b[1])) return false;
  const intersects = (from, to, lo, hi) => {
    let enter = 0,
      exit = 1;
    for (let axis = 0; axis < 2; axis++) {
      const delta = to[axis] - from[axis];
      if (Math.abs(delta) < 1e-12) {
        if (from[axis] <= lo[axis] || from[axis] >= hi[axis]) return false;
      } else {
        const t0 = (lo[axis] - from[axis]) / delta,
          t1 = (hi[axis] - from[axis]) / delta;
        enter = Math.max(enter, Math.min(t0, t1));
        exit = Math.min(exit, Math.max(t0, t1));
        if (exit <= enter + 1e-10) return false;
      }
    }
    return exit > enter + 1e-10;
  };
  return !obstacles.some((o) => {
    if (o.name !== "chair")
      return intersects(
        a,
        b,
        [o.x - o.hw, o.z - o.hd],
        [o.x + o.hw, o.z + o.hd],
      );
    const localA = chair.worldToLocal(new THREE.Vector3(a[0], 0, a[1])),
      localB = chair.worldToLocal(new THREE.Vector3(b[0], 0, b[1])),
      box = chairBounds[0].localBox;
    return intersects(
      [localA.x, localA.z],
      [localB.x, localB.z],
      [box.min.x - 0.1, box.min.z - 0.1],
      [box.max.x + 0.1, box.max.z + 0.1],
    );
  });
}
function pathTo(start, x, z) {
  x = clamp(x, -4, 4);
  z = clamp(z, -3, 3);
  if (blocked(x, z)) return [];
  if (lineClear(start, [x, z])) return [[x, z]];
  const step = 0.2,
    key = (a, b) => `${a},${b}`,
    cell = (n) => Math.round(n / step),
    a = [cell(start[0]), cell(start[1])],
    b = [cell(x), cell(z)],
    open = [a],
    seen = new Set([key(...a)]),
    previous = new Map();
  let found = false;
  while (open.length) {
    open.sort(
      (u, v) =>
        Math.hypot(u[0] - b[0], u[1] - b[1]) -
        Math.hypot(v[0] - b[0], v[1] - b[1]),
    );
    const q = open.shift();
    if (q[0] === b[0] && q[1] === b[1]) {
      found = true;
      break;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const n = [q[0] + dx, q[1] + dz],
        k = key(...n);
      if (
        !seen.has(k) &&
        !blocked(n[0] * step, n[1] * step) &&
        lineClear([q[0] * step, q[1] * step], [n[0] * step, n[1] * step])
      ) {
        seen.add(k);
        previous.set(k, q);
        open.push(n);
      }
    }
  }
  if (!found) return [];
  let p = [[x, z]],
    q = b;
  while (key(...q) !== key(...a)) {
    p.push([q[0] * step, q[1] * step]);
    q = previous.get(key(...q));
  }
  p.reverse();
  const simple = [];
  let from = start;
  for (let i = 0; i < p.length;) {
    let j = p.length - 1;
    while (j > i && !lineClear(from, p[j])) j--;
    simple.push(p[j]);
    from = p[j];
    i = j + 1;
  }
  return simple;
}
const names = {
  idle: "站立",
  walk: "行走",
  sit: "坐下",
  stand: "起身",
  dance: "短舞蹈",
  turn: "360° 转身",
};
class CharacterScene extends Phaser.Scene {
  get actor() { return this.instanceAvatar || avatar; }
  get rig() { return this.instanceMotion || motion; }
  constructor(instance = null) {
    super(instance ? "CharacterPeer" : "CharacterStudio");
    this.instanceAvatar = instance?.avatar;
    this.instanceMotion = instance?.motion;
    this.isPeer = !!instance;
    this.actorId = instance?.actorId || "room-primary";
    this.initialPosition = instance?.position || initialPosition;
    this.seatSerial = 0;
    this.seatToken = null;
    this.executingRequest = null;
    this.behaviorTasks = createBehaviorTasks({ownerId: this.actorId, onEvent: event => {
      if(event.task.kind === "greeting")this.lastGreetingRequest=event.task.requestId;
      if (["cancelled", "failed"].includes(event.type) && this.executingRequest === event.task.requestId) {
        this.executingRequest = null;
        const wasDeferred=this.deferredBehavior?.requestId===event.task.requestId;
        this.deferredBehavior = null;
        if (event.task.kind === "greeting" || wasDeferred) {
          this.actor?.livePresentation?.cancelGreeting();
          return; // A cancelled seated gesture must not unexpectedly stand up.
        }
        this.pending = null;
        this.clearPath();
        this.turnRemaining = 0;
        this.releaseSeatRequest(event.task.reason);
        if (this.actor && this.rig) {
          if (["sit", "stand"].includes(this.mode)) this.setMode("stand");
          else this.setMode("idle");
        }
      }
    }});
    this.mode = "idle";
    this.modeTime = 0;
    this.speed = 0;
    this.maxSpeed = 0.85;
    this.locomotionIntent = "walk";
    this.distance = 0;
    this.path = [];
    this.target = null;
    this.afterWalk = null;
    this.pending = null;
    this.paused = false;
    this.playbackRate = 1;
    this.simulationTime = 0;
    this.lastFrameTime = performance.now();
    this.outfit = 0;
    this.sequence = [];
    this.sequenceIndex = -1;
    this.sequenceTime = 0;
    this.turnRemaining = 0;
    this.turning = false;
    this.lastAction = "idle";
    this.yaw = 0;
    this.actualSpeed = 0;
    this.seatAlign = false;
    this.pathTurn = null;
    this.turnPolicy = createTurnPolicy();
    this.backgroundSuspended = document.hidden;
    this.resumeFrame = false;
  }
  create() {
    controller = this;
    this.input.on("pointerdown", (p) => {
      this.pointerDown =
        p.event?.target === this.game.canvas ? [p.x, p.y] : null;
    });
    this.input.on("pointerup", (p) => {
      const down = this.pointerDown;
      this.pointerDown = null;
      if (
        !ready ||
        !down ||
        p.event?.target !== this.game.canvas ||
        Phaser.Math.Distance.Between(...down, p.x, p.y) > 6
      )
        return;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          (p.x / this.scale.width) * 2 - 1,
          (-p.y / this.scale.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObject(floor)[0];
      if (hit) this.command({ type: "walk", x: hit.point.x, z: hit.point.z });
    });
    const onSpace = (e) => {
      if (
        e.target instanceof Element &&
        (e.target.closest("aside, form, input, button, select, textarea, summary") ||
          e.target.isContentEditable)
      )
        return;
      e.preventDefault();
      if (e.repeat) return;
      this.command({ type: "pause" });
    };
    this.input.keyboard.on("keydown-SPACE", onSpace);
    const onCommand = (cmd) => this.command(cmd);
    this.game.events.on("command", onCommand);
    controls = new OrbitControls(camera, this.game.canvas);
    controls.target.set(initialPosition[0], 0.85, initialPosition[2]);
    controls.minDistance = 1.5;
    controls.maxDistance = 13;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.enableDamping = true;
    controls.enablePan = true;
    const onVisibility = () => {
      this.backgroundSuspended = document.hidden;
      this.resumeFrame = true;
      this.lastFrameTime = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    this.scale.on("resize", resizeThree);
    const sceneControls = controls;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("command", onCommand);
      this.input.keyboard.off("keydown-SPACE", onSpace);
      document.removeEventListener("visibilitychange", onVisibility);
      this.scale.off("resize", resizeThree);
      sceneControls.dispose();
      if (controls === sceneControls) controls = null;
    });
    this.cameraPreset("close", true);
  }
  cancelSequence() {
    this.sequence = [];
    this.sequenceIndex = -1;
    if (this.isPeer) return;
    document.querySelector("#sequence-label").textContent =
      "手动体验 · 可以随时暂停或换装";
    document.querySelector("#progress-bar").style.width = "0%";
  }
  releaseSeatRequest(reason) {
    if (!this.seatToken) return;
    seatLeases.requestRelease(this.seatToken, reason);
    if (seatLeases.get(this.seatToken)?.state === "released") this.seatToken = null;
  }
  reserveSeat() {
    if (this.seatToken && seatLeases.get(this.seatToken)?.state !== "released") return true;
    const result = seatLeases.reserve({ seatId: "room-chair-1", ownerId: this.actorId,
      requestId: this.executingRequest || `${this.actorId}:direct-seat:${++this.seatSerial}` });
    if (result.accepted) this.seatToken = result.lease.token;
    return result.accepted;
  }
  greetingReady() {
    if(!this.actor||!this.rig)return false;
    const m=this.rig.getMetrics(),live=this.actor.livePresentation?.getState();
    return !this.target&&!this.pending&&!this.turnPolicy.sample().active&&m.danceMix<.001&&
      this.actor.livePresentation?.canStartGreeting()&&
      !live?.accessories.mic.requested&&!(["loading","playing","fading"].includes(live?.greeting?.status))&&
      ((this.mode==="idle"&&m.gait<.01&&m.stopTime>=.5)||(this.mode==="sit"&&m.sitProgress===1));
  }
  requestBehavior({requestId, kind, payload = {}, timeoutSeconds = 60, queue = false} = {}) {
    const active = this.behaviorTasks.active();
    if (!requestId && kind === "greeting" && active?.kind === "greeting")
      return {admission:active.admission, duplicate:true, task:active};
    if (requestId && this.behaviorTasks.get(requestId))
      return this.behaviorTasks.request({requestId, kind, payload, timeoutSeconds, queue});
    if (kind === "greeting" && !this.greetingReady()) {
      const admission=this.behaviorTasks.request({requestId,kind,payload,timeoutSeconds,queue:false});
      if(admission.admission==="accepted")this.behaviorTasks.fail(admission.task.requestId,"greeting-requires-stable-standing-or-seated-empty-hands");
      return {...admission,task:this.behaviorTasks.get(admission.task.requestId)};
    }
    if (!queue) {
      for (const task of [this.behaviorTasks.active(), ...this.behaviorTasks.pending()].filter(Boolean))
        this.behaviorTasks.cancel(task.requestId, "superseded");
    }
    const admission = this.behaviorTasks.request({requestId, kind, payload, timeoutSeconds, queue});
    if (admission.admission === "accepted" && !admission.duplicate) this.startBehavior(admission.task);
    return {...admission, task: this.behaviorTasks.get(admission.task.requestId)};
  }
  startBehavior(task) {
    this.executingRequest = task.requestId;
    try {
      if (!this.actor || !this.rig) throw new Error("avatar-resource-unavailable");
      const gesture = this.actor.livePresentation?.getState().greeting;
      if (task.kind !== "greeting" && ["loading","playing","fading"].includes(gesture?.status)) {
        this.actor.livePresentation.cancelGreeting();
        this.deferredBehavior = task;
        return; // Finish the 0.2s outgoing layer while the underlying pose stays stable.
      }
      if (task.kind === "greeting") {
        const live=this.actor.livePresentation;
        if (!this.greetingReady())throw Error("greeting-requires-stable-standing-or-seated-empty-hands");
        live.playGreeting({requestId:task.requestId}).then(result=>{
          if (!result.started && !result.cancelled && !result.duplicate && this.behaviorTasks.get(task.requestId)?.state==="running")
            this.behaviorTasks.fail(task.requestId,result.error||"greeting-load-failed");
        }).catch(error=>this.behaviorTasks.fail(task.requestId,error.message));
        return;
      }
      if (!["walk", "idle", "sit", "stand", "turn", "dance"].includes(task.kind)) throw new Error("unsupported-behavior");
      if (task.kind === "dance" && task.payload.danceId) this.rig.setDance(task.payload.danceId);
      if (task.kind === "dance" && !danceSpaceAvailable(this.actor.root,this.rig.getDance()?.radius || .6)) throw new Error("insufficient-dance-space");
      if (task.kind === "sit" && (!chair.parent || !this.reserveSeat())) throw new Error("seat-unavailable");
      if (task.kind === "walk") {
        if (!this.go(task.payload.x, task.payload.z)) throw new Error("path-unreachable");
      } else if (this.action(task.kind, task.payload) === false) throw new Error(this.actor.livePresentation?.canPerform(task.kind)?.reason || "seat-unavailable");
    } catch (error) { this.behaviorTasks.fail(task.requestId, error.message); }
  }
  updateBehavior(dt, metrics) {
    this.behaviorTasks.tick(dt); // Simulation seconds; paused/background time does not count.
    const task = this.behaviorTasks.active();
    if (this.deferredBehavior && !["loading","playing","fading"].includes(this.actor.livePresentation?.getState().greeting?.status)) {
      const deferred=this.deferredBehavior;this.deferredBehavior=null;
      if(task?.requestId===deferred.requestId)this.startBehavior(deferred);
    }
    if (task) {
      if (task.kind === "sit" && !chair.parent) this.behaviorTasks.fail(task.requestId, "seat-target-invalidated");
      const settled = !this.target && !this.pending && !this.turnPolicy.sample().active && this.mode === "idle" && metrics.gait < .01 && metrics.stopTime >= .5;
      let complete = task.kind === "sit" ? this.mode === "sit" && metrics.sitProgress === 1 && !this.pending :
        ["walk", "idle", "stand", "turn"].includes(task.kind) ? settled : false;
      if (task.kind === "greeting") {
        const g=this.actor.livePresentation.getState().greeting;
        complete=g.requestId===task.requestId&&g.status==="completed";
        if(g.requestId===task.requestId&&g.status==="failed")this.behaviorTasks.fail(task.requestId,g.error);
      }
      if (this.deferredBehavior) complete=false;
      if (task.kind === "walk" && complete && Math.hypot(this.actor.root.position.x-task.payload.x, this.actor.root.position.z-task.payload.z) > .05) {
        this.behaviorTasks.fail(task.requestId, "destination-not-reached"); complete = false;
      }
      if (task.kind === "dance" && Number.isFinite(task.payload.durationSeconds) && this.modeTime >= task.payload.durationSeconds && this.mode === "dance") this.action("idle");
      if (task.kind === "dance" && settled && metrics.danceMix < .001) complete = true;
      if (complete) {
        this.behaviorTasks.complete(task.requestId, {mode:this.mode,position:this.actor.root.position.toArray(),seatToken:this.seatToken});
        this.executingRequest = null;
      }
    }
    // Feet are already at the local approach point while seated. Release only
    // after the actual pelvis rises and exits the seat footprint, not root alone.
    const lease = this.seatToken && seatLeases.get(this.seatToken);
    if (lease?.state === "exiting" && metrics.sitProgress === 0) {
      const hip = chair.worldToLocal(new THREE.Vector3().fromArray(metrics.hipWorld));
      if (hip.y > this.rig.getSeatHeight() + .25 && hip.z > .25) {
        seatLeases.releaseAfterExit(this.seatToken); this.seatToken = null;
      }
    }
    if (!this.behaviorTasks.active()) {
      const next = this.behaviorTasks.startNext();
      if (next) this.startBehavior(next);
    }
  }
  command(cmd) {
    if (cmd.type === 'bodySelect') return this.isPeer ? {applied:false,reason:'请通过独立实例入口选择对照人物'} : switchFoundationBody(cmd.bodyType);
    if (["route","sequence"].includes(cmd.type) && ["loading","playing","fading"].includes(this.actor?.livePresentation?.getState().greeting?.status))
      return {applied:false,reason:"请等待招手结束后开始路线或自动序列。"};
    if (["route", "sequence", "reset"].includes(cmd.type))
      for (const task of [this.behaviorTasks.active(), ...this.behaviorTasks.pending()].filter(Boolean)) this.behaviorTasks.cancel(task.requestId, "superseded-by-" + cmd.type);
    if (["action", "walk"].includes(cmd.type)) {
      this.cancelSequence();
      return this.requestBehavior({ requestId: cmd.requestId, kind: cmd.type === "walk" ? "walk" : cmd.name,
        payload: cmd.type === "walk" ? {x:cmd.x,z:cmd.z} : {}, queue: cmd.queue === true });
    }
    if (!ready && cmd.type !== "camera") return;
    if (
      ![
        "pause",
        "camera",
        "view",
        "speed",
        "outfit",
        "playbackRate",
        "helpers",
        "advance",
        "corrections",
        "bodyMode",
        "dynamics",
      ].includes(cmd.type)
    )
      this.cancelSequence();
    switch (cmd.type) {
      case "action":
        this.action(cmd.name);
        break;
      case "walk":
        this.go(cmd.x, cmd.z);
        break;
      case "speed":
        this.setSpeed(cmd.value);
        break;
      case "danceSelect":
        this.rig.setDance(cmd.id); return {applied:true};
      case "appearance":
        return this.actor.appearance?.set(cmd) ?? {applied:false,reason:'当前人物不支持外观编辑'};
      case "faceGeometry":
        return this.actor.facialGeometry?.set(cmd) ?? {applied:false,reason:'当前人物尚无几何参数适配'};
      case "speaking":
        this.actor.livePresentation?.setSpeaking(cmd.value);
        return {applied:true};
      case "gaze":
        this.actor.livePresentation?.setGaze(cmd.target);
        return {applied:true};
      case "expression":
        this.actor.setExpression(cmd.name);
        return {applied:true};
      case "accessory":
        // Admission must read the controller's current intent, not last frame's
        // live-layer snapshot (dance and equip may arrive in the same tick).
        if (cmd.kind === "mic" && cmd.value && (this.mode === "dance" ||
            this.pending?.name === "dance" || this.rig.getMetrics().danceMix > .001))
          return {applied:false,reason:"持麦舞蹈尚未制作；请等待舞蹈退出后装备。"};
        return this.actor.livePresentation?.setAccessory(cmd.kind,cmd.value);
      case "outfit":
        this.setOutfit(cmd.value);
        break;
      case "route":
        this.route(cmd.name);
        break;
      case "sequence":
        this.runSequence();
        break;
      case "pause":
        this.setPaused(cmd.value ?? !this.paused);
        break;
      case "playbackRate":
        this.setPlaybackRate(cmd.value);
        break;
      case "view":
        this.setView(cmd.name);
        break;
      case "helpers":
        setHelpers(cmd.value);
        break;
      case "advance":
        this.advance(cmd.seconds);
        break;
      case "corrections":
        setCorrections(cmd.name);
        break;
      case "bodyMode":
        setBodyMode(cmd.name);
        break;
      case "dynamics":
        setDynamics(cmd.value);
        break;
      case "reset":
        this.reset();
        break;
      case "camera":
        this.cameraPreset(cmd.name);
        break;
    }
  }
  setMode(name) {
    if (this.mode !== name) {
      this.mode = name;
      this.actor?.livePresentation?.setAction(name);
      this.modeTime = 0;
      if (name === "sit" && this.seatToken) seatLeases.occupy(this.seatToken);
      if (name === "stand" && this.seatToken) seatLeases.beginExit(this.seatToken);
      if (this.rig) {
        // Queue the requested mode; rig.update consumes it on the next tick.
        // Eager setAction resets clocks after the displayed pose was evaluated,
        // so refreshPose(0) can replay the old input with the new action clock.
        this.lastAction = name;
      }
    }
  }
  clearPath() {
    this.curveTurnSign = null;
    if (!turnLegacy && this.turnPolicy.sample().active) this.turnPolicy.stop();
    this.path = [];
    this.target = null;
    if (!this.isPeer) marker.visible = false;
    this.afterWalk = null;
    this.seatAlign = false;
    this.pathTurn = null;
  }
  action(name, options = {}) {
    const rotation = name === "turn" ? options.rotationRadians ?? Math.PI * 2 : 0;
    if (name === "turn" && (!Number.isFinite(rotation) || Math.abs(rotation) < 1e-6 || Math.abs(rotation) > Math.PI * 2))
      throw new RangeError("turn rotationRadians must be finite, nonzero and within one revolution");
    const support = this.actor?.livePresentation?.canPerform(name);
    if (support && !support.allowed) {
      if (!this.isPeer) document.querySelector("#scene-state").textContent = support.reason;
      return false;
    }
    if (name === "sit" && !this.reserveSeat()) return false;
    if (name !== "sit" && !["sit", "stand"].includes(this.mode)) this.releaseSeatRequest("behavior-changed");
    if (name === "turn" && this.mode === "turn" && !turnLegacy) {
      this.turnPolicy.requestRotation(rotation);
      this.turnRemaining = Math.abs(rotation);
      return;
    }
    // Repeated commands are idempotent; only the sit UI button explicitly toggles.
    if (
      (name === this.mode &&
        !(
          name === "idle" &&
          (this.pending ||
            this.target ||
            this.seatAlign ||
            this.turnPolicy.sample().active)
        )) ||
      (name === "sit" && (this.afterWalk === "sit" || this.seatAlign))
    )
      return;
    if (!turnLegacy && this.turnPolicy.sample().active) {
      // Keep the airborne step; latest action wins after safe landing.
      this.clearPath();
      this.turnRemaining = 0;
      this.pending = name === "idle" ? null : { type: "action", name, options };
      this.setMode("idle");
      return;
    }
    if ((this.mode === "sit" || this.mode === "stand") && name !== "stand") {
      this.pending = { type: "action", name, options };
      this.setMode("stand");
      return;
    }
    this.pending = null;
    this.clearPath();
    this.turnRemaining = 0;
    if (name === "sit") {
      const p = seatTargets(this.rig).approach;
      this.go(p[0], p[2], "sit");
      return;
    }
    if (name === "turn") {
      this.setMode("turn");
      this.turnRemaining = Math.abs(rotation);
      if (!turnLegacy) {
        this.beginTurn();
        this.turnPolicy.requestRotation(rotation);
      }
      return;
    }
    this.setMode(
      name === "dance" ? "dance" : name === "stand" ? "stand" : "idle",
    );
  }
  go(x, z, after = null) {
    this.curveTurnSign = null;
    if (after !== "sit") this.releaseSeatRequest("movement-requested");
    if (![x, z].every(Number.isFinite))
      throw new TypeError("Walk target must be finite");
    if (this.mode === "sit" || this.mode === "stand") {
      this.pending = { type: "walk", x, z, after };
      this.setMode("stand");
      return true;
    }
    if (this.mode === "dance" || this.rig.getMetrics().danceMix > 0.001) {
      this.pending = { type: "walk", x, z, after };
      this.clearPath();
      this.setMode("idle");
      return true;
    }
    const p = pathTo([this.actor.root.position.x, this.actor.root.position.z], x, z);
    if (!p.length) {
      if (!this.isPeer) document.querySelector("#scene-state").textContent =
        "这里有家具，请选择地面空位";
      return false;
    }
    this.pending = null;
    this.seatAlign = false;
    this.path = p;
    this.target = this.path.shift();
    this.afterWalk = after;
    this.turnRemaining = 0;
    this.setMode("walk");
    if (!this.isPeer) { marker.position.set(x, 0.028, z); marker.visible = true; }
    return true;
  }
  beginTurn() {
    if (this.turnPolicy.sample().active) return;
    const free = this.rig.getMetrics().feet.findIndex((f) => !f.contact);
    this.turnPolicy.reset(this.yaw, { preferredSwing: free });
  }
  setSpeed(n) {
    this.maxSpeed = clamp(Number(n), 0.4, 3.0);
    this.locomotionIntent = this.maxSpeed >= 1.85 ? "run" : "walk";
    if (this.isPeer) return;
    document.querySelector("#speed").value = this.maxSpeed;
    document.querySelector("#speed-label").textContent =
      `${this.maxSpeed >= 1.85 ? "跑步" : this.maxSpeed < 0.65 ? "慢速" : this.maxSpeed > 1.1 ? "较快" : "正常"} · ${this.maxSpeed.toFixed(2)} m/s`;
    document
      .querySelectorAll("[data-speed]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(Math.abs(Number(b.dataset.speed) - this.maxSpeed) < 0.02),
        ),
      );
  }
  setOutfit(n) {
    const selection = [0, 1, 2].includes(Number(n)) ? Number(n) : 0;
    this.actor.setOutfit(selection);
    this.outfitRevision=(this.outfitRevision||0)+1;
    this.outfit = selection;
    if (this.isPeer) return;
    document
      .querySelectorAll("[data-outfit]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(Number(b.dataset.outfit) === this.outfit),
        ),
      );
  }
  setPaused(value) {
    this.paused = Boolean(value);
    this.lastFrameTime = performance.now();
    if (this.isPeer) return;
    document.querySelector("#pause").textContent = this.paused
      ? "继续"
      : "暂停";
    document
      .querySelector("#pause")
      .setAttribute("aria-pressed", String(this.paused));
  }
  setPlaybackRate(value) {
    const rate = Number(value);
    if (rate !== 1 && rate !== 0.25)
      throw new RangeError("Playback rate must be 1 or 0.25");
    this.playbackRate = rate;
    for (const button of document.querySelectorAll("[data-playback-rate]"))
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.playbackRate) === rate),
      );
  }
  setView(name) {
    if (name === "free") this.cameraPreset("close");
    else if (fixedViews.has(name)) this.cameraPreset(name, true);
    else throw new RangeError("View must be front, side, back or free");
  }
  advance(seconds = 1 / 60) {
    if (!ready) throw new Error("Avatar is not ready");
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 30)
      throw new RangeError("Advance expects 0..30 simulation seconds");
    this.setPaused(true);
    // Explicit simulation seconds: independent of playbackRate and the display
    // refresh rate. Every subsystem receives the same small dt.
    const steps = Math.ceil(seconds * 120);
    for (let i = 0; i < steps; i++) this.simulate(seconds / steps);
    updateFixedCamera();
    updateDebugHelpers();
    renderer.render(world, camera);
    refreshUI();
    return snapshot();
  }
  reset() {
    this.actor?.livePresentation?.cancelGreeting({immediate:true});
    this.deferredBehavior=null;
    this.clearPath();
    this.pending = null;
    this.turnRemaining = 0;
    this.speed = 0;
    this.distance = 0;
    this.simulationTime = 0;
    this.actualSpeed = 0;
    this.yaw = 0;
    this.turnPolicy.reset(0);
    this.actor.root.position.set(...this.initialPosition);
    seatLeases.disposeOwner(this.actorId); this.seatToken = null;
    for (const task of [this.behaviorTasks.active(), ...this.behaviorTasks.pending()].filter(Boolean)) this.behaviorTasks.cancel(task.requestId, "explicit-reset");
    this.actor.root.rotation.y = 0;
    this.setMode("idle");
    this.rig.setAction("idle");
    if (this.rig.reset) this.rig.reset();
    // Reset is an explicit teleport, so secondary dynamics must not inherit
    // world-space velocity from the previous location. Never reset during walk.
    this.rig.update(0, {
      distanceDelta: 0,
      speed: 0,
      moving: false,
      action: "idle",
      turning: false,
    });
    this.actor.update(0);
    this.actor.root.updateMatrixWorld(true);
    this.actor.resetSecondary?.();
    this.actor.updateGarment?.(0, 0, chairBounds);
    this.setSpeed(0.85);
    this.cameraPreset("close");
  }
  cameraPreset(name, immediate = false) {
    if (this.isPeer) return;
    cameraMode = name;
    cameraTween = null;
    if (controls) controls.enabled = !fixedViews.has(name);
    syncViewButtons();
    if (fixedViews.has(name)) {
      updateFixedCamera();
      return;
    }
    const root = this.actor?.root.position || v3(...initialPosition);
    followPosition.copy(root);
    const target = name === "room" ? v3(0, 0.65, 0) : v3(root.x, 0.87, root.z);
    const position =
      name === "room"
        ? v3(5.8, 4.5, 7.8)
        : v3(root.x + 1.45, 1.65, root.z + 3.1);
    if (immediate || !controls) {
      camera.position.copy(position);
      if (controls) controls.target.copy(target);
      return;
    }
    cameraTween = {
      t: 0,
      start: camera.position.clone(),
      end: position,
      targetStart: controls.target.clone(),
      targetEnd: target,
    };
  }
  route(name) {
    this.clearPath();
    const p =
      name === "horizontal"
        ? [
            [-2.25, 1.8],
            [2.2, 1.8],
            [-2.25, 1.8],
          ]
        : name === "directions"
          ? [
              [0, 2.5],
              [1.5, 2.5],
              [2.8, 1.6],
              [3.45, -0.8],
              [2.8, -3],
              [-0.8, -2.6],
              [-1.1, 0.1],
              [-0.5, 1.15],
            ]
          : [
              [-1.2, 1.7],
              [-1.2, -2.8],
              [3.15, -2.8],
              [3.45, 1.8],
              [-0.5, 1.15],
            ];
    this.sequence = p.map((pos) => ({
      type: "walk",
      p: pos,
      label: "代表路径",
    }));
    this.sequenceIndex = -1;
    this.nextStep();
    this.cameraPreset("room");
  }
  runSequence() {
    this.reset();
    this.sequence = [];
    for (const outfit of this.actor.config?.outfits?.map((o) => o.index) || [0, 1]) {
      this.sequence.push(
        { type: "outfit", v: outfit },
        { type: "action", name: "idle", duration: 2, label: "站立观察" },
      );
      for (const [speed, p] of [
        [0.45, [-2, 1.8]],
        [0.85, [1.7, 2.0]],
        [1.3, [-1.2, 0.1]],
      ])
        this.sequence.push(
          { type: "speed", v: speed },
          { type: "walk", p, label: `${speed} m/s 行走` },
          { type: "action", name: "idle", duration: 1.2, label: "落脚停止" },
        );
      this.sequence.push(
        { type: "speed", v: 0.85 },
        { type: "walk", p: [-1.2, -2.75], label: "绕过家具" },
        { type: "walk", p: [3.2, -2.75], label: "转角与背面" },
        { type: "walk", p: [3.45, 1.6], label: "回到前侧" },
        { type: "walk", p: [-0.5, 1.15], label: "回到中央" },
        { type: "camera", name: "close" },
        { type: "action", name: "turn", duration: 9, label: "完整 360° 转身" },
        { type: "action", name: "sit", duration: 5, label: "走向座位并坐下" },
        { type: "action", name: "stand", duration: 3, label: "起身" },
        { type: "walk", p: [-0.5, 1.15], label: "走回舞蹈位置" },
        {
          type: "action",
          name: "dance",
          duration: 12,
          label: "抬臂 · 屈肘 · 侧弯 · 抬腿",
        },
        { type: "action", name: "idle", duration: 2, label: "舞蹈结束" },
      );
    }
    this.sequenceIndex = -1;
    this.nextStep();
  }
  nextStep() {
    this.sequenceIndex++;
    this.sequenceTime = 0;
    if (this.sequenceIndex >= this.sequence.length) {
      this.sequence = [];
      document.querySelector("#sequence-label").textContent =
        "完整对照播放结束 · 可再次播放";
      document.querySelector("#progress-bar").style.width = "100%";
      return;
    }
    const s = this.sequence[this.sequenceIndex];
    document.querySelector("#sequence-label").textContent =
      `${this.actor.getOutfitInfo().name} · ${s.label || s.type} · ${this.sequenceIndex + 1}/${this.sequence.length}`;
    document.querySelector("#progress-bar").style.width =
      `${(this.sequenceIndex / this.sequence.length) * 100}%`;
    if (s.type === "walk") {
      if (!this.go(...s.p)) this.nextStep();
    } else if (s.type === "action") this.action(s.name);
    else {
      if (s.type === "speed") this.setSpeed(s.v);
      if (s.type === "outfit") this.setOutfit(s.v);
      if (s.type === "camera") this.cameraPreset(s.name);
      this.nextStep();
    }
  }
  update(time, delta) {
    // Phaser smooths delta; use the measured clock for an exact inspection
    // multiplier, including the first frame after a pause or screenshot.
    const now = performance.now();
    const elapsedMs = Math.max(0, now - this.lastFrameTime);
    this.lastFrameTime = now;
    const dt = this.resumeFrame ? 0 : Math.min(elapsedMs / 1000, 0.05);
    this.resumeFrame = false;
    frameMs.push(elapsedMs);
    if (frameMs.length > 600) frameMs.shift();
    if (ready && !this.paused && !this.backgroundSuspended) {
      const simulated = dt * this.playbackRate;
      const steps = Math.max(1, Math.ceil(simulated * 120));
      for (let i = 0; i < steps; i++) this.simulate(simulated / steps);
    }
    if (ready && controls) {
      const move = this.actor.root.position.clone().sub(followPosition);
      if (cameraMode === "close" && !cameraTween) {
        camera.position.add(move);
        controls.target.add(move);
      }
      followPosition.copy(this.actor.root.position);
    }
    if (cameraTween) {
      cameraTween.t = Math.min(1, cameraTween.t + dt * 2);
      const t = Phaser.Math.Easing.Cubic.InOut(cameraTween.t);
      camera.position.lerpVectors(cameraTween.start, cameraTween.end, t);
      controls.target.lerpVectors(
        cameraTween.targetStart,
        cameraTween.targetEnd,
        t,
      );
      if (cameraTween.t === 1) cameraTween = null;
    }
    if (fixedViews.has(cameraMode)) updateFixedCamera();
    else controls?.update();
    updateDebugHelpers();
    const before = performance.now();
    renderer.render(world, camera);
    renderMs.push(performance.now() - before);
    if (renderMs.length > 600) renderMs.shift();
    if (ready && time - lastMetrics > 250) {
      lastMetrics = time;
      refreshUI();
    }
  }
  simulate(dt) {
    this.simulationTime += dt;
    this.modeTime += dt;
    let moved = 0;
    let turnPlan = null;
    this.turning = false;
    const root = this.actor.root;
    if (this.target) {
      let dx = this.target[0] - root.position.x,
        dz = this.target[1] - root.position.z,
        dist = Math.hypot(dx, dz);
      // Seat alignment needs sub-millimetre arrival without a root snap.
      const arrivalTolerance =
        this.path.length || this.afterWalk === "sit" ? 0.0005 : 0.018;
      if (dist < arrivalTolerance) {
        this.target = this.path.shift() || null;
        if (this.target) {
          dx = this.target[0] - root.position.x;
          dz = this.target[1] - root.position.z;
          dist = Math.hypot(dx, dz);
        } else {
          if (!this.isPeer) marker.visible = false;
          this.speed = 0;
          if (this.afterWalk === "sit") {
            this.seatAlign = true;
            this.setMode("idle");
          } else this.setMode("idle");
          this.afterWalk = null;
        }
      }
      if (this.target) {
        const heading = Math.atan2(dx, dz);
        let angle = Math.atan2(
            Math.sin(heading - this.yaw),
            Math.cos(heading - this.yaw),
          );
        if (!turnLegacy && this.speed > .06 && !this.turnPolicy.sample().active) {
          if (Math.abs(angle)<1.3) this.curveTurnSign=null;
          if (!this.curveTurnSign && Math.abs(angle)>2.8) {
            const shortest=Math.sign(angle), normal=reversalArcClearance(root.position,this.yaw,this.speed,this.maxSpeed,this.target,shortest,this.locomotionIntent);
            const opposite=reversalArcClearance(root.position,this.yaw,this.speed,this.maxSpeed,this.target,-shortest,this.locomotionIntent);
            this.curveTurnSign=opposite>normal ? -shortest : shortest;
          }
          if(this.curveTurnSign && Math.abs(angle)>1.3 && Math.sign(angle)!==this.curveTurnSign)
            angle+=this.curveTurnSign*Math.PI*2;
        }
        // Moving corners/reversals share a continuous steering envelope.
        // Only an already stationary character needs the planted turn phrase;
        // receiving a new target does not reset locomotion or zero velocity.
        if (!turnLegacy) {
          if (this.turnPolicy.sample().active) {
            this.turnPolicy.requestHeading(heading);
            this.pathTurn = "turn";
          } else if (this.speed < .06 && !this.rig.getMetrics().moving && Math.abs(angle) > .27) {
            this.beginTurn();this.turnPolicy.requestHeading(heading);
            this.pathTurn="turn";this.speed=0;
          } else this.pathTurn=null;
        }
        if (turnLegacy && !this.pathTurn && Math.abs(angle) > 0.65)
          this.pathTurn = "settle";
        if (turnLegacy && this.pathTurn === "settle") {
          this.speed = 0;
          const pose = this.rig.getMetrics();
          if (!pose.moving && pose.stopTime >= 0.5 && pose.gait < 0.02)
            this.pathTurn = "turn";
        }
        if (turnLegacy && this.pathTurn === "turn") {
          this.speed = 0;
          const yawStep = clamp(angle, -dt * 0.8, dt * 0.8);
          this.yaw += yawStep;
          root.rotation.y = this.yaw;
          this.turning = Math.abs(yawStep) > 1e-9;
          // Start locomotion on the following substep, preserving lastActual.
          if (Math.abs(angle) <= dt * 0.8 + 1e-6) this.pathTurn = null;
        } else if (!this.pathTurn && !this.turnPolicy.sample().active) {
          // Moving steering uses one continuous lateral-acceleration envelope.
          // a_lateral = speed * yawRate; no cosine-to-zero speed handoff.
          const steering = movingSteering(angle,dist,this.speed,this.maxSpeed);
          const yawRate = turnLegacy ? 3.2 : steering.yawRate;
          const yawStep = clamp(angle, -dt * yawRate, dt * yawRate);
          this.yaw += yawStep;
          root.rotation.y = this.yaw;
          this.turning = Math.abs(angle) > 0.2;
          let remaining = dist;
          for (let i = 0; i < this.path.length; i++) {
            const a = i ? this.path[i - 1] : this.target,
              b = this.path[i];
            remaining += Math.hypot(b[0] - a[0], b[1] - a[1]);
          }
          const cornerFactor =
            this.path.length && dist < 0.4 ? 0.5 + (0.5 * dist) / 0.4 : 1;
          const steeringSpeed = turnLegacy ? Infinity : steering.desiredSpeed;
          const desired =
            Math.min(this.maxSpeed, Math.sqrt(2 * 1.8 * remaining), steeringSpeed) *
            (turnLegacy ? Math.max(0, Math.cos(angle)) ** 3 : 1) *
            cornerFactor;
          const accel = desired < this.speed
            ? locomotionAcceleration.braking
            : locomotionAcceleration[this.locomotionIntent];
          this.speed += clamp(desired - this.speed, -accel * dt, accel * dt);
          moved = Math.min(dist, this.speed * dt);
          const alongFacing = !turnLegacy && dist > .10 && Math.abs(angle) > .06;
          const x = root.position.x + (alongFacing ? Math.sin(this.yaw) : dx / dist) * moved,
            z = root.position.z + (alongFacing ? Math.cos(this.yaw) : dz / dist) * moved;
          if (!blocked(x, z)) {
            root.position.x = x;
            root.position.z = z;
          } else {
            moved = 0;
            this.speed = 0;
            this.clearPath();
            this.setMode("idle");
          }
          this.distance += moved;
        }
      }
    } else this.speed = Math.max(0, this.speed - 2.5 * dt);
    if (this.seatAlign) {
      const goalYaw = chair.rotation.y;
      const delta = Math.atan2(
        Math.sin(goalYaw - this.yaw),
        Math.cos(goalYaw - this.yaw),
      );
      if (!turnLegacy) {
        if (Math.abs(delta) >= 0.025 || this.turnPolicy.sample().active) {
          this.beginTurn();
          this.turnPolicy.requestHeading(goalYaw);
        } else {
          this.seatAlign = false;
          this.setMode("sit");
        }
      } else {
        this.yaw += clamp(delta, -dt * 2.5, dt * 2.5);
        root.rotation.y = this.yaw;
        this.turning = true;
        if (Math.abs(delta) < 0.025) {
          this.seatAlign = false;
          this.yaw = goalYaw;
          root.rotation.y = goalYaw;
          this.setMode("sit");
        }
      }
    }
    if (turnLegacy && this.mode === "turn" && this.turnRemaining > 0) {
      const d = Math.min(this.turnRemaining, dt * 0.8);
      this.turnRemaining -= d;
      this.yaw += d;
      root.rotation.y = this.yaw;
      this.turning = true;
      if (this.turnRemaining < 0.0001) this.setMode("idle");
    }
    if (!turnLegacy && this.turnPolicy.sample().active) {
      turnPlan = this.turnPolicy.update(dt);
      this.yaw = turnPlan.yaw;
      root.rotation.y = this.yaw;
      this.turning = true;
      this.speed = 0;
      moved = 0;
      if (this.mode === "turn")
        this.turnRemaining = turnPlan.active
          ? Math.max(1e-6, Math.abs(turnPlan.remaining))
          : 0;
    }
    this.actualSpeed = dt ? moved / dt : 0;
    this.rig.update(dt, {
      distanceDelta: moved,
      speed: this.actualSpeed,
      locomotion: this.locomotionIntent,
      moving: moved > 1e-7,
      action: this.mode === "turn" ? "idle" : this.mode,
      turning: this.turning,
      // Room turns belong to the planner. Near-zero launch displacement must
      // not select the legacy yaw-delta alternating-foot fallback.
      allowUnplannedTurn: turnLegacy,
      turnPlan,
      speaking: this.actor.livePresentation?.getState().speaking,
    });
    this.actor.update(dt, {action:this.mode});
    if (!this.isPeer) comparison?.update(dt);
    root.updateMatrixWorld(true);
    const m = this.rig.getMetrics();
    this.actor.updateGarment?.(m.sitProgress, dt, chairBounds);
    if (turnPlan && !turnPlan.active) {
      this.pathTurn = null;
      if (this.mode === "turn") this.setMode("idle");
    }
    if (this.mode === "stand" && m.transitionComplete) {
      this.setMode("idle");
      if (this.pending) {
        const cmd = this.pending;
        this.pending = null;
        if (cmd.type === "walk") this.go(cmd.x, cmd.z, cmd.after);
        else this.action(cmd.name, cmd.options);
      }
    }
    if (
      this.mode === "idle" &&
      this.pending &&
      m.danceMix <= 0.001 &&
      !this.turnPolicy.sample().active
    ) {
      const cmd = this.pending;
      this.pending = null;
      if (cmd.type === "walk") this.go(cmd.x, cmd.z, cmd.after);
      else this.action(cmd.name, cmd.options);
    }
    if (this.mode === "dance" && m.dancePlaybackComplete) this.setMode("idle");
    this.updateBehavior(dt, m);
    if (this.sequence.length) {
      const s = this.sequence[this.sequenceIndex];
      if (s.type === "walk") {
        if (!this.target && !this.pending && this.speed < 0.02) this.nextStep();
      } else if (s.type === "action") {
        const eligible =
          s.name === "sit"
            ? this.mode === "sit"
            : s.name === "turn"
              ? this.turnRemaining <= 0
              : true;
        if (eligible) this.sequenceTime += dt;
        if (this.sequenceTime >= (s.name === "turn" ? 1 : s.duration))
          this.nextStep();
      }
    }
  }
}
function average(a) {
  return a.reduce((sum, n) => sum + n, 0) / Math.max(1, a.length);
}
function p95(a) {
  return [...a].sort((a, b) => a - b)[Math.floor(a.length * 0.95)] || 0;
}
function snapshot() {
  const c = controller,
    m = motion?.getMetrics() || {};
  return {
    ready,
    buildInfo,
    bodySelection: {...bodySelection},
    chair: { position: chair.position.toArray(), ...seatTargets() },
    pending: c?.pending,
    seatAlign: c?.seatAlign,
    pathTurn: c?.pathTurn,
    turnLegacy,
    turnPlan: c?.turnPolicy.sample(),
    backgroundSuspended: c?.backgroundSuspended,
    mode: c?.mode,
    outfit: c?.outfit,
    outfitRevision:c?.outfitRevision||0,
    outfitInfo: avatar?.getOutfitInfo(),
    appearance: avatar?.appearance?.getState(),
    facialGeometry: avatar?.facialGeometry?.getState(),
    speed: c?.actualSpeed,
    maxSpeed: c?.maxSpeed,
    locomotionIntent: c?.locomotionIntent,
    distance: c?.distance,
    facing: c?.yaw,
    position: avatar?.root.position.toArray(),
    target: c?.target,
    path: c?.path,
    collision: avatar
      ? blocked(avatar.root.position.x, avatar.root.position.z)
      : null,
    paused: c?.paused,
    playbackRate: c?.playbackRate,
    simulationTime: c?.simulationTime,
    modeTime: c?.modeTime,
    view: fixedViews.has(cameraMode) ? cameraMode : "free",
    camera: {
      mode: cameraMode,
      position: camera.position.toArray(),
      target: controls?.target.toArray(),
    },
    helpers: {
      visible: helpersVisible,
      normalizedSegments: normalizedPairs.length,
      contactProjection:
        "heel/toe support anchor and actual when active; otherwise ankle target and actual, world XZ projected to ground",
    },
    inspection: {
      ...inspection,
      flags: { ...correctionLayers[inspection.corrections] },
      asset: avatar?.getDebugState?.() || null,
    },
    sequenceIndex: c?.sequenceIndex,
    sequenceLength: c?.sequence.length,
    phase: m.phase,
    feet: m.feet,
    motion: m,
    loadMs,
    frameMs: { mean: average(frameMs), p95: p95(frameMs) },
    renderSubmitMs: { mean: average(renderMs), p95: p95(renderMs) },
    renderer: {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries,
    },
    heap: performance.memory
      ? {
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
        }
      : null,
  };
}
function refreshUI() {
  const s = snapshot();
  document.querySelector("#scene-state").textContent =
    `${s.outfitInfo?.name || "裤装"} · ${names[s.mode] || s.mode}${s.paused ? " · 已暂停" : ""}`;
  const greetingStatus=document.querySelector("#greeting-status");
  if(greetingStatus){
    const g=avatar?.livePresentation?.getState().greeting;
    const task=controller?.lastGreetingRequest?controller.behaviorTasks.get(controller.lastGreetingRequest):null;
    const reason=task?.reason?(task.state==="cancelled"?"招手已取消":task.reason.includes("resource")||task.reason.includes("load")?"招手资源加载失败，可重试":"请在空手站稳或坐稳后招手"):null;
    greetingStatus.textContent=reason||({loading:"招手加载中",playing:"招手播放中",fading:"招手退出中",completed:"招手完成",cancelled:"招手已取消",failed:g?.error}[g?.status]||"空手站稳/坐稳后招手");
  }
  document.querySelector("#sit-button").textContent =
    s.mode === "sit" ? "起身" : "坐下";
  document.querySelector("#metrics").textContent =
    `速度 ${Number(s.speed || 0).toFixed(2)} m/s · 路程 ${Number(s.distance || 0).toFixed(2)} m\n帧间隔 ${s.frameMs.mean.toFixed(1)} ms (P95 ${s.frameMs.p95.toFixed(1)})\n渲染提交 ${s.renderSubmitMs.mean.toFixed(1)} ms\n绘制 ${s.renderer.calls} · 三角面 ${s.renderer.triangles}\n纹理 ${s.renderer.textures} · 几何 ${s.renderer.geometries}\n首载 ${(s.loadMs / 1000).toFixed(2)} s\n脚滑动与变形详见调试数据`;
}
function resizeThree() {
  const w = stage.clientWidth,
    h = stage.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
game = new Phaser.Game({
  type: Phaser.CANVAS,
  parent: "phaser-stage",
  width: stage.clientWidth,
  height: stage.clientHeight,
  transparent: true,
  audio: { noAudio: true },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: { target: 60 },
  scene: CharacterScene,
});
new ResizeObserver(() => {
  resizeThree();
  game.scale.resize(stage.clientWidth, stage.clientHeight);
}).observe(stage);
resizeThree();
const emit = (cmd) => controller?.command(cmd);
window.__debug = {
  ready: false,
  get buildInfo() {
    return buildInfo;
  },
  setChairTransform,
  chairColliders: () => chairBounds,
  seatLeases,
  request: request => controller.requestBehavior(request),
  tasks: () => controller.behaviorTasks,
  command: emit,
  exportAppearanceRecipe: () => exportAppearanceRecipe(controller),
  importAppearanceRecipe: text => importAppearanceRecipe(controller, text),
  snapshot,
  action: (name) => emit({ type: "action", name }),
  setSpeed: (value) => emit({ type: "speed", value }),
  setOutfit: (value) => emit({ type: "outfit", value }),
  walkTo: (x, z) => emit({ type: "walk", x, z }),
  runSequence: () => emit({ type: "sequence" }),
  route: (name) => emit({ type: "route", name }),
  pause: () => emit({ type: "pause" }),
  setPaused: (value) => emit({ type: "pause", value }),
  setPlaybackRate: (value) => controller.setPlaybackRate(value),
  view: (name) => controller.setView(name),
  setHelpers,
  setCorrections,
  setBodyMode,
  setDynamics,
  advance: (seconds) => controller.advance(seconds),
  cameraObject: () => camera,
  reset: () => emit({ type: "reset" }),
  camera: (name) => emit({ type: "camera", name }),
  avatar: () => avatar,
  comparison: () => comparison,
  loadComparison,
  removeComparison,
  motion: () => motion,
  scene: world,
  renderer,
  game,
};
for (const b of document.querySelectorAll("[data-action]"))
  b.onclick = () =>
    emit({
      type: "action",
      name:
        b.id === "sit-button" && controller?.mode === "sit"
          ? "stand"
          : b.dataset.action,
    });
for (const b of document.querySelectorAll("[data-outfit]"))
  b.onclick = () => emit({ type: "outfit", value: b.dataset.outfit });
for (const b of document.querySelectorAll("[data-speed]"))
  b.onclick = () => emit({ type: "speed", value: b.dataset.speed });
for (const b of document.querySelectorAll("[data-route]"))
  b.onclick = () => emit({ type: "route", name: b.dataset.route });
for (const b of document.querySelectorAll("[data-camera]"))
  b.onclick = () => emit({ type: "camera", name: b.dataset.camera });
for (const button of document.querySelectorAll("[data-playback-rate]"))
  button.onclick = () =>
    emit({ type: "playbackRate", value: Number(button.dataset.playbackRate) });
for (const button of document.querySelectorAll("[data-view]"))
  button.onclick = () => emit({ type: "view", name: button.dataset.view });
document.querySelector("#correction-mode").onchange = (event) =>
  emit({ type: "corrections", name: event.target.value });
for (const button of document.querySelectorAll("[data-body-mode]"))
  button.onclick = () =>
    emit({ type: "bodyMode", name: button.dataset.bodyMode });
document.querySelector("#dynamics-toggle").onclick = () =>
  emit({ type: "dynamics", value: !inspection.dynamics });
document.querySelector("#helpers-toggle").onclick = () =>
  emit({ type: "helpers", value: !helpersVisible });
document.querySelector("#advance-frame").onclick = () =>
  emit({ type: "advance", seconds: 1 / 60 });
document.querySelector("#speed").oninput = (e) =>
  emit({ type: "speed", value: e.target.value });
document.querySelector("#sequence").onclick = () => emit({ type: "sequence" });
document.querySelector("#pause").onclick = () => emit({ type: "pause" });
document.querySelector("#reset").onclick = () => emit({ type: "reset" });
let buildInfo = { development: import.meta.env.DEV, shortId: null };
fetch(`${import.meta.env.BASE_URL}build-info.json`, { cache: "no-store" })
  .then((r) => (r.ok ? r.json() : null))
  .then((info) => {
    buildInfo = { ...info, development: import.meta.env.DEV };
    document.querySelector(".edition").textContent = import.meta.env.DEV
      ? "开发预览"
      : `候选 ${info?.shortId || "未标识"}`;
  })
  .catch(() => {
    document.querySelector(".edition").textContent = import.meta.env.DEV
      ? "开发预览"
      : "构建标识缺失";
  });
// A second independently parsed rig is an isolation fixture, not a crowd feature.
// Its own mixer, face clock, equipment and dynamic state advance on the SAME
// Phaser time step, never a second requestAnimationFrame loop.
function removeComparison() { comparisonGeneration++; comparison?.dispose(); comparison = null; }
async function loadComparison(bodyType = avatar.profile.bodyType === "female" ? "male" : "female") {
  if (comparison || comparisonLoading) throw new Error("Comparison already loaded or loading");
  comparisonLoading = true;
  const generation = ++comparisonGeneration;
  let a;
  try {
  // Keep an unposed peer out of the rendered world until its mixer and contact
  // calibration are ready. Do not hide its root: calibration reads visibility.
  a = await loadFoundationAvatar({ scene: world, renderer, bodyType, attachToScene: false });
  a.root.position.set(1.2, 0, 1.15);
  const clips = await loadRetargetedMotions(a.vrm,{avatarSha256:a.getAssetProfile().sha256});
  const m = createMotion(a.vrm, a.root, clips, a.profile.motion);
  const peerController = new CharacterScene({ avatar: a, motion: m, actorId: `room-peer-${generation}`, position: [1.2, 0, 1.15] });
  const instance = {
    avatar: a, motion: m, controller: peerController,
    action: name => peerController.command({type:"action",name}),
    request: request => peerController.requestBehavior(request),
    tasks: peerController.behaviorTasks,
    command: command => peerController.command(command),
    update: dt => peerController.simulate(dt),
    dispose() { peerController.clearPath(); m.dispose?.(); a.dispose(); peerController.behaviorTasks.dispose(); seatLeases.disposeOwner(peerController.actorId); },
  };
  instance.update(0); a.resetSecondary();
  if (generation !== comparisonGeneration) { instance.dispose(); a = null; throw new Error("Comparison request cancelled"); }
  world.add(a.root);
  comparison = instance;
  return instance;
  } catch (error) { if (a) a.dispose(); throw error; }
  finally { comparisonLoading = false; }
}
function syncFoundationControls(a) {
  if (!a.config) return;
  document.querySelectorAll("[data-outfit]").forEach(button =>
    button.setAttribute("aria-pressed", String(Number(button.dataset.outfit) === controller.outfit)));
  document.querySelector('[data-outfit="0"] b').textContent = a.config.pantsLabel;
  document.querySelector('[data-outfit="1"]').hidden = !a.config.ids.skirt;
  const oldTrial = document.querySelector('[data-outfit="2"]');
  oldTrial.hidden = !a.config.ids.shorts;
  if (a.config.ids.shorts) oldTrial.querySelector("b").textContent = a.config.shortsLabel;
  document.querySelector("#foundation-legend").textContent = `${a.config.label}：同一房间与控制器，当前基模独立验证。`;
}
function bindFoundationControls(a) {
  if (!a.config) return;
  syncFoundationControls(a);
  const row = document.createElement("div"); row.className = "debug-row foundation-actions";
  for (const [bodyType, label] of [["female", "女性候选"], ["male", "男性候选"]]) {
    const link = document.createElement("a");
    link.href = `?body=${bodyType}`; link.textContent = label; row.append(link);
  }
  for (const [id, label] of [["neutral", "自然眨眼"], ["happy", "微笑"], ["aa", "口型 A"]]) {
    const button = document.createElement("button"); button.textContent = label;
    button.dataset.expression = id; button.onclick = () => emit({type:"expression",name:id}); row.append(button);
  }
  const speaking = document.createElement("button"); speaking.textContent = "讲话演示";
  speaking.id = 'speaking-button';
  speaking.onclick = () => { const enabled = !controller.actor.livePresentation.getState().speaking; emit({type:"speaking",value:enabled}); speaking.textContent = enabled ? "停止讲话" : "讲话演示"; };
  row.append(speaking);
  const greeting=document.createElement("button");greeting.textContent="单次招手";greeting.dataset.action="greeting";
  greeting.title="稳定站立或坐姿、空手；男女外观仍待视觉验收";
  greeting.onclick=()=>{const result=emit({type:"action",name:"greeting"});if(result?.task?.reason)document.querySelector("#scene-state").textContent=result.task.reason;};
  row.append(greeting);
  const greetingStatus=document.createElement("span");greetingStatus.id="greeting-status";greetingStatus.setAttribute("role","status");greetingStatus.textContent="空手站稳/坐稳后招手";row.append(greetingStatus);
  const gaze = document.createElement("button"); gaze.textContent = "看向镜头";
  gaze.onclick = () => emit({type:"gaze",target:camera.position.toArray()}); row.append(gaze);
  for (const [kind,label] of [["mic","麦克风"],["glasses","眼镜"]]) {
    const button = document.createElement("button"); button.textContent = "装备"+label; button.dataset.accessoryKind = kind;
    const status = document.createElement("span");
    status.dataset.accessoryStatus = kind; status.setAttribute("role","status");
    let uiRequest = 0;
    button.onclick = async () => {
      const request = ++uiRequest;
      const selectedActor = controller.actor;
      const enabled = !controller.actor.livePresentation.getState().accessories[kind].requested;
      status.textContent = enabled ? label+"加载中" : "";
      try {
        const result = await emit({type:"accessory",kind,value:enabled});
        if (request === uiRequest && controller.actor === selectedActor) status.textContent = result?.applied || result?.cancelled
          ? "" : result?.reason || label+"加载失败，请重试";
      } catch (error) {
        if (request === uiRequest && controller.actor === selectedActor) status.textContent = String(error.message || error);
      } finally {
        if (request === uiRequest && controller.actor === selectedActor) button.textContent = controller.actor.livePresentation.getState().accessories[kind].requested
          ? "卸下"+label : "装备"+label;
      }
    }; row.append(button,status);
  }
  const peer = document.createElement("button"); peer.textContent = "双实例隔离对照";
  peer.onclick = async () => {
    peer.disabled = true;
    try {
      if (comparison) removeComparison();
      else await loadComparison();
      peer.textContent = comparison ? "移除第二实例" : "双实例隔离对照";
    } catch (error) { console.error(error); peer.textContent = "对照加载失败，可重试"; }
    finally { peer.disabled = false; }
  };
  row.append(peer); document.querySelector(".debug-controls").append(row);
}
let bodySelectionGeneration = 0;
const bodySelection = {loading:false, requested:null, error:null};
async function switchFoundationBody(bodyType) {
  const request = ++bodySelectionGeneration;
  if (!ready || !avatar?.config) return {applied:false,reason:'人物尚未准备好'};
  bodySelection.requested = bodyType; bodySelection.error = null;
  if (avatar.profile.bodyType === bodyType) { bodySelection.loading = false; return {applied:true,bodyType}; }
  bodySelection.loading = true;
  let nextAvatar, nextMotion, committed = false;
  const notices = [];
  try {
    // Prepare completely off-scene; the current avatar remains usable on failure.
    nextAvatar = await loadFoundationAvatar({scene:world,renderer,bodyType,attachToScene:false});
    if (request !== bodySelectionGeneration) return {applied:false,cancelled:true};
    nextAvatar.root.position.copy(avatar.root.position);
    const clips = await loadRetargetedMotions(nextAvatar.vrm,{avatarSha256:nextAvatar.profile.sha256});
    if (request !== bodySelectionGeneration) return {applied:false,cancelled:true};
    const colors = avatar.appearance.getState();
    const hairStyle = nextAvatar.appearance.getState().availableStyles.includes(colors.hairStyle) ? colors.hairStyle : 'original';
    if (hairStyle !== colors.hairStyle) notices.push('原发型未适配此身体，已使用该人物原发型');
    const applied = await nextAvatar.appearance.set({hairStyle,hairColor:colors.hairColor,skinTone:colors.skinTone,eyeColor:colors.eyeColor,lipColor:colors.lipColor});
    if (!applied.applied) throw new Error(applied.reason || '外观配置加载失败');
    if (request !== bodySelectionGeneration) return {applied:false,cancelled:true};
    const initialRole = avatar.config.outfits.find(entry => entry.index === controller.outfit)?.role;
    nextAvatar.setOutfit(nextAvatar.config.outfits.find(entry => entry.role === initialRole)?.index ?? 0);
    nextAvatar.setDebugBody(inspection.bodyMode === 'base'); nextAvatar.setDynamics(inspection.dynamics);
    nextMotion = createMotion(nextAvatar.vrm,nextAvatar.root,clips,nextAvatar.profile.motion);
    // Prepare this detached actor's real materials against the room lights.
    // Capture current controller/camera state only after this asynchronous wait.
    await renderer.compileAsync(nextAvatar.root,camera,world);
    if (request !== bodySelectionGeneration) return {applied:false,cancelled:true};
    const oldRole = avatar.config.outfits.find(entry => entry.index === controller.outfit)?.role;
    const outfit = nextAvatar.config.outfits.find(entry => entry.role === oldRole)?.index ?? 0;
    if (!nextAvatar.config.outfits.some(entry => entry.role === oldRole)) notices.push('原服装没有此身体版型，已切到裤装');
    nextAvatar.setOutfit(outfit);
    nextAvatar.setDebugBody(inspection.bodyMode === 'base'); nextAvatar.setDynamics(inspection.dynamics);
    nextMotion.setCorrections({...correctionLayers[inspection.corrections]});
    const oldAvatar = avatar, oldMotion = motion;
    const saved = {position:avatar.root.position.clone(),yaw:controller.yaw,camera:cameraMode,
      cameraPosition:camera.position.clone(),cameraTarget:controls.target.clone(),speed:controller.maxSpeed,
      paused:controller.paused,rate:controller.playbackRate,simulationTime:controller.simulationTime,
      seated:['sit','stand'].includes(controller.mode)||controller.seatAlign,
      active:controller.mode!=='idle',danceId:motion.getDance()?.id};
    if (saved.seated) { saved.position.fromArray(seatTargets(nextMotion).approach); notices.push('更换身体后回到椅前站位，请重新入座以验证接触'); }
    else if (saved.active) notices.push('当前动作已结束，可用新身体重新播放');
    // Every asset-dependent operation remains owned by the preparation locals.
    // No old actor/controller state is changed if one of these calls fails.
    nextAvatar.root.position.copy(saved.position); nextAvatar.root.rotation.y = saved.yaw;
    nextMotion.reset(); nextMotion.setAction('idle');
    nextMotion.update(0,{distanceDelta:0,speed:0,moving:false,action:'idle',turning:false});
    nextAvatar.livePresentation?.setAction('idle');
    nextAvatar.update(0); nextAvatar.root.updateMatrixWorld(true);
    nextAvatar.resetSecondary(); nextAvatar.updateGarment(0,0,chairBounds);
    const dance = nextMotion.getDances().find(entry => entry.id === saved.danceId) || nextMotion.getDances().find(entry => entry.id === 'rokoko-5359146-30s-v1') || nextMotion.getDances()[0];
    if (dance) nextMotion.setDance(dance.id);
    const oldTasks = [controller.behaviorTasks.active(),...controller.behaviorTasks.pending()].filter(Boolean);
    if (request !== bodySelectionGeneration) return {applied:false,cancelled:true};

    // Attach before transferring ownership: an attachment error still disposes
    // the prepared actor. This synchronous section cannot render a mixed frame.
    world.add(nextAvatar.root);
    avatar = nextAvatar; motion = nextMotion; nextAvatar = null; nextMotion = null;
    committed = true;
    // Reset only command/path state. Calling controller.reset() would teleport
    // and re-pose the old actor and also overwrite camera/speed preferences.
    Object.assign(controller, {
      executingRequest:null, deferredBehavior:null, pending:null,
      path:[], target:null, afterWalk:null, seatAlign:false, pathTurn:null, curveTurnSign:null,
      sequence:[], sequenceIndex:-1, sequenceTime:0,
      mode:'idle', lastAction:'idle', modeTime:0, turning:false, turnRemaining:0,
      speed:0, actualSpeed:0, distance:0, yaw:saved.yaw, outfit,
      simulationTime:saved.simulationTime, maxSpeed:saved.speed,
      paused:saved.paused, playbackRate:saved.rate, lastFrameTime:performance.now(),
      seatToken:null, lastGreetingRequest:null, pointerDown:null,
    });
    marker.visible = false;
    // Cleanup and presentation are independent after commit. A failed UI write
    // must not report that the old (already replaced) character was retained.
    const finish = (label, work) => {
      try { work(); } catch (error) { notices.push(`${label}：${error.message || error}`); }
    };
    finish('转向状态清理失败', () => controller.turnPolicy.reset(saved.yaw));
    for (const task of oldTasks) finish('旧动作清理失败', () => controller.behaviorTasks.cancel(task.requestId,'body-replaced'));
    controller.lastGreetingRequest = null;
    finish('座位占用清理失败', () => seatLeases.disposeOwner(controller.actorId));
    finish('旧人物移除失败', () => oldAvatar.root.removeFromParent());
    finish('旧动作资源清理失败', () => oldMotion.dispose());
    finish('旧人物资源清理失败', () => oldAvatar.dispose());
    finish('序列界面更新失败', () => controller.cancelSequence());
    finish('服装界面更新失败', () => syncFoundationControls(avatar));
    finish('舞蹈界面更新失败', () => populateDanceSelect(document.querySelector('select[aria-label="舞蹈样件"]')));
    finish('附件界面更新失败', () => {
      document.querySelector('#speaking-button').textContent = '讲话演示';
      for (const [kind,label] of [['mic','麦克风'],['glasses','眼镜']]) {
        document.querySelector(`[data-accessory-kind="${kind}"]`).textContent = '装备'+label;
        document.querySelector(`[data-accessory-status="${kind}"]`).textContent = '';
      }
    });
    finish('骨骼辅助更新失败', () => createDebugHelpers());
    finish('调试界面更新失败', () => syncInspectionUI());
    cameraMode = saved.camera; cameraTween = null; controls.enabled = !fixedViews.has(cameraMode);
    camera.position.copy(saved.cameraPosition); controls.target.copy(saved.cameraTarget);
    followPosition.copy(avatar.root.position);
    finish('镜头界面更新失败', () => { updateFixedCamera(); syncViewButtons(); });
    finish('地址更新失败', () => {
      const url = new URL(location.href); url.searchParams.set('body',bodyType); history.replaceState(history.state,'',url);
    });
    finish('状态界面更新失败', () => refreshUI());
    return {applied:true,bodyType,notice:notices.join('；')};
  } catch (error) {
    if (committed) return {applied:true,bodyType,notice:[...notices,`人物已切换，后续更新失败：${error.message || error}`].join('；')};
    if (request === bodySelectionGeneration) bodySelection.error = error.message;
    return {applied:false,reason:error.message};
  } finally {
    try { nextMotion?.dispose(); } finally { nextAvatar?.dispose(); }
    if (request === bodySelectionGeneration) bodySelection.loading = false;
  }
}
function populateDanceSelect(select) {
  select.replaceChildren();
  for (const dance of motion.getDances()) {
    const option=document.createElement('option'); option.value=dance.id;
    option.textContent=dance.label || (dance.playback === 'loop' ? '源短舞参考（循环）' : '技术编排（完整7.2秒）');
    select.append(option);
  }
  select.value = motion.getDance()?.id;
}
const loadStart = performance.now();
loadAvatar({ scene: world, renderer })
  .then(async (a) => {
    avatar = a;
    bindFoundationControls(a);
    avatar.root.position.set(...initialPosition);
    const motions = await loadRetargetedMotions(avatar.vrm,{avatarSha256:avatar.getAssetProfile?.().sha256});
    motion = createMotion(
      avatar.vrm,
      avatar.root,
      motions,
      avatar.profile?.motion,
    );
    const danceSelect=document.createElement("select"); danceSelect.setAttribute("aria-label","舞蹈样件");
    for (const dance of motion.getDances()) {
      const option=document.createElement("option");option.value=dance.id;
      option.textContent=dance.label || (dance.id === 'rokoko-5359146-30s-v1' ? '视频转动作 · 原30秒（封存）' :
        dance.id === 'rokoko-5359146-30s-arm-local-v1' ? '视频转动作 · 唯一优化版（封存）' :
        dance.playback === "loop" ? "源短舞参考（循环）" : "技术编排（完整7.2秒）");
      danceSelect.append(option);
    }
    danceSelect.onchange=()=>{try{emit({type:"danceSelect",id:danceSelect.value});}catch(error){danceSelect.value=motion.getDance().id;document.querySelector("#scene-state").textContent=error.message;}};
    document.querySelector(".debug-controls").append(danceSelect);
    if (new URLSearchParams(location.search).get('workbench') === 'appearance' &&
        motion.getDances().some(d => d.id === 'rokoko-5359146-30s-v1')) {
      motion.setDance('rokoko-5359146-30s-v1'); danceSelect.value = 'rokoko-5359146-30s-v1';
    }
    motion.setAction("idle");
    motion.update(0, {
      distanceDelta: 0,
      speed: 0,
      moving: false,
      action: "idle",
      turning: false,
    });
    updateAvatar(0);
    // The root moved from import origin to the room; do not treat that
    // placement as a physics impulse on the first visible hair frame.
    avatar.vrm.springBoneManager?.reset();
    setChairHeight(motion.getSeatHeight());
    // Preserve the original default seat location; all later targets are local.
    chair.position.z = 1.05 - motion.getMetrics().seatBack;
    refreshChair();
    avatar.updateGarment?.(motion.getMetrics().sitProgress, 0, chairBounds);
    loadMs = performance.now() - loadStart;
    createDebugHelpers();
    const initialInspection = avatar.getDebugState?.();
    if (initialInspection) {
      inspection.bodyMode = initialInspection.mode;
      inspection.dynamics = initialInspection.dynamics;
    }
    syncInspectionUI();
    ready = true;
    window.__debug.ready = true;
    document.querySelector("#loading").hidden = true;
    document.querySelector("#loading").style.display = "none";
    const workbench = new URLSearchParams(location.search).get('workbench') === 'appearance';
    const initialView = new URLSearchParams(location.search).get('view');
    controller?.cameraPreset(workbench ? (fixedViews.has(initialView) ? initialView : 'inspect-face-front') : 'close');
    bindAppearanceWorkbench({avatar,controller});
    refreshUI();
  })
  .catch((error) => {
    // A motion/retarget failure can happen after the avatar factory succeeds.
    // No ready scene may retain this half-initialized primary instance.
    motion?.dispose?.();
    avatar?.dispose?.();
    motion = null; avatar = null; ready = false;
    window.__debug.ready = false;
    document.querySelector("#loading").innerHTML =
      "<strong>角色加载失败</strong><span></span>";
    document.querySelector("#loading span").textContent = error.message;
    console.error(error);
  });
