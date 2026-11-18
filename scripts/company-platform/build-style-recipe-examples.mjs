import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import catalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import templates from '../../prototype/src/company/templates-extended.json' with { type: 'json' };
import { applyStyleRecipe } from './apply-style-recipe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inputs = [
  ['mixed-company', 'prototype/src/company/examples/c2-mixed-company.json'],
  ['small-home', 'prototype/src/company/examples/c2-small-home.json'],
];
const recipes = [
  ['warm-live', 'scripts/company-platform/style-recipes/warm-live.json'],
  ['cool-work', 'scripts/company-platform/style-recipes/cool-work.json'],
];
const outputRoot = path.join(root, 'evidence/company-style-recipe-v1/inputs');
await fs.mkdir(outputRoot, { recursive: true });
const records = [];
for (const [layoutId, layoutPath] of inputs) {
  const layout = JSON.parse(await fs.readFile(path.join(root, layoutPath), 'utf8'));
  for (const [recipeId, recipePath] of recipes) {
    const recipe = JSON.parse(await fs.readFile(path.join(root, recipePath), 'utf8'));
    const result = applyStyleRecipe(layout, recipe, { catalog, templates });
    const outputPath = path.join(outputRoot, `${layoutId}-${recipeId}.json`);
    const bytes = Buffer.from(JSON.stringify(result.document, null, 2) + '\n');
    await fs.writeFile(outputPath, bytes);
    const manifest = { schema: 'company-style-recipe-result@1', layoutId, recipe: result.recipe, input: layoutPath, output: path.relative(root, outputPath).replaceAll('\\', '/'), operations: result.operations.length, facilityCount: result.document.nodes.filter(node => node.kind === 'facility').length };
    await fs.writeFile(`${outputPath}.style.json`, JSON.stringify(manifest, null, 2) + '\n');
    records.push(manifest);
  }
}
const report = { status: 'passed', schema: 'company-style-recipe@1', records };
await fs.writeFile(path.join(root, 'evidence/company-style-recipe-v1/batch-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, inputs: records.length, output: 'evidence/company-style-recipe-v1/inputs' }));
