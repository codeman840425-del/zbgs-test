# One quality 64 time-resolution check: rejected

Frozen source02950240, same single outer author surface, continuous ring reconstruction and corrected linear150/150/80. ONLY solver quality8 to64; collision quality4, mass.15, Angular.6, air2, self.0025author, object.011+.001author, scale10 and input timing unchanged. Runtime/game update is untouched.

Independent capture pin30Hz movement maximum15.737mm motivates nominal per-step1.967mm at8 vs.246mm at64, relative to1.2mm object distance. This estimates discretization scale, not actual per-native-substep motion or CCD. Settings were read back from Blender. One process,2threads,17.63seconds wall, no timeout or retry.

First self intersection stillframe5. First material failure moves19 to25 (ratio1.289675 still fails1.25). At matchingframe29/action.866667s: outer/full edge2.168294 to1.747591, body44 to6, top86 to106, self30 to26 (outer17 to9). Temporal resolution changes trajectory but does not establish convergence or admission. Counts trade off; do not report only improved body pairs.

Hard diagnostic2.0 stop atframe35/action1.066667s with ratio2.159290. Finalbody10/top111/chair0/self72 (outer44/return28). Maximum edge freeouter sim635-636/render741-742; incidentfaces1151(parent1131) and1390(parent1370). All original rendered return triangles remain in gates; initial self and material failures stay permanent. No full seated-stable output, no action slowdown, no further quality or parameter scan.

Files: same-time-comparison.json includes every matchedframe, surface-failure-classification.json separates outer/return, preparation.json contains actualsettings, frame*.json.gz contains all positions/pairs. Fixed-camera terminalfront/side images are saved rejected collision meshes, without textures/hair/fullvisual face, not game acceptance. Reproduce once in absent isolatedoutput: python scripts/m1-assets/simple-skirt/run-quality64-v1.py. Diagnostics/render scripts are read-only replay, no physics.

Documentation write initially encountered default Windows GBK decoding; explicit UTF8 corrected before final report, with no physical rerun.
