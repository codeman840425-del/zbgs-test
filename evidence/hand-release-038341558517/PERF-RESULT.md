# Adjacent fixed-build performance check

Windows / Chrome 157.0.8103.51 / RTX 4090 development environment; 1440x900, detail=false, no recording or throttle. Each case sampled 30 seconds, serialized with other GPU and heavy CPU tasks stopped. This is not an ordinary-PC measurement or a long-duration reliability test.

| Build | Case | Frame P95/P99/max ms | CPU update P95/max ms | Frames >33 ms |
|---|---|---|---|---|
| 7a86c24e34aa | skirt-run | 6.3/6.6/12.5 | 3.1/7.9 | 0 |
| 7a86c24e34aa | skirt-sit-hold | 10.1/11.5/18.0 | 9.9/17.5 | 0 |
| 038341558517 | skirt-run | 6.2/6.7/17.7 | 4.4/17.2 | 0 |
| 038341558517 | skirt-sit-hold | 10.2/11.8/20.1 | 9.9/19.8 | 0 |

Running CPU P95 increased from 3.1 to 4.4 ms after applying hand clearance while moving. Sitting CPU P95 remained 9.9 ms. Frame pacing alone does not show the added CPU cost; no optimization claim is made.

The equipment update now occurs inside the hand surface callback. Therefore work moves into the motion timing span and the outer garment span approaches zero; that is not eliminated garment cost. Use total CPU update, not summed overlapping timers or the garment timer alone.

The run route includes acceleration, turns, stops and polling gaps; before/after moving frames were 3574/4968 and 3535/4946. Both cases have zero invalid-state and missing-instrumentation frames. Render counts match: run 138 calls/51078 triangles, sitting 136/50950, 45 textures/91 geometries. Heap snapshots are not retained-memory or GPU-byte measurements.

Both temporary test servers and browsers exited. Skirt seated shape remains failed. Ordinary-PC performance and sustained thermal/load behavior remain untested. Raw traces and script hash are in perf-before/report.json and perf-after/report.json.
