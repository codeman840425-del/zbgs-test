# Raw-head reference candidate v3

This single source/configuration candidate uses style ID `female-ponytail-headref-v3`, fit ID `female-ponytail-headref-v3-fit`, resource version3 and source style family `female-ponytail-v1`. It retains the exact original female body `027bed60…` and rootjoin GLB `1b785f9d…`,744864 bytes. The asset URL stays `/assets/m2-long-hair-rootjoin-v2/female-ponytail.glb`. The new fit uses `/assets/m2-long-hair-raw-head-reference-v3/fit.json`. No new geometry or texture export is involved.

The only physical configuration addition is `dynamics.simulationReference="raw-head"`. All joint names, lengths, inverse binds, gravity, stiffness, drag, radii and body/room collision implementation retain their source values. `source-spec.json` pins the old fit/manifest/asset and frozen26-entry package inventory. `raw-head-reference-v3.py` verifies them, computes the complete plan twice, preserves identical existing outputs and rejects differing targets before writing. A fresh `--out assets-source/m2-long-hair-v1/revisions/raw-head-reference-v3/exports/<name>` permits an independent config export.

The runtime resolves raw head through `vrm.humanoid.getRawBoneNode('head')`, validates the explicit enum and rejects a missing raw head before acquiring colliders. Omitted reference keeps the historical avatar-scene behavior, including its existing world fallback when `vrm.scene` is absent. The official solver stores tail history in the selected center frame, including translation and rotation. Gravity remains world-directed.

The hypothesis follows the actual seat trace. Its9378 body queries produced zero correction, and chair correction began after the rise peak. A raw-head frame excludes local rigid head movement from tail history, which may reduce that impulse. It may also remove desirable head-driven inertia during walking, turning or expressive head movement. Reduced upward motion alone cannot establish naturalness or acceptance.

```powershell
python -B scripts/m2-long-hair-v1/raw-head-reference-v3.py
node scripts/qa-hair-reference.mjs --modules-root F:/gamemake/prototype/node_modules
```

The CPU check loads the real original VRM and actual eight-bone ponytail with a1×1 texture decode fixture. With unchanged six spring joints and three body shapes, a common300mm head/chest translation gives a maximum raw-head local-quaternion component difference of `5.59e-15` against its stationary control. Omitted and explicit avatar-scene settings agree exactly. The legacy fixture responds to the same translation with a component difference about0.2896. This is a controlled covariance test. The previous two failed full captured-trajectory replays remain unaccepted in `evidence/m2-hair-seat-feasibility-v2`.

Additional CPU checks cover the exact new fit contract, rejection under old fit identity/current catalog, invalid references, missing-head preflight, inverse-cache refresh, independent actors, zero-delta freeze, toggle/reset and collider disposal. The official shared `inverseCacheProxy` remains on its center node after joint deletion. The adapter preserves that shared instrumentation for other official managers and the remaining VRM lifetime. It does not set each joint's center to null during cleanup.

The old style, fit and manifest retain their identities. Default catalog, public resources and workbench have no changes in this package. Root can append the distinct candidate in a private fixed build for side-by-side comparison. The existing hat is pinned to the old exact style/fit and has no automatic admission for this candidate. Derived bodies require their own reviewed fits. To roll back the experiment, select the historical item or remove the candidate catalog entry. The optional runtime field preserves the historical default.

`runtimeAccepted=false` remains explicit. Root owns actual no-hat walk/run/turn/seat/rise, pause/reset, saved-identity restoration and visual comparison before accepting this reference choice.
