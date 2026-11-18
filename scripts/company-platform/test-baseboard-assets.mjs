import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, Raycaster, RepeatWrapping, SRGBColorSpace, Vector3 } from '../../prototype/node_modules/three/build/three.module.js';
import { createCompanyAssetLibrary } from '../../prototype/src/company/asset-library.js';
import { installNodeImageDecodeShim } from './preflight-library-assets.mjs';

const { PNG } = createRequire(new URL('../../prototype/package.json', import.meta.url))('pngjs');
const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-baseboard-v1';
const cli = path.join(root, 'scripts/company-platform/build-baseboards.mjs');
const relativePath = file => path.relative(root, file).split(path.sep).join('/');
const json = (directory, file) => fs.readFile(path.join(directory, file), 'utf8').then(JSON.parse);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const near = (measured, expected) => assert(Math.abs(measured - expected) < 1e-7, `Expected ${expected}, got ${measured}`);

function projectedFront(profile, height) {
  const intersections = [];
  for (const [[z0, y0], [z1, y1]] of profile.map((p, i) => [p, profile[(i + 1) % profile.length]])) {
    if (Math.min(y0, y1) <= height && height < Math.max(y0, y1))
      intersections.push(z0 + (z1 - z0) * ((height - y0) / (y1 - y0)));
  }
  return Math.max(...intersections);
}

function inspectTriangles(mesh) {
  const points = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex();
  const count = index?.count ?? points.count;
  const edges = new Map(), capArea = [0, 0], bearing = { floor: 0, wall: 0 };
  for (let i = 0; i < count; i += 3) {
    const triangle = [0, 1, 2].map(delta => new Vector3().fromBufferAttribute(points, index?.getX(i + delta) ?? i + delta).applyMatrix4(mesh.matrixWorld));
    const labels = triangle.map(point => point.toArray().map(value => value.toFixed(7)).join(','));
    for (const [j, label] of labels.entries()) {
      const key = [label, labels[(j + 1) % 3]].sort().join('|');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    const [a, b, c] = triangle;
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const area = normal.length() / 2;
    assert(area > 1e-12);
    if (triangle.every(point => Math.abs(point.x + .5) < 1e-7)) {
      assert(normal.x < 0);
      capArea[0] += area;
    }
    if (triangle.every(point => Math.abs(point.x - .5) < 1e-7)) {
      assert(normal.x > 0);
      capArea[1] += area;
    }
    if (triangle.every(point => Math.abs(point.y) < 1e-7)) bearing.floor += area;
    if (triangle.every(point => Math.abs(point.z) < 1e-7)) bearing.wall += area;
  }
  assert([...edges.values()].every(edgesAtPosition => edgesAtPosition === 2), 'Every welded geometric edge must close with exactly two triangles');
  near(bearing.floor, .02);
  near(bearing.wall, .12);
  return { triangles: count / 3, capArea, bearing };
}

async function inspectCollection(directory) {
  const collection = await json(directory, family + '/collection.json');
  const library = createCompanyAssetLibrary({ fetchImpl: async url => {
    const file = await fs.readFile(path.join(directory, 'prototype/public' + url));
    return { ok: true, arrayBuffer: async () => file.buffer.slice(file.byteOffset, file.byteOffset + file.length) };
  } });
  const reports = [];
  try {
    for (const record of collection.resources) {
      const resource = await json(directory, record.resourcePath);
      assert.deepEqual(resource.finish.allowedSurfaces, ['baseboard']);
      assert.equal(resource.kind, 'surface-finish');
      assert.equal(resource.mountRole, 'surface-finish');
      const [solid, texture] = await Promise.all([record.modelPath, record.texturePath].map(file => fs.readFile(path.join(directory, file))));
      assert.equal(sha256(solid), resource.asset.sha256);
      const png = PNG.sync.read(texture, { checkCRC: true });
      const colors = new Set();
      for (let i = 0; i < png.data.length; i += 4) {
        assert.equal(png.data[i + 3], 255);
        colors.add(png.data.readUIntBE(i, 3));
      }
      assert(colors.size > 4, 'Expected a painted or patterned PNG');
      const jsonEnd = 20 + solid.readUInt32LE(12);
      const gltf = JSON.parse(solid.subarray(20, jsonEnd));
      const pngView = gltf.bufferViews[gltf.images[0].bufferView];
      const imageOffset = jsonEnd + 8 + pngView.byteOffset;
      assert(solid.subarray(imageOffset, imageOffset + pngView.byteLength).equals(texture), 'Embedded and exported PNG must match byte-for-byte');
      await library.preload([resource]);
      const { root: object, nodes } = library.instantiate(resource);
      try {
        const mesh = nodes.get(resource.finish.materialNode);
        assert(mesh?.isMesh && mesh.material.map?.isTexture);
        assert.equal(mesh.material.map.colorSpace, SRGBColorSpace);
        assert.equal(mesh.material.map.wrapS, RepeatWrapping);
        assert.equal(mesh.material.map.wrapT, RepeatWrapping);
        assert.deepEqual([mesh.material.map.image.width, mesh.material.map.image.height], [png.width, png.height]);
        object.updateMatrixWorld(true);
        const bounds = new Box3().setFromObject(mesh, true);
        bounds.min.toArray().forEach((value, index) => near(value, [-.5, 0, 0][index]));
        bounds.max.toArray().forEach((value, index) => near(value, [.5, .12, .02][index]));
        const actual = inspectTriangles(mesh);
        actual.capArea.forEach(area => near(area, record.crossSectionAreaSquareMetres));
        const sections = [.031, .092, .101, .109, .115, .119].map(height => {
          const hit = new Raycaster(new Vector3(.013, height, .05), new Vector3(0, 0, -1)).intersectObject(mesh, false)[0];
          assert(hit);
          near(hit.point.z, projectedFront(resource.finish.profile, height));
          return { height, visibleDepth: hit.point.z };
        });
        reports.push({ id: resource.id, version: resource.version, sha256: resource.asset.sha256, textureSha256: sha256(texture),
          textureSize: [png.width, png.height], ...actual, sections });
      } finally {
        object.traverse(node => { node.geometry?.dispose(); node.material?.map?.dispose(); node.material?.dispose(); });
      }
    }
    return reports;
  } finally { library.dispose(); }
}

const [out, ...extra] = process.argv.slice(2);
if (!out || extra.length || out.startsWith('-')) throw new Error('Usage: node scripts/company-platform/test-baseboard-assets.mjs PROJECT_OUTPUT_DIRECTORY');
const output = path.resolve(out);
assert(!relativePath(output).startsWith('../') && path.isAbsolute(output), 'Use project-local output so the negative recipes can be addressed');
await fs.mkdir(output);
installNodeImageDecodeShim();
const defaults = await inspectCollection(root);
assert.equal(defaults.length, 4);
assert.equal(new Set(defaults.map(record => JSON.stringify(record.sections))).size, 4);
assert.equal(new Set(defaults.map(record => record.textureSha256)).size, 4);
const invoke = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
assert.equal(invoke('--check').status, 0);
const alternateFile = family + '/examples/reveal-sage-v2.json';
const alternateRoot = path.join(output, 'alternate');
const built = invoke('--output', alternateRoot, '--parameters', alternateFile);
assert.equal(built.status, 0, built.stderr);
const [variant] = await inspectCollection(alternateRoot);
assert.equal(variant.id, 'baseboard-reveal-sage');
assert.equal(variant.version, 2);
assert.notEqual(variant.sha256, defaults[1].sha256);
assert.notDeepEqual(variant.sections, defaults[1].sections);
const negative = [
  ['duplicate-tail', profile => [...profile, profile[0]]],
  ['overheight', profile => profile.map(([depth, height]) => [depth, height === .12 ? .121 : height])],
  ['self-intersection', () => [[0, 0], [.02, 0], [.002, .1], [.02, .1], [.003, .02], [.02, .12], [0, .12]]],
];
const rejects = [];
for (const [key, change] of negative) {
  const recipe = await json(root, alternateFile);
  recipe.designs[0].profile = change(recipe.designs[0].profile);
  const file = path.join(output, key + '.json'), rejected = path.join(output, key + '-rejected');
  await fs.writeFile(file, JSON.stringify(recipe), { flag: 'wx' });
  const attempt = invoke('--output', rejected, '--parameters', relativePath(file));
  assert.equal(attempt.status, 1);
  const error = JSON.parse(attempt.stderr);
  assert.equal(error.code, 'invalid-baseboard-profile');
  await assert.rejects(fs.access(rejected), { code: 'ENOENT' });
  rejects.push({ key, ...error });
}
assert.equal(invoke('--check').status, 0);
const report = path.join(output, 'report.json');
await fs.writeFile(report, JSON.stringify({ status: 'passed', defaults, variant, rejects, unchangedAfterRejection: true }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'passed', defaults: defaults.length, alternate: { id: variant.id, version: variant.version }, rejects: rejects.length, report }));
