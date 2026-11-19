import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {checkManagedOutput} from './package-company.mjs';

const [sealedArg,manifestSha,workArg,outArg,...extra] = process.argv.slice(2);
assert(sealedArg && /^[a-f0-9]{64}$/.test(manifestSha ?? '') && workArg && outArg && !extra.length,
  'Usage: node test-wall-hvac-receiver.mjs SEALED MANIFEST_SHA FRESH_WORK FRESH_EVIDENCE');

const sealed = await fs.realpath(sealedArg);
const work = path.resolve(workArg), out = path.resolve(outArg);
const within = (root,file) => {
  const relative = path.relative(root,file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
for (const [left,right] of [[sealed,work],[sealed,out],[work,out]]) {
  assert(!within(left,right) && !within(right,left),'Use separate package, working copy and evidence directories.');
}

const exists = async file => fs.lstat(file).then(() => true,error => {
  if (error.code === 'ENOENT') return false;
  throw error;
});
for (const target of [work,out]) {
  await checkManagedOutput(target,undefined,{allowDelivery:false});
  const parent = path.dirname(target);
  assert.equal(path.relative(parent,await fs.realpath(parent)),'','Use an existing real parent directory.');
  assert(!(await exists(target)),'Select a fresh directory: ' + target);
}

const source = path.join(work,'source'), prototype = path.join(source,'prototype');
const tools = path.join(source,'scripts','company-platform');
const temp = path.join(out,'tmp'), npmCache = path.join(out,'npm-cache');
const env = {...process.env,TMP:temp,TEMP:temp,TMPDIR:temp};
const manifestName = 'transfer-manifest.json';
const family = 'assets-source/company-wall-hvac-v1', example = family + '/examples/fifth-ribbed.json';
const home = 'wall-hvac-home', rental = 'wall-hvac-rental';
const originalRef = {id:'wall-ac-ribbed',version:1}, fifthRef = {id:'wall-ac-ribbed-fine',version:1};
const dataDir = (root,key) => key === '@default' ? path.join(root,'data') : path.join(root,'data','rooms',key);
const saveFile = (root,key) => path.join(dataDir(root,key),'save.json');
const deviceId = key => `${key}/ground/live/wall-ac`;
const load = file => import(pathToFileURL(file).href);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pin = async file => sha(await fs.readFile(file));
const json = async file => JSON.parse(await fs.readFile(file,'utf8'));
const write = (file,value) => fs.writeFile(file,JSON.stringify(value,null,2) + '\n',{flag:'wx'});
const run = promisify(execFile);
const report = {status:'running',sealed,manifestSha256:manifestSha,work,commands:[]};

function device(document) {
  const item = document.nodes.find(node => node.id === deviceId(document.id));
  assert(item,'Missing wall unit in ' + document.id);
  return item;
}

async function invoke(label,cwd,entry,args,{expectedExit=0,format='json',command=process.execPath} = {}) {
  const item = {label,cwd,command,entry,args};
  report.commands.push(item);
  let stdout,stderr;
  try {
    ({stdout,stderr} = await run(command,entry ? [entry,...args] : args,
      {cwd,env,windowsHide:true,timeout:240_000,maxBuffer:8*1024*1024}));
    item.exit = 0;
  } catch (error) {
    ({stdout,stderr} = error);
    item.exit = error.code;
    item.signal = error.signal;
  }
  await Promise.all([['stdout',stdout],['stderr',stderr]].map(([stream,value]) =>
    fs.writeFile(path.join(out,`${label}.${stream}.log`),value ?? '',{flag:'wx'})));
  assert.equal(item.exit,expectedExit,`${label}\n${stderr || stdout || ''}`);
  item.response = format === 'json' ? JSON.parse(expectedExit ? stderr : stdout) : stdout.trim();
  return item.response;
}

async function verify(label,root,digest,viewer) {
  const args = [root,digest];
  if (viewer) args.push('--viewer',viewer);
  const receipt = await invoke(label,root,'verify.mjs',args);
  assert.deepEqual([receipt.ok,receipt.manifestSha256,receipt.checkedFiles],[true,digest,receipt.declaredFiles]);
  if (viewer) assert.equal(receipt.scope,'rebuilt-viewer');
  return receipt;
}

async function installLocked() {
  assert(!(await exists(path.join(prototype,'node_modules'))),'The working copy must start without dependencies.');
  let entry, command = 'npm';
  if (process.platform === 'win32') {
    const npmBin = path.join('node_modules','npm','bin','npm-cli.js');
    const candidates = [process.env.npm_execpath,path.join(path.dirname(process.execPath),npmBin),
      ...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean).map(folder => path.join(folder,npmBin))];
    for (const candidate of candidates) {
      if (candidate && path.basename(candidate) === 'npm-cli.js' && await exists(candidate)) {
        entry = path.resolve(candidate);
        break;
      }
    }
    assert(entry,'Cannot locate npm-cli.js in the Node.js installation.');
    command = process.execPath;
  }
  const lockFile = path.join(prototype,'package-lock.json'), expected = await pin(lockFile);
  await invoke('npm-ci',prototype,entry,['ci','--include=dev','--cache',npmCache,'--no-audit','--no-fund'],{command,format:'text'});
  const lock = await json(lockFile);
  for (const name of ['three','vite','pngjs','jpeg-js']) {
    const installed = await json(path.join(prototype,'node_modules',name,'package.json'));
    assert.equal(installed.version,lock.packages['node_modules/' + name].version);
  }
  assert.equal(await pin(lockFile),expected);
  report.lockSha256 = expected;
}

async function build(label,dist) {
  await checkManagedOutput(dist,undefined,{allowDelivery:false});
  const id = await invoke(`${label}-identity`,prototype,path.join('scripts','build-company-id.mjs'),[],{format:'text'});
  assert.match(id,/^[a-f0-9]{12}$/);
  await invoke(label,prototype,path.join('node_modules','vite','bin','vite.js'),
    ['build','--config','vite.company.config.js','--outDir',dist],{format:'text'});
  assert.equal((await json(path.join(dist,'company-build-info.json'))).shortId,id);
  return id;
}

async function inspectScene(packageRoot,manifest,key) {
  const company = path.join(prototype,'src','company');
  const runtimeRoot = path.join(packageRoot,'source','prototype');
  const [THREE,{createCompanyScene},{createCompanyAssetLibrary},{decodeCompanySave},{deriveCompany},
    {installNodeImageDecodeShim},{wallEdge},catalog,templates] = await Promise.all([
    load(path.join(prototype,'node_modules','three','build','three.module.js')),
    ...['render.js','asset-library.js','persistence.js','document.js'].map(name => load(path.join(company,name))),
    load(path.join(tools,'preflight-library-assets.mjs')),load(path.join(company,'wall-visibility.js')),
    ...['catalog','templates'].map(name => json(path.join(runtimeRoot,manifest.runtimeInputs[name]))),
  ]);
  installNodeImageDecodeShim();
  const document = await decodeCompanySave(await fs.readFile(saveFile(packageRoot,key),'utf8'),catalog,templates);
  const node = device(document), derived = deriveCompany(document,catalog,templates);
  const facility = derived.facilities.find(item => item.id === node.id);
  assert(facility?.resource.wallHvac);
  const {resource,floorId} = facility;
  const viewer = path.join(packageRoot,'viewer'), fetched = new Map();
  const library = createCompanyAssetLibrary({fetchImpl:async url => {
    assert(url.startsWith('/company-assets/') && !url.includes('\\'));
    const file = path.resolve(viewer,'.' + url);
    assert(within(viewer,file));
    const bytes = await fs.readFile(file);
    fetched.set(url,sha(bytes));
    return new Response(bytes);
  }});
  let scene;
  try {
    await library.preload([...derived.facilities,...derived.surfaceFinishes].filter(item => item.floorId === floorId)
      .map(item => item.resource));
    scene = createCompanyScene(new THREE.Scene(),document,{catalog,templates,visibleFloorId:floorId,assetLibrary:library,mirrorPreflight:() => {}});
    scene.root.updateMatrixWorld(true);
    assert.equal(fetched.get(resource.asset.url),resource.asset.sha256);
    const unit = scene.root.getObjectByName(node.id);
    assert(unit?.visible);
    const mount = unit.getObjectByName('wall-ac-mount');
    assert(mount?.isMesh);
    const near = (a,b) => assert(Math.abs(a-b) < 1e-5,`${a} differs from ${b}`);
    const world = derived.worlds.get(node.id);
    const anchor = unit.getWorldPosition(new THREE.Vector3());
    const forward = unit.getWorldDirection(new THREE.Vector3());
    anchor.toArray().forEach((n,i) => near(n,world.position[i]));
    forward.toArray().forEach((n,i) => near(n,[Math.sin(world.yaw),0,Math.cos(world.yaw)][i]));
    const plate = new THREE.Box3().setFromObject(mount,true);
    const plateCorners = [plate.min.x,plate.max.x].flatMap(x => [plate.min.z,plate.max.z]
      .map(z => new THREE.Vector3(x,anchor.y,z)));
    const mountDepth = Math.min(...plateCorners.map(point => point.sub(anchor).dot(forward)));
    near(mountDepth,0);
    const back = plate.getCenter(new THREE.Vector3());
    back.addScaledVector(forward,mountDepth - back.clone().sub(anchor).dot(forward));
    const walls = scene.walls.filter(wall => wall.userData.roomId === node.parentId && wall.userData.edge === wallEdge(node.transform.yaw));
    const ray = new THREE.Raycaster(back.clone().addScaledVector(forward,.04),forward.clone().negate(),0,.09);
    const [hit] = ray.intersectObjects(walls,false);
    assert(hit,'The mounting plane must meet room-wall geometry.');
    near(back.distanceTo(hit.point),0);
    const bottom = new THREE.Box3().setFromObject(unit,true).min.y;
    assert(bottom >= 2);
    const {louver,status,closedRadians,modeRadians} = resource.wallHvac;
    const flap = unit.getObjectByName(louver), indicator = unit.getObjectByName(status);
    const state = {...resource.stateDefaults,...node.state};
    near(flap.rotation.x,state.on ? modeRadians[state.mode-1] : closedRadians);
    assert.equal(indicator.material.emissiveIntensity,state.on ? 1 : 0);
    const ribBanks = [1,2,3].flatMap(index => {
      const bank = unit.getObjectByName('wall-ac-vertical-rib-bank-' + index);
      if (!bank) return [];
      const positions = bank.geometry.getAttribute('position');
      const uniqueX = new Set(Array.from({length:positions.count},(_,i) => positions.getX(i).toFixed(6)));
      // Each extruded rib contributes two distinct X planes; banks are mesh-local.
      return [uniqueX.size / 2];
    });
    return {ref:node.resource,asset:resource.asset,state,ribBanks,
      installation:{parentId:node.parentId,transform:node.transform,anchor:anchor.toArray(),forward:forward.toArray(),
        wall:hit.object.name,contact:hit.point.toArray()},
      display:{flapRadians:flap.rotation.x,statusIntensity:indicator.material.emissiveIntensity}};
  } finally {
    scene?.dispose();
    library.dispose();
  }
}

async function sourceScene(root,key) {
  const folder = dataDir(root,key), batch = path.join(folder,'batch-result');
  if (await exists(batch)) return batch;
  const original = path.join(folder,'original-input.json');
  assert(await exists(original),'Missing the package input for ' + key);
  return original;
}

async function main() {
  report.original = await verify('verify-original',sealed,manifestSha);
  const original = await json(path.join(sealed,manifestName));
  assert.deepEqual(original.roomOrigins.map(item => item.key).sort(),['@default',home,rental]);
  await fs.mkdir(work);
  await fs.cp(sealed,work,{recursive:true,force:false,errorOnExist:true});
  report.workingCopy = await verify('verify-pristine-copy',work,manifestSha);
  await installLocked();

  const pristineDist = path.join(out,'rebuilt-original');
  assert.equal(await build('build-original',pristineDist),original.buildId);
  report.rebuiltOriginal = await verify('verify-original-viewer-bytes',sealed,manifestSha,pristineDist);

  const originalHome = await json(saveFile(work,home)), originalRental = await json(saveFile(work,rental));
  assert.equal(originalHome.document.id,home);
  assert.equal(originalRental.document.id,rental);
  assert.deepEqual(device(originalRental.document).resource,originalRef);
  const originalRecipe = await json(path.join(source,family,'parameters.json'));
  const fifthRecipe = await json(path.join(source,example));
  const ribRecipe = originalRecipe.designs.find(item => item.id === originalRef.id && item.version === originalRef.version);
  assert.equal(fifthRecipe.designs.length,1);
  const [fineRecipe] = fifthRecipe.designs;
  assert.deepEqual([ribRecipe.kind,ribRecipe.ribsPerBank,fineRecipe.kind,fineRecipe.ribsPerBank],['ribbed',7,'ribbed',10]);
  report.before = {home:await inspectScene(sealed,original,home),rental:await inspectScene(sealed,original,rental)};
  assert.deepEqual(report.before.rental.ribBanks,[7,7,7]);

  const edited = path.join(out,'rental-edited'), ops = path.join(out,'replace-rental-hvac.ops.json');
  const editArgs = ['apply',saveFile(work,rental),ops,edited,'--room',rental];
  await write(ops,[{type:'replace-resource',id:deviceId(rental),resource:fifthRef}]);
  const beforePin = await pin(saveFile(work,rental));
  const rejected = await invoke('reject-unregistered-replacement',work,'edit.mjs',editArgs,{expectedExit:1});
  assert.deepEqual([rejected.ok,rejected.code,rejected.path],[false,'missing-resource-version',deviceId(rental)]);
  assert(!(await exists(edited)));
  assert.equal(await pin(saveFile(work,rental)),beforePin);
  report.rejection = {...rejected,saveSha256:beforePin};

  const publish = (label,mode) => invoke(label,source,path.join(tools,'publish-room-appearance.mjs'),[mode,example]);
  const publication = await publish('publish-fifth-look','--publish');
  assert.deepEqual([publication.status,publication.family,publication.items.length],['published','wall-hvac',1]);
  const [published] = publication.items;
  assert.deepEqual({id:published.id,version:published.version},fifthRef);
  assert.equal(publication.sourceParametersSha256,await pin(path.join(source,example)));
  assert.deepEqual(await publish('reproduce-fifth-look','--check'),{...publication,status:'unchanged'});
  report.fifth = {recipe:example,recipeSha256:publication.sourceParametersSha256,ribsPerBank:fineRecipe.ribsPerBank,...published};

  const expected = structuredClone(originalRental.document);
  expected.revision++;
  device(expected).resource = fifthRef;
  const retried = await invoke('retry-replacement-after-registration',work,'edit.mjs',editArgs);
  assert.deepEqual([retried.ok,retried.id,retried.revision],[true,rental,expected.revision]);
  const editedSave = path.join(edited,'save.json'), editedEnvelope = await json(editedSave);
  assert.deepEqual(editedEnvelope.document,expected);

  const derivedDist = path.join(out,'rebuilt-edited'), derivative = path.join(out,'derived-package');
  const buildId = await build('build-edited',derivedDist);
  assert.notEqual(buildId,original.buildId);
  const defaultCompany = (await json(saveFile(work,'@default'))).document.id;
  assert([home,rental].includes(defaultCompany));
  const packaged = await invoke('package-both-rooms',work,path.join(tools,'package-company.mjs'),[
    derivedDist,buildId,defaultCompany === rental ? editedSave : await sourceScene(work,'@default'),derivative,'--source',source,
    '--room',home,await sourceScene(work,home),'--room',rental,editedSave,
  ]);
  assert.deepEqual([packaged.ok,packaged.rooms],[true,[home,rental]]);
  const derived = await json(path.join(derivative,manifestName));
  const derivedPin = await pin(path.join(derivative,manifestName));
  report.derived = await verify('verify-derived',derivative,derivedPin);

  const homePrefix = `data/rooms/${home}/`;
  const originalHomeFiles = original.files.filter(file => file.path.startsWith(homePrefix));
  assert(originalHomeFiles.length >= 3);
  assert.deepEqual(derived.files.filter(file => file.path.startsWith(homePrefix)),originalHomeFiles);
  for (const file of originalHomeFiles) assert.equal(await pin(path.join(derivative,file.path)),file.sha256,file.path);
  report.homePreserved = originalHomeFiles;

  const reopened = {};
  for (const [roomKey,expectedEnvelope] of [[home,originalHome],[rental,editedEnvelope],
    ['@default',defaultCompany === rental ? editedEnvelope : await json(saveFile(work,'@default'))]]) {
    const file = saveFile(derivative,roomKey);
    const validation = await invoke(`reopen-${expectedEnvelope.document.id}${roomKey === '@default' ? '-default' : ''}`,
      work,'edit.mjs',['validate',file]);
    assert.deepEqual([validation.ok,validation.id,validation.revision],[true,expectedEnvelope.document.id,expectedEnvelope.document.revision]);
    assert.deepEqual(await json(file),expectedEnvelope);
    reopened[roomKey] = {saveSha256:await pin(file),...validation};
  }
  if (defaultCompany === home) assert.equal(reopened['@default'].saveSha256,await pin(saveFile(work,'@default')));
  report.reopened = reopened;
  report.after = {home:await inspectScene(derivative,derived,home),rental:await inspectScene(derivative,derived,rental)};
  assert.deepEqual(report.after.home,report.before.home);
  const {rental:before} = report.before, {rental:after} = report.after;
  assert.deepEqual(after.ref,fifthRef);
  assert.deepEqual(after.ribBanks,[10,10,10]);
  assert.equal(after.asset.sha256,published.sha256);
  assert.notEqual(after.asset.sha256,before.asset.sha256);
  for (const field of ['state','installation','display']) assert.deepEqual(after[field],before[field]);
  assert.equal(await pin(saveFile(work,rental)),beforePin);
  report.pristineAfterWork = await verify('verify-original-after-work',sealed,manifestSha);
  report.derivedAfterReopen = await verify('verify-derived-after-reopen',derivative,derivedPin);
  report.status = 'passed';
}

await fs.mkdir(out);
try {
  await fs.mkdir(temp);
  await main();
  console.log(JSON.stringify({status:report.status,report:path.join(out,'report.json')},null,2));
} catch (error) {
  report.status = 'failed';
  report.error = {message:error.message,stack:error.stack};
  console.error(error);
  process.exitCode = 1;
  if (report.original) {
    try {
      report.originalAfterFailure = await verify('verify-original-after-failure',sealed,manifestSha);
    } catch (verificationError) {
      report.originalAfterFailure = {ok:false,message:verificationError.message};
    }
  }
} finally {
  await write(path.join(out,'report.json'),report);
}
