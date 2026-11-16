# Full-duration sampled review — after ab0743684fe6

The original video was decoded sequentially at 2 fps, one decoder and one filter thread. All 34 samples in review-2fps/00.jpg through 04.jpg were personally opened. The complete viewport is retained; sheets use 800x500 per sample. No browser, new recording or product change was involved.

Observed movie timeline (nominal sample timestamps):

- 0–1.5 s: original startup/loading UI. Around 2–2.5 s: appearance workbench and face view are ready. This startup precedes the lightweight trace clock.
- 3–3.5 s: the near-view click has produced the visible red floor-miss message; face camera remains in place. It does not silently invent a destination.
- 4 s: room view is visible. At 4.5 s the ground target indicator appears; 5–7 s samples show the character changing world position toward it.
- 7.5–10.5 s: actions tab and running-speed/route controls are visible; the route target changes and the character traverses the room. The room framing and available controls remain intact.
- 11–12 s: the continuing pose is held while paused; a new route can be selected without advancing the character. At 12.5–14.5 s the character resumes changing position and pose, with resumed feedback rather than the old paused text.
- 15–16.5 s: stop feedback is visible and the character settles into standing; final trace has idle, speed zero and target null.

Trace corroboration uses its own post-ready clock, not the movie's loading-inclusive timestamps: miss feedback at 0.730 s, room guidance at 1.670 s, real walk at 2.392 s, changed-speed feedback at 5.462 s, route-start feedback at 5.990 s. Pause at 9.017 s, new route while paused at 9.654 s, explicit resumed feedback at 10.382 s, stop acknowledgement at 12.900 s. All 225 paused samples have exactly zero root displacement and zero simulation-time advancement. Complete status strings and source rows are retained in review-2fps/state-review.json.

This supports the causal UI sequence together with the native event log and actual state assertions. No new persistent visual collapse or stuck movement was observed in these sampled frames. The room character is small: this does not judge fine hand/foot contact, sub-0.5-second snaps, or continuous naturalness. Large camera movement at the deliberate face-to-room switch is expected, not an animation discontinuity diagnosis. The old and new movies share the exact executed script hash, but startup and asynchronous timings differ; their timestamps are not pose-locked. No ordinary-PC performance conclusion is made.
