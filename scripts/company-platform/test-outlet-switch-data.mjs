import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompany,deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {listPlacementTargets,createFacilityPlacement} from '../../prototype/src/company/facility-edit-data.js';

globalThis.FileReader??=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();}).catch(error=>this.onerror?.(error));}};
const root=new URL('../../',import.meta.url), hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const resources=catalog.resources.filter(resource=>resource.productionBranch==='outlet-switch');
assert.equal(resources.length,4);
const checks=[];
const record=(name,observed)=>checks.push({name,passed:true,observed});
for(const resource of resources){
  assert.equal(resource.mount,'wall');assert.deepEqual(resource.mounting,{origin:'center',width:.12,height:.2,depth:.04});
  assert.deepEqual(resource.stateDefaults,{on:false});assert.deepEqual(resource.stateSchema,{on:{type:'boolean'}});
  const bytes=await fs.readFile(new URL(`../../prototype/public${resource.asset.url}`,import.meta.url));
  assert.equal(bytes.length,resource.asset.bytes);assert.equal(hash(bytes),resource.asset.sha256);
  const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;scene.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(scene);assert(bounds.min.x>=-.061&&bounds.max.x<=.061);assert(bounds.min.y>=-.101&&bounds.max.y<=.101);assert(bounds.min.z>=-.001&&bounds.max.z<=.042);
  const status=scene.getObjectByName('status-led');assert(status?.isMesh&&status.material?.emissive);
  scene.traverse(node=>{node.geometry?.dispose?.();for(const material of [node.material].flat())material?.dispose?.();});
}
record('Four real GLB resources share one wall/status contract',{ids:resources.map(resource=>resource.id),distinctAssets:new Set(resources.map(resource=>resource.asset.sha256)).size});
let document=createCompany({id:'outlet-switch-data',name:'插座开关数据样件',width:9,depth:7},catalog);
const room=document.nodes.find(node=>node.kind==='room');const target=listPlacementTargets(document,catalog,resources[0],room.id,{templates})[0];assert(target);
const placement=createFacilityPlacement(document,catalog,resources[0],target.id,{},room.id,{templates});document=prepareCompanyChange(document,[placement.operation],{catalog,templates}).document;const facilityId=placement.id;
record('Wall target placement produces a real facility and no blocking footprint',{facilityId,target:target.id,obstacles:deriveCompany(document,catalog,templates).obstacles.filter(obstacle=>obstacle.id===facilityId).length});
for(const value of [false,true]){document=prepareCompanyChange(document,[{type:'set-state',id:facilityId,state:{on:value}}],{catalog,templates}).document;assert.equal(document.nodes.find(node=>node.id===facilityId).state.on,value);}
record('Boolean status accepts both states',{state:document.nodes.find(node=>node.id===facilityId).state});
const before=JSON.stringify(document);assert.throws(()=>prepareCompanyChange(document,[{type:'set-state',id:facilityId,state:{on:'yes'}}],{catalog,templates}),error=>error.code==='invalid-device-state');assert.equal(JSON.stringify(document),before);
record('Invalid state rejects and preserves the previous document',{code:'invalid-device-state'});
const transform=structuredClone(document.nodes.find(node=>node.id===facilityId).transform);let replaced=document;
for(const resource of resources.slice(1))replaced=prepareCompanyChange(replaced,[{type:'replace-resource',id:facilityId,resource:{id:resource.id,version:resource.version}}],{catalog,templates}).document;
assert.deepEqual(replaced.nodes.find(node=>node.id===facilityId).transform,transform);assert.equal(replaced.nodes.find(node=>node.id===facilityId).state.on,true);
record('All four appearances replace in place while retaining transform and status',{finalResource:replaced.nodes.find(node=>node.id===facilityId).resource});
const report={status:'passed',scope:'Outlet/switch data, real GLB readback, wall placement, state and replacement',checks,limits:['Visual status is not electrical simulation','No cable communication or character C3 usage']};
await fs.mkdir(new URL('../../evidence/company-outlet-switch-v1/',import.meta.url),{recursive:true});await fs.writeFile(new URL('../../evidence/company-outlet-switch-v1/data-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:checks.length}));
