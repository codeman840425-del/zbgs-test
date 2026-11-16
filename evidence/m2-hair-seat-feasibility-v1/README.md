# Seated ponytail mechanism diagnosis

This review uses source commit `3934f9e1bde3bf6c1b07f2cf848489108fd5a21b`, fixed build `e9bd472be0f8`, original female body `027bed60…` and exact rootjoin-v2 hair `1b785f9d…`. The source author reviewed the root runtime implementation independently and personally inspected `evidence/m2-long-hair-review-e9b-v1/sheet-03.jpg`. The upward tail is visible in its 21.5s video sample. Video time and page `performance.now()` have different origins. The causal comparisons below use timestamps within each captured trace.

| Actual room trace | Tail tip relative to Pony1 | Cumulative room collisions | Unresolved room collisions |
|---|---:|---:|---:|
| 21200.1ms, sit mode begins | -230.2mm | 0 | 0 |
| 22025.1ms, tail rising | +53.6mm | 0 | 0 |
| 22128.3ms, highest tip | +252.4mm | 0 | 0 |
| 22644.0ms, tail descending | -170.9mm | 0 | 0 |
| 22747.0ms, first chairBack corrections | -236.8mm | 9 | 0 |

The twelve environment collider objects stay installed and reset count remains 2 during this interval. `RoomBoxShape.calculateCollision` increments its cumulative counter before selecting any face. Its source retains those counters across reset. This observed upward episode precedes chair projection, including infeasible projection and selected-face jumping. The separate contact run records peak tip offsets +245.7mm for pants and +254.0mm for the moved/rotated-chair skirt without new environment collision increments at those peaks. The pants peak has zero cumulative collisions. The moved-chair phase retains 265 earlier calls, with its cumulative count constant during the ascent.

The trace includes auxiliary local rotations and world child positions. `probe.py` rebuilds the six child points in raw-head local space from the exact GLB rest transforms, then solves their rigid transform to world. Its maximum fit residual over both e9b captures is `1.2405e-10m`. The second singular value throughout the flip stays above `0.0001495`, avoiding a collinear fit. As a separate check, the three historical508 captures directly include HairAnchor world matrices. Reconstructed matrices agree with that captured ground truth within `6.53e-15` per element.

The recovered raw-head origin descends from Y1.38765m to Y1.08709m during the zero-chair-collision interval, a 300.56mm drop. Its forward pitch reaches approximately -0.756 radians, or 43.3 degrees down. At the tail's highest recorded point, the head is still descending at about 0.196m/s measured over the preceding 103ms. This establishes a substantial animated head trajectory during the flip. These sampled derivatives do not reveal the largest individual frame impulse.

The installed official 3.5.5 joint integrates current/previous tails in its configured center, transforms to world, adds stiffness and gravity, enforces bone length, then visits body sphere/capsule colliders followed by the room colliders. Each correction is followed by another fixed-length normalization. The resulting tail is stored as history and used to rotate the bone. The app sets the center to `vrm.scene`. Raw head and hips motion relative to that scene continues to affect the spring. The recorded head trajectory and the free tail rise are consistent with this mechanism. Existing traces contain no body-shape query/correction history, so the relative contribution of inertia and body proxy impulses remains unresolved.

Historical508 seated bones/OBBs establish a separate static contact constraint. All six sampled chairBack pivots have an available separating half-space. Pony4 and Pony5 have only the top face available, with pivot gaps about 41.7mm and 3.8mm and a fixed-length plane-circle solution. This is a settled geometry reference from the earlier point/sphere implementation. It supplies no transition replay and does not identify the e9b upward cause.

`tested-hair-spring.js` retains exact root source bytes. The app and installed official module also match the fixed-v4 worktree byte for byte, recorded with all source data/image/resource hashes in `input-identities.json`. `selected-series.jsonl` retains the compact calculated seated sequences. No game module, source geometry or physics parameter was changed.

```powershell
python -B evidence/m2-hair-seat-feasibility-v1/probe.py --input-root F:/gamemake
node evidence/m2-hair-seat-feasibility-v1/qa-capture.mjs --modules-root F:/gamemake/prototype/node_modules
```

The minimum next real observation is one unchanged original-chair seat transition, from 350ms before sit mode through 2.8s afterward. `capture-existing.cjs` attaches to an existing caller-owned page, observes the exact three scene-owned official body shapes and twelve per-joint room shapes, and wraps the existing appearance update. Each query records the actual input tail, radius, signed distance, returned direction, collider/pivot matrices and order. Each update records dt, raw head/chest/center matrices, sit progress and post-update auxiliary tails/rotations. The last two pre-event history samples and exact fit/GLB identity permit a replay comparison. Negative body queries before the rise would identify actual body correction impulses. Zero body and room corrections during onset would isolate the animated-reference/history contribution for the following bounded configuration decision. A reference-frame change remains pending that evidence.

An existing Playwright page can call the exported helper without navigation or browser creation.

```javascript
const {capture} = require('./evidence/m2-hair-seat-feasibility-v1/capture-existing.cjs');
await capture(page, {build: 'e9bd472be0f8', out: freshOutputDirectory, triggerSit: true});
```

The CLI requires an existing CDP-enabled browser and exactly one matching page. Replace the endpoint, page prefix and build with the actual fixed candidate. `--trigger-sit` requests its ordinary sit action. The browser remains open after the client exits.

```powershell
node evidence/m2-hair-seat-feasibility-v1/capture-existing.cjs --cdp=http://127.0.0.1:9222 --url=http://127.0.0.1:FIXED_PORT/ --build=e9bd472be0f8 --out=evidence/FRESH_SEAT_CAPTURE --modules=F:/gamemake/prototype/node_modules --trigger-sit
```

All function wrappers restore exact original descriptors in `finally`, including after capture timeout. The CPU fixture exercises real installed sphere/capsule queries and proves return values, `this`, input points and target vectors retain their original behavior. It also checks original-update exceptions and failed preflight cleanup. Real page attachment and execution remain untested in this author task. An interrupted browser connection can prevent restoration and is reported explicitly. Query recording adds allocation and CPU overhead, so the resulting run cannot qualify performance. It changes no source radius, gravity, reference frame, playback speed or controller implementation. Dynamic and visual acceptance remain open.
