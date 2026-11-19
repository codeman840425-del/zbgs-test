import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const root = fileURLToPath(new URL('../../', import.meta.url));
const family = 'assets-source/company-singing-stage-v1';
const generator = 'scripts/company-platform/build-singing-stage.mjs';
const environment = 'assets-source/company-environment-specs-v1/branches.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const read = rel => fs.readFile(path.join(root, rel));
const dependencyFiles = {
  sourceRecord: 'original/sources.json', license: 'original/CC0-1.0.txt',
  sourceConverter: 'tools/prepare_master.py', editableReader: 'tools/read_blend.py',
  topologyReader: 'tools/gltf_parts.py', textureFilter: 'tools/resize_maps.py'
};

async function regular(rel) {
  assert(typeof rel === 'string' && /^(?:assets-source\/company-|output\/)/u.test(rel) &&
    !/[\\:\x00-\x1f<>|"?*]/u.test(rel) && rel.split('/').every(c => c && !/[. ]$/u.test(c)), 'Unsafe source path: ' + rel);
  const target = path.resolve(root, rel);
  assert.equal(await fs.realpath(target), target, 'Linked source path: ' + rel);
  assert((await fs.lstat(target)).isFile(), 'Expected regular source file: ' + rel);
  return fs.readFile(target);
}

async function pinned(pin) {
  assert(pin.path.startsWith(family + '/'), 'Source outside singing-stage family');
  const bytes = await regular(pin.path);
  assert.equal(hash(bytes), pin.sha256, 'Source hash mismatch: ' + pin.path);
  return bytes;
}

function range(value, low, high, name) {
  assert(Number.isFinite(value) && value >= low && value <= high, name + ' outside supported geometry range');
}

function renderMaster(bytes, design, spec) {
  const length = bytes.readUInt32LE(12), offset = 20 + length;
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.readUInt32LE(offset), bytes.length - offset - 8);
  const gltf = JSON.parse(bytes.subarray(20, offset));
  const binary = Buffer.from(bytes.subarray(offset + 8));
  assert.equal(gltf.images.length, 6);
  assert.equal(gltf.meshes.flatMap(m => m.primitives).reduce((n, p) => n + gltf.accessors[p.indices].count / 3, 0), spec.triangles);
  const node = name => {
    const entries = gltf.nodes.filter(n => n.name === name);
    assert.equal(entries.length, 1, 'Missing or ambiguous source node: ' + name);
    return entries[0];
  };
  if (design.kind === 'vocal') {
    range(design.boomPitchDegrees, -8, -4, 'boomPitchDegrees');
    range(design.clipWidthScale, .93, .945, 'clipWidthScale');
    const joint = node('microphone-stand_boom'), halfAngle = design.boomPitchDegrees * Math.PI / 360;
    joint.rotation = [Math.sin(halfAngle), 0, 0, Math.cos(halfAngle)];
    // The imported master already has a fitted 94% width. For another fit bake the relative scale
    // into the clip geometry and apply the inverse transpose to its normals.
    if (design.clipWidthScale !== .94) {
      const relative = design.clipWidthScale / .94;
      const attributes = gltf.meshes[node('singing-mic-clip').mesh].primitives[0].attributes;
      for (const kind of ['POSITION', 'NORMAL']) {
        const a = gltf.accessors[attributes[kind]], view = gltf.bufferViews[a.bufferView];
        assert(a.componentType === 5126 && a.type === 'VEC3' && !view.byteStride);
        a.min = [Infinity, Infinity, Infinity];
        a.max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < a.count; i++) {
          const start = (view.byteOffset || 0) + (a.byteOffset || 0) + 12 * i;
          let coords = [0, 4, 8].map(n => binary.readFloatLE(start + n));
          coords[0] *= kind === 'NORMAL' ? 1 / relative : relative;
          if (kind === 'NORMAL') {
            const magnitude = Math.hypot(...coords);
            coords = coords.map(v => v / magnitude);
          }
          for (let k = 0; k < 3; k++) {
            const v = Math.fround(coords[k]);
            binary.writeFloatLE(v, start + 4 * k);
            a.min[k] = Math.min(a.min[k], v);
            a.max[k] = Math.max(a.max[k], v);
          }
        }
      }
    }
  } else {
    range(design.scoreLiftMetres, .02, .10, 'scoreLiftMetres');
    node('music-stand_desk').translation[1] += design.scoreLiftMetres;
  }
  gltf.nodes[gltf.scenes[gltf.scene].nodes[0]].name = design.id;
  gltf.asset.generator = 'company-singing-stage-v1 / build-singing-stage.mjs';
  const data = Buffer.from(JSON.stringify(gltf)), padded = Math.ceil(data.length / 4) * 4;
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  [0x46546c67, 2, 28 + padded + binary.length, padded, 0x4e4f534a].forEach((v, i) => header.writeUInt32LE(v, 4*i));
  binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, data, Buffer.alloc(padded - data.length, 0x20), binHeader, binary]);
}

async function readExisting(target) {
  try { return await fs.readFile(target); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
}

async function main() {
  const {values: args} = parseArgs({options: {check:{type:'boolean'},write:{type:'boolean'},output:{type:'string'},
    parameters:{type:'string'},help:{type:'boolean'}}});
  if (args.help) {
    console.log('node scripts/company-platform/build-singing-stage.mjs --check | --write | --output NEW_DIRECTORY [--parameters PROJECT_RELATIVE_JSON]');
    return;
  }
  assert.equal([args.check,args.write,Boolean(args.output)].filter(Boolean).length,1,'Specify one of --check, --write, --output');
  assert(!args.parameters || args.output,'Alternate parameters require --output NEW_DIRECTORY');
  const input = args.parameters ?? family+'/parameters.json', contractPath = family+'/contract.json';
  const [inputBytes, contractBytes, scriptBytes, environmentBytes] = await Promise.all([regular(input),regular(contractPath),read(generator),read(environment)]);
  const recipe = JSON.parse(inputBytes), contract = JSON.parse(contractBytes);
  assert.equal(recipe.schema,'company-singing-stage-collection');
  assert.equal(recipe.version,1);
  assert.equal(contract.schema,'company-singing-stage-contract');
  assert(Array.isArray(recipe.designs) && recipe.designs.length &&
    recipe.designs.every(d=>d && Object.hasOwn(contract.designs,d.kind)), 'Expected vocal or score production designs');
  assert(JSON.parse(environmentBytes).groups.some(g=>g.branches.some(b=>b.id===contract.environmentBranch)));
  const common = {};
  for (const [key, file] of Object.entries(dependencyFiles)) {
    const rel = family+'/'+file;
    common[key] = {path:rel,sha256:hash(await regular(rel))};
  }
  const collection = {schemaVersion:1,id:'company-singing-stage-v1',sourceParameters:input,sourceParametersSha256:hash(inputBytes),
    contract:contractPath,contractSha256:hash(contractBytes),generator,generatorSha256:hash(scriptBytes),resources:[]};
  const files = new Map();
  for (const design of recipe.designs) {
    assert(/^[a-z][a-z0-9-]{0,64}$/u.test(design.id) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/u.test(design.id));
    assert(Number.isSafeInteger(design.version) && design.version > 0 && typeof design.displayName === 'string' && design.displayName.trim());
    const allowed = ['kind','id','version','displayName',...(design.kind==='vocal'?['boomPitchDegrees','clipWidthScale']:['scoreLiftMetres'])];
    assert.deepEqual(Object.keys(design).sort(),allowed.sort(),'Unknown or missing design fields');
    const spec = contract.designs[design.kind];
    await Promise.all([pinned(spec.original),pinned(spec.editable)]);
    const model = renderMaster(await pinned(spec.neutral),design,spec);
    const url = '/company-assets/singing-stage-v1/'+design.id+'/v'+design.version;
    const modelPath = 'prototype/public'+url+'/model.glb', resourcePath = 'prototype/public'+url+'/resource.json';
    assert(!files.has(modelPath),'Duplicate resource identity: '+design.id);
    const provenance = {license:'CC0-1.0 source; project fitting, mesh separation and 512px PBR maps.',
      sourceAuthor:'Grab3D',sourceLicense:'CC0-1.0',sourceDesign:spec.source,sourceUrl:spec.sourceUrl,
      sourceParameters:input,sourceParametersSha256:hash(inputBytes),generator,generatorSha256:hash(scriptBytes),
      functionalContractSource:contractPath,functionalContractSourceSha256:hash(contractBytes),
      sourceArtifactPath:spec.editable.path,sourceArtifactSha256:spec.editable.sha256,
      environmentBranch:contract.environmentBranch,environmentBranchSource:environment,environmentBranchSourceSha256:hash(environmentBytes),
      dependencies:{...common,editableSource:spec.editable,originalGlb:spec.original,fittedMaster:spec.neutral},
      tools:['Node.js native GLB writer','Blender 4.5.9','Python 3.13.11','NumPy 2.4.2','SciPy 1.18.1','Pillow 12.1.0']};
    const asset = {format:'glb',url:url+'/model.glb',bytes:model.length,sha256:hash(model)};
    files.set(modelPath,model);
    files.set(resourcePath,json({id:design.id,version:design.version,displayName:design.displayName,...spec.resource,provenance,asset}));
    collection.resources.push({id:design.id,version:design.version,modelPath,resourcePath,sha256:asset.sha256,triangles:spec.triangles});
  }
  files.set(family+'/collection.json',json(collection));
  const dest = args.output ? path.resolve(args.output) : root;
  if (args.output) await fs.mkdir(dest);
  const additions = [];
  for (const [name, bytes] of files) {
    const current = await readExisting(path.join(dest,name));
    if (current) assert(current.equals(bytes),'Existing version differs: '+name);
    else { assert(!args.check,'Missing generated file: '+name); additions.push([path.join(dest,name),bytes]); }
  }
  for (const [target,bytes] of additions) {
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.writeFile(target,bytes,{flag:'wx'});
  }
  console.log(JSON.stringify({ok:true,resources:collection.resources},null,2));
}

main().catch(error=>{console.error(error.message);process.exitCode=1;});
