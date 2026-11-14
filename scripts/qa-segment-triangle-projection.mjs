import assert from 'node:assert/strict';
import { projectedSegmentInterval as clip } from '../prototype/src/segment-triangle-projection.js';
// This narrow triangle lies between the old 0, .2, .4 ... segment probes.
const narrow = [.09, -.01, .11, -.01, .1, .01];
const interval = clip(0, 0, 1, 0, narrow);
assert.ok(interval && interval.lo > .09 && interval.hi < .11);
assert.equal(clip(0, .2, 1, .2, narrow), null);
assert.equal(clip(0, 0, 1, 0, [0,0, 1,0, 2,0]), null);
const reverse = clip(1, 0, 0, 0, narrow);
assert.ok(Math.abs(reverse.lo - (1 - interval.hi)) < 1e-10);
assert.ok(Math.abs(reverse.hi - (1 - interval.lo)) < 1e-10);
const inside = clip(.1, 0, .1, .001, narrow);
assert.deepEqual([inside.lo, inside.hi], [0,1]);
console.log('Whole-rail clipping: narrow missed edge, separated/degenerate cases, reversal and inside cases passed.');
