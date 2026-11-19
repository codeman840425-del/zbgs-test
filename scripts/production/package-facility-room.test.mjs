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
const game=process.env.FACILITY_GAME_PACKAGE,room=process.env.FACILITY_COMPANY_TRANSFER;
const gameSha256=process.env.FACILITY_GAME_SHA256;
async function checkCompanyScenes(out,receipt) {
  const three=await import(pathToFileURL(path.join(root,'prototype/node_modules/three/build/three.module.js')));
  const {installNodeImageDecodeShim}=await import(pathToFileURL(path.join(room,'source/scripts/company-platform/preflight-library-assets.mjs')));
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
        const point=scene.describeUsePoint(definition.seatId);
        const handle=await active.session.retainUsePointContact(point.id);
        try {
          assert.ok(handle.seat.isMesh && handle.back.isMesh);
          const [x,y,z]=point.transform.position;
          const ray=new three.Raycaster(new three.Vector3(x,y+1,z),new three.Vector3(0,-1,0));
          const top=ray.intersectObject(handle.seat,false)[0].point.y;
          assert.ok(Math.abs(top-point.facilityTransform.position[1]-.47)<.00001);
        } finally {active.session.releaseUsePointContact(handle);}
      } finally {active.dispose();}
      assert.equal(consumer.scene.children.length,0);
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
        const original=await readFile(path.join(room,'data/rooms',item.key,'save.json'));
        assert.equal(digest(original),item.saveSha256);
        assert.deepEqual(await readFile(path.join(out,item.save)),original);
      }
      const host=await readFile(path.join(out,'facility/company-host.js'),'utf8');
      assert.match(host,/window\.__recordConsumer\.three/);
      assert.match(host,/createCompanyAuthoring\(consumer\.scene/);
      await checkCompanyScenes(out,manifest);
      await assert.rejects(packageFacilityRoom({game,room,gameSha256,out}),/Output already exists/);
      await assert.rejects(packageFacilityRoom({game,room,gameSha256,out:path.join(game,'unexpected-output')}),/overlaps a transfer input|inside the project/);
      assert.deepEqual(await readdir(temp),['combined']);
    } finally {await rm(temp,{recursive:true});}
  });
