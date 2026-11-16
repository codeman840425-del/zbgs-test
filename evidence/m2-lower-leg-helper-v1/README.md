# Geometry helper ground and identity fix

`loadGeometryAvatar(bodyType)` now passes the loaded avatar's actual SHA and actor-root world ground Y into the existing retarget loader. Its one-argument signature and `{avatar,motions,scene}` result stay compatible. Failed setup releases the prepared avatar.

The initial actual helper invocation failed at the foundation warmup's missing renderer interface before reaching retarget. `baseline.json` preserves that failure and the old helper SHA. The same helper now supplies the minimal CPU renderer interface and location shim needed by the current foundation code. Its compileAsync throws if a test requests GPU compilation. Texture decoding continues to use the established 1×1 fixture.

```powershell
node --loader ./evidence/m2-lower-leg-helper-v1/json-loader.mjs evidence/m2-lower-leg-helper-v1/qa.mjs
```

The regression calls the actual one-argument helper for original male and the +20 mm lower-leg body. Both returned motions match an independent explicit invocation with the same actual avatar SHA and actor-root ground, including every track value and exact-body dance availability. The original male ratio is `1.099875624630069`, the derivative ratio is `1.1210927911518558`. After 100 VRM updates, raw/normalized hips agree and model offsets stay at `0` and `0.01944977603852749` m respectively. Actual shoe minima remain about `0.000494728272` and `0.000000000612` m.

Passing the identity enables the original male's two existing normalized dance variants. The new body's output correctly reports those exact-fit variants unavailable. No dance resource, runtime module or source asset changes in this repair. The test loads clips and compares their data without playing a dance or rendering a frame.

The JSON loader only bridges the browser source's bare JSON imports for Node. No GPU, browser, continuous foot-contact or visual approval is included. The lower-leg origin review retains the earlier measured omitted-floor fallback result separately. Repeating `--baseline` is intended only on the preserved pre-fix helper, because it asserts that old prerequisite failure.
