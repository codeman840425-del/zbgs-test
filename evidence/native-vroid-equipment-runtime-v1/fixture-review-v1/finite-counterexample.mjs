import { Vector3 } from '../../../prototype/node_modules/three/build/three.module.js';
import { writeFile } from 'node:fs/promises';
let maximumWorldErrorM = 0;
let worstSourceIndex = null;
const error = new Vector3(NaN, 0, 0).distanceTo(new Vector3(0, 0, 0));
if (error > maximumWorldErrorM) {
  maximumWorldErrorM = error;
  worstSourceIndex = 0;
}
const result = { schema: 'native-equipment-fixture-finite-counterexample-v1',
  actualErrorFinite: Number.isFinite(error), reportedMaximumM: maximumWorldErrorM,
  reportedWorstSourceIndex: worstSourceIndex,
  meaning: 'The v3 aggregation can report zero when a point is nonfinite',
  limits: 'Controlled actual Three Vector3 counterexample. No claim the v3 recording actually contained NaN.' };
await writeFile(new URL('./finite-counterexample.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(result);
