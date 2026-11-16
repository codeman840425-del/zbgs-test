# Independent read-only review

The stored evidence supports a **partial shadow-depth first-use cost**, not an exclusive root cause or a display-frame improvement claim. No browser/GPU run or product change was performed for this review. `analyze.py` recomputes the figures from the original records and preserves their hashes in `analysis.json`.

## What is controlled and corroborated

All four runs loaded the same two JavaScript asset hashes and the expected runtime build. Each condition used a new Chrome process/profile, the same viewport, diagnostics enabled, original body, initial mouth zero and one actual +12% UI edit. Female on→frozen and male frozen→on partially counter execution order. This is one sample per condition, not repeated within-body counterbalancing; driver/OS cache was explicitly not cleared, and idle pose/time was not locked.

The intervention leaves `shadowMap.enabled` and shadow type unchanged while setting `autoUpdate=false, needsUpdate=false`. Installed Three `WebGLShadowMap.js:95` exits on exactly that combination. Frozen traces contain no shadow draw-pass GL records. The two main-program cache keys are equal between on/frozen conditions for each body. Thus this is materially better controlled than disabling shadow shader defines, but it deliberately renders stale shadows and is diagnostic only.

The same actual WebGLProgram object obtains the weak-map `glID` at `linkProgram`, `getProgramInfoLog`, and the final Three program snapshot. Every observed info-log call has a matching link and final program identity, and lies inside the peak render call. The depth call is tagged both by actual MeshDepthMaterial draw context and matching final program type; it is not inferred merely from ordering. Main calls identify FaceMouth and Face_SKIN Outline. Per-run IDs are not globally comparable; cross-condition shader configuration was compared by cache key instead.

## Exact cost scope

| Condition | Peak render CPU return | Enclosed shadow render | Depth infoLog | Main infoLogs |
|---|---:|---:|---:|---:|
| Female on | 121.4 ms | 38.1 ms | 27.3 ms | 80.3 ms |
| Female frozen | 62.0 ms | 0.0 ms | 0.0 ms | 52.7 ms |
| Male frozen | 69.0 ms | 0.0 ms | 0.0 ms | 57.1 ms |
| Male on | 106.0 ms | 34.1 ms | 25.7 ms | 69.6 ms |

Depth infoLog accounts for 22.5%/24.2% of the female/male peak render CPU call, or 25.4%/27.0% of the observed info-log total. Entire shadow render accounts for 31.4%/32.2% of that render call. These are nested measures: do not add depth infoLog, shadow render and total render together. They are not GPU-time percentages.

The female on/off render difference is 59.4 ms although the measured on shadow call is 38.1 ms. Main info-log times also change (80.3→52.7 ms); male changes 69.6→57.1 ms. Consequently subtraction of total peaks cannot assign the whole difference to depth. Residual outline calls alone are 52.3/56.8 ms in the frozen cases. There is no basis for claiming shadow is the only or majority blocking source. `linkProgram` returning in 0–0.1 ms does not imply zero compilation work: installed Three invokes diagnostics on first uniform/attribute use (`WebGLProgram.js:822,921,936`) and readiness separately. The wrapped call measures CPU/driver waiting until return, not independent shader compiler work or GPU completion.

## Script/statistics limitations

No blocking identity/attribution defect was found for these recorded calls. However, rAF rows are labeled when their callback runs, and the first interval after a label change can span the preceding phase. `first-mouth` lasts through 1.8 seconds after completion, so its maxima/percentiles describe that window, not an exactly isolated presentation of the first edited frame. Set/compile wall times overlap render intervals; they must not be summed as exclusive CPU work. `inCompile` covers only the synchronous invocation, not the entire returned promise lifetime. The script records durations but not info-log strings/link status; zero page errors alone does not independently prove all shader diagnostics were empty.

**Headless Chrome is explicit in all three reviewed scripts.** rAF is a callback timestamp interval, not actual monitor scanout or proof that a user saw a frame. No screenshot/video was taken in these cost runs. Browser scheduling, driver state and instrumentation remain relevant. A headed actual-UI measurement is needed before a claim about visible responsiveness; these data do not establish ordinary-PC performance.

The archived `visible-face-ui-cost-ab074/executed-script.cjs` and `visible-face-ui-cost-a7efd/executed-script.cjs` are byte-identical SHA256 `115894f50c860fb79d771c5e7957a1481729cd384bf1c1300c7c0fc9b7264592`, and both launch `headless:true`. Their names mean visible-appearance controls, not a visible Chrome window. Historical numbers and scripts were not modified.
