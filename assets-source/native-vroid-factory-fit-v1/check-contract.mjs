// Actual existing selection contract only; no loader/browser/runtime admission.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {resolveEquipmentSet} from '../../prototype/src/equipment-set.js';
import {outfitSelection} from '../../prototype/src/outfit-selection.js';
const directory=new URL('./',import.meta.url);
const read=name=>JSON.parse(fs.readFileSync(new URL(name,directory),'utf8'));
const manifest=read('equipment.json'),candidate=read('profile-candidate.json'),p=candidate.profile;
const selection=outfitSelection({...p,outfits:[p.defaultOutfit]},0);
const selected=resolveEquipmentSet(manifest.items,selection.ids,p.sha256);
if(selected.length!==3||selection.bottomRole!=='shorts')throw Error('Incorrect actual outfit roles');
let oldSourceRejected=false;
try{resolveEquipmentSet(manifest.items,selection.ids,'78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3');}catch(e){if(!e.message.includes('exact body identity'))throw e;oldSourceRejected=true;}
if(!oldSourceRejected)throw Error('Wrong avatar identity accepted');
const sourcePins=['../../prototype/src/equipment-set.js','../../prototype/src/outfit-selection.js'].map(path=>({path,sha256:crypto.createHash('sha256').update(fs.readFileSync(new URL(path,directory))).digest('hex')}));
const result={schema:'native-unmasked-equipment-selection-contract-v1',selectedIds:selection.ids,bottomRole:selection.bottomRole,oldSourceRejected,sourcePins,scope:'Existing pure selection functions only. Profile registry, GLTF loader, coverage and game not exercised.'};
fs.writeFileSync(new URL('contract-check.json',directory),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
