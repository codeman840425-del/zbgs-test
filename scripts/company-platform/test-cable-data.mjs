import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateCableResource, deriveCableConnections, CABLE_CONNECTION } from '../../prototype/src/company/cable-data.js';

const root = process.cwd();
const ids = ['single-sleeve', 'dual-sleeve', 'braided-loop', 'flat-ribbon'];
const loadJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const routeResources = await Promise.all(ids.map(id => loadJson(path.join(root, 'prototype/public/company-assets/cable-route-v1', id, 'v1/resource.json'))));
const deviceResources = await Promise.all(['keyboard-compact-usb', 'monitor-aurora-usb'].map(id => loadJson(path.join(root, 'prototype/public/company-assets/cable-devices-v1', id, 'v1/resource.json'))));
const keyboard = deviceResources[0], monitor = deviceResources[1], route = routeResources[0];
const deskResource = { id: 'desk-test', version: 1, mountRole: 'desk', surface: { topY: 0, halfSize: [1, 1] } };
const node = (id, resource, parentId, position = [0, 0, 0], yaw = 0, extra = {}) => ({ id, kind: 'facility', parentId, resource: { id: resource.id, version: resource.version }, transform: { position, yaw }, state: {}, ...extra });
const base = () => {
  const deskR = structuredClone(deskResource), monitorR = structuredClone(monitor), keyboardR = structuredClone(keyboard), routeR = structuredClone(route);
  const desk = node('desk', deskR, 'room');
  const screen = node('screen', monitorR, 'desk', [0, 0, 0]);
  const keys = node('keys', keyboardR, 'desk', [0, 0, 0.5]);
  const cable = node('cable', routeR, 'desk', [0, 0, 0], 0, { state: { connected: true }, cableLink: { a: { deviceId: 'screen', portId: 'usb' }, b: { deviceId: 'keys', portId: 'usb' } } });
  return { nodes: [desk, screen, keys, cable], facilities: [
    { id: 'desk', node: desk, resource: deskR, floorId: 'floor' },
    { id: 'screen', node: screen, resource: monitorR, floorId: 'floor' },
    { id: 'keys', node: keys, resource: keyboardR, floorId: 'floor' },
    { id: 'cable', node: cable, resource: routeR, state: cable.state, floorId: 'floor' },
  ] };
};
const invoke = input => deriveCableConnections(input, (code, id, message, details) => { throw Object.assign(new Error(message), { code, id, details }); });
const expectFailure = (name, change, expected) => {
  const input = base(); change(input); const before = structuredClone(input);
  let error; try { invoke(input); } catch (caught) { error = caught; }
  assert(error, `${name} unexpectedly passed`); assert(expected.includes(error.code), `${name} expected ${expected}, got ${error.code}`);
  assert.deepEqual(input, before, `${name} mutated the input after rejection`); return { name, code: error.code };
};

const checks = [];
for (const resource of routeResources) { validateCableResource(resource, (code, id, message) => { throw new Error(`${code}:${id}:${message}`); }); checks.push({ name: `${resource.displayName} contract`, passed: true, id: resource.id }); }
assert.deepEqual(CABLE_CONNECTION, { profile: 'desk-collinear-v1', connector: 'usb-c-visual-v1', spanRange: [.14, .7], unplugDistance: .025 });
const connected = invoke(base()), routeResult = connected.get('cable');
assert(routeResult.span > .14 && routeResult.span < .7); assert.equal(routeResult.connected, true); assert.equal(routeResult.length, routeResult.span); checks.push({ name: 'Connected cable resolves two compatible facing ports', passed: true, span: routeResult.span });
const disconnectedInput = base(); disconnectedInput.facilities[3].node.state.connected = false; disconnectedInput.facilities[3].state.connected = false; const disconnected = invoke(disconnectedInput).get('cable'); assert.equal(disconnected.length, disconnected.span - .025); checks.push({ name: 'Disconnected B keeps the reserved endpoint and shortens the visual route', passed: true, length: disconnected.length });
checks.push(expectFailure('Missing endpoint', input => { input.facilities[2].id = 'removed'; input.facilities[2].node.id = 'removed'; }, ['missing-cable-endpoint']));
checks.push(expectFailure('Port conflict', input => { const extra = structuredClone(input.facilities[3]); extra.id = 'cable-2'; extra.node.id = 'cable-2'; input.facilities.push(extra); }, ['cable-port-in-use']));
checks.push(expectFailure('Wrong endpoint orientation', input => { input.facilities[2].node.transform.yaw = Math.PI; }, ['unsupported-cable-route']));
checks.push(expectFailure('Span below runtime minimum', input => { input.facilities[2].node.transform.position[2] = .3; }, ['unsupported-cable-route']));
checks.push(expectFailure('Endpoint outside desk corridor', input => { input.facilities[1].node.transform.position[0] = 1.1; input.facilities[2].node.transform.position[0] = 1.1; }, ['cable-outside-desk']));
checks.push(expectFailure('Moving parent desk is rejected', input => { input.facilities[0].resource.movingParts = true; }, ['invalid-cable-parent']));
const rotated = base(); rotated.facilities[1].node.transform = { position: [0, 0, 0], yaw: Math.PI / 2 }; rotated.facilities[2].node.transform = { position: [.5, 0, 0], yaw: Math.PI / 2 }; const rotatedRoute = invoke(rotated).get('cable'); assert(rotatedRoute.span > .14 && rotatedRoute.span < .7); checks.push({ name: 'Quarter-turned desk port pair derives a valid same-axis route', passed: true, span: rotatedRoute.span });
const movedDesk = base(); movedDesk.nodes[0].transform = { position: [1, 0, 2], yaw: Math.PI / 2 }; movedDesk.facilities[0].node.transform = movedDesk.nodes[0].transform; const movedRoute = invoke(movedDesk).get('cable'); assert.equal(movedRoute.span, routeResult.span); checks.push({ name: 'Whole-desk translation/rotation leaves parent-local cable span stable', passed: true, span: movedRoute.span });
const remapped = base(), remappedScreen = structuredClone(remapped.facilities[1]), remappedKeys = structuredClone(remapped.facilities[2]), remappedCable = structuredClone(remapped.facilities[3]); remappedScreen.id = remappedScreen.node.id = 'screen-copy'; remappedScreen.node.transform.position = [0, 0, .5]; remappedKeys.id = remappedKeys.node.id = 'keys-copy'; remappedKeys.node.transform.position = [0, 0, 1]; remappedCable.id = remappedCable.node.id = 'cable-copy'; remappedCable.node.cableLink = { a: { deviceId: 'screen-copy', portId: 'usb' }, b: { deviceId: 'keys-copy', portId: 'usb' } }; remapped.facilities.push(remappedScreen, remappedKeys, remappedCable); assert(invoke(remapped).has('cable-copy')); checks.push({ name: 'Copied desk devices with remapped endpoint IDs derive an independent cable', passed: true });
const original = base(), copied = structuredClone(original), cableCopy = structuredClone(copied.facilities[3]); cableCopy.id = 'cable-copy'; cableCopy.node.id = 'cable-copy'; copied.facilities.push(cableCopy); let copyError; try { invoke(copied); } catch (error) { copyError = error; } assert(copyError?.code === 'cable-port-in-use'); assert.deepEqual(original.facilities[3].node.cableLink, { a: { deviceId: 'screen', portId: 'usb' }, b: { deviceId: 'keys', portId: 'usb' } }); checks.push({ name: 'Copy with unremapped endpoint IDs is rejected and original link stays intact', passed: true, code: copyError.code });

const report = { status: 'passed', profile: 'company-cable-data-v1', checks, limits: ['CPU contract only. No server leases, electrical semantics, flexible physics, browser runtime or arbitrary curved routes.'] };
const output = path.join(root, 'evidence/company-cable-data-v1'); await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({ status: report.status, checks: checks.length, report: 'evidence/company-cable-data-v1/report.json' }, null, 2));
