# 两派生体的独立源校准候选

生成时未接入产品；Root随后已在固定版49b3d2a24f21接入。每个profile由其实际VRM的位置、索引、LowerArm权重和inverse bind真实重算；不是复制female文件改bodySHA。`integration-plan.json`保留生成时的精确输入/输出hash、拟议URL和两次生成一致性，`proposed-config.patch`保留集成建议历史，已接入时不要重复应用。实际public文件由Root复制，不改生成时receipt。

在项目根目录执行（Python + NumPy；无需Blender、浏览器或网络）：

```powershell
python scripts/m1-variants/build-forearm-profile.py --input prototype/public/assets/m1-variants/m1a-jaw-v1/avatar.vrm --body-id m1a-jaw-v1 --expect-sha 3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011 --output assets-source/m1-variants/forearm-collision-v2/m1a-jaw-v1
python scripts/m1-variants/build-forearm-profile.py --input prototype/public/assets/m1-variants/m1a-waisthip-v1/avatar.vrm --body-id m1a-waisthip-v1 --expect-sha 10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5 --output assets-source/m1-variants/forearm-collision-v2/m1a-waisthip-v1
```

原女性控制重算：

```powershell
python scripts/m1-variants/build-forearm-profile.py --input prototype/public/assets/foundation/base-female-roundtrip.vrm --body-id female --expect-sha 027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95 --output assets-source/m1-variants/forearm-collision-v2/female-reference
```

实际结果：female-reference/profile.json与当前public female v2 **逐字节相同**（b2ef32aa…4103e）。两派生各重复生成，profile逐字节一致；生成算法本体约0.10–0.12秒/体，命令总耗时约0.5秒/体，仅开发机单次测量。计时receipt每次更新，因此generation.json不承诺逐字节相同。

本次两派生的实测前臂数据与原女性数据恰好相同：局部Face/腰臀修改没有改变生成器选中的前臂源面。它仍保留各自完整bodySHA身份；不能因为数值相同就跳过每体实际拟合。产品纯validator已分别接受自身SHA、拒绝原女性SHA，见identity-checks.json。

必须独立检查的变化：前臂粗细/手腕或肘周形状、权重、骨长、inverse bind、拓扑、非等比缩放，以及身体/衣服改变造成的坐姿空间关系。绑定空间包络覆盖仅证明所选LowerArm面；混合权重弯肘、最终蒙皮与裙面的交叉仍需动态复验。当前生成器不涵盖完整手掌/手指，不能解决原female起身已确认的掌指交叉。

49b3已按每一相同body/衣服/路径比对`forearm=legacy`与自身profile，保持源腕轨迹和动作时长。两派生100采样内前臂交叉均降为0，但起身掌指各15帧仍有交叉，整体接触gate失败；回执在 `evidence/m1-variants-49b3d2a24f21-forearm-ab/`。既有175原女性与派生数据仍不是单变量A/B。此结果不是连续视觉验收或目标设备性能通过。
