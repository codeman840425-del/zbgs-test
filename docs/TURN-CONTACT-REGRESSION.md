# Turn contact regression

`scripts/qa-turn-chain.cjs` and old diagnostic evidence remain unchanged. New `qa-turn-contact-chain.cjs` records actual calibrated raw shoe-skin heel/toe patches after skeleton update, plus raw ankles, target, support anchors, contact kind, planner state, reset spatial receipts and lifecycle. `qa-turn-regression.cjs` reads those saved batches; it never opens a browser. Old ankle-only captures cannot pass the new schema check.

Thresholds reuse locomotion acceptance: support residual/stance travel <=30 mm, consecutive contact travel <=15 mm, raw ankle/target step <=60 mm per120Hz substep, continuous reach clamp <=100 ms, shoe floor >=−6 mm. Residual duration above6 mm is diagnostic, not a new invented pass threshold. Whole-shoe yaw is intentionally not locked: the physical toe contact point is tested. A stance is not silently restarted just because its anchor moved; contact loss or actual contact-kind change starts a new stance.

Reset checks compare target to raw ankle and actual support to anchor (30 mm), plus a loose1.2 m ankle/root distance bound for these measured candidates. They detect old world anchors after an explicit teleport, not a universal body-size limit. Normal recorder now accepts male outfit2 and rejects invalid female2/male1; a valid plan is not a recorded/accepted video.

Fixed `38ea4eda48aa` is **failed**, not a release. Fbase30/60Hz batches were captured under `output/playwright/m1/38ea4eda48aa/turn-contact-chain-1794692874662`. Root requested stop after concrete failures;120Hz and the planned male follow-up were not completed. The initial script persisted identity gates only at its end, so interrupted artifacts truthfully mark those receipts unavailable. The script now checkpoints reports before sampling and after each batch. No receipt was fabricated. Offline `contact-regression.json` explicitly fails incomplete collection as well as numeric violations.

Two independently established failures:

- Walk±180: right foot is airborne inside the same planner phrase. Raw ankle and target jump282.391/360.131 mm in one8.333 ms frame. `analyze-turn-arc.py` reconstructs the effective polar arc from actual root, previous raw swing-start point, target angle and emitted blend. The negative case changes−2.811914→+2.796041 rad, the positive+2.814295→−2.798058 rad. Both cross the source's `abs(arc)>2.8` sign branch. Source-mixer or IK errors are not needed to explain these target jumps. The next candidate must keep the arc branch continuous throughout each swing and satisfy the unchanged60 mm gate, not merely remove the visible worst screenshot.
- Run+90: right toe remains contact while IK is clamped for183.333 ms (`t7.341667..7.516667`). At `t7.425`, raw skin support error is30.113832768 mm; normalized metric slip is30.113833245 mm, agreeing within4.8e−10 m. `runMix=0`, walk phase.0507076, speed1.0932 m/s, actual toe y22.3256 mm against anchor y0. This is real unreachable support, not a raw/normalized measurement mismatch, and cannot be rounded below the30 mm gate.

Evidence: `evidence/turn-38ea-early-failures.json`, `turn-38ea-arc-reconstruction.json`, `turn-38ea-run90-support.json`. Other saved contact/anchor/clamp violations remain for diagnosis; no overall naturalness or ordinary-device performance claim follows from the numerical capture.

Bounded follow-up on fixed `537d7490ddf7` (arc change only): F run±90 at60Hz was recaptured with hip/upper-leg world points and measured leg lengths, then browser closed. Output `output/playwright/m1/537d7490ddf7/turn-contact-chain-1794693252180`; numeric gate still fails positive90. `analyze-turn-reach.py` reproduces `evidence/turn-537d-run90-reach.json`: average leg length.768141883 m gives the configured.12leg cap92.177026 mm, exactly equal to actual adaptive drop at the peak. The right target is.798245627 m from the upper-leg origin against.767141793 m reach. With targets fixed, minimum additional pure-vertical drop is42.6756 mm, or pure-horizontal shift47.5560 mm (world x+13.2611,z+45.6696 mm). Left heel is also planted and remains reachable under either single-frame geometric alternative. This identifies the saturated drop cap; it does not justify raising the cap blindly or claim either correction is smooth over the complete motion.

Bounded follow-up `964fd8a1f663`: F walk±180,60Hz captured Toes local/world quaternions and raw toe bone origin. At the first moving frame after turn completion (8.391667→8.400000), right toe remains marked contact; source walk phase resets.43289→.30008074. Toes local rotation changes only5.96e−8 rad, but Foot world rotation jumps.733414 rad (42.02°). Actual raw toe bone origin moves86.11 mm and raw shoe toe patch93.6088 mm. The world anchor is recaptured at the new location, so instantaneous target residual is near zero while real contact travel is large. This is a turn-foot→source-walk orientation/anchor transition, not local Toes deformation or soft-min patch selection. `analyze-turn-contact-transition.py` reproduces `evidence/turn-964fd-toe-transition.json` from `output/playwright/m1/964fd8a1f663/turn-contact-chain-1794693566499/fps-60.json`.

The same walk−180/+180 traces contain141.67/133.33 ms clamp intervals, respectively17/16 frames, all with `contact=false`. They are swing reach limitations, not sustained support failure. The current gate retains its historical all-clamp counter; the report must distinguish those states before deciding on a separate swing quality rule. No threshold was loosened in this diagnosis.

`98577338506f` full first batch: Fbase30Hz,45 scenarios (six angles1/5/15/45/90/180 both directions × idle/walk/run, plus four reselects, two stops,360 and two chairs).38 passed and7 failed only the unchanged−6 mm floor gate. All seven minima occur at a new phrase progress0 with `turning=true`, `moving=false`, failed foot `contact=false`: toe or heel−8.403..−8.545 mm. These are transition floor penetrations, not persistent planted-toe drift. Batch maxima: support3.2985 mm, frame contact travel1.3953 mm, stance drift4.7036 mm, raw ankle/target step55.1369 mm, continuous clamp33.333 ms. Thus earlier target/sole-anchor discontinuities did not recur in this batch, but it is still a failed candidate.

The serial `scripts/run-turn-contact-matrix.cjs` stopped automatically after that failed batch and closed browser/server. F60/120 and all male batches were **not executed**; do not inherit a pass from earlier male or smaller root-side tests. Outputs: `output/turn-contact-matrix-98577338506f-1794694064690.json`, `evidence/turn-985-f30-contact-gate.json`, `evidence/turn-985-floor-failures.json`. Root's source remains untouched by QA.

985 floor root cause was independently calculated from the360 handoff at.600000→.608333 s. Foot world rotation difference is0; target/actual ankle drops4.242267924 mm and actual toe drops4.242267915 mm. `turnEntryPivot` is the actual soft-min shoe point, but the then-current `restSoleOffsets` used arithmetic-mean patch Y. Actual entry toe lever Y is−.102713326842 m; the implied rest lever Y is−.098471058918 m. Subtracting that incompatible lever depresses the ankle a second time: toe−4.1905→−8.4328 mm. Because the foot is not yet contact, the contact-only measured correction does not run. `evidence/turn-985-phrase-floor-root-cause.json` retains the exact two frames and calculation.

Root's proposed correction uses the same actual soft-min rest definition and a measured entry lever interpolated to rest alongside toe rotation. At entry progress0, `pivot − (pivot − lastActual)` must equal lastActual, preventing the additional sink. This is a source/algebra agreement, not a new runtime pass; subsequent fixed-candidate floor probes determine acceptance.

`18a7de64033c` batch outcome: Fbase30/60/120Hz each45 scenarios passed the unchanged numerical contact gates (135 total). Rest lever actually used the same soft-min definition in this build, alongside measured entry interpolation. Mbase30Hz then failed three cases and the runner stopped; male60/120 and dressed follow-ups were not executed. M run−90 sustained clamp150 ms; run+90 support76.850 mm, stance drift53.331 mm and clamp375 ms; run-reverse-stop raw/target step100.169 mm. Male cannot inherit the female result. Matrix receipt: `output/turn-contact-matrix-18a7de64033c-1794694465374.json`.

Even female numeric success did not establish visual naturalness: the batch's55.137 mm maximum step was chair-align0 at startup, with almost zero root speed, an unplanned turning foot lifting then becoming walk support. `evidence/turn-18a7-max-step-detail.json` retains that transition. Root identified a production path entering the legacy fallback; the later capture schema `actual-skin-toe-contact-v2` records `motionPolicy` and rejects `row.turning && !row.motionPolicy`. A final planner frame remains valid because its motion policy object exists even when `active=false`. Historical v1 captures are labeled “unplanned gate not recorded”, never retroactively passed.

`136da8e156b3` targeted M30 run±90+extras (11 scenarios) recorded no unplanned-turn violations, but the three male failures persisted. Right toe in positive90 stays continuously contact for.800 s; by peak it has anchored while root travels.80654 m and rotates93.3546°. Downward and horizontal hip corrections both hit the.12leg cap101.39472 mm. At run exit (`t7.608333`, speed1.541667), pose matching changes walk phase.9577487→.5173184, placing this already-planted right foot at local phase.017318 (early walk support); the old world anchor persists. This is evidence to inspect transition support progression, not justification for larger hip constants or an arbitrary new phase. Detailed start/peak/root/hip/foot data: `evidence/turn-136da-male-support-travel.json`.

The136da stop failure is also continuous target motion rather than an arc-branch jump: a new−26.5198° phrase lasts only.216667 s, with one8.333 ms sample progressing.127529→.188143. Its first swing window is compressed to about.12 s despite a large foot-placement distance, producing100.169 mm/frame. `evidence/turn-136da-male-stop-compression.json` preserves the phrase start and peak. An eventual fix needs to respect foot-transfer duration/displacement as well as root angular distance; new fixed regression and normal-speed viewing remain required.

```powershell
node scripts/run-fixed-check.cjs experiments/turn-candidate-7/dist scripts/qa-turn-contact-chain.cjs 38ea4eda48aa --body=female --fps=30,60,120 --angles=1,15,45,90,180 --modes=idle,walk,run
node scripts/qa-turn-regression.cjs <capture-output-directory>
python scripts/analyze-turn-arc.py <capture-output-directory>/fps-30.json evidence/turn-38ea-arc-reconstruction.json
```

## 固定 0df453d35d2c：相位支撑修补与最短转移窗口的数值回归

本次**基础人体** F/M × 30/60/120 外层模拟频率，各45实际路径/转身/重选/停止/360/椅对齐场景，共270/270通过完整接触gate。另有男30Hz run±90+extras11例、男女60Hz真实原地1/5/15/45/90/180°左右各12例，35/35通过。真实原地角请求用 `rotationRadians`，没有将旧idle走路路径当作原地验证。

可恢复紧凑证据：`evidence/turn-0df453d35d2c/summary.json`、`matrix-receipt.json` 与每批 `*-gate.json`。每份gate含构建及身体初末SHA核验；summary固定本次QA脚本SHA。完整逐帧数据在对应 `output/playwright/m1/0df453d35d2c`。矩阵主回执：`output/turn-contact-matrix-0df453d35d2c-1794695983823.json`。

|范围|支撑残差峰值|真实踝单帧最大步进|最低真实鞋底|最长连续clamp（含摆腿）|
|---|---:|---:|---:|---:|
|F三频135例|3.901 mm|42.930 mm|−1.047 mm|41.667 ms|
|M三频135例|4.965 mm|38.439 mm|−1.078 mm|8.333 ms|
|F真实原地12例|低于.001 mm|12.885 mm|−.360 mm|0|
|M真实原地12例|.050 mm|12.681 mm|−.147 mm|0|

没有unplanned-turn gate违例。F最大42.93 mm发生run+90 t8.208333→8.216667：双帧该脚均为摆腿、无reachClamp、raw和target一致，runMix0、walkPhase .199953→.208549；这不是此前支撑跳锚，但快速摆腿仍需正常速近景审看。两帧在 `evidence/male-gait-phase-fix/female-run90-maxstep.json`。

原male run±90 prolonged-support原因、隔离patch、Node32相位对比及其**未解决的既存合成人工F加速失败**详见 `docs/GAIT-PHASE-SUPPORT-FIX.md`。候选未靠改髋限值或挪锚点通过。当前开发机完整motion.update换档采样1.8/1.9 ms，不等于全部帧开销或普通PC结果。

本轮仅数值，不是自然度、服装、正常速度影片或真实30/60/120设备性能验收。Root继续安排同固定版裤/裙/短裤的正常速度观察。本轮浏览器与临时server已关闭，audit不继续占用窗口。
