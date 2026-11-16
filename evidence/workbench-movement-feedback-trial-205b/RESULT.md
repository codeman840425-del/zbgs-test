# Movement feedback trial — 205b90fac0ef

Technical result: 9 checks passed, zero page errors. Executed against the fixed `experiments/appearance-visible-trial-v4/dist`, using the script snapshot in this directory. The test browser and wrapper-owned temporary server were closed.

Actual UI checks covered near-camera floor miss feedback; room entry and real floor movement; speed selection without inventing a destination or leaking UI clicks to the scene; reset retaining the inspection camera and restoring 0.85 m/s; paused route and explicit resume feedback; stop/no-destination feedback; male selection and running route; seated-to-walk; and interruption of an actually active dance by a ground destination. Movement was checked using actual root displacement, not only a mode label. Full input/state evidence remains in `report.json`.

The pause/resume and stop screenshots were independently opened and reviewed after execution. The first says “已继续，正在前往所选目的地”; the second says “已继续播放” with a standing character and no stale route statement. This verifies the previously observed stale paused message in the sampled state. It is not a continuous motion or naturalness review.

This is a trial, not the final exact-commit release. Subsequent source changes include greeting-route rejection feedback and route/speed feedback ownership; they are not tested by these nine checks. The current reusable script now contains a tenth real greeting-route rejection check, syntax-checked but not executed here. The historical executed-script snapshot and raw report are unchanged.

No product files were modified, no normal-speed movie or performance measurement was run in this trial, and no ordinary-PC performance claim is made. The original bcade video remains separately labeled; final comparison recording awaits the final build.
