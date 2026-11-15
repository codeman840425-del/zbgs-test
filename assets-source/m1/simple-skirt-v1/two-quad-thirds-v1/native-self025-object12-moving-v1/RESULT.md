# Independent object-distance comparison: rejected

Same029 source and actual60-frame input. Direct baseline is `native-self025-moving-v1`: self .0025author unchanged. Only cloth object distance .002→.011author; collider .001author unchanged; author scale10 yields totalworld.3→1.2mm. Mass/stiffness/bending/quality/source/topology unchanged. No further configuration scan.

First actual contact frame10 vs7, first1.25 material failure20 vs18. At matchingframe35/action1.066667s: body168→4, top92→76, chair11→0, self8→10; maxedge1.789491→2.096640. The larger object distance improves some body/chair contact counts but hits the separate diagnostic2.0hard stop earlier. It does not pass zero-crossing/material admission. Complete per-frame original failures remain permanent; no clean later frame can erase them. This trial stops35 rather than60, no rerun.

The unsewn hem mechanism is independently established in `../free-hem-structure.json`:120upper-loop free boundary edges,0pins, no upper sewing/connection; onlybottom fold connects to shell. Static return length remains~10.38mm, while median angle relative outer-up changes4.44→154.54degrees and tangent projection+10.34→−9.37mm. Thus the10mm separation is largely free-strip unfolding, not10mm material stretch. This is not sole causation of all body/top failures.

Actual35front/side shows a recognizable sitting transition with upper/front contact artifacts; pure collision diagnostic materials, not game or full-character rendering acceptance. Only recorded collider surfaces present, no textures/hair; all failure faces remain.

Reproduce once in isolated absent output: `python scripts/m1-assets/simple-skirt/run-object12-v1.py`. Same-time report: `compare-object12-v1.py`. Topology/fold report: `inspect-free-hem-v1.py`. Saved-shape rendering only: Blender `render-object12-v1.py`. Initial read-only topology report had a missing hashlib import fixed before emitting report; no physical retry. Native trial ran once,5.48seconds wall,2threads, then closed.

Configuration direction is stopped. A potential next production distinction is single outer author surface with original render return rebuilt from its local tangent and full final contact/strain checks. That mapping is not implemented or validated by this package.
