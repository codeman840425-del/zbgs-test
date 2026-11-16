import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const root = new URL('../../', import.meta.url);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const sourceRoot = 'assets-source/company-ceiling-finishes-v1';
const outputRoot = 'prototype/public/company-assets/ceiling-finishes-v1';
const evidenceRoot = 'evidence/company-ceiling-production-v1';
const generatorSha256 = sha256(await fs.readFile(new URL(import.meta.url)));

const designIds = ['ceiling-panel-grid', 'ceiling-perforated', 'ceiling-woven', 'ceiling-linear'];
const patternById = {
  'ceiling-panel-grid': 'panel-grid',
  'ceiling-perforated': 'perforated',
  'ceiling-woven': 'woven',
  'ceiling-linear': 'linear'
};
const parameterKeys = {
  'panel-grid': 'panelPx',
  perforated: 'holePx',
  woven: 'weavePx',
  linear: 'linePx'
};

const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
const blend = (base, accent, amount) => base.map((value, index) =>
  Math.round(value + (accent[index] - value) * amount));

function validateDesign(design) {
  if (!design || typeof design !== 'object') throw new Error('Design must be an object');
  if (!designIds.includes(design.id) || patternById[design.id] !== design.pattern || parameterKeys[design.pattern] === undefined || design.surface !== 'ceiling') {
    throw new Error('Ceiling design identity, pattern, or surface is invalid');
  }
  const parameter = parameterKeys[design.pattern];
  const keys = design.params && typeof design.params === 'object' ? Object.keys(design.params) : [];
  const period = design.params?.[parameter];
  if (keys.length !== 1 || !Number.isInteger(period) || period < 16 || period > 128 || 512 % period !== 0) {
    throw new Error('Pattern period must be one integer parameter from 16 to 128 pixels that divides 512');
  }
  if (!Array.isArray(design.tile) || design.tile.length !== 2 ||
      !design.tile.every(value => Number.isFinite(value) && value >= 0.1 && value <= 4)) {
    throw new Error('tile must contain two finite metre values from 0.1 to 4');
  }
  for (const color of [design.base, design.accent]) {
    if (!Array.isArray(color) || color.length !== 3 ||
        !color.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
      throw new Error('base and accent must be RGB integer triples');
    }
  }
}

/** Return the generated RGB value at a pixel in the 512px periodic tile. */
export function pixelAt(design, x, y) {
  validateDesign(design);
  x = mod(x, 512);
  y = mod(y, 512);
  const period = design.params[parameterKeys[design.pattern]];
  const { base, accent } = design;
  if (design.pattern === 'panel-grid') {
    const edge = Math.max(2, Math.floor(period / 16));
    const xIn = mod(x, period);
    const yIn = mod(y, period);
    if (xIn < edge || yIn < edge || xIn >= period - edge || yIn >= period - edge) return accent;
    const inset = Math.min(xIn, yIn, period - 1 - xIn, period - 1 - yIn) / (period / 2);
    return blend(base, accent, 0.08 * Math.max(0, 1 - inset));
  }
  if (design.pattern === 'perforated') {
    const dx = mod(x, period) + 0.5 - period / 2;
    const dy = mod(y, period) + 0.5 - period / 2;
    const radius = period * 0.27;
    const distance = Math.hypot(dx, dy);
    if (distance <= radius) return accent;
    if (distance <= radius + Math.max(1, period / 32)) return blend(base, accent, 0.45);
    return base;
  }
  if (design.pattern === 'woven') {
    const band = Math.max(4, Math.floor(period / 4));
    const xBand = Math.floor(mod(x, period) / band);
    const yBand = Math.floor(mod(y, period) / band);
    const xThread = mod(x, band) < Math.max(2, Math.floor(band / 5));
    const yThread = mod(y, band) < Math.max(2, Math.floor(band / 5));
    if (xThread && yThread) return accent;
    if (xThread || yThread) return blend(base, accent, (xBand + yBand) % 2 ? 0.55 : 0.35);
    return blend(base, accent, (xBand + yBand) % 2 ? 0.12 : 0);
  }
  const lineWidth = Math.max(2, Math.floor(period / 10));
  const yIn = mod(y, period);
  if (yIn < lineWidth) return accent;
  const xIn = mod(x, period);
  if (xIn < Math.max(1, Math.floor(period / 32)) && yIn > period / 4 && yIn < period * 0.75) return blend(base, accent, 0.45);
  return blend(base, accent, 0.06 * Math.sin((yIn / period) * Math.PI) ** 2);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

/** Encode the design as a deterministic 512x512 RGBA PNG. */
export function texture(design) {
  validateDesign(design);
  const width = 512;
  const height = 512;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rows[(width * 4 + 1) * y] = 0;
    for (let x = 0; x < width; x += 1) {
      const color = pixelAt(design, x, y);
      const offset = (width * 4 + 1) * y + 1 + x * 4;
      rows[offset] = color[0];
      rows[offset + 1] = color[1];
      rows[offset + 2] = color[2];
      rows[offset + 3] = 255;
    }
  }
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([header, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(rows, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}

function aligned(buffer) {
  const source = ArrayBuffer.isView(buffer)
    ? Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : Buffer.from(buffer);
  return Buffer.concat([source, Buffer.alloc((4 - (source.length % 4)) % 4)]);
}

/** Pack one inner-facing ceiling quad and its PNG into a GLB. */
export function glb(design, image = texture(design)) {
  validateDesign(design);
  if (!Buffer.isBuffer(image) || image.length < 32) throw new Error('image must be a non-empty PNG buffer');
  const position = new Float32Array([-0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, -0.5]);
  const normal = new Float32Array([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0]);
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const indices = new Uint16Array([0, 2, 1, 0, 3, 2]);
  const chunks = [];
  let offset = 0;
  const add = value => {
    const bytes = aligned(value);
    const range = [offset, bytes.length];
    chunks.push(bytes);
    offset += bytes.length;
    return range;
  };
  const positionView = add(position);
  const normalView = add(normal);
  const uvView = add(uv);
  const indexView = add(indices);
  const imageView = add(image);
  const binary = Buffer.concat(chunks);
  const json = {
    asset: { version: '2.0', generator: 'company-ceiling-finishes-v1' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'finish-surface', mesh: 0 }],
    meshes: [{ name: 'finish-surface', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: positionView[0], byteLength: positionView[1] },
      { buffer: 0, byteOffset: normalView[0], byteLength: normalView[1] },
      { buffer: 0, byteOffset: uvView[0], byteLength: uvView[1] },
      { buffer: 0, byteOffset: indexView[0], byteLength: indexView[1], target: 34963 },
      { buffer: 0, byteOffset: imageView[0], byteLength: imageView[1] }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-0.5, 0, -0.5], max: [0.5, 0, 0.5] },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: 3, componentType: 5123, count: 6, type: 'SCALAR' }
    ],
    images: [{ bufferView: 4, mimeType: 'image/png' }],
    textures: [{ sampler: 0, source: 0 }],
    samplers: [{ wrapS: 10497, wrapT: 10497, magFilter: 9729, minFilter: 9987 }],
    materials: [{ name: 'finish-surface', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.72 } }]
  };
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const binaryChunk = Buffer.concat([binary, Buffer.alloc((4 - (binary.length % 4)) % 4)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binaryChunk.length, 8);
  const chunk = (type, value) => {
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.writeUInt32LE(value.length, 0);
    chunkHeader.writeUInt32LE(type, 4);
    return Buffer.concat([chunkHeader, value]);
  };
  return Buffer.concat([header, chunk(0x4e4f534a, jsonChunk), chunk(0x004e4942, binaryChunk)]);
}

function resourceFor(design, sourceBytes, image, model) {
  return {
    id: design.id,
    version: 1,
    kind: 'surface-finish',
    displayName: design.label,
    mountRole: 'surface-finish',
    coordinates: { units: 'metres', up: '+Y', forward: '+Z' },
    finish: { allowedSurfaces: ['ceiling'], materialNode: 'finish-surface', tileMeters: design.tile },
    materialSlots: { finish: ['finish-surface'] },
    stateDefaults: {},
    asset: { format: 'glb', url: `/company-assets/ceiling-finishes-v1/${design.id}/v1/model.glb`, sha256: sha256(model), bytes: model.length },
    provenance: {
      license: 'Project-authored procedural surface sample. No external art assets.',
      sourceParameters: `${sourceRoot}/${design.id}.json`,
      sourceParametersSha256: sha256(sourceBytes),
      generator: 'scripts/company-platform/build-ceiling-finishes.mjs',
      generatorSha256,
      sourceParametersSummary: design.params,
      productionDependencies: [],
      outputs: { textureSha256: sha256(image), textureBytes: image.length, modelSha256: sha256(model), modelBytes: model.length }
    }
  };
}

export async function build({ check = false } = {}) {
  const records = [];
  const resources = [];
  for (const id of designIds) {
    const sourcePath = `${sourceRoot}/${id}.json`;
    const sourceBytes = await fs.readFile(new URL(sourcePath, root));
    const design = JSON.parse(sourceBytes);
    if (design.id !== id) throw new Error(`Source identity differs from filename: ${id}`);
    validateDesign(design);
    const image = texture(design);
    const model = glb(design, image);
    const resource = resourceFor(design, sourceBytes, image, model);
    const directory = `${outputRoot}/${id}/v1`;
    const outputs = [
      ['texture.png', image],
      ['model.glb', model],
      ['resource.json', Buffer.from(`${JSON.stringify(resource, null, 2)}\n`)]
    ];
    for (const [name, bytes] of outputs) {
      const target = new URL(`${directory}/${name}`, root);
      if (check) {
        const current = await fs.readFile(target);
        if (!current.equals(bytes)) throw new Error(`Output differs: ${target.pathname}`);
      } else {
        await fs.mkdir(new URL('./', target), { recursive: true });
        await fs.writeFile(target, bytes);
      }
    }
    resources.push(`${directory}/resource.json`);
    records.push({ id, pattern: design.pattern, period: design.params[parameterKeys[design.pattern]], sourceParametersSha256: sha256(sourceBytes), textureSha256: sha256(image), textureBytes: image.length, modelSha256: sha256(model), modelBytes: model.length });
  }
  const collection = Buffer.from(`${JSON.stringify({ schemaVersion: 1, generator: 'scripts/company-platform/build-ceiling-finishes.mjs', generatorSha256, resources }, null, 2)}\n`);
  const collectionTarget = new URL(`${sourceRoot}/collection.json`, root);
  if (check) {
    const current = await fs.readFile(collectionTarget);
    if (!current.equals(collection)) throw new Error('Collection differs');
  } else await fs.writeFile(collectionTarget, collection);
  return { status: 'passed', mode: check ? 'check' : 'build', resources: records };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log(JSON.stringify(await build({ check: process.argv.includes('--check') })));
}
