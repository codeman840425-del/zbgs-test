import {readFile} from 'node:fs/promises';

export async function load(url, context, nextLoad) {
  if (url.endsWith('/glasses-temple-fit-manifest.json')) {
    return {format: 'json', shortCircuit: true, source: await readFile(new URL(url), 'utf8')};
  }
  return nextLoad(url, context);
}
