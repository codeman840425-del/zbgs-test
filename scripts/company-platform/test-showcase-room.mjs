import assert from 'node:assert/strict';
import batch from './batch-inputs/product-showcase-rooms.json' with {type:'json'};
import rules from './showcase-inputs/showcase-checks.json' with {type:'json'};
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {pointInTransform,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {checkProductShowcases,checkShowcaseRoom} from './check-showcase-room.mjs';

const reports=[],rejections=[];
let renamedInstances,multipleRoomOrder;
const node=(doc,id)=>doc.nodes.find(n=>n.id===id);
function close(a,b){assert(Math.abs(a-b)<1e-6,`${a} vs ${b}`);}
async function rejected(doc,rule,code,id,details=()=>{}){
  const original=JSON.stringify(doc);
  await assert.rejects(checkShowcaseRoom(doc,rule),err=>{
    assert.equal(err.code,code,err.message);assert.equal(err.path,id,err.message);
    details(err.details);rejections.push({code,id});return true;
  });
  assert.equal(JSON.stringify(doc),original);
}

for(const item of batch.items){
  const base=createCompanyScaleV2(item.input,catalog,templates);
  const {document}=prepareCompanyChange(base,item.operations,{catalog,templates});
  const rule=rules[item.key],saved=JSON.stringify(document),verified=await checkShowcaseRoom(document,rule);
  assert.equal(verified.sight.productHits.length,5);
  assert.deepEqual(verified.supports.map(s=>s.surface),['top','lower','middle','top']);
  for(const s of verified.supports)assert(Math.abs(s.productBottomY-s.roomTopY)<.001);
  reports.push({key:item.key,meshes:verified.checkedMeshes,rayCount:verified.sight.productHits.length,
    offAxisDegrees:verified.sight.productHits.map(s=>s.angleDegrees),portal:verified.portalId});
  const rotated=structuredClone(document),turn={position:[3,0,-4],yaw:Math.PI/2};
  for(const n of rotated.nodes.filter(n=>n.parentId===verified.floorId)){
    n.transform.position=pointInTransform(turn,n.transform.position);n.transform.yaw+=turn.yaw;
  }
  const again=await checkShowcaseRoom(rotated,rule);
  verified.sight.lens.forEach((x,i)=>close(x,again.sight.lens[i]));
  verified.sight.productHits.forEach((h,i)=>close(h.distance,again.sight.productHits[i].distance));
  assert.equal(JSON.stringify(document),saved);
  if(item.key!=='showcase-rental')continue;
  const id=rule.roomId,{featured,camera}=rule.members;
  const remapped=structuredClone(document),custom=structuredClone(rule);
  const nodeMap=new Map(remapped.nodes.map(n=>[n.id,n]));
  const inRoom=n=>n.parentId===id||nodeMap.has(n.parentId)&&inRoom(nodeMap.get(n.parentId));
  const fixtures=remapped.nodes.filter(n=>n.kind==='facility'&&inRoom(n));
  const ids=new Map(fixtures.map((n,i)=>[n.id,'vendor-inventory/'+(301+i)]));
  const remaining=remapped.nodes.filter(n=>!ids.has(n.id));
  for(const n of fixtures){
    n.id=ids.get(n.id);
    n.parentId=ids.get(n.parentId)??n.parentId;
  }
  remapped.nodes=[...remaining,...fixtures.reverse()];
  custom.members=Object.fromEntries(Object.entries(rule.members).map(([key,value])=>[key,ids.get(value)]));
  const afterRename=await checkShowcaseRoom(remapped,custom);
  assert.deepEqual(afterRename.members,custom.members);
  assert(afterRename.sight.productHits.every(hit=>hit.instanceId===custom.members.featured));
  assert.deepEqual(afterRename.sight.lens,verified.sight.lens);
  assert.equal(afterRename.sight.productHits.length,verified.sight.productHits.length);
  renamedInstances={count:ids.size,members:afterRename.members,rays:afterRename.sight.productHits.length};
  await rejected(remapped,rule,'showcase-wrong-subject',camera,d=>assert.equal(d.actualRoomId,null));
  const occupiedId=structuredClone(custom);
  occupiedId.members.sampleHigh=occupiedId.members.featured;
  await rejected(remapped,occupiedId,'invalid-showcase-members','showcase.members');
  const foreign=structuredClone(remapped);
  const otherRoom=foreign.nodes.find(n=>n.kind==='room'&&n.id!==id);
  const impostor={...structuredClone(node(foreign,custom.members.backdrop)),id:rule.members.backdrop,parentId:otherRoom.id,
    transform:{position:[0,0,0],yaw:0}};
  foreign.nodes.push(impostor);
  const foreignRule=structuredClone(custom);foreignRule.members.backdrop=impostor.id;
  await rejected(foreign,foreignRule,'showcase-wrong-subject',impostor.id,d=>assert.equal(d.actualRoomId,otherRoom.id));
  const secondCompany='second-shop',alternate=value=>JSON.parse(JSON.stringify(value).replaceAll(item.key,secondCompany));
  const second=alternate(document);
  const twoFloors={...structuredClone(document),id:'two-showcases',scale:'building',nodes:[...document.nodes,...second.nodes].map(n=>
    n.kind==='floor'?{...n,parentId:'two-showcases'}:structuredClone(n))};
  delete twoFloors.spaceProfile; // Explicit legacy building grammar permits two independent floors without public cores.
  twoFloors.productShowcases=[alternate(rule),rule];
  multipleRoomOrder=(await checkProductShowcases(twoFloors,{catalog,templates})).map(r=>r.roomId);
  assert.deepEqual(multipleRoomOrder,twoFloors.productShowcases.map(r=>r.roomId));
  for(const invalid of [undefined,[],{},[rule,rule]]){
    await assert.rejects(checkProductShowcases({...twoFloors,productShowcases:invalid}),{code:'invalid-product-showcases'});
  }
  const wrong=structuredClone(document);
  node(wrong,featured).resource={id:'side-table-life-cup',version:1};
  await rejected(wrong,rule,'showcase-wrong-subject',featured);
  const wrongSlot=structuredClone(document),other=node(wrongSlot,rule.members.sampleHigh);
  for(const key of ['parentId','transform','attachment']){
    const product=node(wrongSlot,featured);
    [other[key],product[key]]=[product[key],other[key]];
  }
  await rejected(wrongSlot,rule,'showcase-wrong-mount',featured);
  const backwards=structuredClone(document);
  node(backwards,camera).transform.yaw=0;
  await rejected(backwards,rule,'showcase-off-axis',camera);
  const leftAtCenter=structuredClone(document);
  node(leftAtCenter,featured).transform.position[2]=0;
  await rejected(leftAtCenter,rule,'showcase-occluded',rule.members.counter,d=>assert.equal(d.blocker.mesh,'cabinet-top'));
  function withScreen(x,z,yaw){
    const blocked=structuredClone(document),panel=structuredClone(node(blocked,rule.members.backdrop));
    panel.id=id+'/physical-test-screen';panel.transform={position:[x,0,z],yaw};blocked.nodes.push(panel);return blocked;
  }
  const extra=id+'/physical-test-screen';
  await rejected(withScreen(-.15,.70,0),rule,'showcase-occluded',extra,d=>assert(d.blocker.position.length===3));
  const station=verified.route.at(-1),door=verified.route[0];
  for(const [region,x,z] of [['presenter',station[0],station[1]],['aisle-1',(door[0]+station[0])/2,door[1]]]){
    await rejected(withScreen(x,z,Math.PI/2),rule,'showcase-clearance-obstructed',extra,d=>{
      assert(d.failures.some(f=>f.region===region&&f.componentId===extra&&f.kind==='mesh-surface'&&f.roomLocalReserve));
    });
  }
}
console.log(JSON.stringify({ok:true,rooms:reports,renamedInstances,multipleRoomOrder,rejections},null,2));
