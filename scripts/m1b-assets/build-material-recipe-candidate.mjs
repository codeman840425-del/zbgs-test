// Generate isolated, reviewable integration artifacts. Never edits src/public.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=path.join(root,'assets-source/m1b/shorts/material-recipe-candidate-v1');
const read=p=>readFile(path.join(root,p),'utf8'),hash=b=>createHash('sha256').update(b).digest('hex');
const manifestText=await read('prototype/public/assets/m1b/equipment.json');
const manifest=JSON.parse(manifestText),entry=manifest.items.find(x=>x.id==='m1b-uniform-shorts-v1');
assert.equal(entry.sha256,'c8a1afd0742cbb99302abc107673744751a8cfd77c6c89df039b068054a947d0');
assert.equal(hash(await readFile(path.join(root,'prototype/public/assets/m1b',entry.url))),entry.sha256);
const implementation=await readFile(path.join(out,'src/cloth-material.js'));
assert.equal(hash(implementation),'4539ac3f83bc5fb1fa9aa91dbfb7323a8f2e7084a5f762d9713d0ae36bcfb565');
const recipe={schema:'zbgs-garment-material-recipe-v1',id:'m1b-shorts-cloth-v4-review1',version:1,status:'candidate-not-product-visual-acceptance',
 fit:{equipmentId:entry.id,garmentSha256:entry.sha256,avatarSha256:entry.compatibleAvatarSha256,fitId:entry.fitId,styleId:entry.styleId},
 implementation:{id:'cloth-normal-v4-review1',sha256:hash(implementation),threeRevision:'187'},
 materialNames:['M00_001_01_Bottoms_01_CLOTH','M1B_Shorts_InnerFacing'],settings:{linearColor:[.025,.032,.055],fabricStart:[.17,.21]},
 preserves:['original GLB geometry/UV/skin weights','original alpha map/test','original unmodified materials for restore'],
 limits:['UV-band/stripe retention is not semantic preservation of every seam/pocket','Fixed world-light toon approximation, not PBR or fabric simulation','Only exact current male shorts fit; no male/female/variant generalization']};
const recipeText=JSON.stringify(recipe,null,2)+'\n',filename='m1b-shorts-cloth-v4-review1.json';
await mkdir(path.join(out,'public/assets/material-recipes'),{recursive:true});
await writeFile(path.join(out,'public/assets/material-recipes',filename),recipeText);
entry.materialRecipes=[{id:recipe.id,url:'/assets/material-recipes/'+filename,sha256:hash(recipeText),bytes:Buffer.byteLength(recipeText)}];
await mkdir(path.join(out,'public/assets/m1b'),{recursive:true});
const manifestAnchor='      "sourceSpec": "assets-source/m1b/shorts/spec.json"';
const manifestCandidate=once(manifestText,manifestAnchor,manifestAnchor+',\n      "materialRecipes": '+JSON.stringify(entry.materialRecipes,null,2).replace(/\n/g,'\n      '));
assert.deepEqual(JSON.parse(manifestCandidate),manifest);
await writeFile(path.join(out,'public/assets/m1b/equipment.json'),manifestCandidate);
let equipment=await read('prototype/src/equipment.js');
const sourceHashes={'prototype/src/equipment.js':hash(equipment)};
function once(text,needle,replacement){assert.equal(text.split(needle).length,2,'Patch anchor must occur once: '+needle);if(text.includes('\r\n'))replacement=replacement.replace(/\r?\n/g,'\r\n');return text.replace(needle,replacement);}
equipment=once(equipment,'import * as THREE from "three";','import * as THREE from "three";\nimport { createGarmentMaterialRecipes } from "./material-recipes.js";');
equipment=once(equipment,'  let disposed = false;','  const materialRequests = new Map();\n  let disposed = false;');
equipment=once(equipment,'    loaded.set(entry.id, result);','    result.materialRecipes = createGarmentMaterialRecipes({entry,meshes,avatarSha256,manifestBase,threeRevision:THREE.REVISION});\n    loaded.set(entry.id, result);');
equipment=once(equipment,'  function destroy(item) {','  function destroy(item) {\n    item.materialRecipes?.dispose();');
equipment=once(equipment,'    get(id) { return loaded.get(id) || null; },',`    async setMaterialRecipe(id, recipeId) {
      if(disposed)throw new Error("Equipment adapter is disposed");
      getEntry(id);
      const ticket=(materialRequests.get(id)||0)+1;materialRequests.set(id,ticket);
      if(recipeId===null&&!loaded.has(id))return {applied:true,state:null};
      const item=await load(id);
      if(disposed)throw new Error("Equipment adapter is disposed");
      if(materialRequests.get(id)!==ticket)return {applied:false,reason:"superseded"};
      return item.materialRecipes.select(recipeId);
    },
    getMaterialRecipeState(id) { return loaded.get(id)?.materialRecipes.getState() ?? null; },
    get(id) { return loaded.get(id) || null; },`);
await writeFile(path.join(out,'src/equipment.js'),equipment);
// Two pass-throughs expose the same equipment implementation to the avatar;
// scene/UI may call it, with no action, motion or geometry changes.
let composition=await read('prototype/src/m1-equipment.js');sourceHashes['prototype/src/m1-equipment.js']=hash(composition);
composition=once(composition,'    setDebugBody(value) {',`    setMaterialRecipe(id, recipeId) { return adapter.setMaterialRecipe(id, recipeId); },
    getMaterialRecipeState(id) { return adapter.getMaterialRecipeState(id); },
    setDebugBody(value) {`);
await writeFile(path.join(out,'src/m1-equipment.js'),composition);
let avatar=await read('prototype/src/foundation-avatar.js');sourceHashes['prototype/src/foundation-avatar.js']=hash(avatar);
avatar=once(avatar,'    getAssetProfile: () => profile,',`    getAssetProfile: () => profile,
    setMaterialRecipe: (id, recipeId) => equipment.setMaterialRecipe(id, recipeId),
    getMaterialRecipeState: (id) => equipment.getMaterialRecipeState(id),`);
await writeFile(path.join(out,'src/foundation-avatar.js'),avatar);
await writeFile(path.join(out,'build-receipt.json'),JSON.stringify({status:'isolated-generated-patch-not-applied',sourceHashes,recipe:entry.materialRecipes[0],sourceGarmentSha256:entry.sha256,implementationSha256:hash(implementation),geometryUnchanged:true},null,2)+'\n');
console.log(JSON.stringify({out,recipe:entry.materialRecipes[0],sourceHashes},null,2));
