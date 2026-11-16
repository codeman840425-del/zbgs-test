// CPU lifecycle checks for the reversible inner-top coverage adapter.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageRoot = process.env.GARMENT_COVERAGE_PACKAGE || path.join(root, "prototype");
const require = createRequire(pathToFileURL(path.join(packageRoot, "package.json")));
const esbuild = require("esbuild");
const bundle = await esbuild.build({
  entryPoints: [path.join(root, "prototype/src/garment-coverage.js")], bundle: true,
  write: false, format: "esm", platform: "node", absWorkingDir: root,
  nodePaths: [path.join(packageRoot, "node_modules")], logLevel: "silent",
});
const { createGarmentCoverage } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const THREE = await import(pathToFileURL(path.join(packageRoot, "node_modules/three/build/three.module.js")));

const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const raw = new Uint32Array([0, 1, 2, 0, 2, 3]);
const indexBytes = Buffer.from(raw.buffer);
const fit = {
  schema: "zbgs-garment-coverage-mask-v1", id: "fixture-mask-v1",
  innerTopId: "inner-top", innerTopSha256: "inner-sha", innerTopMaterial: "M00_001_01_Tops_01_CLOTH",
  outerId: "outer", outerAssetSha256: "outer-sha", topFaceCount: 2,
  topIndexComponentType: 5125, topIndexAccessorSha256: digest(indexBytes),
  selectedFaceIds: [0], selectedTriangles: [[0, 1, 2]],
};
const descriptorBytes = Buffer.from(JSON.stringify(fit));
const descriptor = { url: `data:application/json,${encodeURIComponent(descriptorBytes.toString())}`, sha256: digest(descriptorBytes) };
const make = () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(raw), 1));
  geometry.addGroup(0, 3, 0); geometry.addGroup(3, 3, 0);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.material.name = fit.innerTopMaterial;
  return { geometry, mesh, inner: { entry: { id: fit.innerTopId, sha256: fit.innerTopSha256 }, meshes: [mesh] },
    outer: { entry: { id: fit.outerId, sha256: fit.outerAssetSha256 }, meshes: [] } };
};

const checks = [];
const a = make();
const coverage = await createGarmentCoverage({ ...a, descriptor });
assert.equal(coverage.getInfo().active, false); checks.push("exact descriptor and inactive initial state");
const original = a.mesh.geometry;
let update = coverage.prepareEquipmentSet([fit.innerTopId]); update.commit(); update.dispose();
assert.equal(a.mesh.geometry, original); checks.push("inner top alone preserves complete geometry");
update = coverage.prepareEquipmentSet([fit.innerTopId, fit.outerId]); update.commit(); update.dispose();
assert.equal(a.mesh.geometry.index.count, 3); assert.equal(coverage.getInfo().hiddenFaces, 1); checks.push("outer plus inner commits selected face mask");
assert.deepEqual(a.mesh.geometry.groups, [{ start: 0, count: 0, materialIndex: 0 }, { start: 0, count: 3, materialIndex: 0 }]); checks.push("material groups remap across hidden face");
const b = make();
const second = await createGarmentCoverage({ ...b, descriptor });
let secondUpdate = second.prepareEquipmentSet([fit.innerTopId, fit.outerId]); secondUpdate.commit(); secondUpdate.dispose();
assert.equal(b.mesh.geometry.index.count, 3); assert.equal(a.mesh.geometry.index.count, 3); checks.push("two instances own independent covered geometry");
second.dispose(); assert.equal(b.mesh.geometry.index.count, 6); assert.equal(a.mesh.geometry.index.count, 3); checks.push("disposing one instance restores only itself");
update = coverage.prepareEquipmentSet([fit.innerTopId]); update.commit(); update.dispose();
assert.equal(a.mesh.geometry, original); checks.push("removing outer restores complete top");
await assert.rejects(() => createGarmentCoverage({ ...a, outer: { entry: { id: fit.outerId, sha256: "wrong" }, meshes: [] }, descriptor }), /exact inner and outer/); checks.push("wrong outer identity rejects before mutation");
coverage.dispose(); assert.equal(a.mesh.geometry, original); checks.push("dispose restores original geometry");
console.log(JSON.stringify({ schema: "zbgs-garment-coverage-runtime-qa-v1", passed: true, checks, GPUUsed: false,
  actualSourceDescriptorCheckedByPython: true, runtimeOrVisualAcceptance: false }, null, 2));
