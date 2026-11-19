import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {checkManagedOutput} from './package-company.mjs';

const project = path.resolve(import.meta.dirname, '../..');
const keys = ['singing-studio', 'singing-rental'];
const originalResource = {id:'floor-vocal-mic-boom',version:1};
const fittedResource = {id:'floor-vocal-mic-disc-fit-lower',version:1};
const predecessorPin = '5c676cafa500ac5fc79d2461935fc323844e02fa0a1baa01c8025cd75d3e4012';
const manifestName = 'transfer-manifest.json';
const run = promisify(execFile);
const read = async file => JSON.parse(await fs.readFile(file,'utf8'));
const sha = data => createHash('sha256').update(data).digest('hex');
const shaFile = async file => sha(await fs.readFile(file));
const load = file => import(pathToFileURL(file).href);
const inDirectory = (parent,child) => {
  const relative = path.relative(parent,child);
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..'+path.sep);
};
const mic = document => document.nodes.find(node => node.id === document.singingRooms[0].roles.mic);
const stablePoint = ({id,kind,companyId,roomId,floorId,facilityId,slotId,capacity,clearance,contact,local,
  performerReferences,transform,facilityTransform,approachPosition,exitPosition}) => ({
  id,kind,companyId,roomId,floorId,facilityId,slotId,capacity,clearance,contact,local,
  performerReferences,transform,facilityTransform,approachPosition,exitPosition,
});

const [sourceArg,distArg,predecessorArg,outputArg,...extra] = process.argv.slice(2);
assert(sourceArg && distArg && predecessorArg && outputArg && !extra.length,
  'Usage: node test-vocal-fit-handoff.mjs FIXED_SOURCE_ROOT FIXED_VIEWER_DIST VOCAL_USE_V1_1_PACKAGE NEW_OUTPUT_DIRECTORY');
const [source,dist,predecessor] = await Promise.all([sourceArg,distArg,predecessorArg].map(dir=>fs.realpath(dir)));
const output = path.resolve(outputArg);
await checkManagedOutput(output,project,{allowDelivery:false});
for (const input of [source,dist,predecessor]) {
  assert(!inDirectory(input,output) && !inDirectory(output,input),'Keep results separate from fixed inputs.');
}
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.mkdir(output);
const report = {status:'running',source,dist,predecessor:{path:predecessor,manifestSha256:predecessorPin},
  scope:'CPU fixed two-room production, physical staging, packaging and cold save reopen. Character fit and playback require the separate actor runs.',
  rooms:[],commands:[],rejections:[]};

async function invoke(label,entry,args,{code=0,stream='stdout'}={}) {
  const command = {label,entry,args};
  report.commands.push(command);
  let result;
  try {
    result = {...await run(process.execPath,[entry,...args],{
      cwd:source,windowsHide:true,timeout:180_000,maxBuffer:4*1024*1024,
    }),code:0};
  } catch (error) {
    result = error;
  }
  command.exit = result.code;
  assert.equal(result.code,code,`${label}\n${result.stderr || result.stdout || result.message || ''}`);
  command.response = JSON.parse(result[stream]);
  assert.equal(command.response.ok,code===0,label);
  return command.response;
}

async function verify(root,pin,label) {
  const result = await invoke(label,path.join(root,'verify.mjs'),[root,pin]);
  assert.equal(result.manifestSha256,pin);
  assert.equal(result.checkedFiles,result.declaredFiles);
  assert.deepEqual([result.missingFiles,result.changedFiles,result.extraFiles],[0,0,0]);
  return result;
}

async function checkHandoff() {
  const tools = path.join(source,'scripts/company-platform');
  const runtime = path.join(source,'prototype/src/company');
  const batchInput = path.join(tools,'batch-inputs/vocal-fit-rooms.json');
  const batchTool = path.join(tools,'batch.mjs');
  const packageTool = path.join(tools,'package-company.mjs');
  const batchOut = path.join(output,'batch');
  const packageOut = path.join(output,'candidate-package');
  const {shortId:build} = await read(path.join(dist,'company-build-info.json'));
  const [{readVocalAuthority},{decodeCompanySave},{checkSingingRooms},{createCompanyScene},
    {deriveCompany,pointInTransform},{preflightLibraryAssets},three] = await Promise.all([
    load(path.join(tools,'package-template/vocal-origin.mjs')),
    load(path.join(runtime,'persistence.js')),
    load(path.join(tools,'check-singing-room.mjs')),
    load(path.join(runtime,'render.js')),
    load(path.join(runtime,'document.js')),
    load(path.join(tools,'preflight-library-assets.mjs')),
    load(path.join(source,'prototype/node_modules/three/build/three.module.js')),
  ]);
  report.predecessor.verification = await verify(predecessor,predecessorPin,'verify locked predecessor');
  const originalManifest = await read(path.join(predecessor,manifestName));
  const catalog = await read(path.join(source,'prototype',originalManifest.runtimeInputs.catalog));
  const templates = await read(path.join(source,'prototype',originalManifest.runtimeInputs.templates));
  const batch = await invoke('produce both rooms',batchTool,[batchInput,batchOut]);
  assert.deepEqual(batch.results.map(({key,status})=>[key,status]),keys.map(key=>[key,'created']));
  const inherited = (key,sourceKey) => ['--inherit-vocal',key,predecessor,predecessorPin,sourceKey];
  const namedRooms = keys.flatMap(key=>['--room',key,path.join(batchOut,key)]);
  const packageArgs = target=>[dist,build,path.join(batchOut,keys[0]),target,'--source',source,...namedRooms,
    ...inherited('@default',keys[0]),...inherited(keys[0],keys[0])];
  const wrongOut = path.join(output,'reject-wrong-source');
  const before = (await fs.readdir(output)).sort();
  const wrong = await invoke('reject studio authority for rental room',packageTool,
    [...packageArgs(wrongOut),...inherited(keys[1],keys[0])],{code:1,stream:'stderr'});
  assert.equal(wrong.code,'vocal-origin-room-mismatch',wrong.message);
  assert.deepEqual((await fs.readdir(output)).sort(),before,'Wrong-source rejection left a package or staging path.');
  report.rejections.push(wrong);
  await invoke('package named rooms with inherited standing declarations',packageTool,
    [...packageArgs(packageOut),...inherited(keys[1],keys[1])]);
  const candidatePin = await shaFile(path.join(packageOut,manifestName));
  assert.notEqual(candidatePin,predecessorPin);
  report.candidate = await verify(packageOut,candidatePin,'verify fitted package');
  assert.equal(report.candidate.build,build);
  const candidateManifest = await read(path.join(packageOut,manifestName));
  const candidateCatalog = await read(path.join(packageOut,'data/library-catalog.json'));
  const candidateTemplates = await read(path.join(packageOut,'data/templates.json'));
  assert.deepEqual(candidateCatalog,catalog);
  assert.deepEqual(candidateTemplates,templates);

  const replacementInputs = [];
  for (const key of keys) {
    const origin = await readVocalAuthority({packageRoot:predecessor,manifestSha256:predecessorPin,sourceRoomKey:key});
    const inheritedRoom = await invoke(`cold-read ${key}`,path.join(packageOut,'check-vocal-origin.mjs'),
      [key,candidatePin,predecessor,predecessorPin,key]);
    assert.equal(inheritedRoom.companyId,key);
    assert.equal(inheritedRoom.sourceManifestSha256,predecessorPin);
    const roomFiles = path.join(packageOut,'data/rooms',key);
    const save = path.join(roomFiles,'save.json');
    assert.equal(await shaFile(save),await shaFile(path.join(batchOut,key,'save.json')));
    assert.equal(await shaFile(save),inheritedRoom.saveSha256);
    const oldSave = await read(path.join(predecessor,'data/rooms',key,'save.json'));
    const document = await decodeCompanySave(await fs.readFile(save,'utf8'),candidateCatalog,candidateTemplates);
    const expected = structuredClone(oldSave.document);
    assert.deepEqual(mic(expected).resource,originalResource);
    mic(expected).resource = fittedResource;
    expected.revision = document.revision;
    if (key === 'singing-studio') {
      // Clear the pickup from the lens view while retaining the original desk and camera angles.
      const camera = expected.nodes.find(node=>node.id===expected.singingRooms[0].roles.camera);
      assert.deepEqual(camera.transform.position,[0,.84,.4]);
      camera.transform.position[0] = -.16;
    }
    assert.deepEqual(document,expected,'Expected only the fitted resource and the studio camera side shift.');
    const [{usePoint,...measurement}] = await checkSingingRooms(document,{catalog,templates,root:source});
    assert.deepEqual(usePoint.resource,fittedResource);
    assert.deepEqual(JSON.parse(JSON.stringify(usePoint)),inheritedRoom.points[0]);
    assert.deepEqual(stablePoint(usePoint),stablePoint(origin.points[0]));
    assert.deepEqual(measurement.score.map(({visibility})=>visibility.samples),[260,260]);
    assert.deepEqual(measurement.camera.rays.map(ray=>ray.reference),['mouth','eye']);
    assert.deepEqual(Object.keys(measurement.microphone.joins),[
      'singing-mic-pickup / singing-mic-collar', 'singing-mic-collar / singing-mic-handle',
      'singing-mic-handle / singing-mic-clip', 'singing-mic-clip / boom-tip-joint',
      'boom-tip-joint / boom-inner-slider', 'boom-inner-slider / singing-boom',
    ]);
    const {portalId} = document.singingRooms[0];
    for (const route of [measurement.access,measurement.approach,measurement.exit]) {
      assert.equal(route.portalId,portalId);
      assert(route.inside.length>1);
    }
    assert.equal(candidateManifest.roomOrigins.find(row=>row.key===key).mode,'inherited-vocal');
    const derived = deriveCompany(document,catalog,templates);
    const microphone = derived.facilities.find(facility=>facility.id===usePoint.facilityId);
    const originalAsset = catalog.resources.find(resource=>resource.id===originalResource.id && resource.version===originalResource.version).asset;
    const {asset} = microphone.resource;
    const glb = path.join(packageOut,'viewer',asset.url.slice(1));
    assert.equal(await shaFile(glb),asset.sha256);
    assert.notEqual(asset.sha256,originalAsset.sha256);
    const installedResources = [...derived.facilities,...derived.surfaceFinishes]
      .filter(facility=>facility.floorId===usePoint.floorId).map(facility=>facility.resource);
    let pickupMesh;
    await preflightLibraryAssets({root:source,resources:installedResources,validate:library=>{
      const scene = createCompanyScene(new three.Scene(),document,{catalog,templates,visibleFloorId:usePoint.floorId,
        assetLibrary:library,mirrorPreflight:()=>{}});
      try {
        assert.deepEqual(scene.describeUsePoint(usePoint.id),usePoint);
        const {anchor,pickupMesh:mesh} = scene.resolveUsePoint(usePoint.id);
        assert(anchor?.isObject3D && mesh?.isMesh);
        assert.equal(mesh.name,usePoint.contact.pickupNodeId);
        const mouth = new three.Vector3(...pointInTransform(usePoint.transform,usePoint.performerReferences.mouth));
        const room = derived.worlds.get(usePoint.roomId);
        const surface = new three.Vector3(...pointInTransform(room,measurement.microphone.surface));
        const direction = surface.clone().sub(mouth).normalize();
        const [hit] = new three.Raycaster(mouth,direction,0,.26).intersectObject(mesh,false);
        assert.equal(hit?.object,mesh);
        assert(hit.point.distanceTo(surface)<1e-6);
        assert(Math.abs(hit.distance-measurement.microphone.distanceMetres)<1e-6);
        pickupMesh = {node:mesh.name,mouthDistance:hit.distance,worldHit:hit.point.toArray()};
      } finally { scene.dispose(); }
    }});
    report.rooms.push({key,saveSha256:inheritedRoom.saveSha256,point:inheritedRoom.points[0],assetSha256:asset.sha256,
      pickupMesh,measurement});
    replacementInputs.push({key,document:oldSave.document,operations:[
      {type:'replace-resource',id:mic(document).id,resource:fittedResource},
    ]});
  }

  const attemptedEdit = path.join(output,'incompatible-pickup-edit.batch.json');
  const editOut = path.join(output,'rejected-edits');
  await fs.writeFile(attemptedEdit,JSON.stringify({schema:'company-batch',version:1,items:replacementInputs},null,2)+'\n',{flag:'wx'});
  const rejected = await invoke('reject changing pickup fit with appearance replacement',batchTool,[attemptedEdit,editOut],{code:1});
  assert.deepEqual(rejected.results.map(result=>result.key),keys);
  for (const result of rejected.results) {
    assert.equal(result.code,'incompatible-replacement',result.message);
    assert(result.path.includes('.resource.pickupFit'),result.path);
    report.rejections.push(result);
  }
  assert.deepEqual(await fs.readdir(editOut),[],'Rejected appearance operations created room results.');
  assert.deepEqual((await invoke('retry the authorized fitted room batch',batchTool,[batchInput,batchOut]))
    .results.map(({status})=>status),['idempotent','idempotent']);
  await verify(predecessor,predecessorPin,'verify locked predecessor after rejection');
  await verify(packageOut,candidatePin,'verify fitted package after rejection');
  report.status = 'passed';
}

try {
  await checkHandoff();
  console.log(JSON.stringify({ok:true,report:path.join(output,'report.json'),candidate:report.candidate},null,2));
} catch (error) {
  report.status = 'failed';
  report.error = {message:error.message,stack:error.stack};
  console.error(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}