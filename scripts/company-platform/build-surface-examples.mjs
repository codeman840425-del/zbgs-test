import fs from 'node:fs/promises';
import {applySurfaceRecipe} from './apply-surface-recipe.mjs';
const root=new URL('../../',import.meta.url),check=process.argv.includes('--check');
const inputs=[
  {layout:'c2-mixed-company',recipe:'warm',output:'c2-surface-company',name:'连续饰面 · 两层住宅',removeOldPanels:true},
  {layout:'c2-small-home',recipe:'graphic',output:'c1-surface-home',name:'连续饰面 · 民房'},
  {layout:'c2-surface-company',recipe:'ceilings',output:'c2-ceiling-company',name:'完整饰面 · 两层住宅'},
  {layout:'c1-surface-home',recipe:'ceilings',output:'c1-ceiling-home',name:'完整饰面 · 民房'},
];
for(const input of inputs) {
  const read=async name=>JSON.parse(await fs.readFile(new URL(name,root)));
  const base=await read(`prototype/src/company/examples/${input.layout}.json`);
  // The earlier fixture intentionally exhibited small sample panels. This new
  // fixture omits them so they do not cover the complete structural finishes.
  if(input.removeOldPanels)base.nodes=base.nodes.filter(node=>!node.id.endsWith('/floor-panel')&&!node.id.endsWith('/wall-panel'));
  base.name=input.name;
  const result=applySurfaceRecipe(base,await read(`scripts/company-platform/surface-inputs/${input.recipe}.json`));
  const bytes=JSON.stringify(result,null,2)+'\n',output=new URL(`prototype/src/company/examples/${input.output}.json`,root);
  if(check){if(await fs.readFile(output,'utf8')!==bytes)throw Error(`Stale example: ${input.output}`);}
  else await fs.writeFile(output,bytes);
}
console.log(JSON.stringify({status:'passed',mode:check?'check':'build',inputs}));
