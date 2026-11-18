import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompany, deriveCompany, prepareCompanyChange} from '../../prototype/src/company/document.js';
import {listPlacementTargets} from '../../prototype/src/company/facility-edit-data.js';
import {createAppearanceSample} from '../../prototype/src/company/appearance-samples.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {encodeCompanySave, decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {validateSupportResource} from '../../prototype/src/company/support-data.js';

const ctx = {catalog, templates};
const batch = JSON.parse(await fs.readFile(new URL('./batch-inputs/static-textile-rooms.json',import.meta.url)));
const fixture = JSON.parse(await fs.readFile(new URL('./fixtures/static-textiles.json',import.meta.url)));
const ref = id => ({id,version:1});
const pose = (x,z,yaw=0) => ({position:[x,0,z],yaw});
const node = (doc,id) => doc.nodes.find(n => n.id===id);
const resource = id => catalog.resources.find(r => r.id===id && r.version===1);
const add = (id,parentId,resourceId,more={}) => ({type:'add-facility',id,parentId,resource:ref(resourceId),...more});
const change = (doc,ops,options={}) => prepareCompanyChange(doc,ops,{...ctx,...options}).document;
const fail = (code,path,message) => {throw Object.assign(Error(message),{code,path});};
const reports = {rooms:[], rejected:[], genericSupport:{}, samples:[]};
function rejected(doc,label,operations,code,options={}) {
  const source = JSON.stringify(doc);
  assert.throws(() => change(doc,operations,options),e => e.code===code,`${label}: expected ${code}`);
  assert.equal(JSON.stringify(doc),source);
  reports.rejected.push({label,code});
}

for (const input of batch.items) {
  const f = fixture.rooms.find(entry => entry.key === input.key);
  const base = createCompanyScaleV2(input.input,catalog,templates);
  const doc = change(base,input.operations);
  const sofa = node(doc,f.hostId), prop = node(doc,f.textileId);
  const surface = resource(sofa.resource.id).supportSurfaces.find(s => s.id===prop.attachment.surfaceId);
  const expected = {position:[surface.center[0],surface.topY,surface.center[1]],yaw:0};
  assert.deepEqual(prop.transform,expected);
  assert.deepEqual(deriveCompany(doc,catalog,templates).usePoints,deriveCompany(base,catalog,templates).usePoints);
  for (const look of fixture.looks) {
    const next = change(doc,[{type:'replace-resource',id:prop.id,resource:look}]);
    assert.deepEqual(node(next,prop.id),{...prop,resource:look});
    inspectCompanyPlacement(next,catalog,templates);
    assert.deepEqual(await decodeCompanySave(await encodeCompanySave(next,catalog,templates),catalog,templates),next);
  }
  const targets = listPlacementTargets(doc,catalog,prop.resource,f.roomId,{templates});
  assert.deepEqual(targets.map(t=>[t.parentId,t.attachment.surfaceId]),[[sofa.id,'textile-rest']]);
  assert.deepEqual(targets[0].position,expected.position);
  const moved = change(doc,[{type:'move',id:sofa.id,transform:f.moveHost}]);
  inspectCompanyPlacement(moved,catalog,templates);
  const before = deriveCompany(doc,catalog,templates), after = deriveCompany(moved,catalog,templates);
  assert.notDeepEqual(before.worlds.get(prop.id),after.worlds.get(prop.id));
  assert.deepEqual(node(moved,prop.id),prop);
  const otherHost = sofa.resource.id==='sofa-textile-modular'?'sofa-textile-arch':'sofa-textile-modular';
  const reskinned = change(doc,[{type:'replace-resource',id:sofa.id,resource:ref(otherHost)}]);
  assert.deepEqual(deriveCompany(reskinned,catalog,templates).usePoints,before.usePoints);
  assert.deepEqual(node(reskinned,prop.id),prop);
  const points = before.usePoints.filter(p=>p.facilityId===sofa.id);
  assert.equal(points.length,2);
  const busy = {isUsePointBusy:id=>id===points[0].id};
  rejected(doc,'move reserved sofa '+sofa.id,[{type:'move',id:sofa.id,transform:f.moveHost}],'facility-busy',busy);
  const safelyEdited = change(doc,[{type:'replace-resource',id:prop.id,resource:fixture.looks[2]}],busy);
  assert.deepEqual(deriveCompany(safelyEdited,catalog,templates).usePoints,before.usePoints);
  reports.rooms.push({room:f.roomId,host:sofa.resource,attached:prop.id,surface:prop.attachment.surfaceId,seatIds:points.map(p=>p.id),
    looks:fixture.looks,relativePosition:prop.transform.position,before:before.worlds.get(prop.id),after:after.worlds.get(prop.id)});
}

for (let index=0;index<4;index++) {
  const sample = createAppearanceSample('static-textile',index,catalog,templates);
  assert.equal(node(sample.document,sample.target).resource.id,fixture.looks[index].id);
  reports.samples.push(sample.resource);
}
const empty = createCompany({id:'textile-installation',width:12,depth:8},catalog);
const roomId = empty.nodes[1].id;
const shelf = catalog.resources.find(r=>r.mountRole==='storage-shelf' && r.supportSurfaces?.length);
const ornament = catalog.resources.find(r=>r.mountRole==='tabletop-ornament' && r.mount==='support-surface');
const hosts = change(empty,[add('sofa',roomId,'sofa-textile-modular',{transform:pose(-2,-1)}),
  add('shelf',roomId,shelf.id,{transform:pose(2,-1)}),add('old-sofa',roomId,'lounge-sofa',{transform:pose(2,1.5)})]);
const on = surfaceId=>({attachment:{surfaceId}});
const middle = shelf.supportSurfaces.find(s=>s.id==='middle');
const first = change(hosts,[add('ornament','shelf',ornament.id,on(middle.id)),add('cloth','sofa','static-textile-pillow',on('textile-rest'))]);
assert.deepEqual(node(first,'ornament').transform.position,[middle.center[0],middle.topY,middle.center[1]]);
const another = shelf.supportSurfaces.find(s=>s.id!==middle.id);
const reattached = change(first,[{type:'attach-surface',id:'ornament',parentId:'shelf',surfaceId:another.id}]);
assert.deepEqual(node(reattached,'ornament').transform.position,[another.center[0],another.topY,another.center[1]]);
const copyHost = position => change(first,[{type:'copy-facility',id:'sofa',newId:'second',transform:position}]);
assert.throws(()=>inspectCompanyPlacement(copyHost(pose(-2,1.7,Math.PI/2)),catalog,templates),
  e=>e.code==='blocked-use-space' && e.path==='sofa#left.exit' && e.details.obstacleId==='second');
reports.rejected.push({label:'copied sofa blocks original left seat exit',code:'blocked-use-space'});
const copy = copyHost(pose(-4.45,1.45,Math.PI/2));
const child = copy.nodes.find(n=>n.parentId==='second');
assert(child && child.id!=='cloth');
assert.deepEqual(child.attachment,node(first,'cloth').attachment);
assert.deepEqual(child.transform,node(first,'cloth').transform);
inspectCompanyPlacement(copy,catalog,templates);
reports.genericSupport={shelf:shelf.id,added:middle.id,reattached:another.id,copiedChild:child.id};
rejected(first,'textile on a shelf',[add('wrong','shelf','static-textile-throw',on(middle.id))],'incompatible-textile-support');
rejected(first,'ordinary prop on a textile arm',[add('wrong','sofa',ornament.id,on('textile-rest'))],'incompatible-textile-support');
rejected(first,'old sofa has no wide arm',[add('wrong','old-sofa','static-textile-pillow',on('textile-rest'))],'missing-support-surface');
rejected(first,'another textile overlaps',[add('second-cloth','sofa','static-textile-sofa-cover',on('textile-rest'))],'overlapping-supported-props');
rejected(first,'explicit pose crosses the arm edge',[{type:'move',id:'cloth',transform:{position:[.9,.7,0],yaw:0}}],'invalid-support-fit');
rejected(first,'missing surface on reattachment',[{type:'attach-surface',id:'cloth',parentId:'sofa',surfaceId:'missing'}],'missing-support-surface');
rejected(first,'incompatible narrower sofa replacement',[{type:'replace-resource',id:'sofa',resource:ref('sofa-modular')}],'incompatible-replacement');
const intruding=structuredClone(resource('sofa-textile-modular'));
intruding.supportSurfaces[0].center=[.48,0];
assert.throws(()=>validateSupportResource(intruding,fail),e=>e.code==='textile-rest-over-seat');
reports.rejected.push({label:'misdeclared support overlaps right seat',code:'textile-rest-over-seat'});
console.log(JSON.stringify({status:'passed',...reports},null,2));
