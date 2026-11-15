# Single-layer author construction, original render retained

Same frozen029 GLB (1402render vertices2440faces), no asset/source edits. Author welded vertices1290→1170 and faces2440→2200 by excluding120free return points/240return faces. Original full render topology and all original attributes remain. Physical mass/DOF change is explicit; not equivalent physics.

Each inner point maps to closest actual initial outer triangle with barycentric coordinates and a signed full UVN local-frame offset. Orthogonal projections outside triangles use closest edge/vertex plus local residual; no source point is snapped onto shell. Initial double precision reconstruction max0metres; native float32 first frame microprecision recorded separately. The first mapper rejected absent interior-plane projections before creating a map; deterministic closest-triangle boundary support completed the original required mapping, not a cloth retry.

Physics uses fixedB self .0025author, object cloth.011+collider.001author, scale10. No new collision projections or solver. Every evaluated author frame rebuilds all original return points then runs full render body/top/chair/self,1.25edge,pin/degeneracy gates. Input same actual60frames (static repeats frame1).

Both sole trials reject. Static18 first4outer/return self, terminalself15 allreturn-involved, outerself0; fullmax1.092983 vs outermax1.027004. Moving first4self; material24=1.312161; hard2 at28=2.107187 on genuineouter edge sim520–521/render625–626 (free, parents901/1140), not return mapping. Moving terminalbody40/top68/self20;4self pairs areouter-only. No conclusion that all single-layer production is impossible. Independent point triangle frames can make reconstructed offsets cross adjacent faces; this is separate from actualouter material overstrain.

BaselineB35body4/top76 allfree, no fixed/mixedpairs. Root audit independently handles60-frame source fixedband; not duplicated here. Current static run hasobject1.2mm while prior staticself025 usedobject.3mm, so do not attribute their difference solely to structure. MovingB is exactphysical-parameter baseline.

Source mapping rebuild: `python scripts/m1-assets/simple-skirt/build-single-layer-map-v1.py` in isolated output (refuses overwrite). Physical trial: SKIRT_OBSERVATION=static/moving then `python scripts/m1-assets/simple-skirt/run-single-layer-v1.py`. Read-only diagnosis and saved-shape rendering: `diagnose-single-layer-v1.py`, Blender `render-single-layer-v1.py`. No game integration. Parameter/source direction stopped pending evidence decision.
