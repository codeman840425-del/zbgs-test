# Real background return: aa6fc6159e2d

**Bounded real-tab checks passed.** This is new evidence from the current fixed public build, not an inherited result from the earlier 77 visibility attempt. No product code or fixed build was changed.

The test launched headed installed Chrome with an independent persistent profile and exactly two owned tabs. Playwright 1.58.2's permanent-focus override was disabled on the original driver session; background-throttling suppression arguments were removed. Initial `document.visibilityState === 'visible'` was required and actually observed before running cases. Switching to the same-context blank tab and back generated trusted native `visibilitychange` events. Neither the visibility property nor lifecycle events were fabricated. The brief extra hidden/visible pair before the walking case is the creation of that blank tab, retained in the trace.

| Actual case | Hidden wall seconds | Hidden simulation delta | Root / 6 raw bone origins / 25 skirt-point change while hidden | Return behavior |
| --- | ---: | ---: | --- | --- |
| Normal walking, skirt and dynamics on | 1.5129 | 0 | All zero | Resumes; walk task later completed |
| Seated, skirt and dynamics on | 1.5200 | 0 | All zero | Resumes without hidden-time catch-up |
| User-paused seated | 1.5066 | 0 | All zero | Remains paused; only explicit user resume advances |

For the walking and seated cases the first sampled render callback after return has simulation delta 0, motion substep dt 0, and zero root/bone-origin/sampled-skirt displacement relative to the visible event. Subsequent approximately 0.72 seconds of foreground time advance simulation approximately 0.72 seconds. The user-paused case remains completely unchanged. Its reported motion dt is the stale last simulated substep (0.0062), not evidence that a new paused step executed. The approximately 1.52-1.54 second rAF gaps span the actual hidden interval and are not classified as foreground performance stalls.

The active walk request completed normally, with no timeout or cancellation in this short interruption. This proves only the tested short background interval, not long suspension/deadline behavior. The garment is the existing pose-guided constrained skirt, not an inertial cloth simulation. Its metrics and sampled world vertices are recorded; this is not a full cloth collision or all-vertex continuity gate.

## Actual visual review and errors

The native page recording includes startup, real tab-hidden holds, returned walking, approach/sit, seated return, user pause and explicit resume. It records the application viewport, not the browser tab strip. Native trusted events in `report.json.gz` establish the tab visibility changes. Three returned screenshots and all 20 sequential 1 fps samples (three sheets) were inspected. The character remains present with attached clothes after each return; no gross return-pose explosion was seen. Sparse engineering image review cannot certify every motion frame or user naturalness, and known skirt shape limitations are not retested or corrected here.

There were **zero page errors**, and one console HTTP 404 resource message. The original console listener did not capture that message's URL, so its resource attribution is unverified; it is retained rather than silently classified as harmless. There was no corresponding identity/resource admission failure or failed task. No target-PC, CPU-throttling or performance conclusion is made.

## Recovery and artifacts

- `executed-script.cjs`: exact executed QA script; source entry is `scripts/qa-background-aa6.cjs`. A new output path is required on rerun.
- `report.json.gz`: full events, frame samples, identity receipts and checks, losslessly compressed from retained raw JSON.
- `summary.json`: per-case deltas and first four returned frame samples.
- `video/`: unchanged native Playwright recordings of application and blank tab.
- `index.html`: large application video, returned images and whole-time sheets.

The browser context was closed and no server was started. The isolated `chrome-profile/` is disposable test state and intentionally excluded from Git and the evidence manifest; it is not needed for replay. All checks used the existing full fixed build and exact original female avatar hash. No other browser was controlled.
