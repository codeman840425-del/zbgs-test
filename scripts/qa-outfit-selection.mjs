import assert from 'node:assert/strict';
import {FOUNDATION_PROFILES,foundationProfile} from '../prototype/src/foundation-profiles.js';
import {outfitSelection} from '../prototype/src/outfit-selection.js';
import {resolveEquipmentSet} from '../prototype/src/equipment-set.js';

let legacyLooks=0;
for(const body of Object.keys(FOUNDATION_PROFILES)) {
  const profile=foundationProfile(body);
  for(const look of profile.outfits){
    const actual=outfitSelection(profile,look.index);
    if(look.equipmentRoles){
      assert.deepEqual(actual.roles,look.equipmentRoles);
      assert.equal(actual.bottomRole,look.bottomRole);
      continue;
    }
    assert.deepEqual(actual.roles,['top','shoes',look.role]);
    assert.deepEqual(actual.ids,actual.roles.map(role=>profile.ids[role]));
    assert.equal(actual.bottomRole,look.role);legacyLooks++;
  }
  assert.throws(()=>outfitSelection(profile,99),/no matching/);
  assert.throws(()=>outfitSelection(profile,'unknown'),/no matching/);
}
// A native body with shorts must not invent a pants item or expose duplicate
// shorts looks. Exercise the same profile factory used by runtime actors.
const shortBody='qa-native-short-default';
FOUNDATION_PROFILES[shortBody]={id:shortBody,ids:{top:'native-top',shorts:'native-shorts',shoes:'native-shoes'},
  defaultOutfit:{index:0,role:'shorts',bottomRole:'shorts',equipmentRoles:['top','shorts','shoes']}};
try {
  const native=foundationProfile(shortBody);
  assert.equal(native.outfits.length,1);
  assert.deepEqual(outfitSelection(native,0).ids,['native-top','native-shorts','native-shoes']);
  native.outfits[0].equipmentRoles.pop();
  assert.equal(foundationProfile(shortBody).outfits[0].equipmentRoles.length,3);
  FOUNDATION_PROFILES[shortBody].defaultOutfit.index=2;
  assert.throws(()=>foundationProfile(shortBody),/index 0/);
} finally {delete FOUNDATION_PROFILES[shortBody];}
const config={ids:{top:'top',shoes:'shoes',shorts:'shorts',outer:'outer'},outfits:[
  {index:3,role:'layered-shorts',bottomRole:'shorts',equipmentRoles:['top','shoes','shorts','outer']},
]};
const selection=outfitSelection(config,'3');
const catalog=selection.ids.map(id=>({id,slot:({top:'top',shoes:'shoes',shorts:'bottom',outer:'outerwear'})[id],compatibleAvatarSha256:'body',layerWith:id==='outer'?['top']:undefined}));
assert.deepEqual(resolveEquipmentSet(catalog,selection.ids,'body').map(item=>item.id),selection.ids);
catalog.find(item=>item.id==='outer').allowedBottoms=['shorts'];
assert.deepEqual(resolveEquipmentSet(catalog,selection.ids,'body').map(item=>item.id),selection.ids);
catalog.find(item=>item.id==='outer').allowedBottoms=['unfitted-pants'];
assert.throws(()=>resolveEquipmentSet(catalog,selection.ids,'body'),/lower-layer fit/);
for(const change of [{equipmentRoles:['shorts','missing']},{equipmentRoles:['shorts','shorts']},{bottomRole:'skirt'},{equipmentRoles:[]}]){
  assert.throws(()=>outfitSelection({...config,outfits:[{...config.outfits[0],...change}]},3));
}
assert.throws(()=>outfitSelection({...config,ids:{...config.ids,outer:'top'}},3),/Duplicate/);
const suitConfig={ids:{onePiece:'suit',shoes:'shoes'},outfits:[{index:5,role:'onePiece',bottomRole:'onePiece',equipmentRoles:['shoes','onePiece']}]};
const suitSelection=outfitSelection(suitConfig,5);
const suitCatalog=[{id:'suit',slot:'onePiece',compatibleAvatarSha256:'body'},{id:'shoes',slot:'shoes',compatibleAvatarSha256:'body'},
 {id:'top',slot:'top',compatibleAvatarSha256:'body'},{id:'shorts',slot:'bottom',compatibleAvatarSha256:'body'}];
assert.deepEqual(resolveEquipmentSet(suitCatalog,suitSelection.ids,'body').map(item=>item.id),['shoes','suit']);
for(const conflicting of ['top','shorts'])assert.throws(()=>resolveEquipmentSet(suitCatalog,[...suitSelection.ids,conflicting],'body'),/conflict/);
console.log(JSON.stringify({passed:true,legacyLooks,scope:'Legacy role order/IDs preserved; configured outer and onePiece resolve through shared occupancy rules; onePiece rejects separate top or bottom. No garment fit proof.'}));
