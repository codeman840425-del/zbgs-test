import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual, promisify} from 'node:util';
import {buildLibrary, planPath, replaceIndex, withCatalogWriteLock} from './build-library.mjs';
import {editableSources,plantProducer,plantToolchain} from './plant-editable-source.mjs';
import {showcaseTexturePins} from './validate-resource-provenance.mjs';
import {checkManagedOutput,findManagedProject} from './package-company.mjs';
import {verifyWashbasinSources,verifyWashroomDispenserSources} from './validate-resource-provenance.mjs';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {createCompany, deriveCompany} from '../../prototype/src/company/document.js';

const root = path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const catalogPath = 'prototype/src/company/library-catalog.json';
const json = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code,message) => {throw Object.assign(Error(message),{code});};
const parse = bytes => JSON.parse(bytes.toString('utf8'));
const run = promisify(execFile);
const families = {
  'company-desk-lamp-collection': 'desk-lamp',
  'company-screen-partition-collection': 'screen-partition',
  'company-static-textile-collection': 'static-textile',
  'company-baseboard-collection': 'baseboard',
  'company-mouse-pad-collection': 'mouse-pad',
  'company-phone-static-collection': 'phone-static',
  'company-backdrop-fabric-collection': 'backdrop-fabric',
  'company-wall-ambient-collection': 'wall-ambient',
  'company-desktop-plants-collection': 'desktop-plants',
  'company-garment-rack-collection': 'garment-rack',
  'company-enclosed-wardrobe-collection': 'enclosed-wardrobe',
  'company-showcase-product-collection': 'showcase-product',
  'company-singing-stage-collection': 'singing-stage',
  'company-vocal-mic-looks': 'vocal-mic-looks',
  'company-vocal-fit': 'vocal-fit',
  'company-vocal-height': 'vocal-height',
  'company-readable-score': 'readable-score',
  'company-equipment-carts': 'equipment-cart',
  'company-public-washbasins': 'public-washbasin',
  'company-washroom-dispensers': 'washroom-dispenser',
  'company-tea-station-collection': 'tea-station',
  'company-floor-air-collection': 'floor-air',
  'company-wall-hvac-collection': 'wall-hvac',
};
const generatorFiles = {baseboard:'build-baseboards.mjs', 'mouse-pad':'build-mouse-pads.mjs', 'phone-static':'build-phone-static.mjs', 'backdrop-fabric':'build-backdrop-fabric.mjs', 'wall-ambient':'build-wall-ambient.mjs', 'desktop-plants':'build-desktop-plants.mjs', 'garment-rack':'build-garment-rack.mjs', 'enclosed-wardrobe':'build-enclosed-wardrobe.mjs', 'showcase-product':'build-showcase-products.mjs', 'singing-stage':'build-singing-stage.mjs'};
generatorFiles['tea-station'] = 'build-tea-station.mjs';
generatorFiles['floor-air'] = 'build-floor-air.mjs';
generatorFiles['wall-hvac'] = 'build-wall-hvac.mjs';
generatorFiles['vocal-mic-looks'] = 'build-vocal-mic-looks.mjs';
generatorFiles['vocal-fit'] = 'build-vocal-fit.mjs';
generatorFiles['vocal-height'] = 'build-vocal-height.mjs';
generatorFiles['readable-score'] = 'build-readable-score.mjs';
generatorFiles['equipment-cart'] = 'build-equipment-carts.mjs';
generatorFiles['public-washbasin'] = 'build-public-washbasins.mjs';
generatorFiles['washroom-dispenser'] = 'build-washroom-dispensers.mjs';
const productionBranches = {'mouse-pad':'mouse-and-pad', 'backdrop-fabric':'background-fabric', 'wall-ambient':'ambient-led-and-neon', 'desktop-plants':'plant-desktop-installation', 'tea-station':'tea-rest'};
productionBranches['floor-air'] = 'fan-and-air-purifier';
productionBranches['wall-hvac'] = 'hvac';
productionBranches['vocal-mic-looks'] = 'floor-vocal-microphone';
productionBranches['vocal-fit'] = 'floor-vocal-microphone';
productionBranches['vocal-height'] = 'floor-vocal-microphone';
productionBranches['readable-score'] = 'floor-score-stand';
productionBranches['equipment-cart'] = 'cart-and-equipment-storage';
productionBranches['public-washbasin'] = 'sanitary-support';
productionBranches['washroom-dispenser'] = 'sanitary-support';

const garmentBranches = {rack:'garment-rack-wardrobe',garment:'hanging-garment'};
const singingBranches = {vocal:'floor-vocal-microphone',score:'floor-score-stand'};
function belongsToFamily(resource,family) {
  if (['vocal-fit','vocal-height','readable-score','public-washbasin','washroom-dispenser'].includes(family)) return resource?.productionBranch === productionBranches[family] &&
    resource.provenance?.generator === 'scripts/company-platform/'+generatorFiles[family];
  if (family === 'garment-rack') return Object.values(garmentBranches).includes(resource?.productionBranch);
  if (family === 'singing-stage') return Object.values(singingBranches).includes(resource?.productionBranch);
  return family === 'baseboard'
    ? resource?.kind === 'surface-finish' && resource.provenance?.environmentBranch === 'baseboard-and-edge' &&
      isDeepStrictEqual(resource.finish?.allowedSurfaces,['baseboard'])
    : resource?.productionBranch === (productionBranches[family] ?? family);
}

function validateFunction(reference,resource,family,explicitFit) {
  assert(belongsToFamily(resource,family),'Resource does not belong to '+family);
  const comparison = compareFacilityFunction(reference,resource);
  if (!comparison.compatible) {
    assert(['vocal-fit','vocal-height'].includes(family) && comparison.differences.every(d => d.field.startsWith('pickupFit.')),
      'Function or mounting differs from '+reference.id);
    if (!explicitFit) fail('pickup-fit-requires-explicit-publication','A different physical pickup needs a separate fitting ID and --publish-fit');
  }
  if (family === 'baseboard') {
    // Use the normal room admission path for surface kind, materials and profile.
    // Profile and tile scale are appearance choices within the common envelope.
    const catalog = {id:'appearance-validation',version:1,resources:[resource]};
    const document = createCompany({id:'appearance-validation'},catalog);
    document.nodes[1].finishes = {baseboard:{resource:{id:resource.id,version:resource.version}}};
    deriveCompany(document,catalog,{templates:[]});
    if (!resource.finish.profile.some(([depth])=>depth === .02))
      fail('invalid-surface-resource','Baseboard profile must reach its fixed 0.02 m depth');
  }
}

function validateBaseboardTexture(model,resource,texture,entry) {
  const invalid = () => fail('appearance-texture-mismatch',entry.texturePath);
  if (hash(texture) !== entry.textureSha256 || !texture.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    invalid();
  if (model.length < 28 || model.readUInt32LE(0) !== 0x46546c67 || model.readUInt32LE(4) !== 2 ||
      model.readUInt32LE(8) !== model.length || model.readUInt32LE(16) !== 0x4e4f534a)
    invalid();
  const jsonEnd = 20 + model.readUInt32LE(12);
  if (jsonEnd+8 > model.length || model.readUInt32LE(jsonEnd+4) !== 0x004e4942 ||
      jsonEnd+8+model.readUInt32LE(jsonEnd) !== model.length)
    invalid();
  const gltf = parse(model.subarray(20,jsonEnd));
  const target = gltf.nodes?.find(node=>node.name === resource.finish.materialNode);
  const primitive = gltf.meshes?.[target?.mesh]?.primitives?.[0];
  const slot = gltf.materials?.[primitive?.material]?.pbrMetallicRoughness?.baseColorTexture;
  const image = gltf.images?.[gltf.textures?.[slot?.index]?.source];
  const view = gltf.bufferViews?.[image?.bufferView], offset = view?.byteOffset ?? 0;
  if (primitive?.attributes?.TEXCOORD_0 === undefined || image?.mimeType !== 'image/png' ||
      view?.buffer !== 0 || view.byteLength !== texture.length || !Number.isSafeInteger(offset) || offset < 0 ||
      offset + view.byteLength > model.readUInt32LE(jsonEnd))
    invalid();
  const start = jsonEnd + 8 + offset;
  if (!model.subarray(start,start+view.byteLength).equals(texture)) invalid();
}

async function regularFile(relative) {
  const absolute = path.join(root,relative);
  if (await fs.realpath(absolute) !== absolute || !(await fs.lstat(absolute)).isFile())
    fail('appearance-linked-path',relative);
  return fs.readFile(absolute);
}
async function matchesPublishedFile(relative,bytes) {
  try {return (await regularFile(relative)).equals(bytes);}
  catch (error) {if (error.code === 'ENOENT') return false; throw error;}
}
function productionSource(name) {
  if (typeof name !== 'string' || !/^assets-source\/company-[^/]+\//.test(name) ||
      /[\\:\0]/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..'))
    fail('invalid-appearance-source','Expected a project-relative file in assets-source/company-*: '+name);
}
async function ensureDirectory(relative,owned,exclusive=false) {
  let current = root;
  const target = path.join(root,relative);
  for (const name of relative.split('/')) {
    current = path.join(current,name);
    try {await fs.mkdir(current); owned.push(current);}
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if ((exclusive && current === target) || await fs.realpath(current) !== current || !(await fs.lstat(current)).isDirectory())
        fail('appearance-output-conflict',current);
    }
  }
}
async function writeNew(relative,bytes,owned) {
  const file = path.join(root,relative);
  const handle = await fs.open(file,'wx');
  owned.push(file);
  try {await handle.writeFile(bytes); await handle.sync();} finally {await handle.close();}
}

async function publish(recipePath,check,explicitFit) {
  productionSource(recipePath);
  if (!recipePath.endsWith('.json')) fail('invalid-appearance-recipe',recipePath);
  const [originalPlan,originalCatalog,inputBytes] = await Promise.all([planPath,catalogPath,recipePath].map(regularFile));
  const plan = parse(originalPlan), previous = parse(originalCatalog), input = parse(inputBytes);
  const family = families[input.schema];
  if (explicitFit && !['vocal-fit','vocal-height'].includes(family)) fail('invalid-fitting-family','Explicit fitting publication requires a fitted microphone recipe');
  if (typeof family !== 'string' || input.version !== 1 || !Array.isArray(input.designs) || !input.designs.length)
    fail('invalid-appearance-recipe','Expected a version 1 recipe with designs for one of: '+Object.keys(families).join(', '));
  const base = 'assets-source/company-'+family+'-v1';
  const collectionPath = base+'/collection.json';
  if (plan.output !== catalogPath || !Array.isArray(plan.resources) || !Array.isArray(plan.collections) ||
      plan.collections.filter(file => file === collectionPath).length !== 1)
    fail('invalid-appearance-plan',collectionPath);
  const defaults = parse(await regularFile(collectionPath));
  const defaultRefs = defaults.resources.map(entry => previous.resources.find(r => r.id === entry.id && r.version === entry.version));
  const reference = defaultRefs[0];
  assert(belongsToFamily(reference,family),'Missing registered functional reference');
  const generator = 'scripts/company-platform/'+(generatorFiles[family] ?? 'build-'+family+'-collection.mjs');
  const pinnedTools = [{path:generator,sha256:reference.provenance.generatorSha256},
    ...Object.values(reference.provenance.dependencies || {})];
  for (const tool of pinnedTools) {
    if (hash(await regularFile(tool.path)) !== tool.sha256) fail('appearance-tool-pin-mismatch',tool.path);
  }
  const plant = family === 'desktop-plants';
  const garment = family === 'garment-rack' || family === 'enclosed-wardrobe';
  const product = family === 'showcase-product';
  const editablePins = plant || garment || product ? await editableSources(root,input) : null;
  const plantTools = plant ? await plantToolchain(root) : null;
  const tea = family === 'tea-station';
  const teaRoles = {counter:'tea-counter',machine:'tea-machine',cup:'tea-cup'};
  const perDesignSource = family === 'wall-ambient' || plant || product || family === 'enclosed-wardrobe' || tea;
  const artwork = new Map();
  const designBranches = new Map();
  const designRoles = new Map();
  for (const design of input.designs) {
    if (!/^[a-z][a-z0-9-]{0,70}$/.test(design.id) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(design.id) ||
        !Number.isSafeInteger(design.version) || design.version < 1)
      fail('invalid-appearance-identity',String(design.id));
    const branch = family === 'garment-rack' ? garmentBranches[design.type] :
      family === 'singing-stage' ? singingBranches[design.kind] : undefined;
    if (family==='singing-stage' && !Object.hasOwn(singingBranches,design.kind))
      fail('invalid-appearance-recipe','Expected vocal or score for '+design.id);
    if (family === 'garment-rack' && !Object.hasOwn(garmentBranches,design.type))
      fail('invalid-appearance-recipe','Expected rack or garment for '+design.id);
    if (branch) designBranches.set(design.id+'@'+design.version,branch);
    if (tea) {
      if (!Object.hasOwn(teaRoles,design.kind)) fail('invalid-appearance-recipe','Expected counter, machine or cup for '+design.id);
      designRoles.set(design.id+'@'+design.version,teaRoles[design.kind]);
    }
    if (previous.resources.some(r => r.id.toLowerCase() === design.id &&
        (!belongsToFamily(r,family) || (branch && r.productionBranch !== branch) || (tea && r.mountRole !== teaRoles[design.kind]))))
      fail('appearance-id-conflict',design.id+' already belongs to a different family');
    if (design.source) {
      const member = input.sources?.[design.source];
      const source = family === 'desk-lamp' ? input.archive :
        family === 'static-textile' ? input.archives?.[member?.archive] : member;
      productionSource(source?.path);
      const bytes = await regularFile(source.path);
      if (perDesignSource || family === 'garment-rack') {
        productionSource(source.licensePath);
        const license = await regularFile(source.licensePath);
        if (hash(bytes) !== source.sha256 || hash(license) !== source.licenseSha256)
          fail('appearance-source-pin-mismatch',source.path);
        if (family === 'wall-ambient' && source.editable) {
          productionSource(source.editable.path);
          if (hash(await regularFile(source.editable.path)) !== source.editable.sha256)
            fail('appearance-source-pin-mismatch',source.editable.path);
        }
        artwork.set(design.id+'@'+design.version,source);
      }
    }
  }
  // The original producers pin their parameter path. A byte snapshot beside
  // the author's draft lets later edits to that same draft preserve old saves.
  const digest = hash(inputBytes);
  const pinned = recipePath === base+'/parameters.json' ? recipePath : path.posix.join(path.posix.dirname(recipePath),'recipe-'+digest+'.json');
  const output = path.join(await findManagedProject(root) ?? root,'output');
  await checkManagedOutput(path.join(output,'room-appearance-stage'),root,{allowDelivery:false});
  await fs.mkdir(output,{recursive:true});
  if (await fs.realpath(output) !== output || !(await fs.lstat(output)).isDirectory())
    fail('appearance-output-conflict',output);
  const staging = await fs.mkdtemp(path.join(output,'room-appearance-'));
  const staged = path.join(staging,'candidate');
  const ownedFiles = [], ownedDirs = [];
  let committed = false, keepLock = false, stagedRemoved = false;
  async function removeStage() {
    assert.equal(path.dirname(staging),output); assert(path.basename(staging).startsWith('room-appearance-'));
    await fs.rm(staging,{recursive:true,force:true});
    stagedRemoved = true;
  }
  try {
    try {
      if (!(await regularFile(pinned)).equals(inputBytes)) fail('appearance-source-pin-conflict',pinned);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (check) fail('appearance-unregistered',recipePath);
      await writeNew(pinned,inputBytes,ownedFiles);
    }
    try {await run(process.execPath,[plant ? plantProducer : generator,'--output',staged,'--parameters',pinned],{cwd:root,maxBuffer:8*1024*1024});}
    catch (error) {fail('appearance-generation-failed',error.stderr?.trim() || error.message);}
    const generated = parse(await fs.readFile(path.join(staged,collectionPath)));
    assert.equal(generated.sourceParameters,pinned);
    assert.equal(generated.sourceParametersSha256,digest);
    assert.deepEqual(generated.resources.map(r=>[r.id,r.version]),input.designs.map(d=>[d.id,d.version]));
    const items = [], additions = new Set();
    for (const entry of generated.resources) {
      const key = entry.id+'@'+entry.version;
      const dir = 'prototype/public/company-assets/'+family+'-v1/'+entry.id+'/v'+entry.version;
      assert.equal(entry.resourcePath,dir+'/resource.json'); assert.equal(entry.modelPath,dir+'/model.glb');
      const [sidecar,model] = await Promise.all([entry.resourcePath,entry.modelPath].map(file=>fs.readFile(path.join(staged,file))));
      const resource = parse(sidecar);
      assert.equal(resource.id,entry.id); assert.equal(resource.version,entry.version);
      assert.equal(resource.provenance.sourceParameters,pinned); assert.equal(resource.provenance.sourceParametersSha256,digest);
      const branch = designBranches.get(key);
      const role = designRoles.get(key);
      const design = input.designs.find(d => d.id === entry.id && d.version === entry.version);
      const functionalReference = role ? defaultRefs.find(r => r?.mountRole === role) :
        branch ? defaultRefs.find(r => r?.productionBranch === branch) : reference;
      assert(functionalReference && (!branch || resource.productionBranch === branch),'Missing matching branch for '+key);
      let expectedDependencies = functionalReference.provenance.dependencies;
      if(family==='public-washbasin') expectedDependencies=Object.fromEntries(await verifyWashbasinSources(root,resource,input));
      if(family==='washroom-dispenser') expectedDependencies=Object.fromEntries(await verifyWashroomDispenserSources(root,resource,input));
      if(family==='vocal-height'&&design.observation) expectedDependencies={...expectedDependencies,heightObservation:design.observation.source};
      if (perDesignSource || artwork.has(key)) {
        const source = artwork.get(key);
        if (!source) fail('invalid-appearance-source','Missing original artwork for '+key);
        assert.equal(resource.provenance.sourceArtifactPath,source.path);
        assert.equal(resource.provenance.sourceArtifactSha256,source.sha256);
        assert.equal(resource.provenance.sourceAuthor,source.author);
        assert.equal(resource.provenance.sourceLicense,source.license);
        expectedDependencies = {...expectedDependencies,license:{path:source.licensePath,sha256:source.licenseSha256}};
        delete expectedDependencies.editableContour;
        if (family === 'wall-ambient' && source.editable) expectedDependencies.editableContour = source.editable;
        const editable = editablePins?.get(design.source);
        if (product) {
          for (const key of Object.keys(expectedDependencies)) if (key.startsWith('sourceTexture-')) delete expectedDependencies[key];
          delete expectedDependencies.editableSource;
          Object.assign(expectedDependencies,await showcaseTexturePins(root,source));
        }
        if ((garment || product) && editable) expectedDependencies.editableSource = editable;
        if (plant) {
          if (editable) Object.assign(expectedDependencies,{editableSource:editable,geometryCompiler:plantTools.compiler,
            editableSourceValidator:plantTools.validator,producerLock:plantTools.lock});
          const producer=editable ? plantTools.producer : plantTools.compiler;
          assert.equal(resource.provenance.generator,producer.path);assert.equal(resource.provenance.generatorSha256,producer.sha256);
        }
      }
      assert.deepEqual(resource.provenance.dependencies,expectedDependencies);
      if (['vocal-fit','vocal-height'].includes(family) && previous.resources.some(old=>old.id===resource.id &&
          !isDeepStrictEqual(old.microphone?.pickupFit,resource.microphone.pickupFit)))
        fail('pickup-fit-requires-new-id',resource.id);
      validateFunction(functionalReference,resource,family,explicitFit);
      assert.equal(resource.asset.url,entry.modelPath.slice('prototype/public'.length));
      assert.equal(resource.asset.sha256,hash(model)); assert.equal(resource.asset.bytes,model.length);
      assert.equal(entry.sha256,resource.asset.sha256);
      const files = [[entry.modelPath,model],[entry.resourcePath,sidecar]];
      if (family === 'baseboard') {
        assert.equal(entry.texturePath,dir+'/texture.png');
        const texture = await fs.readFile(path.join(staged,entry.texturePath));
        validateBaseboardTexture(model,resource,texture,entry);
        files.push([entry.texturePath,texture]);
      }
      const existing = previous.resources.find(r=>r.id===entry.id && r.version===entry.version);
      const registered = plan.resources.includes(entry.resourcePath) || defaults.resources.some(r=>r.resourcePath===entry.resourcePath);
      if (existing || registered) {
        if (!registered || !isDeepStrictEqual(existing,resource) ||
            !(await Promise.all(files.map(([file,bytes])=>matchesPublishedFile(file,bytes)))).every(Boolean))
          fail('appearance-version-conflict',key);
      } else {
        if (check) fail('appearance-unregistered',key);
        await ensureDirectory(dir,ownedDirs,true);
        for (const [file,bytes] of files) await writeNew(file,bytes,ownedFiles);
        plan.resources.push(entry.resourcePath); additions.add(key);
      }
      items.push({id:entry.id,version:entry.version,resourcePath:entry.resourcePath,sha256:entry.sha256,geometrySha256:entry.geometrySha256,
        ...(family === 'baseboard' ? {texturePath:entry.texturePath,textureSha256:entry.textureSha256} : {})});
    }
    const next = await buildLibrary(plan);
    const old = {...next,resources:next.resources.filter(r=>!additions.has(r.id+'@'+r.version))};
    if (!isDeepStrictEqual(old,previous) || next.resources.length !== previous.resources.length+additions.size)
      fail('appearance-unrelated-catalog-change','Reconcile existing catalog inputs before publication');
    if (!(await regularFile(planPath)).equals(originalPlan) || !(await regularFile(catalogPath)).equals(originalCatalog) ||
        !(await regularFile(recipePath)).equals(inputBytes) || !(await regularFile(pinned)).equals(inputBytes))
      fail('appearance-input-changed','Publication inputs changed');
    await removeStage();
    if (additions.size) {
      await replaceIndex(path.join(root,planPath),json(plan));
      try {await replaceIndex(path.join(root,catalogPath),json(next));}
      catch (error) {
        try {await replaceIndex(path.join(root,planPath),originalPlan);}
        catch (rollback) {
          keepLock = true;
          throw Object.assign(Error('Catalog publication and plan restoration failed: '+rollback.message,{cause:error}),{keepCatalogLock:true});
        }
        throw error;
      }
    }
    committed = true;
    return {status:additions.size?'published':'unchanged',family,sourceParameters:pinned,sourceParametersSha256:digest,items};
  } finally {
    if (!committed && !keepLock) try {
      for (const file of ownedFiles.reverse()) await fs.unlink(file);
      for (const dir of ownedDirs.reverse()) await fs.rmdir(dir);
    } catch (error) {throw Object.assign(error,{keepCatalogLock:true});}
    if (!stagedRemoved) await removeStage();
  }
}

const [mode,recipe,...extra] = process.argv.slice(2);
try {
  if (!['--publish','--check','--publish-fit','--check-fit'].includes(mode) || !recipe || extra.length)
    fail('appearance-usage','node scripts/company-platform/publish-room-appearance.mjs --publish|--check|--publish-fit|--check-fit assets-source/company-.../recipe.json');
  console.log(JSON.stringify(await withCatalogWriteLock(()=>publish(recipe,mode.startsWith('--check'),mode.endsWith('-fit'))),null,2));
} catch (error) {console.error(JSON.stringify({code:error.code??'appearance-publication-failed',message:error.message})); process.exitCode=1;}
