#!/usr/bin/env node
import { setTimeout as delay } from 'node:timers/promises';
import { createStoredCharacterRecord, updateStoredCharacterRecord } from './character-record-store.mjs';

const [mode, root, id, waitMsText = '0', marker = 'worker', lockWaitText] = process.argv.slice(2);
const waitMs = Number(waitMsText);
const lockWaitMs = lockWaitText === undefined ? undefined : Number(lockWaitText);
const recipe = {
  schema: 'workbench-appearance-recipe-v9',
  rulesVersion: 'workbench-appearance-rules-v9',
  base: { bodyType: 'native-male-7586-v1', sha256: '7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81' },
  appearance: { hairStyle: 'original', hairColor: 'original', skinTone: 'original', eyeColor: 'original', lipColor: 'original', eyebrowColor: 'original' },
  equipment: { index: 0, role: 'shorts', manifestUrl: 'equipment.json', resources: [] },
};
const provenance = { producer: 'concurrency-worker', sourceRefs: [{ path: 'fixture/avatar.vrm', sha256: 'a'.repeat(64) }] };
const validateResources = async () => {
  if (waitMs > 0) await delay(waitMs);
  return { status: 'pending', reason: 'concurrency test' };
};

try {
  if (mode === 'create') {
    const result = await createStoredCharacterRecord(root, { identity: { id, name: 'Concurrent', gender: 'male' }, appearanceRecipe: recipe, provenance, now: '2026-11-17T00:00:00.000Z' }, { validateResources, lockWaitMs });
    console.log(JSON.stringify({ ok: true, mode, changed: result.changed, revision: result.record.revision }));
  } else if (mode === 'update') {
    const result = await updateStoredCharacterRecord(root, id, { appearanceRecipe: { ...recipe, appearance: { ...recipe.appearance, eyeColor: marker } } }, { expectedRevision: 1, validateResources, now: `2026-11-17T00:01:0${marker === 'green' ? '1' : '2'}.000Z`, lockWaitMs });
    console.log(JSON.stringify({ ok: true, mode, changed: result.changed, revision: result.record.revision }));
  } else {
    throw Object.assign(new Error('Unknown worker mode'), { code: 'worker-usage' });
  }
} catch (e) {
  console.error(JSON.stringify({ ok: false, code: e.code ?? 'error', message: e.message }));
  process.exitCode = 1;
}
