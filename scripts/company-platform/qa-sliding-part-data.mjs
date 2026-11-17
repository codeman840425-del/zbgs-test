import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createCompany,prepareCompanyChange,deriveCompany,serializeCompany,restoreCompany} from '../../prototype/src/company/document.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {movingFootprint,partOffset,validateMovingResource} from '../../prototype/src/company/moving-parts.js';
import {inspectCompanyMotionSweep} from '../../prototype/src/company/placement.js';
const drawer={id:'drawer',version:1,category:'dynamic',mountRole:'sliding-drawer-cabinet',footprint:{blocking:true,center:[0,0],halfSize:[.45,.275]},stateDefaults:{openFraction:0},stateSchema:{openFraction:{type:'number',min:0,max:1}},stateSemantics:{openFraction:'sliding-drawer-opening-fraction'},usePoints:[],
  movingParts:[{id:'drawer',stateField:'openFraction',kind:'slide',axis:'z',pivot:[0,0,0],translationRange:[0,.32],bounds:{min:[-.42,.78,-.205],max:[.42,1.12,.275]}}],partNodes:{drawer:'slide'},partPanels:{drawer:'front'},partTrays:{drawer:{bottom:'bottom',left:'left',right:'right',back:'back'}}};
const skin={...structuredClone(drawer),id:'skin',partNodes:{drawer:'skin-slide'}};
const obstacle={id:'obstacle',version:1,category:'decor',stateDefaults:{},usePoints:[],footprint:{blocking:true,center:[0,0],halfSize:[.04,.04]}};
const use={id:'use',version:1,category:'interactive',stateDefaults:{},usePoints:[{id:'spot',position:[0,0,0],approach:[0,0,0],exit:[0,0,0],capacity:1}]};
const catalog={id:'slide-test',version:1,resources:[drawer,skin,obstacle,use]},templates={templates:[]},context={catalog,templates};
const base=createCompany({id:'slide',width:8,depth:6},catalog),room=base.nodes[1].id;
const add=(id,resource,position)=>({type:'add-facility',id,parentId:room,resource:{id:resource,version:1},transform:{position,yaw:0}});
const doc=prepareCompanyChange(base,[add('drawer','drawer',[0,0,0])],context).document;
const change=(document,operations)=>prepareCompanyChange(document,operations,context).document;
const state=value=>({type:'set-state',id:'drawer',state:{openFraction:value}});
const checks=[],check=(name,fn)=>{fn();checks.push({name,passed:true});};
check('Slide contract rejects mixed motion, wrong axis/travel/semantics and incomplete tray mappings',()=>{
  for(const mutate of [r=>r.movingParts[0].rotationRange=[0,-Math.PI/2],r=>r.movingParts[0].axis='x',r=>r.movingParts[0].translationRange=[0,.33],r=>r.stateSemantics.openFraction='hinged-door-opening-fraction',r=>delete r.partTrays.drawer.bottom]){
    const bad=structuredClone(drawer);mutate(bad);assert.throws(()=>validateMovingResource(bad,(code)=>{throw Object.assign(Error(code),{code});}),e=>e.code==='invalid-moving-parts');
  }
});
check('Three states project .0/.16/.32 displacement into parent-rotated blocking data',()=>{
  for(const fraction of [0,.5,1]){
    const d=deriveCompany(change(doc,[state(fraction)]),catalog,templates);assert.equal(partOffset(drawer.movingParts[0],{openFraction:fraction}),fraction*.32);assert(Math.abs(d.obstacles[0].max[1]-(.275+fraction*.32))<1e-9);
    const turned=deriveCompany(change(doc,[state(fraction),{type:'move',id:'drawer',transform:{position:[1,0,0],yaw:Math.PI/2}}]),catalog,templates);assert(Math.abs(turned.obstacles[0].max[0]-(1+.275+fraction*.32))<1e-9);
  }
});
check('Compatible appearance preserves half-state and serialization while motion changes are incompatible',()=>{
  assert(compareFacilityFunction(drawer,skin).compatible);
  const bad=structuredClone(skin);bad.movingParts[0].translationRange[1]=.2;assert(!compareFacilityFunction(drawer,bad).compatible);
  const result=change(doc,[state(.5),{type:'replace-resource',id:'drawer',resource:{id:'skin',version:1}}]);assert.equal(result.nodes.find(n=>n.id==='drawer').state.openFraction,.5);assert.deepEqual(restoreCompany(serializeCompany(result,catalog,templates),catalog,templates),result);
});
check('Full closing interval rejects a new obstacle even when the final closed pose fits, including simultaneous appearance swap',()=>{
  const open=change(doc,[state(1)]);const before=JSON.stringify(open);
  for(const operations of [[state(0),add('block','obstacle',[0,0,.5])],[state(0),{type:'replace-resource',id:'drawer',resource:{id:'skin',version:1}},add('block','obstacle',[0,0,.5])]])assert.throws(()=>change(open,operations),e=>e.code==='blocked-moving-part');
  assert.equal(JSON.stringify(open),before);
});
check('Swept use-space and wall checks reject despite valid final states',()=>{
  const open=change(doc,[state(1)]),end=change(open,[state(0),add('use','use',[0,0,.72])]);
  assert.throws(()=>inspectCompanyMotionSweep(open,end,catalog,templates),e=>e.code==='blocked-use-space');
  const nearWall=change(doc,[{type:'move',id:'drawer',transform:{position:[0,0,2.6],yaw:0}}]);assert.throws(()=>change(nearWall,[state(1)]),e=>['outside-room','blocked-moving-part'].includes(e.code));
});
check('Different instances keep their own state and validation leaves the resource catalog unchanged',()=>{
  const two=change(doc,[add('second','drawer',[2,0,0])]),result=change(two,[state(1)]),before=JSON.stringify(catalog);
  inspectCompanyMotionSweep(two,result,catalog,templates);assert.equal(JSON.stringify(catalog),before);assert.equal(deriveCompany(result,catalog,templates).facilities.find(f=>f.id==='second').state.openFraction,0);
  assert.deepEqual(movingFootprint(drawer,{openFraction:0},{openFraction:1}),movingFootprint(drawer,{openFraction:1},{openFraction:0}));
});
const report={status:'passed',checks,limits:['CPU data contracts only; real tray geometry/browser/C3 separately verified']};
if(process.argv[2]){await fs.mkdir(process.argv[2],{recursive:true});await fs.writeFile(`${process.argv[2]}/report.json`,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify(report));
