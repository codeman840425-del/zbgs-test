import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function probePrint(source, modelPath, resourcePath) {
  const moduleAt = relative => import(pathToFileURL(path.join(source, relative)).href);
  const { Raycaster, Vector3 } = await moduleAt('prototype/node_modules/three/build/three.module.js');
  const { loadShowcaseGlb, parseShowcaseGlb, pngView, inspectShowcaseProduct } =
    await moduleAt('scripts/company-platform/test-showcase-product-assets.mjs');
  const { PNG } = createRequire(path.join(source, 'prototype/package.json'))('pngjs');
  const bytes = await fs.readFile(path.join(source, modelPath));
  const resource = JSON.parse(await fs.readFile(path.join(source, resourcePath)));
  const donor = await fs.readFile(path.join(source, resource.provenance.sourceArtifactPath));
  const { gltf, bin } = parseShowcaseGlb(bytes);
  const tex = resource.provenance.dependencies['sourceTexture-0'];
  const packed = pngView(gltf, bin, gltf.images[0]);
  assert(packed.equals(await fs.readFile(path.join(source, tex.path))));
  assert.equal(createHash('sha256').update(packed).digest('hex'), tex.sha256);
  const art = PNG.sync.read(packed, { checkCRC: true }), geometry = await inspectShowcaseProduct(bytes, resource, donor);
  assert.equal(geometry.triangles, 112);
  assert(geometry.ground.areaSquareMetres > .009 && geometry.bounds.dimensions[0] > geometry.bounds.dimensions[2] * 1.40);
  const scene = await loadShowcaseGlb(bytes);
  const seam = scene.getObjectByName('carton-seal'), print = scene.getObjectByName('carton-print'), body = scene.getObjectByName('carton-board');
  assert(seam?.isMesh && body?.isMesh && print?.material.map?.colorSpace === 'srgb');
  const patches = [[18, 36, [249, 230, 181]], [64, 45, [236, 158, 70]], [15, 145, [23, 60, 56]], [10, 164, [189, 83, 41]]];
  const rays = patches.map(([column, row, expected]) => {
    const u = (column + .5) / art.width, v = (row + .5) / art.height;
    const ray = new Raycaster(new Vector3(-.056 + u * .112, .168 - v * .160, .14), new Vector3(0, 0, -1));
    const hit = ray.intersectObject(scene, true)[0];
    assert.equal(hit.object, print);
    assert(Math.abs(hit.uv.x - u) < 1e-6 && Math.abs(hit.uv.y - v) < 1e-6 && hit.face.normal.z > .999);
    const pixel = Math.floor(hit.uv.y * art.height) * art.width + Math.floor(hit.uv.x * art.width);
    const rgb = Array.from(art.data.subarray(pixel * 4, pixel * 4 + 3));
    assert.deepEqual(rgb, expected);
    return { column, row, rgb, point: hit.point.toArray(), mesh: hit.object.name };
  });
  return { model: resource.asset.sha256, donor: resource.provenance.sourceArtifactSha256, author: resource.provenance.sourceAuthor,
    texture: tex.sha256, dimensions: [art.width, art.height], geometry, rays };
}
