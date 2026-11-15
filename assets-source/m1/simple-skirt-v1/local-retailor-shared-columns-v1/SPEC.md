# One shared material-coordinate correction

Frozen parent: local-retailor-layout-v2, checkpoint ea308af660c6cb6133ae23c434ea341def4472c1. Its assets and failures remain intact. This directory is a coordinate-authoring experiment, not a released outfit.

The parent independently mapped each ring by its local arc length. Thus the same mesh column meant different original surface parameters across rings. The known outer edge486–526 became55.275mm from26.840mm rest.

Recover each frozen target ring knot's original-column parameter from the recorded original curves and mapping formula. Use one shared40-column monotonic vector (column0 fixed; periodic endpoint40) for all10 rings. Resample only those exact frozen ring polylines, including the existing asymmetric support. Upper yoke/seam, full source Basis, original top bytes, hand pose, thickness method, original gates and actual captured input remain fixed. Inner target follows the same native Solidify construction; full inner rendering/gates remain. No global radius, width, pose or motion variable is optimized.

One SLSQP minimax solve, at most200 iterations, minimizes maximum original outer-edge stretch over39 shared coordinates and one maximum variable. Initial coordinates are the arithmetic mean of the old ring coordinates. A finite rejected solution does not prove global mathematical infeasibility. No alternative initialization, tolerance, coefficient, thickness or source variant is tried.

Record shared coordinate spread, old spread, original/updated486–526, all outer edges, displacement caused by material reassignment and nearest distance to the frozen ring curves. New connecting triangles approximate the continuous surface differently; additionally measure finite triangle-sample distances in both directions against v2, without calling this an exact Hausdorff bound. Four original pose gates include complete Body/top/chair/self and unchanged1.25 edge gate. Intermediate29/35 remain diagnostic shape interpolation, not a finished transition.

Execution order: plan-retailor-shared-columns-v1.py (Python/SciPy); build-retailor-shared-columns-v1.py (Blender4.5.9); gate-retailor-shared-columns-v1.py (Blender4.5.9). Each refuses frozen result overwrite. Run in this isolated worktree only; no live runtime/controller changes.
