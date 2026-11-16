import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {prepareCompanyChange} from '../../prototype/src/company/document.js';

// A recipe only changes surface choices. It cannot move or remove furniture.
export function applySurfaceRecipe(document,recipe) {
  if(recipe.version!==1||!recipe.default||Object.keys(recipe).some(key=>!['version','name','default','purposes'].includes(key)))throw Error('Unsupported surface recipe');
  const operations=[];
  for(const region of document.nodes.filter(node=>['room','area'].includes(node.kind))) {
    const selection={...recipe.default,...recipe.purposes?.[region.purpose||'public']};
    if(Object.keys(selection).some(key=>!['wall','floor','ceiling'].includes(key)))throw Error('Recipe accepts wall, floor and ceiling finishes only');
    for(const [type,finish]of Object.entries(selection))for(const surface of type==='wall'?['north','south','west','east']:[type])
      operations.push({type:'set-surface-finish',id:region.id,surface,finish});
  }
  return prepareCompanyChange(document,operations,{catalog,templates}).document;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url) {
  const [layout,recipe,output]=process.argv.slice(2);
  if(!output)throw Error('Usage: apply-surface-recipe.mjs LAYOUT RECIPE NEW_OUTPUT');
  const result=applySurfaceRecipe(JSON.parse(await fs.readFile(layout)),JSON.parse(await fs.readFile(recipe)));
  await fs.writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output,company:result.id,regions:result.nodes.filter(n=>n.finishes).length}));
}
