import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [source, reviewedPath, nonexistent] = process.argv.slice(2);
const dist = path.join(source, 'prototype/dist');
const reviewed = JSON.parse(await readFile(reviewedPath, 'utf8'));
const pin = async relative => {
    const bytes = await readFile(path.join(dist, relative));
    const actual = {sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length};
    assert.deepEqual(actual, reviewed.files[relative]);
    return bytes;
};
const info = JSON.parse(await pin('build-info.json'));
assert.equal(info.sourceDigest, reviewed.sourceDigest);
const entry = Object.keys(reviewed.files).find(name => name.startsWith('assets/recordConsumer-'));
const sourceModule = Object.keys(reviewed.files).find(name => name.startsWith('assets/foundation-avatar-'));
const apiBundle = (await pin(entry)).toString('utf8');
await pin(sourceModule);
assert.ok(apiBundle.includes('f as Ye') && apiBundle.includes('Ye(n.bodyType)'));
assert.ok(apiBundle.includes(path.basename(sourceModule)));
const profileCatalog = JSON.parse(await readFile(path.join(source, 'prototype/src/source-outfit-profiles.json'), 'utf8'));
const factory = await import(pathToFileURL(path.join(dist, sourceModule)));
const controls = Object.keys(profileCatalog).filter(id => id.startsWith('rule-body-')).map(id => ({
    id, sha256: factory.f(id).sha256,
}));
assert.equal(controls.length, 2);
for (const {id, sha256} of controls) assert.equal(sha256, profileCatalog[id].sha256);
assert.equal(Object.hasOwn(profileCatalog, nonexistent), false);
const capture = async entry => {
    try {
        await entry();
        assert.fail('Unregistered body unexpectedly loaded');
    } catch (error) {
        assert.equal(error.message, 'Unknown foundation body type: ' + nonexistent);
        return {status: 'rejected', error: error.name, reason: error.message};
    }
};
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls++; throw Error('Unexpected resource request'); };
const exactSourceApi = await import(pathToFileURL(path.join(source, 'prototype/src/character-production.js')));
const request = {schema:'character-production-request-v1', operation:'query', bodyType:nonexistent};
const closure = {
    compiledSharedResolver: await capture(() => factory.f(nonexistent)),
    exactSourceProductionQuery: await capture(() => exactSourceApi.performCharacterProduction(request)),
};
assert.equal(fetchCalls, 0);
console.log(JSON.stringify({
    runtime: {sourceCommit: reviewed.sourceCommit, sourceDigest: info.sourceDigest, buildId: info.shortId},
    fixedInputsContainCompiledBodyCatalog: info.inputs.includes('src/source-outfit-profiles.json'),
    compiledEntry: entry, compiledProfileResolver: sourceModule, request, controls, closure, fetchCalls,
}));
