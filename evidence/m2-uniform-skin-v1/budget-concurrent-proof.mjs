import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {digest} from '../../scripts/runtime-package/files.mjs';
import {readStaticBudget} from '../../scripts/runtime-package/verify-character-handoff.mjs';

const paths = {
  signedRecords: 'signed-pair.json',
  staticBudget: 'budget-signed-pair.json',
  fixedInventory: 'inventory.json',
  budgetConfig: '../../scripts/production/asset-budgets-v1.json',
};
const bytes = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) =>
  [key, await readFile(new URL(path, import.meta.url))])));
const pointer = name => ({path:paths[name], sha256:digest(bytes[name])});
const report = JSON.parse(bytes.staticBudget);
const inventory = JSON.parse(bytes.fixedInventory);
const root = fileURLToPath(new URL('../../',import.meta.url));
const planner = fileURLToPath(new URL('../../scripts/runtime-package/inspect-handoff-plan.py',import.meta.url));
const limits = JSON.parse(execFileSync('python',['-I','-B','-X','utf8',planner,'--budget-limits',root],{encoding:'utf8'}));
const runtimeFiles = inventory.files.filter(file => file.provenance?.some(origin => origin.sourcePath?.startsWith('prototype/public/')));
const verified = readStaticBudget(report,{
  runtime:inventory.runtime,
  inputs:{signedRecords:pointer('signedRecords')},
  staticBudgetEvidence:pointer('staticBudget'),
}, JSON.parse(bytes.signedRecords), bytes.budgetConfig, limits, runtimeFiles);

const recordTotals = totals => Object.fromEntries(['fileBytes','rgba8MipBytes','textureObjects'].map(metric =>
  [metric, totals[metric]]));
console.log(JSON.stringify({
  schema:'zbgs-signed-record-budget-scope-proof-v1',
  runtime:inventory.runtime,
  inputs:Object.fromEntries(Object.keys(paths).map(key => [key,pointer(key)])),
  perRecordStaticBudget:{
    status:verified.status,
    scope:'Every signed record is assessed independently against its per-asset limits and the temporary selected and startup look limits.',
    records:verified.records.map((record,index) => ({...record,
      selected:recordTotals(report.records[index].selectedCost.totals),
      startupAndSelected:recordTotals(report.records[index].startupAndSelectedCost.totals),
    })),
  },
  concurrentSelectedActorReference:{
    ...verified.aggregate,
    actorCount:verified.records.length,
    scope:'The concurrently selected actors use summed per-actor texture and triangle estimates. File bytes use the deduplicated union of the signed records’ dependencies.',
    measurementScope:'Conservative texture sum keeps duplicate actor texture estimates. Actual cross-actor sharing, renderer-only allocations and physical GPU memory are unmeasured.',
    excesses:verified.aggregate.excesses.map(excess => ({...excess,excess:excess.actual-excess.limit})),
  },
  ordinaryPCPerformance:verified.ordinaryPCPerformance,
  runtimeAdmission:report.runtimeAdmission,
},null,2));
