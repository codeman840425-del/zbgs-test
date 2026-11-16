# Actual UI movement comparison — ab0743684fe6

A native 1600x1000 headless Chrome recording uses the same script, input order and relative canvas click coordinates as the preserved bcade comparison. No debug movement commands, diagnostic geometry probes or performance wrappers drive the scene. Loading/request timing may differ, so this is not frame-locked animation comparison.

Sequence: near-view floor click; room camera entry; real floor destination; run speed selection plus horizontal route; pause and room route selection; resume; stop. Final state is idle, unpaused, target null, actual speed zero. Zero page errors. The final trace contains 2276 samples; one first sample has negative relative rAF time and is retained but excluded from the recording-window statistics. In the valid window max interval is 18.3 ms, with zero >50 ms. This is only the recorded development-machine window, not an ordinary-PC performance result. Paused time is deliberately excluded from simulation advancement, so total sim/wall ratio is not a playback-speed verdict.

The complete original movies and raw traces remain unchanged. index.html offers each original at 1x with fullscreen controls. The new movie has now been sequentially decoded at 2 fps with one decoder/filter thread. All 34 sampled images across five sheets were personally opened and reviewed. See REVIEW.md and review-2fps/state-review.json. This is full-duration sampled engineering review, not uninterrupted 1x human naturalness acceptance.

Fixed source 2084c43 / build ab0743684fe6. Test browser and temporary server closed before root's subsequent recording window. No product edits or publication performed by this QA task.
