import assert from 'node:assert/strict';
import {readFile, readdir, mkdtemp, rm, symlink, unlink} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import outputs from '../project-output.cjs';
import {digest} from '../runtime-package/files.mjs';
import {packageFacilityRoom} from './package-facility-room.mjs';

const root=await outputs.productionRoot();
const missing={game:'missing-record-input',room:'missing-company-input',gameSha256:'0'.repeat(64)};
test('rejects drive-root, parent traversal and linked directories before accessing either input',async()=>{
  const temp=await mkdtemp(await outputs.projectOutput(path.join(root,'experiments','facility-path-check-'),root));
  const link=path.join(temp,'outside');
  try {
    await symlink(path.dirname(root),link,process.platform==='win32'?'junction':'dir');
    for (const out of [path.join(path.parse(root).root,'outside-game-output'),
      path.join(root,'..','outside-game-output'),path.join(link,'outside-game-output')]) {
      await assert.rejects(packageFacilityRoom({...missing,out}),{code:'outside-project'});
    }
  } finally {await unlink(link).catch(e=>{if(e.code!=='ENOENT')throw e;});await rm(temp,{recursive:true});}
});

// Pass the received read-only inputs and the SHA from their release receipt.
// For a source-only vocal transfer, NODE_PATH may point to the installed, locked
// company prototype dependencies (pngjs and jpeg-js for its Node preflight).
const game=process.env.FACILITY_GAME_PACKAGE,room=process.env.FACILITY_COMPANY_TRANSFER;
const gameSha256=process.env.FACILITY_GAME_SHA256;
const vocal=process.env.FACILITY_VOCAL_TRANSFER;
const lowered=process.env.FACILITY_LOWER_VOCAL_TRANSFER;
async function checkCompanyScenes(out,receipt,companyRoot) {
  const three=await import(pathToFileURL(path.join(root,'prototype/node_modules/three/build/three.module.js')));
  const {installNodeImageDecodeShim}=await import(pathToFileURL(path.join(companyRoot,'source/scripts/company-platform/preflight-library-assets.mjs')));
  const original={};
  for(const key of ['window','localStorage','fetch','createImageBitmap','self']) original[key]=Object.getOwnPropertyDescriptor(globalThis,key);
  const nativeFetch=globalThis.fetch;
  try {
    installNodeImageDecodeShim();
    const consumer={three,scene:new three.Scene(),seatLeases:{forSeat:()=>null}};
    Object.defineProperty(globalThis,'window',{value:{__recordConsumer:consumer},configurable:true});
    Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>null,setItem(){}},configurable:true});
    globalThis.fetch=async(url,options)=>{
      if(String(url).startsWith('blob:'))return nativeFetch(url,options);
      const absolute=new URL(url,'http://localhost/facility-room.html');
      return new Response(await readFile(path.join(out,absolute.pathname.slice(1))));
    };
    const {mountCompanyRoom}=await import(pathToFileURL(path.join(out,'facility/company-host.js')));
    for(const definition of receipt.rooms) {
      const active=await mountCompanyRoom(consumer,definition.key);
      try {
        const scene=active.session.scene;
        assert.equal(scene.root.parent,consumer.scene);
        assert.equal(scene.view.roomId,definition.roomId);
        assert.ok(scene.navigation(definition.floorId).floors.length);
        if(definition.primaryUsePointId) {
          const point=scene.describeUsePoint(definition.primaryUsePointId);
          const report=JSON.parse(await readFile(path.join(out,definition.usePointReport)));
          assert.deepEqual(point,report.points.find(p=>p.id===definition.primaryUsePointId));
          assert.equal(point.kind,'standing-vocal');
          const {pickupMesh}=scene.resolveUsePoint(point.id);
          assert.ok(pickupMesh.isMesh && pickupMesh.geometry.attributes.position.count>0);
          assert.ok(consumer.scene.getObjectById(pickupMesh.id));
          const stand=scene.root.getObjectByName(point.facilityId);
          pickupMesh.geometry.computeBoundingBox();
          const center=pickupMesh.geometry.boundingBox.getCenter(new three.Vector3());
          stand.worldToLocal(pickupMesh.localToWorld(center));
          const isLower=receipt.roomProfile==='vocal-fit-v1';
          assert.equal(point.resource.id,isLower?'floor-vocal-mic-disc-fit-lower':'floor-vocal-mic-boom');
          const expected=new three.Vector3(0,...(isLower?[1.5507086521,.4478487245]:[1.5909180629,.3870299520]));
          assert.ok(center.distanceTo(expected)<1e-6,`Installed pickup center in facility coordinates: ${center.toArray()}`);
          if(definition.key==='singing-rental') {
            const chair=scene.describeUsePoint('singing-rental/ground/work/chair#seat');
            assert.ok(chair.contact.seatNodeId && chair.contact.backNodeId);
          }
          continue;
        }
        const point=scene.describeUsePoint(definition.seatId);
        const handle=await active.session.retainUsePointContact(point.id);
        try {
          assert.ok(handle.seat.isMesh && handle.back.isMesh);
          const [x,y,z]=point.transform.position;
          const ray=new three.Raycaster(new three.Vector3(x,y+1,z),new three.Vector3(0,-1,0));
          const top=ray.intersectObject(handle.seat,false)[0].point.y;
          assert.ok(Math.abs(top-point.facilityTransform.position[1]-.47)<.00001);
        } finally {active.session.releaseUsePointContact(handle);}
      } finally {
        active.dispose();
        assert.equal(consumer.scene.children.length,0);
      }
    }
  } finally {
    for(const [key,descriptor] of Object.entries(original)) {
      if(descriptor) Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
  }
}
test('retries a rejected receipt with two real transfers, checks files and refuses replacement',
  {skip:!(game && room && gameSha256)},async()=>{
    const temp=await mkdtemp(await outputs.projectOutput(path.join(root,'experiments','facility-package-check-'),root));
    const out=path.join(temp,'combined');
    try {
      await assert.rejects(packageFacilityRoom({game,room,out,gameSha256:'0'.repeat(64)}),/manifest SHA-256 mismatch/);
      assert.deepEqual(await readdir(temp),[]);
      const result=await packageFacilityRoom({game,room,out,gameSha256});
      const receipt=await readFile(path.join(out,'facility-package.json'));
      assert.equal(digest(receipt),result.manifestSha256);
      const manifest=JSON.parse(receipt);
      for(const file of manifest.files) {
        const bytes=await readFile(path.join(out,file.path));
        assert.equal(digest(bytes),file.sha256,file.path);assert.equal(bytes.length,file.bytes,file.path);
      }
      assert.equal(digest(await readFile(path.join(out,'runtime-package.json'))),gameSha256);
      for(const item of result.rooms) {
        assert.deepEqual(Object.keys(item),['key','roomId','floorId','seatId','save','saveSha256']);
        const original=await readFile(path.join(room,'data/rooms',item.key,'save.json'));
        assert.equal(digest(original),item.saveSha256);
        assert.deepEqual(await readFile(path.join(out,item.save)),original);
      }
      const host=await readFile(path.join(out,'facility/company-host.js'),'utf8');
      assert.match(host,/window\.__recordConsumer\.three/);
      assert.match(host,/createCompanyAuthoring\(consumer\.scene/);
      await checkCompanyScenes(out,manifest,room);
      await assert.rejects(packageFacilityRoom({game,room,gameSha256,out}),/Output already exists/);
      await assert.rejects(packageFacilityRoom({game,room,gameSha256,out:path.join(game,'unexpected-output')}),/overlaps a transfer input|inside the project/);
      assert.deepEqual(await readdir(temp),['combined']);
    } finally {await rm(temp,{recursive:true});}
  });

test('rejects unknown profiles and a reviewed vocal source on the default plant profile',async()=>{
  const out=path.join(root,'output','unused-facility-profile-test');
  await assert.rejects(packageFacilityRoom({...missing,out,roomProfile:'vocal-use-v1'}),/Unknown company room profile/);
  await assert.rejects(packageFacilityRoom({...missing,out,reviewedRoom:'missing'}),/applies only to vocal/);
});

test('lowered transfer inherits the reviewed world slot and installs its own pickup in both real rooms',
  {skip:!(game && gameSha256 && vocal && lowered)},async()=>{
    const temp=await mkdtemp(await outputs.projectOutput(path.join(root,'experiments','lower-vocal-check-'),root));
    const out=path.join(temp,'combined');
    const args={game,gameSha256,room:lowered,out,roomProfile:'vocal-fit-v1',reviewedRoom:vocal};
    try {
      await assert.rejects(packageFacilityRoom({...args,room:vocal}),/manifest SHA-256 mismatch/);
      await assert.rejects(packageFacilityRoom({...args,reviewedRoom:path.join(vocal,'..','vocal-use-v1')}),/Source manifest differs/);
      assert.deepEqual(await readdir(temp),[]);
      const result=await packageFacilityRoom(args);
      const receipt=JSON.parse(await readFile(path.join(out,'facility-package.json')));
      assert.equal(receipt.roomManifestSha256,'64802112dd64938d88ef6e8115c90096a90f591833467db55bd837e4ca11eebc');
      assert.equal(receipt.reviewedRoomManifestSha256,'5c676cafa500ac5fc79d2461935fc323844e02fa0a1baa01c8025cd75d3e4012');
      assert.deepEqual(result.rooms.map(r=>r.key),['singing-studio','singing-rental']);
      await checkCompanyScenes(out,receipt,lowered);
    } finally {await rm(temp,{recursive:true});}
  });

test('vocal rooms use their own inherited slot and actual microphone mesh, preserving named source bytes',
  {skip:!(game && gameSha256 && vocal)},async()=>{
    const temp=await mkdtemp(await outputs.projectOutput(path.join(root,'experiments','facility-vocal-check-'),root));
    const out=path.join(temp,'combined'),args={game,gameSha256,room:vocal,out,roomProfile:'vocal-use-v1.1'};
    try {
      await assert.rejects(packageFacilityRoom({...args,roomProfile:'plant'}),/manifest SHA-256 mismatch/);
      await assert.rejects(packageFacilityRoom({...args,reviewedRoom:vocal}),/Source manifest differs/);
      assert.deepEqual(await readdir(temp),[]);
      const result=await packageFacilityRoom(args);
      const receipt=await readFile(path.join(out,'facility-package.json'));
      assert.equal(digest(receipt),result.manifestSha256);
      const metadata=JSON.parse(await readFile(path.join(out,'facility/rooms.json')));
      assert.deepEqual(metadata.rooms,result.rooms);
      assert.equal(metadata.roomManifestSha256,'5c676cafa500ac5fc79d2461935fc323844e02fa0a1baa01c8025cd75d3e4012');
      assert.equal(metadata.reviewedRoomManifestSha256,'2f36e3dc92939fdb93f4c99902196ed6b5e7ec4312cceecb7f48c1237d073c57');
      assert.deepEqual(result.rooms.map(r=>r.key),['singing-studio','singing-rental']);
      for(const r of result.rooms) {
        assert.equal(r.primaryUsePointId,r.key+'/ground/live/vocal#vocal');
        assert.ok(!Object.hasOwn(r,'seatId'));
        for(const [name,file,hash] of [['save.json',r.save,r.saveSha256],['use-points.json',r.usePointReport,r.usePointReportSha256]]) {
          const source=await readFile(path.join(vocal,'data/rooms',r.key,name));
          assert.deepEqual(await readFile(path.join(out,file)),source);
          assert.equal(digest(source),hash);
        }
      }
      for(const row of JSON.parse(receipt).files) {
        const bytes=await readFile(path.join(out,row.path));
        assert.equal(bytes.length,row.bytes,row.path);assert.equal(digest(bytes),row.sha256,row.path);
      }
      await checkCompanyScenes(out,metadata,vocal);
      const repeat=await packageFacilityRoom({...args,out:path.join(temp,'repeat'),reviewedRoom:path.join(vocal,'..','vocal-use-v1')});
      assert.equal(repeat.manifestSha256,result.manifestSha256);
    } finally {await rm(temp,{recursive:true});}
  });
