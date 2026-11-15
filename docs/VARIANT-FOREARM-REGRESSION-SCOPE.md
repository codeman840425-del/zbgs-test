# 派生体在前臂升级后的待验范围

只读审查当前工作树，未启动浏览器或Blender，未改产品。可复算：`node scripts/audit-variant-forearm-config.mjs`。精确源码/资源SHA、各装备身份结果见 `evidence/variant-forearm-config-audit.json`；不是固定版本实际房间验收。

## 已确认事实

| 项目 | 下颌 m1a-jaw-v1 | 腰臀 m1a-waisthip-v1 |
| --- | --- | --- |
| 实际body SHA | 3c11caae…691011 | 10778174…1743b5 |
| 配置/实际body与4件装备身份 | 全部匹配 | 全部匹配 |
| forearmCollision配置 | 未配置，运行时null | 未配置，运行时null |
| 女原体前臂profile验证 | 因body SHA不同拒绝 | 因body SHA不同拒绝 |
| 对应握麦profile | manifest无精确匹配 | manifest无精确匹配 |
| 当前独立座厚 | .01121m | .01105m |

`foundation-profiles.js`只给female/male原体配置v2前臂文件，两派生体不展开/继承female对象。`foundation-avatar.js:20`将未配置者保留为null，再传给motion；`motion.js`的calibratedForearms验证失败后使用legacy-uncalibrated-rails（无profile时仍添加固定.012m前臂段）。因此两派生体**可以走到旧碰撞路径，但没有进入新校准包络**；不能拿female新包络结果判它们通过。对派生体加`?forearm=legacy`也不会构成新/旧有效A/B，因为默认已经为null。

`referenceBody:"female"`在livePresentation中选择外观/附件初始适配族，不替换avatarSha256。`live-presentation.js:loadGrip`按精确avatar SHA查manifest，现manifest仅原female/male；两派生体握麦会明确拒绝。此为正确身份保护，不应通过复制female条目、改SHA或静默用原握姿来“修好”。眼镜仍可单独加载，其贴合未由此代码审查证明。

## 制作机制与边界

`scripts/m1-variants/build-variants.py`按样件种类，仅对jaw的Face或waisthip的Body施加空间位移；同一Basis位移加到所有形态键，保持原索引/权重/骨架。现spec的腰臀位移在局部Z区间约.74–1.18m、X中心附近衰减。这个机制解释为什么可以复用前臂**生成方法**，不能证明导出后前臂顶点/皮肤半径完全相同；本轮没有重新比较逐顶点蒙皮。若要启用校准包络，须从每个实际body生成自己的文件和SHA绑定，证明覆盖及误差后再接配置，而不是复用female已通过结论。

## 最小真实回归，不扩大参数库

1. 冻结一个精确build，分别加载两派生体；核body/equipment/profile身份和初末稳定性。明确遥测为legacy或新生成的calibrated包络，避免用null A/B冒充校准比较。
2. 各自裤/裙的三椅接近→坐下→坐稳→起身，在最终蒙皮与最终手层之后测掌/前臂/衣物间隙及穿插；腰臀样件特别核侧腰、臀座、裙前折及手从膝到腰的路径。保留各自座厚，不从原female或另一派生体复制。基础体可作为同动作解剖对照，不能替代衣服表面测量。
3. 因共享motion新增了进入跑步相位与无支撑停止修补，两样件至少执行真实.76–.79加速窗口、.05停止、旧ca72停止/airborne退出定点，记录actual soles/support/all-clamp；检查改变的身体/衣物表面与走跑转向/停止连续片。无需先重复270全矩阵，但这几项未过不能继承341女原体通过。
4. 同body连续1×站走跑转→坐起→技术舞/招手，检查最终手层与裙碰撞、左右定义及中断，拍同镜头全动作。原female前臂性能/几何数据不能代替此组合；记录缺陷，别只挑一张站姿。
5. jaw再查blink/aa/happy与左右视线/眼镜：局部脸几何改变后眼睑、嘴/牙齿及颌颈接缝仍需真实图。已有1791检查可作历史参照，不能用作当前运行时通过。waisthip重点衣裤裙与坐姿，并做最小脸部加载冒烟即可。
6. 如包含直播持麦，当前应先验明确拒绝且清理/取消正常；需要实际持麦时，先独立导出对应grip身份/握点再验。两实例同时加载一个原体一个派生体，确认null/profile、座厚、表情和附件失败不污染对方。

此次仅确认了资产身份和具体运行分支。两派生体的新前臂校准、当前走跑/停止/服装完整链、麦克风适配与连续自然度均未在本次执行，不能升级能力状态。
