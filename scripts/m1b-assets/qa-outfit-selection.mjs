// Exercises actual equipment selection code with a scoped loader double.
// This proves synchronous state/visibility semantics, not rendering or fitting.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { foundationProfile } from '../../prototype/src/foundation-profiles.js';
const context=vm.createContext({structuredClone,console});
const adapters=[];
function createEquipment({manifestUrl}) {
  const items=new Map(),adapter={disposeCount:0,load:async id=>{items.set(id,{meshes:[{name:id}],container:{visible:false},stats:{id}});},get:id=>items.get(id),dispose(){this.disposeCount++;},items};
  adapters.push(adapter);return adapter;
}
const dependencies={
 './equipment.js':{createEquipment},
 './foundation-profiles.js':{foundationProfile},
 './m1-skirt.js':{createM1Skirt:()=>({mesh:{name:'corrected-skirt'},update(){},getInfo(){return{};},dispose(){}})},
};
const module=new vm.SourceTextModule(await fs.readFile('prototype/src/m1-equipment.js','utf8'),{context});
await module.link(async name=>{const exports=dependencies[name];assert(exports);return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context});});
await module.evaluate();
const records=[];
for(const type of ['male','female']){
 const cfg=foundationProfile(type),body={isSkinnedMesh:true,visible:true,material:{name:'M00_001_01_Body_00_SKIN'}},original={isSkinnedMesh:true,visible:true,material:{name:'M00_001_01_Bottoms_01_CLOTH'}},vrm={scene:{traverse(f){[body,original].forEach(f);}}};
 const gear=await module.namespace.createM1Equipment({vrm,avatarSha256:cfg.sha256,bodyType:type}),adapter=adapters.at(-1);
 const visible=()=>Object.fromEntries(Object.entries(gear.getInfo().items).map(([k,v])=>[k,v.visible]));
 assert.equal(original.visible,false);assert.equal(body.visible,true);
 assert.equal(visible().pants,true);
 if(type==='male'){
  gear.setOutfit(2);assert.equal(gear.getInfo().outfit,2);assert.equal(visible().pants,false);assert.equal(visible().shorts,true);assert.equal(gear.getAssetProfile().pants[0].name,cfg.ids.shorts);
  gear.setDebugBody(true);assert.equal(visible().shorts,false);assert.equal(visible().shoes,true);assert.equal(body.visible,true);
  gear.setDebugBody(false);assert.equal(visible().shorts,true);
  assert.throws(()=>gear.setOutfit(1),/matching outfit/);assert.equal(gear.getInfo().outfit,2);
  for(const value of [0,2,0,2,0])gear.setOutfit(value);
  assert.equal(visible().pants,true);assert.equal(visible().shorts,false);
  assert.equal(gear.getAssetProfile().pants[0].name,cfg.ids.pants);
 }else{assert.throws(()=>gear.setOutfit(2),/matching outfit/);gear.setOutfit(1);assert.equal(visible().skirt,true);assert.equal(visible().pants,false);}
 assert.throws(()=>gear.setOutfit(99),/matching outfit/);assert.equal(body.visible,true);
 records.push({body:type,declared:cfg.outfits,visible:visible(),bodyVisible:body.visible,sourceClothesHidden:!original.visible});
 gear.dispose();gear.dispose();assert.equal(adapter.disposeCount,1);assert.equal(original.visible,true);
}
const before=adapters.length;
await assert.rejects(()=>module.namespace.createM1Equipment({vrm:{},avatarSha256:'wrong',bodyType:'male'}),/identity/);
assert.equal(adapters.length,before);
console.log(JSON.stringify({status:'passed',scope:'actual selection implementation; mocked loading only; no visual acceptance',records},null,2));
