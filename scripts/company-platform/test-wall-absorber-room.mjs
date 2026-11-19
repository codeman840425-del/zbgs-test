import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {scanRoomMeshes,rayHit} from '../../prototype/src/company/room-mesh-geometry.js';
import {wallAbsorberFloors,measureWallAbsorberFloor} from '../../prototype/src/company/wall-absorber-room.js';
import {shouldCheckWallAbsorbers,checkWallAbsorberRooms} from './check-wall-absorber-room.mjs';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
import {checkManagedOutput} from './package-company.mjs';
import {runCompanyBatch} from './batch.mjs';

const [folder,...rest]=process.argv.slice(2),root=path.resolve(import.meta.dirname,'../..');
assert(folder&&!rest.length,'node scripts/company-platform/test-wall-absorber-room.mjs NEW_MANAGED_DIRECTORY');
const out=path.resolve(folder),published=path.join(out,'published');
await checkManagedOutput(out,undefined,{allowDelivery:false});
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const recipe=JSON.parse(await fs.readFile(new URL('./batch-inputs/wall-absorber-rooms.json',import.meta.url)));
const opts={catalog,templates},sha=b=>createHash('sha256').update(b).digest('hex');
const run=items=>runCompanyBatch({...recipe,items},{outputDirectory:published});
const v=(...a)=>new T.Vector3(...a),tuple=p=>p.toArray().map(n=>Number(n.toFixed(6))||0);
const ref=id=>({id,version:1}),move=(id,position,yaw)=>({type:'move',id,transform:{position,yaw}});
const add=(id,parentId,resource,position,yaw)=>({type:'add-facility',id,parentId,resource:ref(resource),transform:{position,yaw}});
const change=(doc,ops)=>prepareCompanyChange(doc,ops,opts).document;
const report={status:'running',rooms:[],rejections:[],scope:'Installed panel and room geometry, authored singing references and optical framing; no acoustic or actor measurement.'};
async function pins(){
  const result={};
  for(const row of recipe.items)for(const name of ['input.json','layout.json','save.json','report.json'])
    result[row.key+'/'+name]=sha(await fs.readFile(path.join(published,row.key,name)));
  return result;
}

async function viewPanel(doc,singing,panel){
  const d=deriveCompany(doc,catalog,templates),[group]=wallAbsorberFloors(doc,d),room=d.nodes.get(panel.roomId);
  let results;
  await preflightLibraryAssets({root,resources:group.resources,validate:assetLibrary=>{
    const scene=createCompanyScene(new T.Scene(),doc,{...opts,assetLibrary,visibleFloorId:group.id,mirrorPreflight:()=>{}});
    try{
      scene.root.updateMatrixWorld(true);
      const records=[];
      const {worldToRoom}=scanRoomMeshes(scene,room,group.facilities,[],[],(object,owner,matrix,bounds)=>
        records.push({id:owner?.id??object.name,object,matrix:matrix.clone(),bounds:bounds.clone()}));
      const local=worldToRoom.multiply(scene.root.getObjectByName(panel.id).matrixWorld);
      const front=v(0,0,1).transformDirection(local),lens=v(...singing.camera.lens),forward=v(...singing.camera.forward),right=v(forward.z,0,-forward.x);
      const roomRecords=records.filter(r=>!(r.id===singing.roles.camera&&(r.object.userData.name||r.object.name)===singing.camera.node));
      results=[[0,0],[-.27,-.54],[-.27,.54],[.27,-.54],[.27,.54]].map(([x,y])=>{
        const target=v(x,y,0).applyMatrix4(local),hit=rayHit(roomRecords,lens,target);
        assert.equal(hit?.record.id,panel.id,'Installed camera must see the panel surface at each sampled part');
        assert(hit.normal.dot(front)>.05,'Camera hit a back/edge triangle');
        const direction=hit.point.clone().sub(lens);
        const h=T.MathUtils.radToDeg(Math.atan2(direction.dot(right),direction.dot(forward)));
        const e=T.MathUtils.radToDeg(Math.atan2(direction.y,Math.hypot(direction.x,direction.z)));
        assert(Math.abs(h)<=35&&Math.abs(e)<=23);
        return {point:tuple(hit.point),part:hit.record.object.userData.name||hit.record.object.name,horizontalDeg:h,verticalDeg:e};
      });
      if(room.id.includes('wall-absorber-studio/')){
        const backdrop=room.id+'/background',safe=move(backdrop,[1.35,0,2.18],Math.PI);
        scene.setWallView({mode:'cutaway',cameraPosition:[-1.1,2.1,5.5]});
        const probe=scene.createPlacementProbe();
        try{
          assert(probe.check([safe]).valid);
          assert.throws(()=>probe.check([move(backdrop,[-1.45,0,2.85],Math.PI)]),e=>e.code==='wall-absorber-occupied');
          assert(probe.check([safe]).valid);
          assert.deepEqual(scene.document,doc);
          report.dragProbe={cutaway:true,acceptedBeforeAndAfter:true,rejected:'wall-absorber-occupied',documentRetained:true};
        }finally{probe.dispose();}
      }
    }finally{scene.dispose();}
  }});
  return results;
}

try{
  const first=await run(recipe.items);assert(first.ok,JSON.stringify(first));
  const originals=await pins(),docs=[];
  for(const item of recipe.items){
    const saved=await fs.readFile(path.join(published,item.key,'save.json'),'utf8'),doc=await decodeCompanySave(saved,catalog,templates);
    const checks=JSON.parse(await fs.readFile(path.join(published,item.key,'report.json'))).checks;
    const rooms=await checkWallAbsorberRooms(doc);assert.deepEqual(checks.wallAbsorberRooms,rooms);
    const [panel]=rooms[0].panels;assert.equal(panel.support.length,5);assert(panel.support.every(s=>s.gapM<=.001));
    assert(panel.frontDepthM>.01&&panel.bearing.gapM<=.001);
    const [singing]=checks.singingRooms;assert(singing.ok&&singing.alternateHeight.profile==='low');
    report.rooms.push({key:item.key,saveSha256:sha(saved),...rooms[0],camera:await viewPanel(doc,singing,panel),
      micDistance:singing.microphone.distanceMetres,otherHeight:singing.alternateHeight.profile,entrance:singing.access.portalId});
    docs.push(doc);
  }
  const [studio]=docs,room=studio.singingRooms[0].regionId,id=room+'/absorber',backdrop=room+'/background';
  async function reject(label,doc,operations,code){
    const response=await run([{key:doc.id,document:doc,operations}]),r=response.results[0];
    assert.equal(r.status,'failed',label+' '+JSON.stringify(response));assert.equal(r.code,code,JSON.stringify(r));
    assert.deepEqual(await pins(),originals);report.rejections.push({label,code:r.code,path:r.path,details:r.details});
  }
  const reverse=move(backdrop,[-1.45,0,2.85],Math.PI);
  await reject('existing floor backdrop moved into installed panel',studio,[reverse],'wall-absorber-occupied');
  const second=add(id+'-adjacent',room,'wall-absorber-upholstered',[-1.70,1.55,2.90],Math.PI);
  const adjoining=change(studio,[second]),adjacentReports=await checkWallAbsorberRooms(adjoining);
  assert.equal(adjacentReports[0].panels.length,2);report.adjoining=adjacentReports[0].panels.map(p=>p.id);
  await reject('two adjacent panels moved 180mm into each other',studio,[{...second,transform:{position:[-1.52,1.55,2.90],yaw:Math.PI}}],'wall-absorber-occupied');
  await reject('shift across a real doorway',studio,[move(id,[0,1.55,2.90],Math.PI)],'wall-display-over-portal');
  await reject('rear plane 40mm behind wall',studio,[move(id,[-1.10,1.55,2.94],Math.PI)],'invalid-wall-fit');
  const window=add(room+'/test-window',room,'window-opening-square-basic',[-2.90,1.45,0],Math.PI/2);
  await reject('registered window on formerly solid west wall',studio,[window,move(id,[-2.90,1.4,0],Math.PI/2)],'wall-display-over-window');
  await reject('positive volume inside perpendicular wall at corner',studio,[move(id,[-2.65,1.55,2.90],Math.PI)],'wall-absorber-wall');
  const bare=change(studio,[{type:'remove',id}]);assert(!shouldCheckWallAbsorbers(bare));assert.deepEqual(await checkWallAbsorberRooms(bare),[]);
  const rotated=structuredClone(studio);rotated.nodes.find(n=>n.kind==='room').transform.yaw=Math.PI/2;
  rotated.nodes.find(n=>n.kind==='floor').transform={position:[3.5,0,-1.75],yaw:Math.PI};
  const [turned]=await checkWallAbsorberRooms(rotated);assert.deepEqual(turned.panels[0].position,report.rooms[0].panels[0].position);
  assert.deepEqual(turned.panels[0].normal,report.rooms[0].panels[0].normal);report.rotatedRoot=turned.panels[0].bearing;

  // A closed component can enclose the entire installation without crossing an interior box face.
  // A hollow, disconnected component with the same bounds must still pass.
  const derived=deriveCompany(studio,catalog,templates),[group]=wallAbsorberFloors(studio,derived),placement=inspectCompanyPlacement(studio,catalog,templates);
  await preflightLibraryAssets({root,resources:group.resources,validate:library=>{
    function enclosed(hollow){
      const injected={instantiate(resource){
        if(resource.id!=='background-brand-panel')return library.instantiate(resource);
        // The real backdrop anchor is [1.4,0,2.18] yaw pi. Geometry below is a regression fixture in its local space.
        const coordinates=[];
        for(const dx of hollow?[-.48,.48]:[0]){
          const solid=new T.BoxGeometry(hollow ? .04 : 1,1.5,.13);
          const surface=solid.toNonIndexed();
          surface.translate(2.5+dx,1.55,-.68);
          coordinates.push(...surface.attributes.position.array);solid.dispose();surface.dispose();
        }
        const geometry=new T.BufferGeometry();
        geometry.setAttribute('position',new T.Float32BufferAttribute(coordinates,3));geometry.computeVertexNormals();
        const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial());
        mesh.name='containment-control';
        const instance=library.instantiate(resource);instance.root.add(mesh);return instance;
      }};
      return measureWallAbsorberFloor(studio,derived,placement,group,{...opts,assetLibrary:injected});
    }
    assert.throws(()=>enclosed(false),e=>{assert.equal(e.code,'wall-absorber-occupied');assert.equal(e.details.kind,'panel-inside-solid');
      report.solidContainment=e.details;return true;});
    assert(enclosed(true)[0].ok);
  }});
  const building=createCompanyScaleV2({id:'absorber-two-floor-control',scale:'building',spaceProfile:{id:'company-space-v2',version:1},
    furnishingVersion:2,floors:[{id:'ground',rooms:[]},{id:'upper',rooms:[]}]},catalog,templates);
  const upper=building.id+'/upper',lower=building.id+'/ground',upRoom=upper+'/room-1',loRoom=lower+'/room-1';
  const upperId=upRoom+'/panel',lowerBg=loRoom+'/backdrop',upperBg=upRoom+'/backdrop';
  const hidden=change(building,[add(upperId,upRoom,'wall-absorber-foam',[0,1.55,-2.90],0),
    add(upperBg,upRoom,'background-brand-panel',[0,0,-2.0],0),add(lowerBg,loRoom,'background-brand-panel',[0,0,-2.85],0)]);
  const hiddenDerived=deriveCompany(hidden,catalog,templates),resources=[...hiddenDerived.facilities,...hiddenDerived.surfaceFinishes].map(f=>f.resource);
  await preflightLibraryAssets({root,resources,validate:async assetLibrary=>{
    const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,value)=>memory.set(k,value)};
    const open=doc=>createCompanyAuthoring(new T.Scene(),doc,{...opts,storage,assetLibrary,mirrorPreflight:()=>{}});
    const session=await open(hidden);
    try{
      await session.setView({floorId:lower});await session.save();const before=session.readSavedText(hidden.id);
      const original=session.document;
      await assert.rejects(session.apply([move(upperBg,[0,0,-2.85],0)]),e=>e.code==='wall-absorber-occupied');
      assert.deepEqual(session.document,original);assert.equal(session.readSavedText(hidden.id),before);
      report.hiddenFloor={visible:lower,checked:upper,retainedSave:sha(before),differentFloorAllowed:lowerBg};
    }finally{session.dispose();}
    const restored=await open(building);
    try{
      await restored.restore(hidden.id);assert.deepEqual(restored.document,hidden);
      const [checked]=await checkWallAbsorberRooms(restored.document);assert.equal(checked.panels[0].resource.id,'wall-absorber-foam');
      report.hiddenFloor.coldRestored=checked.panels[0];
    }finally{restored.dispose();}
  }});
  const repeat=await run(recipe.items);assert(repeat.ok,JSON.stringify(repeat));assert.deepEqual(await pins(),originals);
  report.retry=repeat.results.map(r=>({key:r.key,status:r.status}));report.unchanged=originals;report.status='passed';
}catch(e){report.status='failed';report.error={code:e.code,message:e.message};throw e;}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,rooms:report.rooms.length,rejections:report.rejections.length,output:out}));
