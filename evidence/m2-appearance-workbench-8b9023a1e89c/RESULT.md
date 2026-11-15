# Appearance workbench: 8b9023a1e89c

Fixed build `8b9023a1e89c`, source `5e238e4`. This package records the reduced-saturation warm/deep palette and enlarged full-body framing. It does not include the later eye/lip controls. Original report and recordings are retained without relabelling earlier b44 results.

## Actual execution

- 11/11 scoped technical checks passed; no page errors. Actual UI selected female bob/brown/warm, blonde/deep, expressions, speaking, gaze and reset. Original material colors, shade colors, texture source identities and source pixel hashes restored exactly. Male deep skin and restoration also checked.
- Female bob/brown/warm and male original-hair/deep each completed the default original 30-second dance at normal 1×, ending with completed task and idle state. Neither recording paused or changed speed. Tracks were not edited. Dance clock reaches about 30.867 seconds including the existing exit blend.
- Five exact body identities were captured at simulation time 1.2 seconds, neutral expression and dynamics off, with face/half front/side views. Existing neutral base diagnostic provides original/waist front/side comparison. It is not a naked-color display. Clothing screenshots alone do not demonstrate a clearly perceptible 4% waist change.
- Full original 1600×1000 recordings, trace JSON/gzip, precise body identities and actual executed script are included. The viewer is `index.html`; `summary.json` contains movie/trace hashes and timing.

## Engineering visual review actually performed

All 15 full-time 2-fps sheets (174 sampled frames) were individually inspected: near-view sheets 000–002; female dance 000–005; male dance 000–005. This is sampled engineering review, not continuous human 1× naturalness acceptance, and cannot exclude brief between-sample artifacts.

Near-view sequence shows expression/automatic blink/speaking and brown-to-blonde, warm-to-deep, then original restoration. The new deep palette is visibly less orange. Inspected female front/side and neck/hands, male side face and half-body images show no conspicuous hard color seam at visible ear/neck/hand boundaries; authored lighting and palm differences remain. Gaze uses the existing look-at-camera behavior, not a newly authored head-turn animation.

Female dance sampled intervals 0–5.5, 6–11.5, 12–17.5, 18–23.5, 24–29.5 and 30–34 seconds show the complete existing arm gestures, crossing steps, turn, ending and return to idle. Male corresponding intervals through 34.5 seconds show the same complete sequence. No gross detached limb or missing head/hair geometry was seen in these samples. Existing arm/garment overlap remains (for example hands across torso in female 3.5–4.5/20–20.5 seconds and male 4–5/20.5–21 seconds); the frozen source dance is not declared newly repaired.

Male raised hands at video 26–29 seconds are now inside the image with visible margin, unlike b44. Actual bone endpoint tracking gives minimum top margin about 93.45 pixels at dance time 25.0008; this is a bone metric, not a fingertip surface proof. Sampled images independently confirm the raised visible hand is not cropped. Female corresponding margin is about 184.41 pixels.

Original/waist base front and side screenshots were also inspected. The contour change is subtle; it is not presented as a dramatic new body shape. Bob ear-side flyaways and close ear contact remain visible detail limitations; no blanket no-penetration claim is made.

## Recording clocks and limitations

| Recording | Wall / simulated seconds | Sim/wall | Maximum recorded rAF | >33 / >50 ms |
|---|---|---|---|---|
| Female appearance/speaking | 14.2083 / 14.1924 | 0.998881 | 60.7 ms | 1 / 1 |
| Female original dance | 31.6138 / 31.6134 | 0.999987 | 6.6 ms | 0 / 0 |
| Male original dance | 31.5713 / 31.5710 | 0.999990 | 6.6 ms | 0 / 0 |

Video files additionally contain startup/loading and terminal standing. Near-view long frame occurs near trace t=14.1789 after reset, during end-of-test material/source-pixel restoration sampling. This observation is retained; its cause was not independently isolated. These are recording-window measurements on the development environment, not a performance benchmark or ordinary-PC pass.

b44 error/retry, rapid-switch, two-instance isolation and nine-camera checks remain explicitly older-build evidence; unchanged paths were not redundantly retested here. This final run tests the palette, framing and specified combinations. Existing skirt defects remain accepted-as-current scope, not repaired by this work. Eye/lip features are outside this fixed package.
