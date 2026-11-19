import assert from 'node:assert/strict';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createLocalRoomAssetLibrary} from './check-training-clearance.mjs';
import {checkDanceShot} from './check-dance-shot.mjs';

const id = 'dance-shot-fixture', floorId = id+'/ground', roomId = floorId+'/stage';
const deskId = roomId+'/desk', cameraId = roomId+'/camera';
const activity = {minX:-1.5,maxX:1.5,minZ:-1.4,maxZ:1.4,clearHeight:2.2};
const rule = {cameraId,backdropId:roomId+'/backdrop',frame:{start:[-1,.75],end:[1,.75],bottom:0,top:1.9}};
const options = {catalog,templates};
const base = createCompanyScaleV2({id,name:'Dance shot test',scale:'single-room',furnishingVersion:2,
  spaceProfile:{id:'company-space-v2',version:1},floors:[{id:'ground',rooms:[{id:'stage',purpose:'training'}]}]},catalog,templates);
const add = (id,parentId,resource,position,yaw=0)=>({type:'add-facility',id,parentId,resource:{id:resource,version:1},transform:{position,yaw}});
const {document} = prepareCompanyChange(base,[
  add(deskId,roomId,'desk-frame',[0,0,-2.35]),
  add(cameraId,deskId,'camera-orbit-eye',[0,.84,.43]),
  add(roomId+'/backdrop',roomId,'background-slat-panel',[0,0,2.35],Math.PI),
],options);
const library = createLocalRoomAssetLibrary();
const cases = [];
const p = (x,y,z)=>new THREE.Vector3(x,y,z);
const close = (a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
let upright;
try {
  await library.preload(deriveCompany(document,catalog,templates).facilities.map(f=>f.resource));
  for (const [label,yaw,position] of [['upright',0,[0,0,0]],['rotated',Math.PI/2,[2.25,0,-3.75]]]) {
    const layout = structuredClone(document);
    const floor = layout.nodes.find(node=>node.id===floorId);
    floor.transform = {position,yaw};
    const derived = deriveCompany(layout,catalog,templates), room = derived.nodes.get(roomId);
    const scene = createCompanyScene(new THREE.Scene(),layout,{...options,visibleFloorId:floorId,assetLibrary:library,mirrorPreflight:()=>{}});
    try {
      const group = scene.root.getObjectByName(roomId), worldToRoom = group.matrixWorld.clone().invert();
      const context = {scene,room,facilities:derived.facilities,derived,worldToRoom,activity};
      const run = (specified=rule)=>checkDanceShot({...context,rule:specified});
      const result = run();
      assert.equal(result.ok,true);
      assert.equal(result.projection.aspect,'16:9');
      assert.equal(result.occlusion.method,'continuous-triangle-clip');
      assert.equal(result.lensNode,'camera-lens');
      assert.equal(result.backdrop.samples[1].first.instanceId,rule.backdropId);
      assert.equal(result.projection.cornersNdc.length,4);
      assert(result.projection.cornersNdc.every(ndc=>ndc.every(axis=>Math.abs(axis)<1)));
      if (upright) {
        assert.deepEqual(result.lens,upright.lens);
        assert.deepEqual(result.forward,upright.forward);
        assert.deepEqual(result.projection,upright.projection);
      } else upright = result;
      cases.push({label,lens:result.lens,forward:result.forward,projection:result.projection});
      if (yaw) continue;

      const failure = (label,action,code,path,details)=>{
        assert.throws(action,error=>{
          assert.equal(error.code,code,error.message);
          assert.equal(error.path,path);
          details?.(error.details);
          cases.push({label,code,path});
          return true;
        });
      };
      failure('frame outside activity',()=>run({...rule,frame:{...rule.frame,start:[-1.6,.75]}}),
        'invalid-dance-shot',roomId+'.trainingClearance.shot.frame');
      failure('zero frame width',()=>run({...rule,frame:{...rule.frame,start:rule.frame.end}}),
        'invalid-dance-shot',roomId+'.trainingClearance.shot');
      failure('frustum crops frame',()=>run({...rule,frame:{...rule.frame,start:[-1,-1.3],end:[1,-1.3]}}),
        'dance-shot-out-of-frame',cameraId,e=>assert(e.ndc.some(axis=>Math.abs(axis)>1)));
      failure('named item is not an installed camera',()=>run({...rule,cameraId:deskId}),'dance-shot-camera',deskId);
      const backdrop = scene.root.getObjectByName(rule.backdropId);
      backdrop.visible = false;
      failure('absent on-camera backdrop',()=>run(),'dance-shot-backdrop',rule.backdropId,
        ({samples})=>assert(samples.every(sample=>sample.first?.instanceId!==rule.backdropId)));
      backdrop.visible = true;
      const diagonal = run({...rule,frame:{...rule.frame,start:[-1,.65],end:[1,.85]}});
      assert.notDeepEqual(diagonal.projection.cornersNdc,result.projection.cornersNdc);
      cases.push({label:'diagonal shot plane',passed:true});

      const obstructionPosition = p(...result.lens).lerp(p(.37,1.26,.75),.45);
      const desk = scene.root.getObjectByName(deskId);
      const board = new THREE.Mesh(new THREE.BoxGeometry(.005,.008,.001),new THREE.MeshBasicMaterial());
      board.name = 'thin-desk-mounted-panel';
      board.position.copy(desk.worldToLocal(group.localToWorld(obstructionPosition.clone())));
      desk.add(board);
      scene.root.updateMatrixWorld(true);
      const boardBounds = new THREE.Box3().setFromObject(board).applyMatrix4(worldToRoom);
      for (const x of [-1,0,1]) for (const y of [0,.95,1.9]) {
        const origin = p(...result.lens), axis = p(x,y,.75).sub(origin).normalize();
        assert.equal(new THREE.Ray(origin,axis).intersectsBox(boardBounds),false);
      }
      failure('five-millimetre-wide panel between all nine grid rays',run,'dance-shot-occluded',deskId,({blocker})=>{
        assert.equal(blocker.mesh,board.name);
        assert(blocker.projectedAreaNdc>0);
      });
      // The same mesh can touch the bottom of the subject plane without blocking it.
      board.position.copy(desk.worldToLocal(group.localToWorld(p(0,-.004,.7505))));
      scene.root.updateMatrixWorld(true);
      assert.equal(run().ok,true);
      cases.push({label:'contact at floor and subject boundary',passed:true});
      desk.remove(board);
      board.geometry.dispose();
      board.material.dispose();

      const installed = scene.root.getObjectByName(cameraId);
      installed.rotation.x += .045;
      scene.root.updateMatrixWorld(true);
      const tilted = run();
      close(tilted.forward[1],-Math.sin(.045));
      assert.notDeepEqual(tilted.projection.cornersNdc,result.projection.cornersNdc);
      cases.push({label:'actual tilted lens orientation',forward:tilted.forward});
    } finally {scene.dispose();}
  }
} finally {library.dispose();}
console.log(JSON.stringify({status:'passed',cases},null,2));
