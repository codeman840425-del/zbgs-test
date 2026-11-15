# Actual fixed v2 → shared-column static GPU check

Completed against immutable58394ce674e4, using exact original female027bed60 and pinned v2/shared sources. Both visible material primitives for top and skirt were read back against their respective exported authored targets. Maximum errors in each mode: top0.3211385 micrometre; skirt0.2210912 micrometre. Front/side/room camera matrices, projection and simulation time match exactly; root, hips, authored hips, action/source time and sitProgress also match. No page/console/HTTP failures.

Actual images: parent-front.png / candidate-front.png, parent-side.png / candidate-side.png, parent-room.png / candidate-room.png. Parent means frozenv2, not public source. Room camera explicitly looks at the actor, avoiding the earlier immediate-preset orientation issue. Complete normal-material body/face/hair/top/skirt/shoes/chair remain. No torso coverage mask is used for this modified top; old hand pose is intentionally frozen.

Viewed result: the candidate retains v2's continuous side silhouette; there is no obvious return of the large side-pointed wings seen in current7a86. However v2 and shared look very similar at these distances, and the broad front still reads as a smooth single cover rather than natural cloth folds. The shared mapping correction is real numeric progress, not an observed major style or naturalness breakthrough. Current7a86/13bb pictures were contextual comparison only; this is not a same-pose before/after of those builds.

Reject remains: outer edge1.294 and full inner-return edge1.380 exceed1.25, top local1.406 and130top/skirt pairs remain. Frozen-hand121body pairs are not refitted; a small room image cannot certify absence of them. This single static view does not show start/stop, intermediate sit, cancellation, walk/run or dance response. No new solver or geometry attempt followed.

Browser and temporary OS-assigned HTTP server closed on script completion. Raw machine report, concise identity/readback/camera proof, exact script snapshot and image hashes are archived.
