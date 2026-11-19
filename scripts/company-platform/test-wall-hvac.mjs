import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {Box3, Raycaster, Scene, Vector3} from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createFacilityPlacement,listPlacementTargets} from '../../prototype/src/company/facility-edit-data.js';
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {wallEdge} from '../../prototype/src/company/wall-visibility.js';
import {checkManagedOutput} from './package-company.mjs';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [directory,...extra] = process.argv.slice(2);
assert(directory && !extra.length, 'node scripts/company-platform/test-wall-hvac.mjs NEW_OUTPUT_DIR');
const out = path.resolve(directory);
await checkManagedOutput(out,root,{allowDelivery:false});
await fs.mkdir(out);

const inputPath = fileURLToPath(new URL('./batch-inputs/wall-hvac-rooms.json',import.meta.url));
const batchCli = fileURLToPath(new URL('./batch.mjs',import.meta.url));
const refs = ['curve','twin-intake','ribbed','stepped'].map(name => ({id:'wall-ac-'+name,version:1}));
const output = name => path.join(out,name);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const vec = (x,y,z) => new Vector3(x,y,z);
const round = value => Number(value.toFixed(8)) || 0;
const tuple = vector => vector.toArray().map(round);
const ref = ({id,version}) => ({id,version});
const findNode = (document,id) => document.nodes.find(node => node.id === id);
const context = {catalog,templates};
const epsilon = 1e-5;
const report = {status:'running',scope:'Registered assets through company batch CLI, authoring, persistence and Three scene in Node',assets:[],rooms:[],rejections:[]};
const publicRoot = path.join(root,'prototype','public');
let stage = 'registered resource pins';
let damagedUrl;

function assetPath(url) {
  const file = path.resolve(publicRoot,url.replace(/^\//,''));
  assert(file.startsWith(publicRoot + path.sep),'Asset path escapes the company public library');
  return file;
}

function memoryStorage() {
  const map = new Map();
  return {map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};
}

async function withRoom(document,storage,visit) {
  const requested = [];
  const library = createCompanyAssetLibrary({fetchImpl:async url=>{
    requested.push(url);
    const bytes = await fs.readFile(assetPath(url));
    if (url === damagedUrl) bytes.writeUInt32LE(0,0);
    return new Response(bytes);
  }});
  let session;
  try {
    session = await createCompanyAuthoring(new Scene(),document,{
      ...context,storage,assetLibrary:library,mirrorPreflight:()=>{},
    });
    return await visit(session,requested);
  } finally {
    session?.dispose();
    library.dispose();
  }
}

function checkInstallation(session,facility,expectedForward) {
  const {id,parentId,transform} = facility;
  const device = session.scene.root.getObjectByName(id);
  assert(device?.visible,'The registered air conditioner must be visible in the normal floor view');
  session.scene.root.updateMatrixWorld(true);
  const origin = device.getWorldPosition(vec());
  const forward = device.getWorldDirection(vec());
  const expectedWorld = deriveCompany(session.document,catalog,templates).worlds.get(id);
  assert(origin.distanceTo(vec(...expectedWorld.position)) < epsilon);
  assert(forward.distanceTo(vec(...expectedForward)) < epsilon,'Room rotation did not carry the actual model facing');
  assert(Math.abs(origin.y - 2.24) < epsilon);
  const plate = device.getObjectByName('wall-ac-mount');
  assert(plate?.isMesh && plate.geometry.getAttribute('position').count >= 3);
  const bounds = new Box3().setFromObject(plate,true);
  const corners = [bounds.min.x,bounds.max.x].flatMap(x=>[bounds.min.z,bounds.max.z].map(z=>vec(x,origin.y,z)));
  const coordinate = Math.min(...corners.map(corner=>corner.sub(origin).dot(forward)));
  assert(Math.abs(coordinate) < epsilon,'The mounted plate must meet the facility back plane');
  const back = bounds.getCenter(vec());
  back.addScaledVector(forward,coordinate - back.clone().sub(origin).dot(forward));
  const walls = session.scene.walls.filter(wall=>wall.userData.roomId === parentId && wall.userData.edge === wallEdge(transform.yaw));
  const hit = new Raycaster(back.clone().addScaledVector(forward,.04),forward.clone().negate(),0,.09)
    .intersectObjects(walls,false)[0];
  assert(hit?.point.distanceTo(back) < epsilon,'The actual mounting plate must be flush with the rendered wall');
  const body = new Box3().setFromObject(device,true);
  assert(body.min.y >= 2,'The nonblocking wall appliance must clear the floor route');
  return {anchor:tuple(origin),forward:tuple(forward),wall:hit.object.name,contact:tuple(hit.point),
    plateBackMetres:round(coordinate),bottomMetres:round(body.min.y)};
}

function checkState(session,id,resource,settings) {
  const {wallHvac} = resource;
  const device = session.scene.root.getObjectByName(id);
  const flap = device.getObjectByName(wallHvac.louver);
  const indicator = device.getObjectByName(wallHvac.status);
  const back = device.getObjectByName('wall-ac-outlet-back');
  const meshes = [];
  device.traverseVisible(mesh=>{if(mesh.isMesh) meshes.push(mesh);});
  assert(flap && meshes.includes(indicator) && meshes.includes(back));
  const angle = settings.on ? wallHvac.modeRadians[settings.mode - 1] : wallHvac.closedRadians;
  assert(Math.abs(flap.rotation.x - angle) < epsilon);
  const {emissive,emissiveIntensity} = indicator.material;
  assert(emissive?.isColor);
  assert.equal(emissiveIntensity,settings.on ? 1 : 0);
  assert.equal(emissive.getHex() !== 0,settings.on);
  assert.deepEqual({...resource.stateDefaults,...findNode(session.document,id).state},settings);
  const forward = device.getWorldDirection(vec());
  const first = target => {
    const point = new Box3().setFromObject(target,true).getCenter(vec());
    return new Raycaster(point.addScaledVector(forward,.30),forward.clone().negate(),0,.45).intersectObjects(meshes,false)[0]?.object;
  };
  assert.equal(first(indicator),indicator,'The actual status mesh must be visible from inside the room');
  const outlet = first(back);
  assert(outlet,'The real display instance must intercept its outlet sight line');
  if (settings.on) assert.equal(outlet,back,'The open outlet must reveal its actual recessed back');
  else assert(flap.getObjectById(outlet.id),'The closed flap must intercept the outlet sight line');
  return {settings,angle:round(flap.rotation.x),emissive:emissive.getHexString(),intensity:emissiveIntensity,firstOutletPart:outlet.name};
}

function unchangedRoom(session,id) {
  const {points,navigation} = session.snapshot();
  return {nodes:session.document.nodes.filter(node=>node.id!==id),points,navigation};
}

async function refuse(session,operation,code,id) {
  const root = session.scene.root;
  const unit = root.getObjectByName(id);
  const document = await session.export();
  const stored = session.readSavedText(session.document.id);
  await assert.rejects(session.apply([operation]),error=>{
    assert.equal(error.code,code,error.message);
    report.rejections.push({company:session.document.id,operation,code:error.code,path:error.path,priorSaveSha256:sha(stored)});
    return true;
  });
  assert.equal(session.scene.root,root);
  assert.equal(session.scene.root.getObjectByName(id),unit);
  assert.equal(await session.export(),document);
  assert.equal(session.readSavedText(session.document.id),stored);
}

try {
  const resources = refs.map(target=>catalog.resources.find(resource=>resource.id===target.id&&resource.version===target.version));
  assert(resources.every(Boolean),'All four wall-hvac resources must be registered in the real company catalog');
  for (const resource of resources) {
    assert.equal(resource.mountRole,'wall-hvac');
    assert.equal(resource.productionBranch,'hvac');
    assert(compareFacilityFunction(resources[0],resource).compatible);
    const bytes = await fs.readFile(assetPath(resource.asset.url));
    assert.equal(bytes.length,resource.asset.bytes);
    assert.equal(sha(bytes),resource.asset.sha256);
    report.assets.push({resource:ref(resource),url:resource.asset.url,sha256:sha(bytes)});
  }
  assert.equal(new Set(report.assets.map(asset=>asset.sha256)).size,4);
  installNodeImageDecodeShim();

  stage = 'publish both fixture rooms through the batch CLI';
  const batchRoot = output('batch');
  const launch = promisify(execFile);
  try {
    const {stdout} = await launch(process.execPath,[batchCli,inputPath,batchRoot]);
    report.batch = JSON.parse(stdout);
  } catch (error) {
    report.batchFailure = error.stdout || error.stderr;
    throw error;
  }
  assert(report.batch.ok);
  const inputBytes = await fs.readFile(inputPath);
  report.batchInputSha256 = sha(inputBytes);
  const {items} = JSON.parse(inputBytes);
  assert.deepEqual(items.map(item=>item.key),['wall-hvac-home','wall-hvac-rental']);

  for (const [index,item] of items.entries()) {
    const {key,operations} = item;
    stage = key+' batch room and ground routes';
    const installation = operations.at(-1);
    const {id,parentId} = installation;
    const expectedForward = index===0 ? [0,0,-1] : [-1,0,0];
    const save = await fs.readFile(path.join(batchRoot,key,'save.json'),'utf8');
    const document = await decodeCompanySave(save,catalog,templates);
    const empty = createCompanyScaleV2(item.input,catalog,templates);
    const roomEdits = operations.slice(0,-1);
    const baseline = roomEdits.length ? prepareCompanyChange(empty,roomEdits,context).document : empty;
    assert.equal(document.nodes.filter(node=>node.kind==='room').length,index===0?1:3);
    assert.equal(document.nodes.filter(node=>node.kind==='workstation').length,1);
    assert.equal(findNode(document,key+'/ground').transform.yaw,index===0?0:Math.PI/2);
    assert(findNode(document,parentId)?.kind==='room');
    const placement = inspectCompanyPlacement(document,catalog,templates);
    assert.deepEqual(placement,inspectCompanyPlacement(baseline,catalog,templates));
    assert(placement.checkedPortals.length>0 && placement.checkedPortals.every(portal=>portal.connected));
    const seat = placement.checkedPoints.find(point=>point.facilityId===parentId+'/station-1/chair');
    assert(seat?.approachConnected && seat.exitConnected,'The installed AC must leave workstation approach and exit open');
    const storage = memoryStorage();
    const initialResource = resources.find(resource=>resource.id===installation.resource.id);
    const southId = parentId+':wall:south';
    stage = key+' ordinary add wall target';
    const {before,standardAdd} = await withRoom(baseline,memoryStorage(),async session=>{
      const before = unchangedRoom(session,id);
      const targets = listPlacementTargets(session.document,catalog,initialResource,parentId,{templates});
      assert(targets.length && targets.every(target=>target.position[1]===2.24));
      const planned = createFacilityPlacement(session.document,catalog,initialResource,southId,{},parentId,{templates});
      assert.equal(planned.operation.parentId,parentId);
      assert.deepEqual(planned.operation.transform,installation.transform);
      await session.apply([planned.operation]);
      const installed = findNode(session.document,planned.id);
      assert.deepEqual(unchangedRoom(session,planned.id),before);
      return {before,standardAdd:{target:southId,availableWallTargets:targets.length,
        mounted:checkInstallation(session,installed,expectedForward),
        defaults:checkState(session,planned.id,initialResource,{on:false,mode:1})}};
    });
    const evidence = {key,initialSaveSha256:sha(save),portals:placement.checkedPortals.length,seat:seat.id,standardAdd,variants:[]};
    report.rooms.push(evidence);

    await withRoom(document,storage,async session=>{
      stage = key+' baseline';
      assert.deepEqual(unchangedRoom(session,id),before);
      evidence.initial = checkState(session,id,initialResource,installation.state);
      const second = listPlacementTargets(session.document,catalog,initialResource,parentId,{templates})
        .find(target=>target.id===southId);
      assert(second && Math.abs(second.position[0]-installation.transform.position[0])>=initialResource.mounting.width,
        'Regular wall target must skip the installed device envelope');
      evidence.nextSouthTarget = second.position;
      const order = [...resources.filter(resource=>resource!==initialResource),initialResource];
      const set = patch=>session.apply([{type:'set-state',id,state:patch}]);

      for (const resource of order) {
        stage = key+' '+resource.id+' runtime and cold reload';
        const prior = findNode(session.document,id);
        const replace = {type:'replace-resource',id,resource:ref(resource)};
        await session.apply([replace]);
        const facility = findNode(session.document,id);
        assert.deepEqual(facility,{...prior,resource:ref(resource)});
        assert.deepEqual(unchangedRoom(session,id),before);
        const mounted = checkInstallation(session,facility,expectedForward);
        const preserved = checkState(session,id,resource,prior.state);
        await set({on:true,mode:2});
        const states = [checkState(session,id,resource,{on:true,mode:2})];
        for (const mode of [1,3]) {
          await set({mode});
          states.push(checkState(session,id,resource,{on:true,mode}));
        }
        assert.equal(new Set(states.map(state=>state.angle)).size,3);
        assert.equal(new Set(states.map(state=>state.emissive)).size,3);
        await set({on:false});
        states.push(checkState(session,id,resource,{on:false,mode:3}));
        const finalState = index===0 ? {on:false,mode:3} : {on:true,mode:2};
        await set(finalState);
        await session.save();
        const stored = session.readSavedText(key);
        const keyInStore = [...storage.map.keys()][0];
        const saveFile = output(key+'-'+resource.id+'.json');
        await fs.writeFile(saveFile,stored,{flag:'wx'});
        const cold = memoryStorage();
        cold.setItem(keyInStore,await fs.readFile(saveFile,'utf8'));
        const coldState = await withRoom(baseline,cold,async (restored,requested)=>{
          assert.equal(restored.scene.root.getObjectByName(id),undefined);
          await restored.restore(key);
          assert.equal(await restored.export(),stored);
          assert.equal(restored.readSavedText(key),stored);
          assert(requested.includes(resource.asset.url));
          assert.deepEqual(unchangedRoom(restored,id),before);
          checkInstallation(restored,findNode(restored.document,id),expectedForward);
          return checkState(restored,id,resource,finalState);
        });
        evidence.variants.push({resource:ref(resource),mounted,preserved,states,restored:coldState,saveSha256:sha(stored)});
      }

      stage = key+' rejected edits and clean retry';
      const current = findNode(session.document,id);
      await refuse(session,{type:'replace-resource',id,resource:{id:'wall-art-triptych',version:1}},'incompatible-replacement',id);
      await refuse(session,{type:'add-facility',id:id+'-overlap',parentId,resource:current.resource,
        transform:current.transform},'overlapping-wall-hvac',id);
      await refuse(session,{type:'move',id,transform:{...current.transform,
        position:[0,2.24,installation.transform.position[2]-.04]}},'invalid-wall-fit',id);
      const alternate = resources.find(resource=>resource.id!==current.resource.id);
      const replacement = {type:'replace-resource',id,resource:ref(alternate)};
      damagedUrl = alternate.asset.url;
      try {
        await refuse(session,replacement,'asset-digest-mismatch',id);
      } finally {
        damagedUrl = undefined;
      }
      await session.apply([replacement]);
      const recovered = findNode(session.document,id);
      assert.deepEqual(recovered,{...current,resource:ref(alternate)});
      evidence.cleanRetry = checkState(session,id,alternate,current.state);
    });
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = {stage,code:error.code,path:error.path,message:error.message,stack:error.stack};
  process.exitCode = 1;
} finally {
  await fs.writeFile(output('report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:report.status,rooms:report.rooms.length,
    coldRestores:report.rooms.reduce((count,room)=>count+room.variants.length,0),
    rejections:report.rejections.length,report:output('report.json'),error:report.error}));
}
