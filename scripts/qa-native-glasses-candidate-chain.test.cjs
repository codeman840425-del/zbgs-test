const assert = require('node:assert/strict');
const {createHash, randomUUID} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const test = require('node:test');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {run, loadCases, sourceMeshPositions, expectedTempleGeometry, checkGeometry} = require('./qa-native-glasses-candidate-chain.cjs');

const project = path.resolve(__dirname,'..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function scratch() {
  const prefix = await projectOutput(path.join(project,'output','glasses-chain-test-'),await productionRoot());
  await fs.mkdir(path.dirname(prefix),{recursive:true});
  return fs.mkdtemp(prefix);
}

test('rejects external destinations, project escapes and redirected output before reading cases', async()=>{
  const file = path.join(project,'missing-glasses-test-input.json');
  const outside = path.join(path.dirname(project),'glasses-output-'+randomUUID());
  const drive = path.join(path.parse(project).root,'glasses-output-'+randomUUID());
  const workspace = await scratch();
  const link = path.join(workspace,'redirected');
  try {
    for (const destination of [outside,drive,path.join(project,'..',path.basename(outside))]) {
      await assert.rejects(run('http://127.0.0.1:9/',destination,file),{code:'outside-project'});
      await assert.rejects(fs.lstat(destination),{code:'ENOENT'});
    }
    await fs.symlink(path.dirname(project),link,process.platform==='win32'?'junction':'dir');
    await assert.rejects(run('http://127.0.0.1:9/',path.join(link, path.basename(outside)),file),{code:'outside-project'});
    if (process.platform==='win32') {
      await assert.rejects(run('http://127.0.0.1:9/',path.join(workspace,'NUL'),file),/Unsupported Windows output path/);
    }
    await assert.rejects(fs.lstat(outside),{code:'ENOENT'});
  } finally {
    await fs.unlink(link).catch(error=>{if(error.code!=='ENOENT')throw error;});
    await fs.rm(workspace,{recursive:true,force:true});
  }
});

test('pins original 1K archive records and rejects bad or ambiguous case inputs', async()=>{
  const workspace = await scratch();
  try {
    const signed = path.join(project,'evidence/m2-uniform-lite-operator-v1/records.json');
    const file = path.join(workspace,'cases.json');
    const config = {
      schema:'native-glasses-candidate-cases-v1', buildId:'a'.repeat(12), sourceDigest:'a'.repeat(64),
      signedRecords:{path:path.relative(workspace,signed),sha256:sha(await fs.readFile(signed))},
      cases:[
        {bodyType:'source-female-uniform-texture-v1',bodySHA256:'1049f87a865e523e02b53d9985a37aa5229dd2221b7a9645f2261f16d35c172c',
          recordSha256:'e9a1c33db6c2b119f1b0c2b97b5a1eb1101352efdd356692052c872ce33ec757',fitSHA256:'b'.repeat(64)},
        {bodyType:'source-male-cc0-texture-release-v1',bodySHA256:'2e66ee6c88524bca3f61b834672e89d3146f9f41859811d2159a01c0edf10617',
          recordSha256:'54ade1c32e23e7cb509626c175923e59b10c1c2d331aba08dce09002f9b048e2',fitSHA256:'c'.repeat(64)},
      ],
    };
    async function read(value) {
      await fs.writeFile(file, JSON.stringify(value));
      return loadCases(file);
    }
    const parsed = await read(config);
    assert.deepEqual(parsed.fixed,{buildId:config.buildId,sourceDigest:config.sourceDigest});
    assert.deepEqual(parsed.cases.map(row=>row.record.identity.id),['uniform-lite-female-v1','uniform-lite-male-v1']);
    assert.equal(parsed.signedRecords.path,await fs.realpath(signed));
    for (const [change,message] of [
      [value=>value.cases[0].bodyType='../other', /Invalid glasses case identity/],
      [value=>value.cases[0].fitSHA256=['b'.repeat(64)], /Invalid glasses case identity/],
      [value=>value.cases.push(value.cases[0]), /Duplicate glasses body type/],
      [value=>value.cases[0].bodySHA256='d'.repeat(64), /Expected values to be strictly equal/],
      [value=>value.signedRecords.sha256='d'.repeat(64), /Signed records file SHA-256 mismatch/],
      [value=>value.signedRecords.path='missing-signed-records.json', /ENOENT/],
    ]) {
      const wrong = structuredClone(config);
      change(wrong);
      await assert.rejects(read(wrong),message);
    }
    const retry = await read(config);
    assert.equal(retry.caseFile.sha256,parsed.caseFile.sha256);
  } finally {
    await fs.rm(workspace,{recursive:true,force:true});
  }
});

test('legacy case defaults and actual original candidate geometry remain compatible on CPU', async()=>{
  const game = path.join(project,'prototype');
  const publicRoot = path.join(game,'public');
  const {cases} = await loadCases();
  assert.deepEqual(cases.map(row=>row.bodyType),['native-contour-roundness-a-v1','native-contour-cheek-b-v1']);
  const manifest = JSON.parse(await fs.readFile(path.join(publicRoot,'assets/native-glasses-candidate-v2/manifest.json')));
  const asset = await fs.readFile(path.join(publicRoot,'assets/m1c/studio-glasses-v1.glb'));
  const positions = await sourceMeshPositions(asset);
  const {fitGlassesTemples, validateTempleProfile} = await import(pathToFileURL(path.join(game,'src/glasses-temple-fit.js')).href);
  const modulePath = require.resolve('../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const {GLTFLoader} = await import(pathToFileURL(modulePath).href);
  const original = {fetch:globalThis.fetch, location:globalThis.location};
  try {
    globalThis.location={search:'?glassesFit=candidate'};
    for (const {bodyType,bodySHA256} of cases) {
      const entry = manifest.profiles.find(row=>row.bodyType===bodyType);
      assert.equal(entry.bodySHA256,bodySHA256);
      const bytes = await fs.readFile(path.join(publicRoot,entry.url.slice(1)));
      assert.equal(sha(bytes),entry.sha256);
      const profile = JSON.parse(bytes);
      const accessorySHA256=sha(asset);
      assert(validateTempleProfile(profile,bodySHA256,accessorySHA256));
      const expected = expectedTempleGeometry(profile,positions);
      const {scene} = await new GLTFLoader().parseAsync(asset.buffer.slice(asset.byteOffset,asset.byteOffset+asset.byteLength),'');
      globalThis.fetch = async url=>{assert.equal(url,entry.url);return new Response(bytes);};
      const identity = await fitGlassesTemples(scene,{bodySHA256,accessorySHA256});
      assert.equal(identity.sha256,entry.sha256);
      assert.equal(identity.sourceGeometryUnmodified,true);
      const actual = {};
      scene.traverse(mesh=>{if(mesh.isMesh)actual[mesh.name]=[...mesh.geometry.attributes.position.array];});
      const replay = checkGeometry(expected,actual);
      assert.deepEqual(replay.temples.map(row=>row.rings.length),[4,4]);
      actual.Temple1[0] += .0001;
      assert.throws(()=>checkGeometry(expected,actual),/Loaded vertices differ.*Temple1/);
    }
  } finally {
    globalThis.fetch=original.fetch;
    if (original.location===undefined) delete globalThis.location;
    else globalThis.location=original.location;
  }
});
