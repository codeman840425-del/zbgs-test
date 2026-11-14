import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import Phaser from "phaser";
import { loadAvatar } from "./assets.js";
import { createMotion } from "./motion.js";
import { loadRetargetedMotions } from "./motion-source.js";
import "./style.css";

// Phaser owns input, path movement, action sequencing and frame scheduling.
// Three.js is a presentation adapter. It never advances root movement itself.
const stage = document.querySelector("#stage");
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
// Seat centre is 0.16 m behind the actor, matching the motion adapter contract.
const chairBounds = [];
const seatRoot = { x: 2.65, z: 1.05 };
const chair = new THREE.Group();
chair.position.set(seatRoot.x, 0, seatRoot.z - 0.16);
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
  { name: "chair", x: seatRoot.x, z: seatRoot.z - 0.4, hw: 0.48, hd: 0.28 },
];
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
function blocked(x, z) {
  return (
    Math.abs(x) > 4.05 ||
    z < -3.05 ||
    z > 3.05 ||
    obstacles.some((o) => Math.abs(x - o.x) < o.hw && Math.abs(z - o.z) < o.hd)
  );
}
function lineClear(a, b) {
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.06);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (blocked(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
      return false;
  }
  return true;
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
  constructor() {
    super("CharacterStudio");
    this.mode = "idle";
    this.modeTime = 0;
    this.speed = 0;
    this.maxSpeed = 0.85;
    this.distance = 0;
    this.path = [];
    this.target = null;
    this.afterWalk = null;
    this.pending = null;
    this.paused = false;
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
    this.input.keyboard.on("keydown-SPACE", (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLButtonElement
      )
        return;
      e.preventDefault();
      this.command({ type: "pause" });
    });
    this.game.events.on("command", (cmd) => this.command(cmd));
    controls = new OrbitControls(camera, this.game.canvas);
    controls.target.set(initialPosition[0], 0.85, initialPosition[2]);
    controls.minDistance = 1.5;
    controls.maxDistance = 13;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.enableDamping = true;
    controls.enablePan = true;
    this.scale.on("resize", resizeThree);
    this.cameraPreset("close", true);
  }
  cancelSequence() {
    this.sequence = [];
    this.sequenceIndex = -1;
    document.querySelector("#sequence-label").textContent =
      "手动体验 · 可以随时暂停或换装";
    document.querySelector("#progress-bar").style.width = "0%";
  }
  command(cmd) {
    if (!ready && cmd.type !== "camera") return;
    if (!["pause", "camera", "speed", "outfit"].includes(cmd.type))
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
        this.paused = !this.paused;
        document.querySelector("#pause").textContent = this.paused
          ? "继续"
          : "暂停";
        document
          .querySelector("#pause")
          .setAttribute("aria-pressed", String(this.paused));
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
      this.modeTime = 0;
      if (motion) {
        motion.setAction(name === "turn" ? "idle" : name);
        this.lastAction = name;
      }
    }
  }
  clearPath() {
    this.path = [];
    this.target = null;
    marker.visible = false;
    this.afterWalk = null;
    this.seatAlign = false;
  }
  action(name) {
    if (name === "sit" && (this.mode === "sit" || this.mode === "stand"))
      name = "stand";
    if ((this.mode === "sit" || this.mode === "stand") && name !== "stand") {
      this.pending = { type: "action", name };
      this.setMode("stand");
      return;
    }
    this.pending = null;
    this.clearPath();
    this.turnRemaining = 0;
    if (name === "sit") {
      this.go(seatRoot.x, seatRoot.z + motion.getSeatApproach(), "sit");
      return;
    }
    if (name === "turn") {
      this.setMode("turn");
      this.turnRemaining = Math.PI * 2;
      return;
    }
    this.setMode(
      name === "dance" ? "dance" : name === "stand" ? "stand" : "idle",
    );
  }
  go(x, z, after = null) {
    if (this.mode === "sit" || this.mode === "stand") {
      this.pending = { type: "walk", x, z, after };
      this.setMode("stand");
      return false;
    }
    const p = pathTo([avatar.root.position.x, avatar.root.position.z], x, z);
    if (!p.length) {
      document.querySelector("#scene-state").textContent =
        "这里有家具，请选择地面空位";
      return false;
    }
    this.path = p;
    this.target = this.path.shift();
    this.afterWalk = after;
    this.turnRemaining = 0;
    this.setMode("walk");
    marker.position.set(x, 0.028, z);
    marker.visible = true;
    return true;
  }
  setSpeed(n) {
    this.maxSpeed = clamp(Number(n), 0.4, 1.4);
    document.querySelector("#speed").value = this.maxSpeed;
    document.querySelector("#speed-label").textContent =
      `${this.maxSpeed < 0.65 ? "慢速" : this.maxSpeed > 1.1 ? "较快" : "正常"} · ${this.maxSpeed.toFixed(2)} m/s`;
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
    this.outfit = Number(n) ? 1 : 0;
    avatar.setOutfit(this.outfit);
    document
      .querySelectorAll("[data-outfit]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(Number(b.dataset.outfit) === this.outfit),
        ),
      );
  }
  reset() {
    this.clearPath();
    this.pending = null;
    this.turnRemaining = 0;
    this.speed = 0;
    this.distance = 0;
    this.yaw = 0;
    avatar.root.position.set(...initialPosition);
    avatar.root.rotation.y = 0;
    this.setMode("idle");
    motion.setAction("idle");
    if (motion.reset) motion.reset();
    this.setSpeed(0.85);
    this.cameraPreset("close");
  }
  cameraPreset(name, immediate = false) {
    cameraMode = name;
    const root = avatar?.root.position || v3(...initialPosition);
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
    for (let outfit = 0; outfit < 2; outfit++) {
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
      `${this.outfit ? "裙装" : "裤装"} · ${s.label || s.type} · ${this.sequenceIndex + 1}/${this.sequence.length}`;
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
    const dt = Math.min(delta / 1000, 0.05);
    frameMs.push(delta);
    if (frameMs.length > 600) frameMs.shift();
    if (ready && !this.paused) this.simulate(dt);
    if (ready && controls) {
      const move = avatar.root.position.clone().sub(followPosition);
      if (cameraMode === "close" && !cameraTween) {
        camera.position.add(move);
        controls.target.add(move);
      }
      followPosition.copy(avatar.root.position);
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
    controls?.update();
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
    this.modeTime += dt;
    let moved = 0;
    this.turning = false;
    const root = avatar.root;
    if (this.target) {
      let dx = this.target[0] - root.position.x,
        dz = this.target[1] - root.position.z,
        dist = Math.hypot(dx, dz);
      if (dist < 0.018) {
        this.target = this.path.shift() || null;
        if (this.target) {
          dx = this.target[0] - root.position.x;
          dz = this.target[1] - root.position.z;
          dist = Math.hypot(dx, dz);
        } else {
          marker.visible = false;
          this.speed = 0;
          if (this.afterWalk === "sit") {
            this.seatAlign = true;
            this.setMode("idle");
          } else this.setMode("idle");
          this.afterWalk = null;
        }
      }
      if (this.target) {
        const heading = Math.atan2(dx, dz),
          angle = Math.atan2(
            Math.sin(heading - this.yaw),
            Math.cos(heading - this.yaw),
          );
        const yawStep = clamp(angle, -dt * 3.2, dt * 3.2);
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
        const desired =
          Math.min(this.maxSpeed, Math.sqrt(2 * 1.8 * remaining)) *
          Math.max(0, Math.cos(angle)) ** 3 *
          cornerFactor;
        const accel = desired < this.speed ? 2.5 : 1.5;
        this.speed += clamp(desired - this.speed, -accel * dt, accel * dt);
        moved = Math.min(dist, this.speed * dt);
        const x = root.position.x + (dx / dist) * moved,
          z = root.position.z + (dz / dist) * moved;
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
    } else this.speed = Math.max(0, this.speed - 2.5 * dt);
    if (this.seatAlign) {
      const delta = Math.atan2(Math.sin(-this.yaw), Math.cos(-this.yaw));
      this.yaw += clamp(delta, -dt * 2.5, dt * 2.5);
      root.rotation.y = this.yaw;
      this.turning = true;
      if (Math.abs(delta) < 0.025) {
        this.seatAlign = false;
        this.setMode("sit");
      }
    }
    if (this.mode === "turn" && this.turnRemaining > 0) {
      const d = Math.min(this.turnRemaining, dt * 0.8);
      this.turnRemaining -= d;
      this.yaw += d;
      root.rotation.y = this.yaw;
      this.turning = true;
      if (this.turnRemaining < 0.0001) this.setMode("idle");
    }
    this.actualSpeed = dt ? moved / dt : 0;
    motion.update(dt, {
      distanceDelta: moved,
      speed: this.actualSpeed,
      moving: !!this.target,
      action: this.mode === "turn" ? "idle" : this.mode,
      turning: this.turning,
    });
    avatar.vrm.update(dt);
    root.updateMatrixWorld(true);
    const m = motion.getMetrics();
    avatar.updateGarment?.(m.sitProgress, dt, chairBounds);
    if (this.mode === "stand" && (m.transitionComplete || this.modeTime > 3)) {
      this.setMode("idle");
      if (this.pending) {
        const cmd = this.pending;
        this.pending = null;
        if (cmd.type === "walk") this.go(cmd.x, cmd.z, cmd.after);
        else this.action(cmd.name);
      }
    }
    if (this.sequence.length) {
      const s = this.sequence[this.sequenceIndex];
      if (s.type === "walk") {
        if (!this.target && this.speed < 0.02) this.nextStep();
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
    mode: c?.mode,
    outfit: c?.outfit,
    outfitInfo: avatar?.getOutfitInfo(),
    speed: c?.actualSpeed,
    maxSpeed: c?.maxSpeed,
    distance: c?.distance,
    facing: c?.yaw,
    position: avatar?.root.position.toArray(),
    target: c?.target,
    path: c?.path,
    collision: avatar
      ? blocked(avatar.root.position.x, avatar.root.position.z)
      : null,
    paused: c?.paused,
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
    `${s.outfit ? "裙装" : "裤装"} · ${names[s.mode] || s.mode}${s.paused ? " · 已暂停" : ""}`;
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
const emit = (cmd) => game.events.emit("command", cmd);
window.__debug = {
  ready: false,
  snapshot,
  action: (name) => emit({ type: "action", name }),
  setSpeed: (value) => emit({ type: "speed", value }),
  setOutfit: (value) => emit({ type: "outfit", value }),
  walkTo: (x, z) => emit({ type: "walk", x, z }),
  runSequence: () => emit({ type: "sequence" }),
  route: (name) => emit({ type: "route", name }),
  pause: () => emit({ type: "pause" }),
  reset: () => emit({ type: "reset" }),
  camera: (name) => emit({ type: "camera", name }),
  avatar: () => avatar,
  motion: () => motion,
  scene: world,
  renderer,
  game,
};
for (const b of document.querySelectorAll("[data-action]"))
  b.onclick = () => emit({ type: "action", name: b.dataset.action });
for (const b of document.querySelectorAll("[data-outfit]"))
  b.onclick = () => emit({ type: "outfit", value: b.dataset.outfit });
for (const b of document.querySelectorAll("[data-speed]"))
  b.onclick = () => emit({ type: "speed", value: b.dataset.speed });
for (const b of document.querySelectorAll("[data-route]"))
  b.onclick = () => emit({ type: "route", name: b.dataset.route });
for (const b of document.querySelectorAll("[data-camera]"))
  b.onclick = () => emit({ type: "camera", name: b.dataset.camera });
document.querySelector("#speed").oninput = (e) =>
  emit({ type: "speed", value: e.target.value });
document.querySelector("#sequence").onclick = () => emit({ type: "sequence" });
document.querySelector("#pause").onclick = () => emit({ type: "pause" });
document.querySelector("#reset").onclick = () => emit({ type: "reset" });
const loadStart = performance.now();
loadAvatar({ scene: world, renderer })
  .then(async (a) => {
    avatar = a;
    avatar.root.position.set(...initialPosition);
    const motions = await loadRetargetedMotions(avatar.vrm);
    motion = createMotion(avatar.vrm, avatar.root, motions);
    motion.setAction("idle");
    motion.update(0, {
      distanceDelta: 0,
      speed: 0,
      moving: false,
      action: "idle",
      turning: false,
    });
    avatar.vrm.update(0);
    // The root moved from import origin to the room; do not treat that
    // placement as a physics impulse on the first visible hair frame.
    avatar.vrm.springBoneManager?.reset();
    setChairHeight(motion.getSeatHeight());
    chair.position.z = seatRoot.z - motion.getMetrics().seatBack;
    chair.updateMatrixWorld(true);
    chairBounds.push(
      new THREE.Box3().setFromObject(chairSeat),
      new THREE.Box3().setFromObject(chairBack),
    );
    // Derive navigation occupancy from the rendered seat. The old hard-coded
    // obstacle was behind it and left the front of the seat walkable.
    const seatBox = chairBounds[0];
    Object.assign(
      obstacles.find((o) => o.name === "chair"),
      {
        x: (seatBox.min.x + seatBox.max.x) / 2,
        z: (seatBox.min.z + seatBox.max.z) / 2,
        hw: (seatBox.max.x - seatBox.min.x) / 2 + 0.1,
        hd: (seatBox.max.z - seatBox.min.z) / 2 + 0.1,
      },
    );
    avatar.updateGarment?.(motion.getMetrics().sitProgress, 0, chairBounds);
    loadMs = performance.now() - loadStart;
    ready = true;
    window.__debug.ready = true;
    document.querySelector("#loading").hidden = true;
    document.querySelector("#loading").style.display = "none";
    controller?.cameraPreset("close");
    refreshUI();
  })
  .catch((error) => {
    document.querySelector("#loading").innerHTML =
      "<strong>角色加载失败</strong><span></span>";
    document.querySelector("#loading span").textContent = error.message;
    console.error(error);
  });
