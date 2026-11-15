# 掌指真实点轮廓：独立成本失败候选

当前结论（2026-11-14）：83实测几何改善但成本失败；一次等价alpha证明试验05仍失败，分支已冻结、不合主。详见 [83报告](RESULT-83accb29be4b.md) 与 [05报告](alpha-proof/RESULT-05eb768aadc3.md)。以下首试计划/未验证描述保留为原始方案历史，不能覆盖这两份实际结果。

**不在主运行时启用，不是修复完成。** 唯一拟运行候选为 `source/hand-contour-workspace.mjs` + `patch/motion-hand-contours.patch`。它保留原始作者手腕/手指姿态及前臂80轨、共用投影grid/alpha缓存、5轮修正、最终复查；只替换显式启用的手部五轨测量。

## 根因证据与适用范围

175 的 `measureArm` 手部仍为 wrist→MiddleDistal、16mm固定半径的5轨，没有按真实掌宽、拇指、其他指端形成轮廓。实际皮肤×裙面检查在原女性起身100采样中的15帧相交，193个不同skin面；前臂不相交。准确输入：

`output/playwright/m1/175a487d5ea3/variant-seat-arms-1794702194076/beta-base-female-m1.json`

`evidence/source-selection.json` 保存同源语义选择结果：2212个掌指面、每侧769个顶点，原193个失败面全部在选择范围。这只说明没有漏选失败部位，**不证明有限检测轨已找到每个相交面**。

当前只有原女性SHA `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95` 的 opt-in；男及jaw/waisthip不能静默继承。语义分组算法可重用，但新体型必须单独生成/测量。

## 最小机制

1. 每实例初始化：通过实际 Body_SKIN 的语义蒙皮权重选择掌和五指，保留每个选中三角的全部顶点；按主要掌/指权重归入6个组。拓扑/骨引用缓存在该controller闭包，不跨实例共享。
2. 复用现有 `profile.seatHandSurfaces(true)` 的官方humanoid/scene/equipment同步；**此后**采当前实际raw蒙皮手顶点。没有再次更新/恢复骨架，没有新增姿态时钟。
3. 每手沿原向外投影方向，计算各组的真实投影凸轮廓。轮廓边和最内实际皮肤点到轮廓点的辐条均使用真实3D皮肤点，不铺平深度、不猜半径。
4. 原求解保持手腕世界旋转，因此预测中只按候选 wrist−原wrist 平移这些轨；手指姿态不改。混有前臂权重的腕边界不一定严格刚性，最终**真实raw蒙皮面×实际裙面**必须再验。
5. 继续使用已有 `railClearance`、8mm间距、alpha规则、iteration上限；不改旧前臂路径、坐起目标或公共动作状态。

## 离线结果和否决的替代

- 14个已捕获的175真实源保留姿态、28只手：真实轮廓含所有选中点的2D投影；每手164–212轨，平均185.11。相比旧手5轨，存在明确成本风险，不能因不是2790面×步就宣称高效。
- 真实Three SkinnedMesh工作区3姿态检查：采样不改raw骨矩阵，预测腕平移保留采样形状，拓扑变化和SHA错误fail-closed。
- 另一种8方向实际support平面轮廓为70–72轨，但最内深度铺平造成最多**82.24mm**深度包络保守量。该方案不应合入，完整源码/数据放 `rejected/` 与 `evidence/contour-check.json`。它不是可启用的运行选项。
- 有限轮廓/辐条不能覆盖每个内部小三角，也不是CCD。离线投影含点通过不等于修正后无交叉。当前没有浏览器实际效果或成本通过结论。

## 构建与首个窗口

基线提交 `1b1da8119c8f616c4b198a85bf004ee4b7959382`。保存的 Git blob / `source/motion.base.js` 是 LF，其原字节SHA为 `d6c5c9a9ffbbd01bc45bde575e2824499f09194acc9ab4200b8bf0c9bef5700c`。Windows checkout 的实际CRLF字节SHA为 `3851f2e3b3bc8bd64323d1dc6ed29d869bb2d04f0869927aa39647d55c6cefa2`，**仅CRLF→LF** 后才对应 d6c5。生成器先核这两种已知原字节，再做受限文本等价核查；不对模型或资源SHA做文本正规化。

生成的CRLF candidate实际字节SHA为 `4b767b9d64413d6021744b8947c1a289297110e621f4a27152d463d3c74ef38a`，其LF文本SHA为 `a126ac5a0558ca890372199e271167534463739d7dceeae69dc412ee74341bf0`，分别记录于 `patch/manifest.json`。安装receipt保留checkout raw/LF、candidate raw/LF和git apply结果。自包含baseline用于重生成，不依赖已经改过的worktree runtime。

不要整文件覆盖主区：只在负责人准备的独立候选源应用局部patch、把helper放到该候选`src/`旁，并在**原女性**motion profile加 manifest 中的 `handSurfaceContact` opt-in。不开此项时保留原手五轨。

首个实际窗口建议：

- 原女性裙，先同轨迹站立、坐入、坐稳、起身中段/末段3–5关键姿态，确认handSurfaceMetrics非空、手指姿态未被改写、wrist delta/肘变化合理。
- 短完整坐起使用已有 `scripts/qa-variant-seat-arms.cjs <URL> <BUILD> --bodies=beta-base-female-m1`：按同100采样比较真实最终皮肤×实际显示裙的前臂/掌指交叉，不只测新代理的remainingClearance。15帧失败若未改善或产生明显腕/肘跳则停，不继续增厚。
- 固定同room/authored/dynamics-off无录制比较，复用 `assets-source/forearm-collision-v2/scripts/qa-unrecorded-perf.cjs`。先分项开启 `QA_FOREARM_PROFILE=1`：新handSkinMs/handContourMs +原railAlpha/candidateTriangles/fit；随后关闭分项跑短实际rAF/子步/总simulate。CPU耗时不是GPU帧耗时。
- 仅几何与短成本没有明显退化时才录正常速起身，观察源手姿、接缝、抬腕过量。不得把静态几何通过自动当观感通过。

如果成本不收敛，最多基于实际投影几何误差做有界简化，或回到有限源手姿/分段曲面替代，不凭目标轨数删点、不扩成大solver。本轮两个方向的代价与失败边界已保留。

## 重建入口

```powershell
python assets-source/hand-contact-v1/scripts/prepare-fixture.py
node assets-source/hand-contact-v1/scripts/qa-exact-contours.mjs
node assets-source/hand-contact-v1/scripts/qa-workspace.mjs
python assets-source/hand-contact-v1/scripts/make-patch.py
```

`prepare-fixture.py` 引用既有完整本地捕获；已保存14姿态小fixture可直接离线复算轮廓，无需重录。原全量捕获缺失时仅影响重采fixture，不影响已保存fixture的检查。Python/NumPy沿项目现有3.13.11/2.4.2环境；Node24.13.0、项目锁定Three。所有来源为本项目已固定模型和动作，不添加新的外部资产或许可。
