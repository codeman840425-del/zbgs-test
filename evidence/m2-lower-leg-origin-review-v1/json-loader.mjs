// Node-only loader bridge for the browser's bare JSON imports. No runtime edits.
import fs from 'node:fs/promises';
export async function load(url, context, nextLoad) {
  if (url.endsWith('.json')) return { format: 'json', source: await fs.readFile(new URL(url)), shortCircuit: true };
  return nextLoad(url, context);
}
