import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [working, sealed, scope] = process.argv.slice(2);
const source = path.join(sealed, 'source');
const filename = name => path.join(working, 'prototype', name);
const load = name => import(pathToFileURL(filename(name)).href);
const read = async name => JSON.parse(await fs.readFile(path.join(sealed, name), 'utf8'));
const {runtimeInputs} = await read('transfer-manifest.json');
const [catalog, templates] = await Promise.all([runtimeInputs.catalog, runtimeInputs.templates].map(name => read('source/prototype/' + name)));
const persistence = 'src/company/persistence.js';
assert((await fs.readFile(filename(persistence))).equals(await fs.readFile(path.join(source, 'prototype', persistence))));
const {decodeCompanySave} = await load(persistence);
const document = await decodeCompanySave(await fs.readFile(path.join(sealed, scope, 'save.json'), 'utf8'), catalog, templates);
assert.deepEqual(document, await read(scope + '/layout.json'));
const checker = 'scripts/company-platform/check-singing-room.mjs';
// The writable copy supplies the locked Three.js installation. All authored data and GLB bytes come from the sealed package.
assert((await fs.readFile(path.join(working, checker))).equals(await fs.readFile(path.join(source, checker))));
const {checkSingingRooms} = await import(pathToFileURL(path.join(working, checker)).href);
const rooms = await checkSingingRooms(document, {catalog, templates, root: source});
console.log(JSON.stringify({room: document.id, revision: document.revision, rooms}, null, 2));
