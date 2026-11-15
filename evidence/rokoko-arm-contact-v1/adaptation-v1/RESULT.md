# 唯一一次局部上肢适配：封存，局部改善，仍有残余

用户硬约束：这段舞优化有且仅有一次，无论结果均封存；后期批量产出后再统一规则修复。已执行一次固定F/M算法/配置，绝无第二候选、窗口扩展或结果驱动调参。用户对原30秒视频转动画的有限认可独立保留，不将本派生自动升级接受。

## 方法与固定边界

仅3s与23s中心，各±0.75s五次平滑窗。实际目标skin局部有限16近邻躯干三角+测量前臂半径辅助最小变化，四个上/前臂局部rotation-vector共12变量，分量界±35°、每中心最大50次内部求解、固定损失权重。女/男3s都达到50次上限（success=false），23s分别16/24次终止。未追加求解。原始固定配置在fit.executed.py，fit.py已加存在报告即拒绝重优化保护。

只改6条上肢quaternion values；手局部补偿保原腕世界朝向。其余JSON轨道原文本字节保留，所有时间戳不变，根/下肢/躯干/手指完全原样。原资源与30秒电影不改。目标裸体/服装没更换。两中心最大局部旋转：女20.0/22.2°，男20.7/30.2°，并非宣称“几毫米微调”。

女skin离线固定raw映射跨3→23s有约5mm动态辅助骨差（男<.08µm）；因此每个求解中心独立使用该时刻实际raw映射，最终接游戏后直接采真实skin，不用映射代替实际结果。

## 实际回读与结果

038runtime+原新数据分别单清单运行（首次双清单因无clip.uuid而Mixer复用原action，失败包完整保留；详duplicate-uuid-validation-failed）。原唯一motion文件未因此重写。两体14姿×两版本实际skin、每体378个120Hz窗口腕轨迹、8部2秒1×原新电影，所有Chrome/server退出。

- 3s两臂skin互穿：女91→0，男105→0。实际前侧图中两条前臂可区分，交臂意图保留。
- 但女3s上臂/肘旁仍穿衣，正面出现明显肤色断边。上臂-body对数39→93等局部恶化未排除，不把前臂0推广全手臂通过。
- 23s右前臂-body女107→30、男95→0；右前臂-top女72→68、男88→45。有限计数不是可见严重度，实际衣侧仍有残余；13/22s等未覆盖问题保持原样。
- 120Hz原新时钟差0。实际腕朝向最大差女.0497°、男.0733°，来源于30Hz局部四元数插值/Float32回读；没有强制腕甩向。修改最大腕位移女77.0mm、男83.1mm；窗边最大差8.61µm。窗口内最大120Hz腕步长没有超过原片对应窗口最大值，但这不是完整自然度保证。
- 8片舞clock/wall比0.99905–0.99970，均真实正常速度；原版录片可能与root约6秒构建重叠，故不用于性能或细微抖动归因。新片录制独占。完整片保留，已查看全部4组低频连续时序图和中心实际近图；未冒称逐帧看尽或用户已接受新片。
- 上臂/衣袖相互影响未包含在代理最小化全量细节中，最终实际skin暴露了残余。代理0不当成穿插通过。轻微隐藏接触不新增硬门，但显眼肤色断边如实保留。

## 身份与复跑

- F unique motion SHA `3677cb727b6025bec6be25f03824ca60da20e39c73fed0484890ee4ff7996e2e`
- M unique motion SHA `5fe55028a0c48e76ec6a506475656f9486512c86c1fdd4b1bea0226300c50702`
- source exact JSON gzip、skin fixture、归档输入与fit-report全部保存。`export_saved.py --out <新目录>`从冻结offset重导，不跑优化；已实际重导两文件SHA完全一致。
- `dance-import-entry.json`是独立asset entry，不是共享清单修改。隔离固定目录analysis/rokoko-arm-local-v1仅改资源/清单；主runtime未改。不能在缺uuid旧loader同页加载两份normalized clip；root另修通用loader，此事不计动作二次优化。
- `capture.cjs`按QA_ARM_MODE=original/adapted分别与run-fixed-check使用原portable/new目录；`skin-crossings.py`只读实际皮肤gzip。`film.cjs`同法正常1×录片。

## 查看

`female/male-{original,adapted}-{3,23}-{front,side}.png`同姿近景，`female/male-{2-4,22-24}-timeline.jpg`全窗抽帧。
`female/male-{original,adapted}-{2-4,22-24}-1x.webm`正常速窗口全片。
详细 `verification-summary.json`、`skin-crossings.json`、`fit-report.json`。

结论：封存为一次局部适配有改善但未消除全部显眼穿插的成果。停止本舞优化；不提出第二组参数、不重做腿、不扩大衣服修复。后期统一规则由root另行安排。
