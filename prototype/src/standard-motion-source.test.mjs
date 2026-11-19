import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {loadStandardMotionLibrary} from './motion-source.js';

test('concurrent actors share a checked UAL transfer and own separate parsed rigs', async t => {
  const bytes = await readFile(new URL('../public/assets/motion/UAL1_Standard.glb', import.meta.url));
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(url);
    return new Response(bytes);
  });
  const [first, second] = await Promise.all([loadStandardMotionLibrary(), loadStandardMotionLibrary()]);
  assert.deepEqual(urls, ['/assets/motion/UAL1_Standard.glb']);
  assert.notEqual(first.scene.getObjectByName('pelvis'), second.scene.getObjectByName('pelvis'));
  assert.equal(first.animations.length, 43);
  const walk = first.animations.find(clip => clip.name === 'Walk_Loop');
  assert(walk.duration > 0 && walk.tracks.length > 0);
  assert.notEqual(walk, second.animations.find(clip => clip.name === walk.name));
});

test('failed and changed UAL bytes reject every waiter and allow a later full retry', async t => {
  const bytes = await readFile(new URL('../public/assets/motion/UAL1_Standard.glb', import.meta.url));
  const damaged = Buffer.from(bytes);
  damaged[damaged.length - 1] ^= 1;
  const replies = [() => new Response(null, {status:503}), () => new Response(damaged), () => new Response(bytes)];
  const mock = t.mock.method(globalThis, 'fetch', () => replies.shift()());
  for (const reason of [/HTTP 503/, /identity mismatch/]) {
    const rejected = await Promise.allSettled([loadStandardMotionLibrary(), loadStandardMotionLibrary()]);
    for (const result of rejected) {
      assert.equal(result.status, 'rejected');
      assert.match(result.reason.message, reason);
    }
  }
  const recovered = await loadStandardMotionLibrary();
  assert(recovered.animations.some(clip => clip.name === 'Sitting_Idle_Loop'));
  assert.equal(mock.mock.callCount(), 3);
});
