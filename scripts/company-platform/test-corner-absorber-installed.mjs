import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import catalogInput from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompany,deriveCompany} from '../../prototype/src/company/document.js';
import {cornerAbsorberTransform} from '../../prototype/src/company/corner-absorber-data.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {shouldCheckWallAbsorbers,wallAbsorberFloors,measureWallAbsorberFloor,inspectWallAbsorberObjects} from '../../prototype/src/company/wall-absorber-room.js';
import {checkManagedOutput} from './package-company.mjs';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';

const {output}=parseArgs({options:{output:{type:'string'}}}).values;
const root=path.resolve(import.meta.dirname,'../..'),out=output&&path.resolve(output),file=out&&path.join(out,'report.json');
if(file){
  await checkManagedOutput(out,root,{allowDelivery:false});await checkManagedOutput(file,root,{allowDelivery:false});
  const stat=p=>fs.lstat(p).catch(e=>{if(e.code!=='ENOENT')throw e;});
  for(let dir=out;;dir=path.dirname(dir)){
    const entry=await stat(dir);assert(!entry||(entry.isDirectory()&&!entry.isSymbolicLink()),'Invalid inspection directory: '+dir);
    if(dir===path.dirname(dir))break;
  }
  assert(!await stat(file),'Inspection report already exists: '+file);
}
const catalog=structuredClone(catalogInput);
const actualCup=catalog.resources.find(r=>r.id==='tea-ceramic-cup'&&r.version===1);
assert(actualCup?.asset);
// Isolate the collision query from tabletop-slot validation. The fixture loads the
// signed product GLB unscaled in its own nonblocking inspection-only decor card.
const cup={id:'inspection-free-ceramic-cup',version:1,category:'decor',mountRole:'inspection-decor',usePoints:[],stateDefaults:{},
  coordinates:actualCup.coordinates,asset:actualCup.asset,footprint:{blocking:false}};
catalog.resources.push(cup);
const opts={catalog,templates},fixture=createCompany({id:'corner-room-inspection',width:8,depth:6},catalog);
fixture.scale='building';
const [ground,room]=fixture.nodes;
const upper={...structuredClone(ground),id:'upper',name:'二层'};
const upstairs={...structuredClone(room),id:'upper-room',parentId:upper.id,transform:{position:[2,0,-1],yaw:Math.PI/2}};
upstairs.finishes={baseboard:{resource:{id:'baseboard-timber',version:1}}};
fixture.nodes.push(upper,upstairs);
const corner='north-west',pose=cornerAbsorberTransform(room,corner,.20);
for(const [parent,id] of [[room,'ground-unit'],[upstairs,'upper-unit']]){
  fixture.nodes.push({kind:'facility',id,parentId:parent.id,attachment:{corner},resource:{id:'corner-absorber-triangular',version:1},state:{},transform:structuredClone(pose)});
}
function ornament(doc,x,y,z,id='porcelain',parent=upstairs){
  doc.nodes.push({kind:'facility',id,parentId:parent.id,resource:{id:cup.id,version:1},
    transform:{position:[pose.position[0]+x,pose.position[1]+y,pose.position[2]+z],yaw:0},state:{}});
}
const safe=structuredClone(fixture);ornament(safe,.292,1.0,.292);
const inside=structuredClone(fixture);ornament(inside,.12,1.0,.12);
const touching=structuredClone(fixture);ornament(touching,.11,2.20,.11);
const throughTrim=structuredClone(fixture);
throughTrim.nodes.find(n=>n.id==='upper-unit').transform=cornerAbsorberTransform(upstairs,corner,.060);
const report={fixture:{id:cup.id,source:actualCup.id+'@'+actualCup.version,modelSha256:cup.asset.sha256,blocking:false},cases:[]};
function checked(doc,assetLibrary){
  const d=deriveCompany(doc,catalog,templates),placement=inspectCompanyPlacement(doc,catalog,templates);
  assert(shouldCheckWallAbsorbers(doc,d));assert(shouldCheckWallAbsorbers(doc,{catalog}));
  return wallAbsorberFloors(doc,d).flatMap(g=>measureWallAbsorberFloor(doc,d,placement,g,{...opts,assetLibrary}));
}
async function main(){
  const d=deriveCompany(safe,catalog,templates),groups=wallAbsorberFloors(safe,d);
  await preflightLibraryAssets({root,resources:groups.flatMap(g=>g.resources),validate:async lib=>{
    for(const [id,doc] of [['nonblocking cup in empty corner of the square',safe],['cup bearing on top without penetration',touching]]){
      const measured=checked(doc,lib);
      assert.equal(measured.length,2);
      const panels=measured.flatMap(g=>g.panels);assert.equal(panels.length,2);
      for(const p of panels)for(const axis of ['x','z']){
        assert.equal(p.bearings[axis].samples.length,9);
        assert(p.bearings[axis].samples.every(s=>s.gapM<=.001&&s.mesh&&s.wall));
      }
      report.cases.push({id,result:'accepted',floors:measured});
    }
    assert.throws(()=>checked(inside,lib),e=>{
      assert.equal(e.code,'corner-absorber-room-occupied');assert.equal(e.details.other,'porcelain');
      report.cases.push({id:'same real cup inside triangular core',result:'rejected',code:e.code,details:e.details});return true;
    });
    assert.throws(()=>checked(throughTrim,lib),e=>{
      assert.equal(e.code,'corner-absorber-room-wall');assert.match(e.details.mesh,/baseboard/);
      report.cases.push({id:'low mounted rail crosses the signed timber wall trim',result:'rejected',code:e.code,details:e.details});return true;
    });
    const entries=new Map(),storage={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v)};
    const author=await createCompanyAuthoring(new T.Scene(),safe,{...opts,assetLibrary:lib,storage});
    try{
      assert.equal(author.scene.visibleFloorId??author.scene.view.floorId,ground.id);
      const before=JSON.stringify(author.document),op={type:'move',id:'porcelain',transform:inside.nodes.find(n=>n.id==='porcelain').transform};
      await assert.rejects(()=>author.apply([op]),e=>e.code==='corner-absorber-room-occupied');
      assert.equal(JSON.stringify(author.document),before);
      report.cases.push({id:'edit on non-viewed upper floor',result:'rejected',code:'corner-absorber-room-occupied',documentRetained:true});
    }finally{author.dispose();}
    await lib.preload(groups.find(g=>g.id===upper.id).resources);
    const upperScene=createCompanyScene(new T.Scene(),safe,{...opts,visibleFloorId:upper.id,assetLibrary:lib,mirrorPreflight:()=>{}});
    try{
      const roomNodes=new Map(safe.nodes.map(n=>[n.id,upperScene.root.getObjectByName(n.id)]));
      const facilities=new Map(d.facilities.filter(f=>f.floorId===upper.id).map(f=>[f.id,{...f,visual:roomNodes.get(f.id).children[0]}]));
      const walls=upperScene.walls;
      const prepared={floorId:upper.id,groups:roomNodes,facilities,walls};
      inspectWallAbsorberObjects(d,prepared);
      // Presentation hides visible walls in cutaway mode; structural records remain.
      upperScene.setWallView({mode:'cutaway',cameraPosition:[0,1.6,4]});
      inspectWallAbsorberObjects(d,prepared);
      const missing=walls.filter(w=>!(w.userData.roomId===upstairs.id&&w.userData.edge==='west'));
      assert(missing.length<walls.length);
      assert.throws(()=>inspectWallAbsorberObjects(d,{...prepared,walls:missing}),e=>{
        assert.equal(e.code,'corner-absorber-room-bearing');assert.equal(e.details.edge,'west');
        report.cases.push({id:'missing backing on one wall of rotated upper room',result:'rejected',code:e.code,details:e.details});return true;
      });
    }finally{upperScene.dispose();}
  }});
}
try{await main();report.status='passed';}
catch(e){report.status='failed';report.error={code:e.code,message:e.message,details:e.details};throw e;}
finally{
  if(file){await fs.mkdir(out,{recursive:true});await fs.writeFile(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
  console.log(JSON.stringify({status:report.status,results:report.cases.map(r=>[r.id,r.result]),output:file??null}));
}
