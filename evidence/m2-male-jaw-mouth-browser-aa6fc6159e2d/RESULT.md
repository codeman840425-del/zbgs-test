# Final discrete jaw-mouth readback: aa6fc6159e2d

The six bounded browser groups passed with zero page errors. This package belongs to final fixed build **aa6fc6159e2d**; the earlier 5d3311c32e19 and 89480cf8f66c evidence retains its own identity. No runtime or asset was edited by this QA run.

## Actual checks

- Male jaw body `m2-male-jaw-v1`, avatar SHA256 `25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153`; mouth recipe SHA256 `e953cb663484bbf999064110e21b86c43e73db20cb7de2a49a1138a03a2c51d1`. The UI exposes exactly original and +4%, hides the continuous numeric input, and disables unsupported brow/nose/eye endpoints. API +2% and -4% requests were rejected without changing the exported recipe.
- Original/+4% neutral, aa=1, and happy=.65 + blink=.998971 + aa=.511979 were captured from identical paused bone pose, simulation time, expression weights and camera. Twelve native front/side images are retained. Direct expression-manager refresh here is a static diagnostic, separate from the real-time clip.
- The native 1600x1000 continuous clip uses actual UI +4% selection, real live speech, automatic blink, gaze, side camera, shorts, walking and stopping, then one reset. The walk task completed at [0.4855544105, 0, 1.7906103668] for target [0.5, 1.8]. Reset restores initial position/idle/0.85 m/s and retains the selected face-side camera and its UI selection.
- An actual UI download was read through a real file chooser in a clean browser context and downloaded again; all JSON fields matched. The two original female/male representative files from 894 were each read in fresh contexts, with their original numeric mouth controls restored and values preserved.

## Image review actually performed

All three static comparison sheets and all four sequential whole-file 2 fps sheets (30 sampled frames) were opened and inspected. The neutral and aa front/side pairs show a small mouth-width change; sampled lips, mouth cavity, jaw/neck outline show no new crack or large black patch. The happy/near-closed-eye pair retains the lash line in both width states. This is a limited endpoint, not broad free-form face editing.

Video-time observations: approximately 1-4.5 s front speech and 5-8.5 s side speech/gaze remain visually connected in the samples; approximately 9-12.5 s shows the room-camera transition and shorts walk/stop; approximately 13-14.5 s returns to face-side and the discrete mouth controls. The opening loading frames and intentional camera changes remain in the original file. The room samples are too small and sparse to certify detailed foot contact, and 2 fps cannot exclude sub-frame or brief motion defects.

The video is an uncut normal-speed record. Engineering review was sampled image inspection, **not a claim of continuous human naturalness acceptance**. No new dance, props, full expression matrix, or four-domain regression was run. Earlier 084 eyelash and 894 file tests are not relabeled as aa6 tests.

## Timing and recovery

The speech measurement window records wall time 8.4085 s and simulation time 8.40850000000015 s; its largest recorded frame interval is 48.5 ms with zero intervals over 50 ms. Reset resets the simulation clock, so a whole-trace wall/simulation ratio would be invalid. These are recording-window observations on the development machine, not a performance benchmark or ordinary-PC pass.

Run `node scripts/qa-m2-male-jaw-mouth-final.cjs` only with its expected fixed build available; the output refuses overwrite. The exact executed script is archived as `executed-script.cjs`. `report.json` preserves its original pending-review label; this RESULT records the subsequent completed engineering image review. `manifest.json` pins the package files. Browser was closed after execution; QA did not create a persistent server.

Open `index.html` for the original video, same-pose images and full-time review sheets. No additional browser run is needed to reproduce this written review.
