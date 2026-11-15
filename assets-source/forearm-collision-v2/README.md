# 前臂源轮廓与源腕保留候选：可审查包，未自动集成

此目录是根代理要求保存进Git的独立候选源、局部补丁和紧凑实际输入。主区 `prototype/src`、`public` 没有被本包覆盖。完整试验工程仍在 `F:/gamemake-forearm-patch`；本目录的profile生成和关键帧复查不依赖该工作树。

当前实际验证候选为 **c9f074519f18**。原480面候选c5f85410630a因每步平均41ms与跳肘被拒绝；80rails仍强迫lap目标的e29f6b5bc9d6消除固定腰环交叉但保留137mm肘跳，也未通过。c9保持相同80rails，仅对已有成熟sitEnter/sitIdle/sitExit保留authored腕，最大单帧肘移降到43.12mm。270帧固定腰环与真实手/腿三角交叉都是0，fit均值5.27ms。**尚未完整正常速视觉验收、男性动态与普通PC性能验收；最终投影残差仍最高4.89mm。不能称整个衣物无穿插或通用包络完成。** 三份详细报告在 `reports/`。

关键机制有真实逐轮输入：lap腕目标过早跨手臂可达边界，随后pole调整改变弯曲分支。旧左77还触发5mm bend fallback。相关跳变alphaRejected为0，右80/81最强衣片面未换，不能将主因写成材质alpha跳变。`evidence/iteration-jump-analysis.json`及实际逐轮keyframes可独立复算。

## 文件与适用范围

当前male没有裙装 `skirtDynamics` / `seatHandRadii`，`fitSeatHands`在入口直接返回，所以男性profile已生成/加载并不等于该层在男性动画中执行或验收。无衣物站立、正常行走在衣物采样前返回；女性无裙但坐下进度大于0时仍会跑空surface的轮廓循环，尚有可消除的分配成本，未偷偷改成已优化。

43.12mm的最大起身肘移已拆分：188帧原源世界肘移41.04mm，IK校正向量仅变2.17mm；伸直余量158.58mm，没有旧版跨可达边界。首轮前臂需求.12→0mm、手掌9.60→5.60mm，最终残差0。不是旧137mm的同类校正骤变，但仍待正常速整片观察。

稳定坐姿仍每帧重采衣物、建投影grid；本样本坐稳82帧fit均值7.16ms。可复用不变拓扑/工作缓冲，但直接复用几何必须检查surface版本、world矩阵、outward方向以及cloth/source姿势变化；目前只记录方案，没有重写优化。

- `female.json` / `male.json`：由实际语义Body_SKIN+inverse bind生成的分段半径和独立轴向端部延伸，精确绑定各自身体SHA。女性肘后40mm/局部半径29.10mm，男性60mm/37.72mm。旧v1球端数据保留为来源，v2运行轮廓使用 `extendedKnots`，不沿整臂使用44/65mm球半径。
- `source/forearm-contour-rails.js`：每臂80个分段/端面轮廓线，复用既有 `projectedSegmentInterval`。有限轮廓可能漏小面，不是完整解析包络或CCD。另一个helper在当前候选仅使用profile验证；里面未调用的480面函数保留供复核，不能重新启用后称c9结果仍适用。
- `patch/c9-source-preserving-review.patch`：从当时主区motion SHA `fc02e75c…c9910`生成的局部审查补丁，包含真实半径接入、最终残差复查、逐轮诊断和verified loader。根代理应逐hunk合并，不能整文件覆盖后来转向/greeting变更。实验query用于A/B，是否保留由整合者决定。
- `runtime-fixture.json`：保存有身份约束的真实身体角色面索引与固定拟合腰边配方，源裙skin+hips局部fit delta生成固定腰。不是运行时投影裙面的同义物。原始拟合来源与失败链在v1/offline-corrective资料，不把它当新cloth。
- `evidence/`：三个候选的全270帧数值摘要；74–83、坐稳、起身关键帧逐轮数据；其中76/77/78/80/81/82/188/207保留实际skin和腰点，其余只留诊断。没有用缺失几何帧伪称可重算整270帧。完整捕获仍在工作树output。

源素材许可与出处继承原foundation女性/男性记录及 `forearm-collision-v1`，没有引入外部新角色。端部延伸是绑定空间几何包围，肘混合蒙皮与不同身体/形变须再验证。原v1的0.204mm posed漏出边界不被本数据自动抹去。

## 可重复入口

Python3.13.11，numpy2.4.2；全捕获分析另外使用本机SciPy（版本在manifest）。

```powershell
python -m pip install -r assets-source/forearm-collision-v2/scripts/requirements.txt
# 只生成本目录female/male源JSON；不会安装到public。
python assets-source/forearm-collision-v2/scripts/build-forearm-rails-v2.py
# 离线重算保留帧的实际skin/腰边与77pole fallback，非新动画验收。
python assets-source/forearm-collision-v2/scripts/verify-keyframes.py
```

根代理把补丁和对应profile明确接到**独立**候选并构建后，指定其真实build与body SHA，调用已有临时server工具：

```powershell
$env:QA_M1_BUILD='<实际12位构建ID>'
$env:QA_M1_ASSET_SHA='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
$env:QA_FOREARM_TARGET_COMPARE='1'
node scripts/run-fixed-check.cjs <固定dist目录> assets-source/forearm-collision-v2/scripts/qa-forearm-runtime.cjs
python assets-source/forearm-collision-v2/scripts/analyze-forearm-runtime.py output/playwright/forearm-<实际构建ID>
```

QA拒绝覆盖已有capture。运行入口核实际served/runtime build和已加载body，而不是仅从manifest读身份。上述命令需要协调独占browser窗口；当前没有常驻测试server。

## 正常速录屏补充（暂停时状态）

c9同镜头lap/authored完整坐起视频已归档到media，顺序解码观察见reports/FOREARM-NORMAL-c9f074519f18.md。authored减少旧目标导致的折肘，但坐稳实际rAF均值44.96ms/P9548.6ms，不通过合入。首rAF约320ms含时间戳起点错位，不能当持续卡顿；持续长帧仍真实，需无录制分项复测。本轮依用户要求暂停，没有新建/运行下一短测。

## 正式复工：无录制分项已完成

见reports/FOREARM-UNRECORDED-c9f074519f18.md。四组实际房间对照确认坐稳authored的持续CPU瓶颈：close/room平均48.29/44.55ms，fit全部真实子步42.94/39.65ms。0pageerror，仍未合入。局部数据准备/分配优化仅是下一建议，尚未实施。浏览器窗口已归还。
