import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createCompany, prepareCompanyChange, deriveCompany, identityTransform, serializeCompany, restoreCompany} from '../../prototype/src/company/document.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
const shelf = {id:'shelf',version:1,category:'decor',mountRole:'storage-shelf',footprint:{blocking:true,center:[0,0],halfSize:[.5,.175]},stateDefaults:{},usePoints:[],supportSurfaces:[
  {id:'lower',center:[0,0],topY:.45,halfSize:[.42,.13],clearanceHeight:.5},
  {id:'top',center:[0,0],topY:1.8,halfSize:[.42,.13],clearanceHeight:.4}],supportNodes:{lower:'board1',top:'board2'}};
const prop={id:'prop',version:1,category:'decor',mountRole:'tabletop-ornament',mount:'support-surface',mounting:{width:.16,depth:.12,height:.2,origin:'bottom'},usePoints:[],stateDefaults:{}};
const other={...structuredClone(shelf),id:'other-shelf',supportNodes:{lower:'different1',top:'different2'}};
const catalog={id:'support-test',version:1,resources:[shelf,prop,other]},templates={templates:[]},options={catalog,templates};
let doc=createCompany({id:'supports',width:8,depth:6},catalog);
const room=doc.nodes.find(n=>n.kind==='room').id;
const apply=ops=>{doc=prepareCompanyChange(doc,ops,options).document;};
const add=(id,parentId,resource,position,attachment)=>({type:'add-facility',id,parentId,resource:{id:resource,version:1},transform:{position,yaw:0},...(attachment?{attachment:{surfaceId:attachment}}:{})});
apply([add('shelf',room,'shelf',[-2,0,0]),add('a','shelf','prop',[-.2,.45,0],'lower'),add('b','shelf','prop',[.2,.45,0],'lower'),add('c','shelf','prop',[0,1.8,0],'top')]);
const report={status:'running',checks:[],limits:['Data contract checks, no actual mesh or real-character acceptance']};
function check(name,fn){fn();report.checks.push({name,passed:true});}
function reject(name,ops,code){check(name,()=>{const prior=JSON.stringify(doc);assert.throws(()=>prepareCompanyChange(doc,ops,options),e=>e.code===code);assert.equal(JSON.stringify(doc),prior);});}
check('parent yaw composes with supported local position',()=>{
  apply([{type:'move',id:'shelf',transform:{position:[-1,0,-1],yaw:Math.PI/2}}]);
  const world=deriveCompany(doc,catalog,templates).worlds.get('a');assert.deepEqual(world.position,[-1,.45,-.8]);
});
check('compatible parent appearance keeps surface ID and local placement',()=>{
  const children=structuredClone(doc.nodes.filter(n=>n.parentId==='shelf'));
  apply([{type:'replace-resource',id:'shelf',resource:{id:'other-shelf',version:1}}]);assert.deepEqual(doc.nodes.filter(n=>n.parentId==='shelf'),children);
  const reordered={...other,supportSurfaces:[...other.supportSurfaces].reverse()};assert(compareFacilityFunction(shelf,reordered).compatible);
  assert(!compareFacilityFunction(shelf,{...other,supportSurfaces:other.supportSurfaces.map(s=>({...s,topY:s.topY+.01}))}).compatible);
});
reject('whole prop overhang even when origin is inside',[{type:'move',id:'a',transform:{position:[.4,.45,0],yaw:0}}],'invalid-support-fit');
reject('nonzero yaw checks swapped depth',[{type:'move',id:'a',transform:{position:[-.2,.45,.06],yaw:Math.PI/2}}],'invalid-support-fit');
reject('floating prop is rejected',[{type:'move',id:'a',transform:{position:[-.2,.46,0],yaw:0}}],'invalid-support-fit');
reject('two items overlapping on same surface reject',[{type:'move',id:'a',transform:{position:[.2,.45,0],yaw:0}}],'overlapping-supported-props');
reject('unknown surface rejects without mutation',[{type:'attach-surface',id:'a',parentId:'shelf',surfaceId:'missing',transform:{position:[0,.45,0],yaw:0}}],'missing-support-surface');
reject('unsupported parent rejects',[{type:'attach-surface',id:'a',parentId:'b',surfaceId:'lower',transform:{position:[0,.45,0],yaw:0}}],'missing-support-surface');
reject('parent cycle rejects',[{type:'attach-surface',id:'a',parentId:'a',surfaceId:'lower',transform:{position:[0,.45,0],yaw:0}}],'parent-cycle');
check('too tall child and malformed support rejected',()=>{
  const tall=structuredClone(catalog);tall.resources.find(r=>r.id==='prop').mounting.height=.8;
  assert.throws(()=>deriveCompany(doc,tall,templates),e=>e.code==='invalid-support-fit');
  const bad=structuredClone(catalog);bad.resources[0].supportSurfaces[0].halfSize[0]=NaN;
  assert.throws(()=>deriveCompany(doc,bad,templates),e=>e.code==='invalid-support-contract');
});
check('explicit shelf change and assembly copy preserve independent IDs',()=>{
  apply([{type:'attach-surface',id:'a',parentId:'shelf',surfaceId:'top',transform:{position:[-.25,1.8,0],yaw:Math.PI/2}}]);
  apply([{type:'group-facilities',id:'display',parentId:room,memberIds:['shelf'],transform:identityTransform()}]);
  apply([{type:'copy-group',id:'display',newId:'display-copy',transform:{position:[3,0,0],yaw:0}}]);
  const derived=deriveCompany(doc,catalog,templates),copyNodes=doc.nodes.filter(n=>n.id.startsWith('display-copy'));
  assert.equal(copyNodes.length,5);assert.equal(doc.nodes.filter(n=>n.attachment?.surfaceId==='top').length,4);
  assert.equal(new Set(doc.nodes.map(n=>n.id)).size,doc.nodes.length);
  assert.equal(derived.facilities.length,8);
  assert.deepEqual(restoreCompany(serializeCompany(doc,catalog,templates),catalog,templates),doc);
});
report.status='passed';const out=process.argv[2];if(out){await fs.mkdir(out,{recursive:true});await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
