# 支撑剩余行程感知的跑→走相位匹配（隔离候选）

状态：仅离线真实几何回归；未发布，尚待固定场景浏览器与正常速度验收。修补只涉及 `motion.js` 相位采样、匹配与遥测，未改变腿长、髋部下沉/横移上限、足底锚点或路径/转身控制。

## 可复现因果

`136da8e156b3` 男性 run+90 中，右脚在 t=7.558333 开始支撑。t=7.608333 降到 1.541667 m/s 后，最近双脚姿态匹配把 walkPhase 选到约 .5083，再加本帧距离到 .5173；右脚局部相位重新落在早期支撑。旧锚点继续保留至 t=8.35，累计 .800 秒。到 t=8.216667 的峰值，根已沿路径移动 .8065 m、转过 93.35°，腿最大可达 .844 m，目标距离 .9219 m。额外扩大髋修正只会掩盖支撑时相重复。

单看瞬时两踝最近姿态能避免原 ca72 飞行期半周期选错，但无法判断已植足还将继续支撑多久。本次在原120样本中另存每侧髋、踝与真实校准鞋跟/鞋尖接触补丁的局部点。对**充分混入跑步的退出**（runMix > .95 且当前实际植足），每个目标相位预测至多 .8 秒源轨迹，在既有 .30 秒淡化期间估计保持该锚点的腿长超限；原双足姿态误差加八倍平均平方超限作为候选代价。植足之外仍完全沿用原瞬时姿态选择。

这是有限范围的相位评分近似，不是新硬约束：预测用当前速度/角速度，位置线性插值近似混合骨姿，不知道未来路径控制，不能保证所有场景都可达。系数8控制在瞬时姿态与未来不可达之间的代价；没有用它修改验收限值。需要以真实场景、速度变化与正常速影片继续验证。

## 隔离实现与结果

- 原副本 SHA256：`cfe9c10ac7ea3448aa592c994dedae9bf7749d9692ea2abb7b98804cfe6a5963`。
- 候选副本 SHA256：`7d75fd3bfe4725b5178b1419eaf75fa6fa550c4f3a81a26b0b8620734752b1a2`。
- 小补丁：`evidence/male-gait-phase-fix/gait-phase.patch`，在当前源 `git apply --check` 成功。Root后续主线其它修改不会由整文件覆盖。
- 原始轨迹：`output/playwright/m1/136da8e156b3/turn-contact-chain-1794694793056/fps-30.json`。
- 重放保留实际根位置/yaw/speed，使用真实VRM、蒙皮、鞋底补丁、生产动作retarget和实际createMotion。开始前恒速热身对准原jogPhase，之前完整控制历史不一致：初始支撑脚有约34 mm差异，因此不宣称逐帧原录像复现。

|实际几何重放|旧支撑误差|候选支撑误差|旧连续支撑clamp|候选|
|---|---:|---:|---:|---:|
|男 run−90|27.554 mm|4.965 mm|150 ms|0|
|男 run+90|76.850 mm|3.843 mm|291.667 ms|0|

两路最大踝单帧步进不变（35.465/38.088 mm）；最初无植足的跑步相位选择不变。只统计支撑clamp，不能与包括摆腿的旧375 ms混用。

另外做32组 F/M、四源相位、跑→走直行/左右弧线及走→跑直线。31个原通过用例继续满足相同30 mm支撑、15 mm接触步进、60 mm脚/目标步进、100 ms持续支撑clamp、地面−6 mm限值；候选整体最低鞋底−1.080 mm。局部较旧结果多下探最大 .774 mm，不能写成所有数值完全相同。

**第32个既存失败保留：**女性人工恒加速度直线 walk→run、触发相位.05，旧/新均支撑89.000 mm、接触单帧16.097 mm、clamp58.333 ms。它未修复，尚未证明当前路径controller会以同条件进入。32组检查通过指没有新增原门槛失败或恶化既存失败，不是32组动作验收全通过。

## 复算

```powershell
node scripts/qa-gait-transition-node.mjs analysis/male-phase-fix/motion-baseline.js output/playwright/m1/136da8e156b3/turn-contact-chain-1794694793056/fps-30.json analysis/male-phase-fix/baseline-replay.json
node scripts/qa-gait-transition-node.mjs analysis/male-phase-fix/motion-candidate.js output/playwright/m1/136da8e156b3/turn-contact-chain-1794694793056/fps-30.json analysis/male-phase-fix/candidate-replay.json
node scripts/qa-gait-phase-sweep-node.mjs analysis/male-phase-fix/motion-baseline.js analysis/male-phase-fix/baseline-sweep.json
node scripts/qa-gait-phase-sweep-node.mjs analysis/male-phase-fix/motion-candidate.js analysis/male-phase-fix/candidate-sweep.json
node scripts/check-gait-phase-patch.mjs
```

备份中的 `evidence/male-gait-phase-fix/sources/` 保留两个精确motion快照；`run90-controller-trace.json.gz` 保留两路原始controller捕获。重放脚本直接支持该gzip输入，重建时可用这两处替代上例本机analysis与output历史路径。输出报告写入新output目录，不能覆盖固定证据。

`headless-avatar-node.mjs`仅将纹理解码替换成1×1占位；资产原字节hash、GLTF/VRM解析、骨/蒙皮/几何与生产工厂是真的。没有启动浏览器、没有截图，不能证明画面/纹理/普通PC帧耗时通过。紧凑结果在 `evidence/male-gait-phase-fix`；逐帧开发重放在 `analysis/male-phase-fix`。

下一验收必须先用Root集成固定版复测男左右run90、既有女性飞行期降档，以及正常速腿部运动，随后再决定必要转身矩阵；不得仅凭本Node结果提升体验入口。

## 集成固定候选 0df453d35d2c 首轮

Root已合入小补丁，另含转身最短足转移窗口等独立修补。固定版 `experiments/turn-candidate-16/dist`，男性30Hz run±90+重选/停步/360/椅对齐共11场景完整接触gate通过；男女各12个真实原地1/5/15/45/90/180°左右60Hz请求也通过。它们分别位于 `turn-contact-chain-1794695893741`、`1794695936863`、`1794695956648`（同build目录），只代表这批数值验收，不是完整普通PC/自然度验收。

切换CPU另存 `evidence/male-gait-phase-fix/switch-cpu.json`：Node v24.13.0实际工厂完整update16次，旧中位.121 ms/最大.556 ms；候选中位2.207 ms/最大4.425 ms。Chrome固定版男±90换档完整motion.update分别1.9/1.8 ms。包含matcher和IK，未含renderer/后续皮肤trace采样，不能误写成整个帧耗时。机器报告AMD Ryzen 9 9950X3D，向当前环境暴露8核8逻辑处理器；普通电脑仍未测，正常渲染全链仍须观察切换帧。

完整后续基础人体矩阵结果已归档 `evidence/turn-0df453d35d2c`，F/M三频共270/270数值gate通过（另35个目标/原地场景通过）。完整条件和限制见 `docs/TURN-CONTACT-REGRESSION.md` 的0df453d35d2c段；此结果不自动覆盖服装、正常速度视觉或普通PC性能，也未把离线合成F加速89 mm既存失败认定为已修。
