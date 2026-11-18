import fs from 'node:fs';
import assert from 'node:assert/strict';
import {appearanceCandidates,createAppearanceSample} from '../../prototype/src/company/appearance-samples.js';
import {createCompany,deriveCompany,CompanyError,migrateLegacyCameraMountSave,prepareCompanyChange,restoreCompany,serializeCompany} from '../../prototype/src/company/document.js';
import {listPlacementTargets,createFacilityPlacement,getFacilityEditConstraints} from '../../prototype/src/company/facility-edit-data.js';
import {inspectCompanyMotionSweep} from '../../prototype/src/company/placement.js';
const catalog=JSON.parse(fs.readFileSync('prototype/src/company/library-catalog.json','utf8'));
const templates=JSON.parse(fs.readFileSync('prototype/src/company/templates.json','utf8'));
const candidates=appearanceCandidates(catalog,'camera-mount');
const outcomes=[];
for(const [index,resource] of candidates.entries()){
  const sample=createAppearanceSample('camera-mount',index,catalog,templates);deriveCompany(sample.document,catalog,templates);
  outcomes.push({id:resource.id,mount:resource.mount,parent:resource.parent,status:'passed'});
}
const bad=createAppearanceSample('camera-mount',0,catalog,templates).document;
const mount=bad.nodes.find(node=>node.id==='sample/object');mount.parentId=bad.nodes.find(node=>node.kind==='room').id;
let code;try{deriveCompany(bad,catalog,templates);}catch(error){if(error instanceof CompanyError)code=error.code;else throw error;}
if(code!=='missing-mount-surface')throw Error(`Expected missing-mount-surface, received ${code}`);
outcomes.push({id:'invalid-parent',status:'passed',code});

const base=createCompany({id:'camera-room',width:9,depth:7},catalog), room=base.nodes[1].id;
const parentDesk={type:'add-facility',id:'desk',parentId:room,resource:{id:'desk',version:1},transform:{position:[0,0,0],yaw:Math.PI/2}};
const apply=(doc,...ops)=>prepareCompanyChange(doc,ops,{catalog,templates}).document;
const resource=id=>catalog.resources.find(r=>r.id===id);
const targets=(doc,id)=>listPlacementTargets(doc,catalog,resource(id),room,{templates});
const place=(doc,id,t)=>createFacilityPlacement(doc,catalog,resource(id),t.id,{},room,{templates}).operation;
const rejects=(code,fn)=>assert.throws(fn,e=>e instanceof CompanyError&&e.code===code);
const check=(id,fn)=>{fn();outcomes.push({id,status:'passed'});};
const withDesk=apply(base,parentDesk), clamp='camera-mount-desk-clamp', arm='camera-mount-wall-arm';

check('desk-contact-four-edges',()=>{
  for (const id of [clamp,'camera-mount-articulated-arm']) {
    const options=targets(withDesk,id);
    assert.equal(options.length,4);
    const normals=[-.5075,-1.0075,.5075,1.0075];
    for (const [i,option] of options.entries()) {
      const axis=i%2===0?2:0, along=2-axis;
      const op=place(withDesk,id,option);
      assert(Math.abs(op.transform.position[axis]-normals[i])<1e-8);
      assert.deepEqual(option.lockedAxes,getFacilityEditConstraints(op,resource(id)).lockedAxes);
      assert.deepEqual(restoreCompany(serializeCompany(apply(withDesk,op),catalog,templates),catalog,templates),apply(withDesk,op));
      const wrong=structuredClone(op);
      wrong.transform.position[axis]=0;
      rejects('invalid-camera-mount-fit',()=>apply(withDesk,wrong));
      wrong.transform.position=[...op.transform.position];
      wrong.transform.position[along]=i%2===0?.61:.11;
      rejects('invalid-camera-mount-fit',()=>apply(withDesk,wrong));
      wrong.transform.position=[...op.transform.position];
      wrong.transform.yaw+=Math.PI;
      rejects('invalid-camera-mount-fit',()=>apply(withDesk,wrong));
    }
  }
});

const northClamp=place(withDesk,clamp,targets(withDesk,clamp)[0]);
check('only-validated-desk-contact-exempts-overlap',()=>{
  const clamped=apply(withDesk,northClamp);
  rejects('overlapping-facilities',()=>apply(clamped,{...northClamp,id:'second-clamp'}));
  rejects('overlapping-facilities',()=>apply(withDesk,{...parentDesk,id:'nested-desk',parentId:'desk'}));
  const cabinet={...parentDesk,id:'cabinet',resource:{id:'hinged-cabinet-flat-panel',version:1},transform:{position:[3,0,-1],yaw:0}};
  const closed=apply(clamped,cabinet), open=structuredClone(closed);
  open.nodes.find(n=>n.id==='cabinet').state={openFraction:1};
  assert(inspectCompanyMotionSweep(closed,open,catalog,templates));
});

check('explicit-v1-save-migration',()=>{
  const legacy=apply(withDesk,northClamp), node=legacy.nodes.find(n=>n.id===northClamp.id);
  node.state={mounted:false}; node.transform.position=[.2,.84,-.1];
  const text=JSON.stringify(legacy);
  rejects('invalid-camera-mount-fit',()=>restoreCompany(text,catalog,templates));
  const migrated=migrateLegacyCameraMountSave(text,catalog,templates);
  assert.deepEqual(migrated.migrations,[{id:node.id,from:[.2,.84,-.1],to:[.2,.84,-.5075]}]);
  const expected=structuredClone(legacy);
  expected.nodes.find(n=>n.id===node.id).transform.position=[.2,.84,-.5075];
  assert.deepEqual(migrated.document,expected);
  assert.deepEqual(migrateLegacyCameraMountSave(serializeCompany(migrated.document,catalog,templates),catalog,templates).migrations,[]);
  const obstructed=structuredClone(legacy);
  obstructed.nodes.push({id:'tripod',kind:'facility',parentId:room,resource:{id:'camera-mount-tripod',version:1},
    transform:{position:[-1.2,0,.2],yaw:0}});
  rejects('overlapping-facilities',()=>migrateLegacyCameraMountSave(JSON.stringify(obstructed),catalog,templates));
  node.transform.position[2]=1;
  rejects('invalid-camera-mount-fit',()=>migrateLegacyCameraMountSave(JSON.stringify(legacy),catalog,templates));
});

check('tripod-floor-editor-target',()=>{
  const id='camera-mount-tripod', options=targets(base,id);
  assert.equal(options.length,1);
  const op=place(base,id,options[0]); apply(base,op);
  op.transform.position[0]=4.2;
  rejects('invalid-floor-fit',()=>apply(base,op));
});

check('wall-editor-avoids-portals-and-window-holes',()=>{
  const shell=structuredClone(base);
  shell.nodes[1].transform.yaw=Math.PI/2;
  const neighbor=(id,position)=>({id,kind:'area',parentId:shell.nodes[0].id,bounds:{width:9,depth:7},
    transform:{position,yaw:Math.PI/2}});
  shell.nodes.push(neighbor('other',[0,0,9]),neighbor('window-side',[-7,0,0]));
  shell.nodes[0].connections=[{id:'passage',from:{regionId:room,edge:'west',width:1.4,offset:0},to:{regionId:'other',edge:'east',width:1.4,offset:0}}];
  const window={...parentDesk,id:'window',resource:{id:'window-opening-square-basic',version:1},transform:{position:[0,1.4,-3.4],yaw:0}};
  const opened=apply(shell,window);
  const options=targets(opened,arm);
  assert.equal(options.length,4);
  for (const target of options) {
    const op=place(opened,arm,target), doc=apply(opened,op);
    const occupied=deriveCompany(doc,catalog,templates).obstacles.find(o=>o.id===op.id);
    assert(occupied.footprint.center[1]>=occupied.footprint.halfSize[1]);
    assert.equal(op.transform.position[1],1.4);
    if (target.edge==='west') {
      op.transform.position[2]=0;
      rejects('wall-display-over-portal',()=>apply(opened,op));
    }
    if (target.edge==='north') {
      op.transform.position[0]=0;
      rejects('wall-display-over-window',()=>apply(opened,op));
    }
  }
  const shared=listPlacementTargets(opened,catalog,resource(arm),'window-side',{templates}).find(t=>t.edge==='south');
  assert(shared);
  const op=createFacilityPlacement(opened,catalog,resource(arm),shared.id,{},'window-side',{templates}).operation;
  apply(opened,op);
  op.transform.position[0]=0;
  rejects('wall-display-over-window',()=>apply(opened,op));
});
console.log(JSON.stringify({status:'passed',groups:outcomes.length,outcomes},null,2));
