// Door-frame construction in metres, with +Z facing inward from the back plane.
// Each part gives [name, minimum XY, maximum XY, material]. XY follows v1.
const materials = {
  base: '#c8b79f',
  accent: '#9c7857',
  dark: '#59645e',
};
const baseParts = [
  ['left-jamb', [-.85, 0], [-.7, 2.2], 'base'],
  ['right-jamb', [.7, 0], [.85, 2.2], 'base'],
  ['header', [-.85, 2.2], [.85, 2.4], 'base'],
];
const reliefParts = {
  'door-frame-stepped': [
    ['step--0.72', [-.775, 2.32], [-.665, 2.4], 'accent'],
    ['step-0.72', [.665, 2.32], [.775, 2.4], 'accent'],
  ],
  'door-frame-inset': [
    ['left-trim', [-.7525, .05], [-.7075, 2.15], 'dark'],
    ['right-trim', [.7075, .05], [.7525, 2.15], 'dark'],
    ['top-trim', [-.68, 2.2175], [.68, 2.2625], 'dark'],
  ],
  'door-frame-crown': [
    ['crown-center', [-.25, 2.3], [.25, 2.4], 'accent'],
    ['crown-wing--0.55', [-.725, 2.32], [-.375, 2.38], 'accent'],
    ['crown-wing-0.55', [.375, 2.32], [.725, 2.38], 'accent'],
  ],
};

export const designIds = Object.keys(reliefParts);
export const baseFront = .07;
export const outerFront = .1;

export function doorFrameParts(id, front = baseFront) {
  const solid = (entries, back, front) => entries.map(([name, min, max, material]) => ({
    name,
    min: [...min, back],
    max: [...max, front],
    color: materials[material],
    roughness: .78,
  }));
  return [...solid(baseParts, 0, front), ...solid(reliefParts[id], front, outerFront)];
}
