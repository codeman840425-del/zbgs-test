import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { createCompanyAssetLibrary } from '../../prototype/src/company/asset-library.js';
import { createCompanyAuthoring } from '../../prototype/src/company/authoring.js';
import { createCompany, deriveCompany } from '../../prototype/src/company/document.js';
import { inspectCompanyPlacement } from '../../prototype/src/company/placement.js';
import { encodeCompanySave } from '../../prototype/src/company/persistence.js';
import { installNodeImageDecodeShim } from './preflight-library-assets.mjs';

const project = new URL('../../', import.meta.url);
const read = async path => JSON.parse(await fs.readFile(new URL(path, project), 'utf8'));
const catalog = await read('prototype/src/company/library-catalog.json');
const templates = await read('prototype/src/company/templates-extended.json');
const quarter = Math.PI / 2;
const transform = (x = 0, z = 0, yaw = 0) => ({ position: [x, 0, z], yaw });
const ref = id => ({ id, version: 1 });
const variants = ['timber', 'fabric', 'acoustic', 'glass'].map(style => {
  const id = 'screen-partition-' + style;
  const resource = catalog.resources.find(r => r.id === id && r.version === 1);
  assert(resource, 'The production catalog is missing ' + id + '@1');
  assert.equal(resource.asset?.format, 'glb');
  for (const [field, value] of Object.entries({mountRole:'screen-partition', productionBranch:'screen-partition',
    category:'decor', mount:'floor-surface', parent:'room.floor', coordinates:{units:'metres',up:'+Y',forward:'+Z'},
    mounting:{origin:'bottom',width:1.8,height:2,depth:.08}, footprint:{center:[0,0],halfSize:[.9,.04],blocking:true},
    stateDefaults:{}, usePoints:[]})) assert.deepEqual(resource[field], value, id + '.' + field);
  return resource;
});
assert.equal(new Set(variants.map(r => r.asset.sha256)).size, 4, 'Four independent model files are required');
const result = { command:'node scripts/company-platform/test-screen-partition-placement.mjs',
  variants:[], editing:{}, rejection:[], scope:'CPU authoring, actual loaded GLBs, continuous static placement and rendered navigation provider.' };
const facility = (id, parentId, resource, pose) => ({kind:'facility',id,parentId,resource:ref(resource),transform:pose,state:{}});
const move = (id, pose) => ({type:'move',id,transform:pose});
const near = (a, b, epsilon = 1e-5) => assert(Math.abs(a - b) <= epsilon, a + ' differs from ' + b);
const rounded = values => values.map(value => Number(value.toFixed(5)));
installNodeImageDecodeShim();
const storageItems = new Map();
const storage = { getItem:key => storageItems.get(key) ?? null, setItem:(key,value) => storageItems.set(key,value) };
const sessions = [];
async function open(document) {
  const library = createCompanyAssetLibrary({fetchImpl:async url => {
    const bytes = await fs.readFile(new URL('prototype/public' + url, project));
    return {ok:true,arrayBuffer:async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)};
  }});
  try {
    const session = await createCompanyAuthoring(new THREE.Group(), document, {catalog,templates,assetLibrary:library,storage});
    const close = () => {session.dispose(); library.dispose();};
    sessions.push(close);
    return session;
  } catch (error) {library.dispose(); throw error;}
}

const empty = createCompany({id:'screen-placement',width:8,depth:6}, catalog);
empty.scale = 'building';
const [floor, first] = empty.nodes;
const second = {...structuredClone(first),id:'neighbour',name:'等候室',purpose:'rest',transform:transform(8,0,Math.PI)};
empty.nodes.push(second);
first.entry = {position:[-2.6,0,1.8]};
floor.transform = transform(4,-3,quarter);
const upstairs = {id:'upper-floor',kind:'floor',parentId:empty.id,name:'二层',transform:structuredClone(floor.transform)};
const upperRoom = {...structuredClone(first),id:'upper-room',parentId:upstairs.id};
empty.nodes.push(upstairs,upperRoom);
floor.exteriorEntrances = [{id:'street-door',regionId:first.id,edge:'north',offset:0,width:1.4,height:2.2}];
floor.connections = [{id:'room-door',from:{regionId:first.id,edge:'east',offset:0,width:1.4},
  to:{regionId:second.id,edge:'east',offset:0,width:1.4}}];
empty.nodes.push(facility('work-chair',first.id,'chair',transform(-2.2,-.9)));
const panel = 'working-screen';
const edited = structuredClone(empty);
edited.nodes.push(facility(panel,first.id,variants[0].id,transform()));

function inspectModel(session, id, resource) {
  const scene = session.scene;
  scene.root.updateWorldMatrix(true,true);
  const nav = scene.navigation().obstacles.find(obstacle => obstacle.instanceId === id);
  assert(nav && nav.kind === 'facility', 'Missing navigation obstacle: ' + id);
  const root = scene.root.getObjectByName(id);
  assert.equal(nav.object, root);
  const mesh = root.children[0]; // The GLB instance, excluding the editor LOD proxy.
  const box = new THREE.Box3().setFromObject(mesh,true);
  const actual = deriveCompany(session.document,catalog,templates).obstacles.find(o => o.id === id);
  assert.deepEqual(nav.footprint,resource.footprint);
  near(box.min.y,0,.001); near(box.max.y,2,.001);
  for (const [axis, field] of ['x','z'].entries()) {
    near(box.min[field],actual.min[axis],.002);
    near(box.max[field],actual.max[axis],.002);
    near(nav[field],(actual.min[axis]+actual.max[axis])/2);
    near(nav[field === 'x' ? 'hw' : 'hd'],(actual.max[axis]-actual.min[axis])/2+.22);
  }
  const caster = new THREE.Raycaster();
  let hits = 0;
  for (const x of [-.8,-.5,0,.5,.8]) for (const y of [.15,.45,.95,1.45,1.9]) {
    const origin = root.localToWorld(new THREE.Vector3(x,y,1));
    const direction = root.localToWorld(new THREE.Vector3(x,y,0)).sub(origin).normalize();
    caster.set(origin,direction); caster.far=2;
    if (caster.intersectObject(mesh,true).length) hits++;
  }
  assert(hits > 0,'No physical screen triangle intersects any of the 25 rays');
  return {min:rounded(box.min.toArray()),max:rounded(box.max.toArray()),meshRayHits:hits,probes:25};
}

// Query finite segments in the navigation provider's world-space obstacle.
// Both endpoints must be outside, so endpoint-only sampling could not pass this assertion.
function crossing(session, roomId, screenId, x, z, alongZ) {
  const obstacle = session.scene.navigation().obstacles.find(o => o.instanceId === screenId);
  const room = session.scene.root.getObjectByName(roomId);
  const box = new THREE.Box3(new THREE.Vector3(obstacle.x-obstacle.hw,-1,obstacle.z-obstacle.hd),
    new THREE.Vector3(obstacle.x+obstacle.hw,1,obstacle.z+obstacle.hd));
  const points = [-.55,.55].map(delta => room.localToWorld(new THREE.Vector3(x+(alongZ?0:delta),0,z+(alongZ?delta:0))));
  assert(points.every(point => !box.containsPoint(point)),'Probe endpoint is inside the obstacle');
  const ray = new THREE.Ray(points[0],points[1].clone().sub(points[0]).normalize());
  const hit = ray.intersectBox(box,new THREE.Vector3());
  return !!hit && hit.distanceTo(points[0]) <= points[0].distanceTo(points[1]);
}

async function rejectedUnchanged(session, label, operation, code, path) {
  const before = session.snapshot(), stored = [...storageItems], root = session.scene.root;
  let actual;
  await assert.rejects(() => session.apply([operation]), error => {
    actual = {label,code:error.code,path:error.path,details:error.details};
    assert.equal(error.code,code,error.message);
    if(path) assert.equal(error.path,path);
    return true;
  });
  assert.deepEqual(session.snapshot(),before);
  assert.equal(session.scene.root,root);
  assert.deepEqual([...storageItems],stored);
  result.rejection.push(actual);
}

try {
  const session = await open(edited);
  for(const resource of variants) {
    await session.apply([{type:'replace-resource',id:panel,resource:ref(resource.id)}]);
    const instance = session.document.nodes.find(n => n.id === panel);
    assert.equal(instance.parentId,first.id); assert.deepEqual(instance.transform,transform());
    assert.deepEqual(instance.resource,ref(resource.id));
    result.variants.push({id:resource.id+'@1',glbSha256:resource.asset.sha256,...inspectModel(session,panel,resource)});
  }
  assert.equal(crossing(session,first.id,panel,.65,0,true),true);
  assert.equal(crossing(session,first.id,panel,0,.65,false),false);
  result.editing.directCrossings = {
    beforeRotation:{alongRoomZ:'blocked',alongRoomX:'free'},
    afterQuarterTurn:{alongRoomZ:'free',alongRoomX:'blocked'},
    afterMove:{oldAlongRoomX:'free',newAlongRoomX:'blocked'},
    segmentLength:1.1, endPoints:'outside the navigation obstacle',
  };
  await session.apply([move(panel,transform(0,0,quarter))]);
  assert.equal(crossing(session,first.id,panel,.65,0,true),false);
  assert.equal(crossing(session,first.id,panel,0,.65,false),true);
  result.editing.rotatedGlass = inspectModel(session,panel,variants[3]);
  await session.apply([move(panel,transform(1.8,.35,quarter))]);
  assert.equal(crossing(session,first.id,panel,0,.65,false),false);
  assert.equal(crossing(session,first.id,panel,1.8,1,false),true);
  result.editing.movedGlass = inspectModel(session,panel,variants[3]);

  const copy = 'neighbour-screen';
  await session.apply([{type:'copy-facility',id:panel,newId:copy,parentId:second.id,transform:transform(.5,-.65,quarter)}]);
  result.editing.crossRoomCopy = inspectModel(session,copy,variants[3]);
  await session.apply([{type:'replace-resource',id:copy,resource:ref(variants[0].id)}]);
  assert.deepEqual(session.document.nodes.find(n => n.id === panel).resource,ref(variants[3].id));
  assert.equal(session.document.nodes.find(n => n.id === copy).parentId,second.id);
  inspectModel(session,copy,variants[0]);
  const upperCopy = 'upper-screen';
  await session.apply([{type:'copy-facility',id:panel,newId:upperCopy,parentId:upperRoom.id,transform:transform(1.8,.35,quarter)}]);
  const upstairsNav = session.scene.navigation(upstairs.id).obstacles.find(o => o.instanceId === upperCopy);
  assert.equal(upstairsNav.object,null);
  assert(!session.scene.navigation().obstacles.some(o => o.instanceId === upperCopy));
  await session.setView({floorId:upstairs.id});
  assert.deepEqual(inspectModel(session,upperCopy,variants[3]),result.editing.movedGlass);
  assert(!session.scene.navigation().obstacles.some(o => o.instanceId === panel));
  await session.setView({floorId:floor.id});
  result.editing.overlaidFloors = {lower:panel,upper:upperCopy,sameWorldBounds:true,distinctFloorObstacles:true};
  const placement = inspectCompanyPlacement(session.document,catalog,templates);
  assert.equal(placement.checkedPortals.length,3);
  assert(placement.checkedPoints.some(p => p.facilityId === 'work-chair' && p.approachConnected && p.exitConnected));
  result.editing.clearPortals = placement.checkedPortals.map(p=>({id:p.connectionId,region:p.regionId,side:p.side}));
  await session.save();
  const savedText = session.readSavedText(edited.id);
  await rejectedUnchanged(session,'exterior entrance',move(panel,transform(0,-2.69)),'blocked-portal','street-door');
  await rejectedUnchanged(session,'interior doorway',move(panel,transform(3.66,0,quarter)),'blocked-portal','room-door');
  await rejectedUnchanged(session,'seat approach',move(panel,transform(-2.2,-.30)),'blocked-use-space','work-chair#seat.approach');
  await rejectedUnchanged(session,'seat exit only',move(panel,transform(-2.2,.029)),'blocked-use-space','work-chair#seat.exit');
  await rejectedUnchanged(session,'screen over room wall',move(panel,transform(3.28,0)),'invalid-floor-fit');
  await rejectedUnchanged(session,'screen off floor',move(panel,{position:[1.8,.1,.35],yaw:quarter}),'unsupported-height');
  await rejectedUnchanged(session,'copy overlapping original',{type:'copy-facility',id:panel,newId:'invalid-copy'},'overlapping-facilities');
  assert.equal(session.readSavedText(edited.id),savedText);
  const savedSnapshot = session.snapshot();
  sessions.pop()();
  const reopened = await open(empty);
  await reopened.restore(edited.id);
  assert.deepEqual(reopened.snapshot(),savedSnapshot);
  assert.equal(await reopened.export(),savedText);
  inspectModel(reopened,panel,variants[3]); inspectModel(reopened,copy,variants[0]);
  result.editing.save = {revision:reopened.document.revision,sha256:createHash('sha256').update(savedText).digest('hex')};
  const damaged = JSON.parse(savedText);
  const pin = damaged.dependencies.resources.find(r => r.id === variants[3].id);
  pin.sha256 = '0'.repeat(64);
  await assert.rejects(() => reopened.import(JSON.stringify(damaged)), {code:'dependency-content-mismatch'});
  assert.deepEqual(reopened.snapshot(),savedSnapshot);
  assert.equal(reopened.readSavedText(edited.id),savedText);
  result.rejection.push({label:'saved resource digest mismatch',code:'dependency-content-mismatch'});

  const oldRoom = await read('prototype/src/company/examples/c1-studio.json');
  const oldCatalog = {...catalog,resources:catalog.resources.filter(r => r.productionBranch !== 'screen-partition')};
  const oldSave = await encodeCompanySave(oldRoom,oldCatalog,templates);
  await reopened.import(oldSave);
  assert.deepEqual(reopened.document,oldRoom);
  assert.equal(await reopened.export(),oldSave);
  result.editing.preExistingRoom = {id:oldRoom.id,sha256:createHash('sha256').update(oldSave).digest('hex')};

  // Two real 1.8m screens in a 4m room leave only a 4cm seam and 18cm end gaps.
  // Closing the seam disconnects the seat from entry without hitting either endpoint.
  const corridor = createCompany({id:'screen-aisle',width:4,depth:6},catalog);
  const aisle = corridor.nodes[1];
  aisle.entry = {position:[0,0,-2.2]};
  corridor.nodes.push(facility('aisle-seat',aisle.id,'chair',transform(0,1.5)),
    facility('left-leaf',aisle.id,variants[0].id,transform(-.92,.07,quarter)),
    facility('right-leaf',aisle.id,variants[3].id,transform(.92,.07)));
  const passage = await open(corridor);
  assert(inspectCompanyPlacement(passage.document,catalog,templates).checkedPoints[0].approachConnected);
  await rejectedUnchanged(passage,'turn real screen across the only aisle',move('left-leaf',transform(-.92,.07)),'disconnected-use-space');
  await passage.apply([move('right-leaf',transform(.92,-1.6,quarter)),move('left-leaf',transform(-.92,.07))]);
  assert(inspectCompanyPlacement(passage.document,catalog,templates).checkedPoints[0].approachConnected);
  result.editing.aisle = {width:4,panels:2,seam:.04,endGaps:.18,thinAxisDepth:.08,
    open:'seat reachable',closed:'disconnected-use-space',relocated:'seat reachable'};
  result.status = 'passed';
  const output = new URL('output/',project);
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(new URL('screen-partition-placement-v1.json',output),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,variants:result.variants.length,rejections:result.rejection.length,receipt:'output/screen-partition-placement-v1.json'}));
} finally { for (const close of sessions.reverse()) close(); }
