# Two-quad source and rejected author trial

Source SHA256: `02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7`.
Unique conforming two-quad subdivision: +10 vertices / +20 faces; old attributes retained, top-four skin pruning and 60-frame LBS error recorded in source reports. Static/four-pose admission does not certify sitting.

Native trial: first 3 stationary frames and first 3 moving frames have no intersections. Frame 7 permanently rejects for actual body intersections; frame 18 stops at material edge ratio 1.31090694 > original 1.25. Body/top/chair/self at frame 18: 20/24/0/0. No seated-stable result exists in this run.

Longest edge is free inner-return sim1239–1240 (render1350–1351), actual rest9.600590mm to12.585480mm; same-time LBS target9.026763mm. It is not two animated pins forced apart. First body and top events occur in free row2 around the top hem; row2 spans -20.335 to+17.203mm relative to nearest-XZ top boundary, not uniformly a waistband.

Official self collision trigger is2*self_distance:1mm in world units; response target .888889mm. Initial inner-return/outer eligible nonadjacent pair2359/2118 distance .617638mm, no shared sim vertex. There are240 eligible pairs under1mm. Frame3 minimum1.302345mm; frame18 minimum4.362310mm. This demonstrates incompatible initial spacing eligibility, not instrumented proof that self impulses cause the later material failure.

`views/` shows actual saved meshes at frames1/7/18, fixed front/side cameras, solid collision diagnostic materials; not full-character game/material acceptance. Original exposure renders remain in `views-lighting-first/`. All full-body collider triangles remain. Source/rebuild scripts and shared continuous input identities are recorded in accompanying manifests. No new runtime integration and no threshold/parameter retry.
