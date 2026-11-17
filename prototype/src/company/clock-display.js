// Presentation consumes explicit host time. No timer, actor or saved-clock owner.
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, expected) => object(value) && Object.keys(value).sort().join(',') === [...expected].sort().join(',');
const name = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value);

export function validateClockResource(resource, fail, path = resource.id) {
  if (resource.clockDisplay === undefined) {
    if (resource.clockNodes !== undefined) fail('invalid-clock-contract', path, 'Clock mappings need a clockDisplay contract');
    return;
  }
  const display = resource.clockDisplay, mapping = resource.clockNodes, digital = display?.kind === 'digital';
  const supported = resource.mount === 'support-surface', frame = digital ? [0,.09,-.03] : [0,.175,-.04];
  const fields = digital ? ['timeOffsetSeconds', 'on', 'brightness'] : ['timeOffsetSeconds'];
  const size = digital ? [.5, .18, .06] : [.35, .35, .08];
  const mounting = resource.mounting;
  if (!keys(display, supported ? ['kind', 'format', 'seconds', 'frame'] : ['kind', 'format', 'seconds']) || !['analog', 'digital'].includes(display.kind) ||
      display.format !== (digital ? '24h' : '12h') || display.seconds !== true || !resource.asset ||
      (!supported && resource.mount !== 'wall') || !mounting || mounting.origin !== (supported ? 'bottom' : 'center') ||
      (supported && (!Array.isArray(display.frame) || display.frame.length !== 3 || frame.some((value,i) => display.frame[i] !== value))) ||
      ['width', 'height', 'depth'].some((field, i) => mounting[field] !== size[i]) ||
      resource.movingParts || resource.light || resource.display || resource.usePoints?.length ||
      resource.footprint?.blocking || !keys(resource.stateDefaults, fields) || !keys(resource.stateSchema, fields) ||
      !keys(resource.stateSemantics, fields))
    fail('invalid-clock-contract', path, 'Expected the fixed clock display, mounting and state fields');
  const offset = resource.stateSchema.timeOffsetSeconds;
  if (!keys(offset, ['type', 'min', 'max']) || offset.type !== 'number' || offset.min !== -86400 || offset.max !== 86400 ||
      resource.stateDefaults.timeOffsetSeconds !== 0 || resource.stateSemantics.timeOffsetSeconds !== 'host-clock-offset-seconds')
    fail('invalid-clock-contract', path, 'Expected the saved host time offset contract');
  let names;
  if (digital) {
    const brightness = resource.stateSchema.brightness;
    if (!keys(resource.stateSchema.on, ['type']) || resource.stateSchema.on.type !== 'boolean' ||
        !keys(brightness, ['type', 'min', 'max']) || brightness.type !== 'number' || brightness.min !== 0 || brightness.max !== 1 ||
        resource.stateDefaults.on !== true || resource.stateDefaults.brightness !== 1 ||
        resource.stateSemantics.on !== 'clock-display-powered' || resource.stateSemantics.brightness !== 'clock-display-brightness' ||
        !keys(mapping, supported ? ['digits', 'colons', 'frame', 'base'] : ['digits', 'colons']) || !Array.isArray(mapping.digits) || mapping.digits.length !== 6 ||
        mapping.digits.some(digit => !Array.isArray(digit) || digit.length !== 7) || !Array.isArray(mapping.colons) || mapping.colons.length !== 4)
      fail('invalid-clock-contract', path, 'Expected six seven-segment digits, four dots and powered brightness');
    names = [...mapping.digits.flat(), ...mapping.colons];
  } else {
    if (!keys(mapping, supported ? ['hour', 'minute', 'second', 'frame', 'base'] : ['hour', 'minute', 'second'])) fail('invalid-clock-contract', path, 'Expected three named hand pivots');
    names = [mapping.hour, mapping.minute, mapping.second];
  }
  if (supported) names.push(mapping.frame, mapping.base);
  if (names.some(value => !name(value)) || new Set(names).size !== names.length)
    fail('invalid-clock-contract', path, 'Display mappings must name distinct actual nodes');
}

export function validatePresentationInputs(inputs) {
  if (!keys(inputs, ['clockSeconds']) || !Number.isFinite(inputs.clockSeconds) || Math.abs(inputs.clockSeconds) > 1e12)
    throw Object.assign(new Error('Expected only finite host clockSeconds within ±1e12'), {code:'invalid-presentation-input', path:'clockSeconds'});
  return {clockSeconds:inputs.clockSeconds};
}

export const CLOCK_DIGIT_SEGMENTS = Object.freeze(['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg']);
export function clockReading(clockSeconds, offset = 0) {
  validatePresentationInputs({clockSeconds});
  if (!Number.isFinite(offset) || Math.abs(offset) > 86400) throw new RangeError('Clock offset outside supported range');
  const seconds = ((clockSeconds + offset) % 86400 + 86400) % 86400;
  const whole = Math.floor(seconds), hours = Math.floor(whole / 3600), minutes = Math.floor(whole / 60) % 60;
  return {seconds, text:[hours, minutes, whole % 60].map(n => String(n).padStart(2,'0')).join(':'),
    angles:{hour:-Math.PI*2*(seconds%43200)/43200, minute:-Math.PI*2*(seconds%3600)/3600, second:-Math.PI*2*(seconds%60)/60}};
}

export function bindClockDisplay(resource, nodes, state) {
  if (!resource.clockDisplay) return null;
  const get = name => {
    const node = nodes.get(name);
    if (!node) throw Object.assign(new Error(`Missing clock node ${name}`), {code:'missing-clock-node', path:resource.id});
    return node;
  };
  if (resource.clockDisplay.kind === 'analog') {
    const hands = Object.fromEntries(['hour','minute','second'].map(part => [part, get(resource.clockNodes[part])]));
    return {apply(input) {
      const reading = clockReading(input.clockSeconds, state.timeOffsetSeconds);
      for (const [part, node] of Object.entries(hands)) node.rotation.z = reading.angles[part];
      return reading;
    }};
  }
  const digits = resource.clockNodes.digits.map(names => names.map(get)), colons = resource.clockNodes.colons.map(get);
  const meshes = [...digits.flat(), ...colons];
  for (const mesh of meshes) {
    if (!mesh.isMesh || !mesh.material || [mesh.material].flat().some(material => !material.emissive))
      throw Object.assign(new Error(`Clock segment ${mesh.name} must be an emissive-capable mesh`), {code:'invalid-clock-material', path:resource.id});
  }
  return {apply(input) {
    const reading = clockReading(input.clockSeconds, state.timeOffsetSeconds), lit = state.on && state.brightness > 0;
    for (const mesh of meshes) for (const material of [mesh.material].flat()) {
      material.color.set('#75efbe'); material.emissive.set('#75efbe'); material.emissiveIntensity = lit ? state.brightness : 0;
    }
    const numbers = reading.text.replaceAll(':','');
    digits.forEach((segments, index) => segments.forEach((mesh, segment) => {mesh.visible = lit && CLOCK_DIGIT_SEGMENTS[Number(numbers[index])].includes('abcdefg'[segment]);}));
    for (const dot of colons) dot.visible = lit;
    return reading;
  }};
}
