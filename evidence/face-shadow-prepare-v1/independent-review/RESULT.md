# Shadow preparation: bounded independent review

Reviewed host SHA `622e4ffbd0112328f059fcd6099b40aa99470200c8c19a2c14a2a8c9eb6c7140` and helper SHA `6132cc6ca3fb049dc40a2226727648260d098b7275f006df72938471419a6fc3`. Product was not changed; no browser/GPU or broad matrix was run by this reviewer.

## Concrete lifecycle finding

`context-settle-witness-aftercheck.mjs` reuses the actual host/helper with the existing mocked renderer. A context-lost event injected between the async tail check and the success `.then` clears the entry map while entries are pending. The success handler then checks only `disposed/current(material)`, so it fulfills without releasing these now-unowned entries. Actual result:4 cloned materials,0 released; later `warm.dispose()` still leaves0 released. See `context-aftercheck/witness.json` and its exact source snapshots. The earlier two-microtask injection occurs before the tail check and correctly rejects/releases4/4; that result remains separately preserved in `context-settle/`.

This is an intentionally scheduled CPU/EventTarget fault injection, not a reproduced naturally occurring browser context-loss race. Native browser context-loss events normally arrive as tasks; the microtask timing is narrower than that. It still demonstrates an unguarded host success-settlement invariant. A minimal success-handler signal/ownership check can reject and release the stale batch without touching programs, thresholds or actor behavior. Root/prototype were notified before integration.

## Other checked boundaries

- Actual shadow material is cloned inside `onBeforeShadow`, before Three reuses/mutates it. Render target/cube/mip are restored synchronously in `finally`, before waiting for compilation. Main-color first-use remains untouched.
- Shared subscribers preserve/restore the original hook once the final listener leaves. Context loss/restore abort the lifetime; pending waits reject through the abort listener, failed batches release only their own materials, settled stable variants remain until deliberate invalidation/eviction/disposal.
- Current helper uses elapsed **visible rAF time**, resets its clock on visibility changes and does not spend the two-second budget while `document.hidden`. There is no unconditional two-second wall timeout in this reviewed version. A hidden request can remain pending until visible capture or cancellation; existing12 CPU cases cover simulated hidden/resume/dispose but not real browser background scheduling.
- Completion after any captured eligible mesh proves at least one actual pass, not that every eligible part/light necessarily rendered. Non-casting, hidden, culled or newly changed light configurations can require an unprepared variant later. This is a warm-cache completeness limitation, not proof of wrong final rendering. Current tests/measurements must not be generalized to arbitrary lighting or camera configurations.
- The helper explicitly supports MeshDepthMaterial and rejects a different pass, missing render target, missing program map, released program or diagnostics.runnable=false. It uses Three internals (`renderer.properties`/program wrappers), so the stated Three0.187 pin matters. No diagnostic disable or offscreen draw is used.

## Observed benefit and cost, not overall acceptance

The supplied headed forward/reverse measurements preserve main-program identity and eliminate newly linked/logged depth programs in the eventual draw. Peak rAF ranges decrease from127.5–133.5ms to90.9–103.2ms; render maxima from122.9–131.3ms to86.8–99.1ms. This is a repeated directional result across the two orders, not just one favorable sample. An extra side-dependent depth variant remains retained.

The tradeoff is substantial: set completion increases from119.6–159.7ms to230.4–250ms. Main-color infoLog remains74.7–85.3ms in candidate runs. Input dispatch does not improve uniformly: reverse male candidate59.7ms versus reverse baseline15.5ms. It would be incorrect to say all responsiveness improved or total operation latency decreased.

These scripts launch `headless:false`, unlike the earlier headless baseline. They do not record/assert document visibility/focus, and neither rAF nor automation input roundtrip measures actual screen presentation/input-to-photon. No recorded visible playback or ordinary-PC acceptance follows from this timing-only evidence. Current helper's visible-budget revision also has a distinct hash from the earlier timing candidate; reuse of cost claims must retain the recorded candidate identity.
