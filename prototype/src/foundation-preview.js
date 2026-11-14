// Isolated asset qualification viewer. No alternate character controller.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { loadRetargetedMotions } from "./motion-source.js";

const stage = document.querySelector("#stage");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#e7ede3");
scene.add(new THREE.HemisphereLight(0xf1f6ff, 0xa9b9aa, 2.4));
const light = new THREE.DirectionalLight(0xfff4e6, 2.2);
light.position.set(2, 4, 3);
scene.add(light);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.MeshStandardMaterial({ color: "#c8d2c5", roughness: 1 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.012;
scene.add(floor);
const grid = new THREE.GridHelper(6, 30, 0x92a596, 0xb1c1b2);
scene.add(grid);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 30);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
function resize() {
  const r = stage.getBoundingClientRect();
  renderer.setSize(r.width, r.height);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
let vrm,
  mixer,
  motions,
  paused = false,
  action = null,
  mode = "rest",
  last = 0,
  base = true;
const originals = new Map(),
  diagnostic = new Map(),
  outer = [];
function view(angle = 0, face = false) {
  controls.target.set(0, face ? 1.45 : 0.83, 0);
  const d = face ? 0.85 : 3.4;
  camera.position.set(
    Math.sin(angle) * d,
    face ? 1.47 : 1.12,
    Math.cos(angle) * d,
  );
  controls.update();
}
function body(enabled) {
  base = enabled;
  for (const [mesh, mat] of originals)
    mesh.material = enabled ? diagnostic.get(mesh) : mat;
  for (const mesh of outer) mesh.visible = !enabled;
  document
    .querySelectorAll("[data-body]")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String((b.dataset.body === "true") === enabled),
      ),
    );
}
function play(name) {
  mixer.stopAllAction();
  vrm.humanoid.resetNormalizedPose();
  mode = name;
  action = null;
  if (name !== "rest") {
    action = mixer.clipAction(motions.clips[name]);
    action.reset();
    if (name === "sitEnter" || name === "sitExit") {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.play();
  }
  mixer.update(0);
  vrm.update(0);
}
try {
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  const roundtrip =
    new URLSearchParams(location.search).get("source") === "roundtrip";
  const assetUrl =
    "/assets/foundation/" +
    (roundtrip ? "base-female-roundtrip.vrm" : "base-female.vrm");
  const gltf = await loader.loadAsync(assetUrl);
  vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm);
  scene.add(vrm.scene);
  vrm.scene.updateMatrixWorld(true);
  vrm.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (mats.some((m) => /Body_.*SKIN/.test(m.name))) {
      originals.set(mesh, mesh.material);
      diagnostic.set(
        mesh,
        mats.map(
          () =>
            new THREE.MeshStandardMaterial({
              color: "#728e9b",
              roughness: 1,
              side: THREE.DoubleSide,
            }),
        ),
      );
    }
    if (mats.some((m) => /_CLOTH/.test(m.name))) outer.push(mesh);
  });
  motions = await loadRetargetedMotions(vrm);
  mixer = new THREE.AnimationMixer(vrm.scene);
  view();
  body(true);
  const build = await fetch("/build-info.json").then((r) => r.json());
  document.querySelector("#status").textContent =
    (roundtrip ? "Blender 再导出" : "原始导出") +
    " · 候选检查 · " +
    build.shortId;
  document.querySelector("#metrics").textContent = JSON.stringify(
    {
      build: build.shortId,
      asset: "Base_Female / VRoid beta 0.14.0 export",
      expressions: vrm.expressionManager.expressions.map(
        (e) => e.expressionName,
      ),
      retargetRatio: motions.ratio,
      bodyMorphs: "not supplied",
      contactIK: "not applied",
      editableSource: "See foundation toolchain report",
    },
    null,
    2,
  );
  window.__foundation = {
    ready: true,
    vrm,
    mixer,
    motions,
    view,
    body,
    play,
    renderer,
    scene,
    camera,
    build,
    assetUrl,
    pause: (v) => (paused = v),
    advance: (dt) => {
      mixer.update(dt);
      vrm.update(0);
      scene.updateMatrixWorld(true);
    },
    state: () => ({ mode, base, time: action?.time || 0 }),
  };
  document
    .querySelectorAll("[data-body]")
    .forEach((b) => (b.onclick = () => body(b.dataset.body === "true")));
  document
    .querySelectorAll("[data-angle]")
    .forEach((b) => (b.onclick = () => view(Number(b.dataset.angle))));
  document.querySelector("#face").onclick = () => view(0, true);
  document.querySelector("#action").onchange = (e) => play(e.target.value);
  document.querySelector("#pause").onclick = (e) => {
    paused = !paused;
    e.target.textContent = paused ? "继续" : "暂停";
  };
  document.querySelector("#expression").onchange = (e) => {
    vrm.expressionManager.resetValues();
    if (e.target.value) vrm.expressionManager.setValue(e.target.value, 1);
  };
} catch (error) {
  document.querySelector("#status").textContent =
    "候选加载失败：" + error.message;
  throw error;
}
function frame(t) {
  requestAnimationFrame(frame);
  const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
  last = t;
  if (vrm) {
    if (!paused) mixer.update(dt);
    vrm.update(0);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
