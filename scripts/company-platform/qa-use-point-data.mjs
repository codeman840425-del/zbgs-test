import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import legacyCatalog from '../../prototype/src/company/facility-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import home from '../../prototype/src/company/examples/c2-small-home.json' with {type:'json'};
import legacy from '../../prototype/src/company/examples/c1-two-stations.json' with {type:'json'};
import {createScaledCompany} from '../../prototype/src/company/space.js';
import {deriveCompany} from '../../prototype/src/company/document.js';
import {describeCompanyUsePoint} from '../../prototype/src/company/use-point-data.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';

const out=process.argv[2];
if(!out)throw new Error('Usage: node scripts/company-platform/qa-use-point-data.mjs NEW_OUTPUT_DIR');
await fs.mkdir(out,{recursive:false});
const checks=[];
const check=(name,fn)=>{fn();checks.push({name,passed:true});};
const close=(actual,expected)=>{assert.equal(actual.length,expected.length);actual.forEach((n,i)=>assert(Math.abs(n-expected[i])<1e-8,`${actual} != ${expected}`));};
const document=createScaledCompany({id:'c3-logical-points',name:'C3 logical points',scale:'building',floorLayouts:['parallel','turned'],
  floors:[{name:'same name',rooms:[{name:'same room',purpose:'streaming',stations:2}]},{name:'same name',rooms:[{name:'same room',purpose:'streaming',stations:2}]}]},catalog,templates);
const scene=createCompanyScene(new THREE.Scene(),document,{catalog,templates});
try {
  const all=scene.describeUsePoints(),floorIds=document.nodes.filter(node=>node.kind==='floor').map(node=>node.id),saved=scene.save();
  check('Logical descriptors cover both floors despite identical room and floor names',()=>{
    assert.equal(all.length,4);assert.equal(new Set(all.map(point=>point.id)).size,4);
    for(const floorId of floorIds)assert.equal(scene.describeUsePoints({floorId}).length,2);
    for(const point of all){assert.equal(point.companyId,document.id);assert.deepEqual(point.missingFields,[]);assert.equal(point.capacity,1);}
    assert.equal(scene.describeUsePoint('missing'),null);
    assert.throws(()=>scene.describeUsePoints({floorId:'missing'}),error=>error.code==='unknown-floor');
  });
  check('Visible descriptors agree with actual nested Three use-point transforms on both orientations',()=>{
    for(const floorId of floorIds){
      scene.setView({mode:'floor',floorId});
      for(const actual of scene.listUsePoints()){
        const logical=scene.describeUsePoint(actual.id);
        actual.chair.updateWorldMatrix(true,false);
        close(actual.chair.getWorldPosition(new THREE.Vector3()).toArray(),logical.transform.position);
        const direction=new THREE.Vector3(0,0,1).transformDirection(actual.chair.matrixWorld);
        close(direction.toArray(),[Math.sin(logical.transform.yaw),0,Math.cos(logical.transform.yaw)]);
        const facility=scene.root.getObjectByName(actual.facilityId);
        close(facility.localToWorld(new THREE.Vector3(...actual.approach)).toArray(),logical.approachPosition);
        close(facility.localToWorld(new THREE.Vector3(...actual.exit)).toArray(),logical.exitPosition);
      }
    }
  });
  check('Building view has zero indoor meshes while all logical descriptions and document remain identical',()=>{
    scene.setView({mode:'building'});let meshes=0;scene.root.traverse(object=>{if(object.isMesh)meshes++;});assert.equal(meshes,0);
    assert.equal(scene.listUsePoints().length,0);assert.deepEqual(scene.describeUsePoints(),all);assert.equal(scene.save(),saved);
    scene.setView({mode:'floor',floorId:floorIds[0]});assert.deepEqual(scene.describeUsePoints(),all);
  });
  check('Returned descriptions are detached values and contain no render or occupancy objects',()=>{
    const first=scene.describeUsePoint(all[0].id);first.transform.position[0]=999;first.resource.id='tampered';first.contact.seatNodeId='tampered';
    assert.deepEqual(scene.describeUsePoint(all[0].id),all[0]);
    const text=JSON.stringify(scene.describeUsePoints());assert(!text.includes('isObject3D'));assert(!text.includes('seatToken'));assert(!text.includes('ownerId'));
  });
  check('Successful edits update logical revision; failed busy move keeps descriptors unchanged',()=>{
    const point=all[0],monitor=point.facilityId.replace(/chair$/,'monitor');
    const handle=scene.prepareChange([{type:'set-state',id:monitor,state:{on:false}}]);scene.commit(handle);
    assert.equal(scene.describeUsePoint(point.id).revision,document.revision+1);
    const before=scene.describeUsePoints(),station=document.nodes.find(node=>node.id===point.facilityId).parentId;
    assert.throws(()=>scene.prepareChange([{type:'move',id:station,transform:{position:[0,0,0],yaw:0}}],{isUsePointBusy:id=>id===point.id}),error=>error.code==='facility-busy');
    assert.deepEqual(scene.describeUsePoints(),before);
  });
  check('Rotated two-seat sofa uses facility-local approach once, retaining left/right identity',()=>{
    const fixture=structuredClone(home),room=fixture.nodes.find(node=>node.kind==='room');
    room.transform={position:[10,0,20],yaw:Math.PI/2};
    const sofa=fixture.nodes.find(node=>node.id==='lounge/sofa');sofa.transform={position:[0,0,0],yaw:0};
    // Remove unrelated furniture only in this narrow spatial fixture.
    fixture.nodes=fixture.nodes.filter(node=>['floor','room','area'].includes(node.kind)||node.id===sofa.id);
    sofa.parentId=room.id;
    const derived=deriveCompany(fixture,catalog,templates),left=describeCompanyUsePoint(fixture,derived,'lounge/sofa#left'),right=describeCompanyUsePoint(fixture,derived,'lounge/sofa#right');
    close(left.transform.position,[10.04,0,20.48]);close(right.transform.position,[10.04,0,19.52]);
    close(left.approachPosition,[11.02,0,20.48]);close(left.exitPosition,[11.15,0,20.48]);
    assert.equal(left.transform.yaw,Math.PI/2);assert.equal(left.contact.seatNodeId,'seat-left');assert.equal(right.contact.seatNodeId,'seat-right');
  });
  check('Historical points without approach metadata remain explicit rather than inventing a target',()=>{
    const derived=deriveCompany(legacy,legacyCatalog,templates),point=describeCompanyUsePoint(legacy,derived,'station-1/chair#seat');
    assert.equal(point.approachPosition,null);assert.equal(point.exitPosition,null);assert.equal(point.capacity,null);
    assert.deepEqual(point.missingFields,['approach','exit','capacity','clearance']);
  });
} finally {scene.dispose();}
check('Disposed provider rejects logical access',()=>assert.throws(()=>scene.describeUsePoints(),error=>error.code==='scene-disposed'));
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({status:'passed',checks,limits:['Actual company modules and Three transforms under CPU. No actor navigation, contact, lease lifecycle or WebGL acceptance.','Mesh retention/rebinding across viewing changes remains a separate C3 seam.']},null,2)+'\n');
console.log(`${checks.length} logical use-point checks passed`);
