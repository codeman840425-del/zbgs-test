import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

// Reproduction is pinned to the clean company C2 checkout. It must not import
// the currently changing company-platform-c1 tree.
const fixedCompanyRoot = 'F:/gamemake-company-c2-fixed';
const fixedCharacterRoot = 'F:/gamemake';
const load = file => import(pathToFileURL(path.resolve(file)).href);
const THREE = await load(`${fixedCompanyRoot}/prototype/node_modules/three/build/three.module.js`);
const document = JSON.parse(await fs.readFile(`${fixedCompanyRoot}/prototype/src/company/examples/c1-two-stations.json`, 'utf8'));
const {createCompanyScene} = await load(`${fixedCompanyRoot}/prototype/src/company/render.js`);

const output = process.argv[2];
if (!output) throw new Error('Usage: node evidence/company-c3-contact-audit-v1/reproduce.mjs NEW_OUTPUT_DIR');
await fs.mkdir(output, {recursive:false});
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const companyCommit = execFileSync('git', ['-C', fixedCompanyRoot, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
const expectedCompanyCommit = 'aff9dd8b3eeca02ecbb3e110f0b572a294a3e193';
assert.equal(companyCommit, expectedCompanyCommit, 'fixed company checkout moved from aff9dd8b');
const characterCommit = '23c1140a01d26b6f1c10ac4f8064f366add3ba17';
const characterSeatLeaseSource = execFileSync('git', ['-C', fixedCharacterRoot, 'show', `${characterCommit}:prototype/src/seat-lease.js`], {encoding:'utf8'});
const characterMainSource = execFileSync('git', ['-C', fixedCharacterRoot, 'show', `${characterCommit}:prototype/src/main.js`], {encoding:'utf8'});
const {createSeatLeases} = await import(`data:text/javascript,${encodeURIComponent(characterSeatLeaseSource)}`);

const world = new THREE.Scene();
const scene = createCompanyScene(world, document);
const pointId = 'station-1/chair#seat';
const point = scene.resolveUsePoint(pointId);
assert(point?.chairSeat?.isMesh, 'fixture must expose a real seat mesh');
const oldChair = point.chair;
const oldSeat = point.chairSeat;
const connectedToWorld = object => { for (let cursor = object; cursor; cursor = cursor.parent) if (cursor === world) return true; return false; };

scene.setView({mode:'building'});
assert.equal(scene.listUsePoints().length, 0, 'building view has no live visible use points');
assert.equal(scene.resolveUsePoint(pointId), null, 'building view cannot resolve old visible use point');
assert.equal(connectedToWorld(oldChair), false, 'old contact object is detached from world on building view');
const buildingNavigation = scene.navigation(document.nodes.find(n => n.kind === 'floor').id);
assert(buildingNavigation.obstacles.some(o => o.kind === 'seat' && o.object === null), 'navigation keeps logical seat obstacle with no mesh object');

scene.setView({mode:'floor', floorId:document.nodes.find(n => n.kind === 'floor').id});
const fresh = scene.resolveUsePoint(pointId);
assert(fresh?.chairSeat?.isMesh);
assert.notEqual(fresh.chairSeat, oldSeat, 'returning to floor creates a new contact mesh identity');

const leases = createSeatLeases();
const lease = leases.reserve({seatId:'room-chair-1', ownerId:'actor-a', requestId:'sit-1'});
assert.equal(lease.accepted, true);
assert.equal(leases.reserve({seatId:'company/floor-1/room-1/station-1/chair#seat', ownerId:'actor-b', requestId:'sit-2'}).accepted, true);

assert.match(characterMainSource, /seatLeases\.reserve\(\{ seatId: "room-chair-1", ownerId: this\.actorId/);
await fs.writeFile(path.join(output, 'reproduction.json'), JSON.stringify({
  status:'passed',
  checks:[
    'building view releases visible contact meshes and current.points',
    'navigation retains a logical seat obstacle with object:null while offscreen',
    'returning to floor creates new mesh identity',
    'seat lease module accepts both hardcoded legacy and company use-point IDs',
    'role controller source hardcodes room-chair-1',
  ],
  fixture:{documentId:document.id, pointId, oldSeatDetached:!connectedToWorld(oldChair), freshSeatIdentityChanged:fresh.chairSeat!==oldSeat},
  sourceCommits:{company:companyCommit,character:characterCommit},
  sourceSha256:{companyRender:sha256(await fs.readFile(`${fixedCompanyRoot}/prototype/src/company/render.js`)),characterMain:sha256(characterMainSource),characterSeatLease:sha256(characterSeatLeaseSource)},
}, null, 2)+'\n');
scene.dispose();
console.log('company C3 contact seam reproduction passed');
