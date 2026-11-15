# Candidate rejected for publication

Public workbench remains 1fff20c54b2b. Candidate 01a1391b7d32 is reproducible from source 164eaf4cd2c62f50f278e41f7aff58b5dfdc85c2; source was explicitly reverted in 603e483. No 19-case browser pass or context-loss pass is claimed for 01a.

First main-program work leaves the draw call, and the measured CPU draw duration drops, but whole observed frame delivery does not improve: the no-input repeat has 115–121 ms maximum rAF intervals. Moving work out of renderer.render is insufficient. In RESULT.md, “request + first draw” ends at the JavaScript draw-call return; it is **not** GPU completion or display presentation latency.

A separate traced male first edit (diagnostic overhead, not a performance benchmark) has a 115.2 ms rAF gap and a long-animation-frame with no attributed script and blockingDuration=0. The same time window overlaps approximately 97.2 ms of CrGpuMain WebGL command-buffer processing. Ten-millisecond heartbeat callbacks continue. This supports a GPU-process/browser rendering bottleneck; it does not identify a particular internal driver/compiler routine. The same trace also records a separate 64 ms geometry-preparation Promise callback.

See ../face-frame-gap-trace-01a/{report.json,summary.json,trace.json.gz}; raw measurements remain unchanged. Next candidate, if justified, will address the independently observed CPU geometry work with strict equivalence, not keep adjusting first-use task delays or claim shadow prewarming is implemented.
