import assert from 'node:assert/strict';
import {FOUNDATION_PROFILES,foundationProfile} from '../prototype/src/foundation-profiles.js';
import {outfitSelection} from '../prototype/src/outfit-selection.js';
import {resolveEquipmentSet} from '../prototype/src/equipment-set.js';

let legacyLooks=0;
for(const body of Object.keys(FOUNDATION_PROFILES)) {
  const profile=foundationProfile(body);
  for(const look of profile.outfits){
    const actual=outfitSelection(profile,look.index);
    assert.deepEqual(actual.roles,['top','shoes',look.role]);
    assert.deepEqual(actual.ids,actual.roles.map(role=>profile.ids[role]));
    assert.equal(actual.bottomRole,look.role);legacyLooks++;
  }
  assert.throws(()=>outfitSelection(profile,99),/no matching/);
  assert.throws(()=>outfitSelection(profile,'unknown'),/no matching/);
}
const config={ids:{top:'top',shoes:'shoes',shorts:'shorts',outer:'outer'},outfits:[
  {index:3,role:'layered-shorts',bottomRole:'shorts',equipmentRoles:['top','shoes','shorts','outer']},
]};
const selection=outfitSelection(config,'3');
const catalog=selection.ids.map(id=>({id,slot:({top:'top',shoes:'shoes',shorts:'bottom',outer:'outerwear'})[id],compatibleAvatarSha256:'body',layerWith:id==='outer'?['top']:undefined}));
assert.deepEqual(resolveEquipmentSet(catalog,selection.ids,'body').map(item=>item.id),selection.ids);
for(const change of [{equipmentRoles:['shorts','missing']},{equipmentRoles:['shorts','shorts']},{bottomRole:'skirt'},{equipmentRoles:[]}]){
  assert.throws(()=>outfitSelection({...config,outfits:[{...config.outfits[0],...change}]},3));
}
assert.throws(()=>outfitSelection({...config,ids:{...config.ids,outer:'top'}},3),/Duplicate/);
console.log(JSON.stringify({passed:true,legacyLooks,scope:'Exact legacy role order/IDs preserved; synthetic configured outer+shorts composes through common set resolver. No new garment fit proof.'}));
