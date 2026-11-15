# Selective face preparation: measured partial improvement

Development RTX4090, Chrome157,1600x1000,paused, fresh process/profile per body, no video/profiler; driver cache not cleared. Light timing wrappers. Adjacent A-B-A comparison. Not ordinary-PC acceptance, gameplay FPS or a full performance pass.

| Body | Old first long frame A1/A2 (ms) | New first long frame (ms) | Morph upload old → new (MB decimal) | Geometry clones old → new |
|---|---:|---:|---:|---:|
| female | 357.9 / 327.5 | 103.1 | 33.14 → 7.37 | 9 → 2 |
| male | 345.8 / 315.4 | 103.0 | 31.97 → 7.11 | 9 → 2 |
| m2-male-jaw-v1 | 327.5 / 327.5 | 97.0 | 31.97 → 7.11 | 9 → 2 |

The old build retains its larger first-use stall when measured again after the candidate; fewer actual affected primitives reduce duplicate morph uploads and first-use program work. All shader diagnostic checks remained enabled. Each raw report retains command time, render time, GL calls, frame quantiles and long-frame counts.

Limits: the candidate still has 97–103 ms first mouth frames; first additional eye domain has 66.7–72.8 ms frames. First-use getProgramInfoLog remains synchronous; the body-switch stall was not optimized or remeasured here. CPU equivalence and browser appearance regression are separate evidence. No new full performance pass is declared.

The candidate does not alter source mesh, expression, body controller, frozen skirt or dance. See ../facial-primitive-scope-v1 for strict rendered-index equivalence and failure/version lifecycle checks.
