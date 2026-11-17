import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createCharacterRecord} from '../../prototype/src/character-record.js';
import {deriveCharacterResourceIdentities} from '../../prototype/src/character-runtime-record.js';
import {foundationProfile} from '../../prototype/src/foundation-profiles.js';
import {outfitSelection} from '../../prototype/src/outfit-selection.js';
import {facialPaletteContract} from '../../prototype/src/facial-palette-contract.js';
import {validateHairSelection,hairFitIdentity} from '../../prototype/src/hair-fit-contract.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'experiments/m2-production-release-v2');
const male=JSON.parse(await readFile(path.join(source,'prototype/public/assets/record-consumer-v1/male-material.json')));
const femaleConfig=foundationProfile('female'), femaleSha=femaleConfig.sha256;
const catalog=JSON.parse(await readFile(path.join(source,'prototype/public',femaleConfig.manifestUrl))).items;
const outfit=outfitSelection(femaleConfig,0), hair=validateHairSelection(femaleSha,'female-ponytail-v1');
const ponytail={...structuredClone(male.appearanceRecipe),schema:'workbench-appearance-recipe-v6',rulesVersion:'workbench-appearance-rules-v6',
  paletteVersion:facialPaletteContract(femaleSha).version,base:{bodyType:'female',sha256:femaleSha},
  hairAssetSha256:hair.assetSha256,hairFit:hairFitIdentity(hair),
  equipment:{index:0,role:outfit.selection.role,manifestUrl:femaleConfig.manifestUrl,resources:Object.fromEntries(outfit.roles.map((role,i)=>[role,catalog.find(entry=>entry.id===outfit.ids[i])]))}};
delete ponytail.accessories;
ponytail.appearance.hairStyle=hair.id;
const live={schema:'live-accessory-record-v1',selections:{mic:{enabled:false,identity:null},glasses:{enabled:false,identity:null}},microphonePresentation:null};
const temp=await mkdtemp(path.join(tmpdir(),'gamemake-budget-review-'));
try{
  for(const [id,recipe,materials] of [['shorts-original',male.appearanceRecipe,male.equipmentMaterials],
    ['shorts-blonde',{...male.appearanceRecipe,appearance:{...male.appearanceRecipe.appearance,hairColor:'blonde'}},male.equipmentMaterials],
    ['ponytail',ponytail,undefined]]){
    const record=await createCharacterRecord({identity:{id,name:id,gender:'fixture'},appearanceRecipe:recipe,equipmentMaterials:materials,liveAccessories:live,
      resourceIdentities:deriveCharacterResourceIdentities(recipe,live,materials),provenance:{producer:'independent-budget-check',sourceRefs:[]},now:male.createdAt},{validateResources:()=>({status:'pending'})});
    const file=path.join(temp,id+'.json');await writeFile(file,JSON.stringify(record));
    const run=spawnSync('python',['-B','scripts/production/record_budget.py','measure',file,'--source-root',source,'--budget-version','m2-technical-v1'],{cwd:root,maxBuffer:8*1024*1024,encoding:'utf8'});
    const result=JSON.parse(run.stdout),row=result.records?.[0];
    if(id==='shorts-blonde'){
      assert.equal(run.status,2);
      assert.equal(result.status,'unsupported');
      assert.equal(row,undefined);
    }else{
      assert.equal(run.status,1);
      if(id==='shorts-original'){
        assert.equal(row.selectedCost.totals.textureObjects,28);
        assert.equal(row.selectedCost.totals.rgba8MipBytes,168821416);
      }else{
        const hairRow=row.models.find(m=>m.class==='hair');
        assert.equal(hairRow.cost.metrics.springJoints,6);
        assert.equal(hairRow.cost.metrics.colliders,3);
      }
    }
    console.log(JSON.stringify({id,exit:run.status,error:result.error,status:result.status,
      textures:row?.selectedCost.totals.textureObjects,rgba8:row?.selectedCost.totals.rgba8MipBytes,
      hairMetrics:row?.models.find(m=>m.class==='hair')?.cost.metrics.springJoints,
      hairColliders:row?.models.find(m=>m.class==='hair')?.cost.metrics.colliders}));
  }
}finally{await rm(temp,{recursive:true,force:true});}
