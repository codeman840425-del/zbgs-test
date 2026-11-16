import * as THREE from "three";
import resources from "./resources.json" with { type: "json" };
import layouts from "./layouts.json" with { type: "json" };

const geometryTypes = {
  BoxGeometry: THREE.BoxGeometry,
  CylinderGeometry: THREE.CylinderGeometry,
  PlaneGeometry: THREE.PlaneGeometry,
  CapsuleGeometry: THREE.CapsuleGeometry,
  SphereGeometry: THREE.SphereGeometry,
};

function finiteVector(value, length, field) {
  if (!Array.isArray(value) || value.length !== length || !value.every(Number.isFinite))
    throw new TypeError(`Company room ${field} must contain ${length} finite numbers`);
}

function validateNode(node, ids) {
  if (!node || typeof node.id !== "string" || !node.id || ids.has(node.id))
    throw new Error("Company room requires unique nonempty node IDs");
  ids.add(node.id);
  for (const field of ["position", "rotation", "scale"])
    finiteVector(node[field], 3, `${node.id}.${field}`);
  if (node.type === "group") {
    if (!Array.isArray(node.children)) throw new TypeError(`${node.id} requires children`);
    node.children.forEach((child) => validateNode(child, ids));
    return;
  }
  if (node.type !== "mesh" || !geometryTypes[node.geometry?.type])
    throw new Error(`Unsupported company room node or geometry at ${node.id}`);
  const parameters = node.geometry.parameters;
  if (!Array.isArray(parameters) || !parameters.every((v) => typeof v === "boolean" || Number.isFinite(v)))
    throw new TypeError(`Nonfinite geometry parameters at ${node.id}`);
  if (!["MeshBasicMaterial", "MeshStandardMaterial"].includes(node.material?.type))
    throw new Error(`Unsupported company room material at ${node.id}`);
  if (node.material.type === "MeshStandardMaterial" && !Number.isFinite(node.material.roughness))
    throw new TypeError(`Nonfinite roughness at ${node.id}`);
  if (node.material.type === "MeshBasicMaterial") {
    const label = node.material.label;
    if (!label || ![label.width, label.height].every(Number.isFinite))
      throw new TypeError(`Invalid label dimensions at ${node.id}`);
    finiteVector(label.textPosition, 2, `${node.id}.label.textPosition`);
  }
  if (typeof node.castShadow !== "boolean" || typeof node.receiveShadow !== "boolean")
    throw new TypeError(`Missing shadow flags at ${node.id}`);
}

function resolveLayout(layoutId) {
  if (resources.version !== 1 || layouts.version !== 1 || !resources.id || !layouts.id)
    throw new Error("Unsupported company room catalog identity or version");
  const layout = layouts.layouts.find((candidate) => candidate.id === layoutId);
  if (!layout) throw new Error(`Unknown company room layout: ${layoutId}`);
  if (layout.version !== 1 || !["legacy-calibrated", "layout-owned"].includes(layout.initialization))
    throw new Error(`Unsupported company room layout version or initialization: ${layoutId}`);
  if (layout.resourceCatalog.id !== resources.id || layout.resourceCatalog.version !== resources.version)
    throw new Error(`Company room resource catalog mismatch: ${layoutId}`);
  const resourceMap = new Map();
  const nodeIds = new Set();
  for (const resource of resources.resources) {
    if (!resource.id || resourceMap.has(resource.id)) throw new Error("Duplicate company room resource ID");
    validateNode(resource.node, nodeIds);
    resourceMap.set(resource.id, resource);
  }
  const instanceIds = new Set();
  for (const instance of layout.instances) {
    if (!instance.id || instanceIds.has(instance.id)) throw new Error("Duplicate company room instance ID");
    instanceIds.add(instance.id);
    if (!resourceMap.has(instance.resourceId) || instance.resourceVersion !== resources.version)
      throw new Error(`Missing company room resource or version for ${instance.id}`);
    finiteVector(instance.position, 3, `${instance.id}.position`);
    if (!Number.isFinite(instance.yaw)) throw new TypeError(`Nonfinite yaw for ${instance.id}`);
  }
  for (const obstacle of layout.obstacles) {
    if (!obstacle.name || ![obstacle.x, obstacle.z, obstacle.hw, obstacle.hd].every(Number.isFinite))
      throw new TypeError("Invalid company room obstacle");
  }
  return { layout, resourceMap };
}

function createBrowserLabelCanvas(label) {
  const canvas = document.createElement("canvas");
  canvas.width = label.width;
  canvas.height = label.height;
  const context = canvas.getContext("2d");
  context.fillStyle = label.background;
  context.fillRect(0, 0, label.width, label.height);
  context.fillStyle = label.color;
  context.textAlign = label.textAlign;
  context.font = label.font;
  context.fillText(label.text, ...label.textPosition);
  return canvas;
}

function createNode(definition, nodes, createLabelCanvas) {
  let object;
  if (definition.type === "group") {
    object = new THREE.Group();
    for (const child of definition.children) object.add(createNode(child, nodes, createLabelCanvas));
  } else {
    const Geometry = geometryTypes[definition.geometry.type];
    const materialDefinition = definition.material;
    let material;
    if (materialDefinition.type === "MeshBasicMaterial") {
      const texture = new THREE.CanvasTexture(createLabelCanvas(structuredClone(materialDefinition.label)));
      texture.colorSpace = THREE.SRGBColorSpace;
      material = new THREE.MeshBasicMaterial({ map: texture });
    } else {
      material = new THREE.MeshStandardMaterial({
        color: materialDefinition.color,
        roughness: materialDefinition.roughness,
      });
    }
    object = new THREE.Mesh(new Geometry(...definition.geometry.parameters), material);
    object.castShadow = definition.castShadow;
    object.receiveShadow = definition.receiveShadow;
  }
  object.name = definition.name || "";
  object.position.fromArray(definition.position);
  object.rotation.set(...definition.rotation);
  object.scale.fromArray(definition.scale);
  nodes.set(definition.id, object);
  return object;
}

// Canvas creation can be injected for pure CPU checks. No renderer or actor state is created here.
export function createCompanyRoom(world, layoutId = "legacy", { createLabelCanvas = createBrowserLabelCanvas } = {}) {
  if (!world?.isObject3D) throw new TypeError("Company room requires a Three.js world");
  const { layout: definition, resourceMap } = resolveLayout(layoutId);
  const nodes = new Map();
  const roots = definition.instances.map((instance) => {
    const root = createNode(resourceMap.get(instance.resourceId).node, nodes, createLabelCanvas);
    root.position.add(new THREE.Vector3(...instance.position));
    root.rotation.y += instance.yaw;
    return root;
  });
  world.add(...roots);
  const floor = nodes.get("floor"), backWall = nodes.get("back-wall"), leftWall = nodes.get("left-wall");
  const chair = nodes.get("chair"), chairSeat = nodes.get("chair-seat"), chairBack = nodes.get("chair-back");
  const chairLegs = [1, 2, 3, 4].map((index) => nodes.get(`chair-leg-${index}`));
  // Main retains the existing refreshChair update of this mutable array.
  const obstacles = structuredClone(definition.obstacles);
  const layout = Object.freeze({ id: definition.id, version: definition.version, initialization: definition.initialization });

  function setChairHeight(h) {
    if (!Number.isFinite(h)) return;
    chairSeat.position.y = h - 0.035;
    chairBack.position.y = h + 0.23;
    for (const leg of chairLegs) {
      leg.scale.y = (h - 0.07) / 0.42;
      leg.position.y = (h - 0.07) / 2;
    }
  }

  function getSnapshot() {
    return {
      layout: { ...layout },
      chair: { position: chair.position.toArray(), yaw: chair.rotation.y },
      obstacles: structuredClone(obstacles),
    };
  }

  return { floor, backWall, leftWall, chair, chairSeat, chairBack, chairLegs, obstacles, setChairHeight, layout, getSnapshot };
}
