# Matched self-contact thickness diagnostic: rejected

Same frozen02950240 source, exact actual58394 continuous input (static control repeats frame1); no body/controller/source edits. The ONLY physical change is selfDistanceAuthoring .005→.0025 with scale10: world trigger1mm→.5mm, response .888889mm→.444444mm. Source actual minimum.5830765mm provides~.083mm initial trigger margin. Object total remains world.3mm; mass, stiffness, quality8, collision quality4 and all other parameters unchanged.

Zero intersections and edge ratio≤1.25 remain admission gates. Observation-only2.0 hard stop does not turn failed shapes into accepted samples. Old/new first18 positions are now expected to differ and recorded; they must not be described as identical after a physical setting change.

Static18: firstbody crossing stillframe4; terminalbody22 vs18, maxedge1.043648 vs1.041288, originalhem .998400 vs.997859; same nearpair ends6.765578mm vs6.768617mm and endpoint separation~10.09mm. Movement: firstcontact still7, firstmaterial still18 (1.298692 vs1.310907); stopsframe45/action1.4s/globaledge2.198467 rather than oldframe42. Terminalbody295/top107/chair16/self22. Different terminal times are NOT same-pose comparisons. `same-time-comparison.json` compares every shared frame, while `comparison-curves.json` retains each complete run.

No substantial improvement and no admission. Initial self preload was real, but removing that preload did not remove resting layer separation or dynamic material/contact failures. This does not isolate the native impulse mechanism; no further self-distance scan is authorized/performed. Object1.2mm independent comparison is not included in this evidence.

Terminal front/side images are actual saved rejected meshes with matching collision input and fixed prior camera. Skin-through remains visible around thighs/front and waist; no claim of full character/game visual pass. No textures/hair/face visual layers beyond captured collider surfaces. Source physical settings, script SHA and full per-frame pairs/positions remain in trial-adapter/result/frame files.

Reproduce only in isolated output with SKIRT_OBSERVATION=static or moving: `python scripts/m1-assets/simple-skirt/run-self025-v1.py`; each output refuses overwrite. Read-only comparison: `compare-self025-v1.py`; saved geometry views: Blender `render-self025-v1.py`. Both sole Blender processes ended normally (<7s each); no retry or parameter sweep.
