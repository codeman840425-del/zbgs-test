import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createCompany,prepareCompanyChange,deriveCompany,restoreCompany,serializeCompany} from '../../prototype/src/company/document.js';
import {movingFootprint,partAngle,validateMovingResource,validateFacilityState} from '../../prototype/src/company/moving-parts.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {inspectCompanyMotionSweep} from '../../prototype/src/company/placement.js';
const cabinet={id:'cabinet',version:1,category:'dynamic',mountRole:'hinged-cabinet',footprint:{blocking:true,center:[0,0],halfSize:[.45,.275]},stateDefaults:{openFraction:0},stateSchema:{openFraction:{type:'number',min:0,max:1}},stateSemantics:{openFraction:'hinged-door-opening-fraction'},usePoints:[],
  movingParts:[{id:'door',kind:'hinge',axis:'y',stateField:'openFraction',pivot:[-.42,0,.245],rotationRange:[0,-Math.PI/2],bounds:{min:[0,.1,-.02],max:[.84,1.12,.03]}}],partNodes:{door:'pivot'},partPanels:{door:'panel'}};
const other={...structuredClone(cabinet),id:'other',partNodes:{door:'other-pivot'},partPanels:{door:'other-panel'}};
const blocker={id:'blocker',version:1,category:'decor',mountRole:'blocker',footprint:{blocking:true,center:[0,0],halfSize:[.04,.04]},stateDefaults:{},usePoints:[]};
const catalog={id:'motion-test',version:1,resources:[cabinet,other,blocker]},templates={templates:[]},options={catalog,templates};
let doc=createCompany({id:'motion',width:8,depth:6},catalog);const room=doc.nodes[1].id;
const add=(id,r,p)=>({type:'add-facility',id,parentId:room,resource:{id:r,version:1},transform:{position:p,yaw:0}});
doc=prepareCompanyChange(doc,[add('cabinet','cabinet',[0,0,0])],options).document;
const checks=[];function check(name,fn){fn();checks.push({name,passed:true});}
const state=v=>[{type:'set-state',id:'cabinet',state:{openFraction:v}}];
check('Fixed hinge direction and semantics reject malformed definitions; legacy boolean and numeric states retain their range',()=>{
  const fail=(code)=>{throw Object.assign(Error(code),{code});};
  for(const change of [r=>r.movingParts[0].rotationRange[1]=Math.PI/2,r=>r.stateSemantics.openFraction='wrong',r=>r.footprint.halfSize=[NaN,.2]]) {
    const bad=structuredClone(cabinet);change(bad);assert.throws(()=>validateMovingResource(bad,fail),e=>e.code==='invalid-moving-parts');
  }
  const legacy={stateDefaults:{on:true,intensity:50}};
  validateFacilityState(legacy,{on:false,intensity:100},fail,'legacy');
  assert.throws(()=>validateFacilityState(legacy,{intensity:101},fail,'legacy'),e=>e.code==='invalid-device-state');
});
check('numeric schema rejects unknown/nonfinite/wrong-type/out-of-range state and preserves input',()=>{
  for(const patch of [null,[],1])assert.throws(()=>prepareCompanyChange(doc,[{type:'set-state',id:'cabinet',state:patch}],options),e=>e.code==='invalid-device-state');
  const saved=JSON.stringify(doc);for(const value of [-.01,1.01,NaN,Infinity,'1',null])assert.throws(()=>prepareCompanyChange(doc,state(value),options),e=>e.code==='invalid-device-state');
  assert.throws(()=>prepareCompanyChange(doc,[{type:'set-state',id:'cabinet',state:{unknown:1}}],options),e=>e.code==='invalid-device-state');assert.equal(JSON.stringify(doc),saved);
});
check('closed, half and open obstacles are driven by the same angle and parent transform',()=>{
  const spans=[];
  for(const fraction of [0,.5,1]){
    const d=prepareCompanyChange(doc,state(fraction),options).derived,obstacle=d.obstacles[0];spans.push(obstacle.max[1]);
    assert(Math.abs(partAngle(cabinet.movingParts[0],{openFraction:fraction})+Math.PI/2*fraction)<1e-10);
    const fp=movingFootprint(cabinet,{openFraction:fraction});assert(Math.abs(obstacle.max[1]-(fp.center[1]+fp.halfSize[1]))<1e-9);
  }
  assert(spans[0]<spans[1]&&spans[1]<spans[2]);
  const rotated=prepareCompanyChange(doc,[...state(1),{type:'move',id:'cabinet',transform:{position:[1,0,0],yaw:Math.PI/2}}],options).derived;
  assert(Math.abs(rotated.obstacles[0].max[0]-(1+spans[2]))<1e-9);
});
check('appearance replacement preserves half-open state while a different joint contract is incompatible',()=>{
  assert(compareFacilityFunction(cabinet,other).compatible);
  const modified=structuredClone(other);modified.movingParts[0].pivot[0]+=.01;assert(!compareFacilityFunction(cabinet,modified).compatible);
  const result=prepareCompanyChange(doc,[...state(.5),{type:'replace-resource',id:'cabinet',resource:{id:'other',version:1}}],options).document;
  assert.equal(result.nodes.find(n=>n.id==='cabinet').state.openFraction,.5);assert.deepEqual(restoreCompany(serializeCompany(result,catalog,templates),catalog,templates),result);
});
check('opening into another facility rejects without changing valid closed scene',()=>{
  const blocked=prepareCompanyChange(doc,[add('blocker','blocker',[0,0,.8])],options).document;const saved=JSON.stringify(blocked);
  assert.throws(()=>prepareCompanyChange(blocked,state(1),options),e=>e.code==='overlapping-facilities');assert.equal(JSON.stringify(blocked),saved);
});
check('analytic sweep catches an interior angular extremum absent at both endpoints',()=>{
  const wide=structuredClone(cabinet);wide.footprint.halfSize=[.31,.31];wide.movingParts[0].pivot=[0,0,0];wide.movingParts[0].bounds={min:[0,.1,0],max:[.3,.6,.3]};
  const a=movingFootprint(wide,{openFraction:0}),b=movingFootprint(wide,{openFraction:1}),swept=movingFootprint(wide,{openFraction:0},{openFraction:1});
  assert.equal(a.halfSize[1],.31);assert.equal(b.halfSize[1],.31);assert(Math.abs(swept.center[1]+swept.halfSize[1]-.3*Math.sqrt(2))<1e-9);
  const cat={...catalog,resources:[wide,blocker]},opts={catalog:cat,templates};
  const blocked=prepareCompanyChange(createCompany({id:'motion',width:8,depth:6},cat),[add('cabinet','cabinet',[0,0,0]),add('blocker','blocker',[0,0,.39])],opts).document;
  assert.throws(()=>prepareCompanyChange(blocked,state(1),opts),e=>e.code==='blocked-moving-part');
  const skin={...structuredClone(wide),id:'skin'},extended={catalog:{...cat,resources:[...cat.resources,skin]},templates};
  assert.throws(()=>prepareCompanyChange(blocked,[{type:'replace-resource',id:'cabinet',resource:{id:'skin',version:1}},...state(1)],extended),e=>e.code==='blocked-moving-part');
  const use={id:'use',version:1,category:'interactive',stateDefaults:{},usePoints:[{id:'spot',position:[0,0,0],approach:[0,0,0],exit:[0,0,0],capacity:1}]};
  const useCatalog={...cat,resources:[wide,use]},useOptions={catalog:useCatalog,templates};
  const occupiedSpace=prepareCompanyChange(createCompany({id:'motion',width:8,depth:6},useCatalog),[add('cabinet','cabinet',[0,0,0]),add('use','use',[0,0,.62])],useOptions).document;
  const final=prepareCompanyChange(occupiedSpace,state(1),useOptions).document;
  assert.throws(()=>inspectCompanyMotionSweep(occupiedSpace,final,useCatalog,templates),e=>e.code==='blocked-use-space');
});
check('wall sweep and closed-to-open static use-space are checked',()=>{
  const nearWall=prepareCompanyChange(doc,[{type:'move',id:'cabinet',transform:{position:[0,0,2.6],yaw:0}}],options).document;
  assert.throws(()=>prepareCompanyChange(nearWall,state(.1),options),e=>['outside-room','blocked-moving-part'].includes(e.code));
  const opened=prepareCompanyChange(doc,state(.5),options).document;assert(inspectCompanyMotionSweep(doc,opened,catalog,templates));
});
check('each scene instance can have its own state and sweep without catalog mutation',()=>{
  const two=prepareCompanyChange(doc,[add('second','cabinet',[2,0,0])],options).document;
  const changed=prepareCompanyChange(two,state(1),options).document,before=JSON.stringify(catalog);inspectCompanyMotionSweep(two,changed,catalog,templates);
  const result=deriveCompany(changed,catalog,templates);assert.equal(result.facilities.find(f=>f.id==='second').state.openFraction,0);assert.equal(JSON.stringify(catalog),before);
});
const report={status:'passed',checks,limits:['Pure state/placement contract only; actual meshes, browser and C3 verified separately']};
const out=process.argv[2];if(out){await fs.mkdir(out,{recursive:true});await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify(report));
