import {productionRuleBodyPointers} from './character-record-input.js';
import {initializeRuleBodyData} from './foundation-profiles.js';

// The production host publishes this sidecar only for the supplied shape packs.
// Both authoring and room verification consume exactly the same registration.
export async function registerPublishedProductionBodies(parameters, signal) {
  const values = parameters.getAll('ruleBodyData');
  if (!values.length) return;
  if (values.length !== 1 || values[0] !== '1') throw Error('Invalid rule body data selection');
  const response = await fetch('/records/rule-body-data.json', {redirect:'error', credentials:'same-origin', signal});
  if (!response.ok) throw Error('Published rule body list HTTP ' + response.status);
  const pointers = productionRuleBodyPointers(await response.json());
  const registration = await initializeRuleBodyData(pointers, {signal});
  if (signal.aborted) {
    registration.dispose();
    signal.throwIfAborted();
  }
  signal.addEventListener('abort', () => registration.dispose(), {once:true});
}
