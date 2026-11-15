# 13bb 掌指交叉与控制范围

**三组均包含真实有限三角相交，不能整体归为边缘浮点噪声。前两组明确处在当前手接触控制的跳过范围。最终五对是舞蹈结束切 idle 的当步残留，不是已执行稳定 idle 校正后的样本。** 本报告只对应 `13bb00a78605`，没有改标 7a86。

| 记录 | 实际状态 | body 对数 | 稳健几何穿越对数¹ | 交线中位 / 最大 |
|---|---|---:|---:|---:|
| row 91，4.608333 s | walk，sitProgress=0，runMix=1 | 203 | 199 | 1.532 / 14.024 mm |
| row 186，13.108333 s | dance，sitProgress=0 | 165 | 152 | 1.582 / 9.291 mm |
| row 258，20.241667 s | 刚切 idle，sitProgress=0 | 5 | 5 | 2.208 / 3.419 mm |

¹ 原交叉门完全未改。补充诊断条件仅为：几何交线长超过 0.1 mm，且两个三角都在对方平面两侧各存在超过 0.01 mm 的顶点。其余对也不能据此宣布无交叉，只是未满足此较强诊断。交线长度和无限平面有符号距离均**不是实体穿入深度**。原命中已经过材质 alpha 门，此处整条几何线未再次按透明纹理截断。

## 具体表面与位置

- 203 / 165 / 5 全属于 `Bodybaked` 的**右手指**面，非前臂/身体腰cap。前两组相交裙面为 293、294、415–420、459、461；最终五对全为 463。
- 从 13bb 精确装备清单读取并验证开腰裙 GLB SHA，以上 11 面均是 hips-bind y < .09 的**自由区侧面/褶面**；不是已移除腰封盖。最大事件面 459/461/463 原法线 x 约 +.977，原 hips-bind x 约 .152–.173 m，确认是侧边衣面。所有原位置、面索引、法线和材质名已附 JSON。
- approach 最大：body face 7189（右无名指第二节）×裙 459；世界线端点 `[3.782517,0.812315,2.391515]` 至 `[3.778600,0.825302,2.387960]`。两个端点位于裙三角内部，重心最小值分别 .172 和 .0536；不是仅沿裙三角边擦过。该身体三点到裙平面距离约 −0.035 / −2.067 / +4.845 mm，存在实际跨面。
- dance 最大：body face 7190（右无名指第二节）×裙 459；线端点 `[2.482109,0.814255,1.269104]` 至 `[2.479657,0.805627,1.271525]`；身体三点到裙平面约 +0.970 / +2.729 / −2.241 mm。
- final 最大：body face 6922（右食指第二节）×裙 463；端点 `[2.487209,0.830734,1.260779]` 至 `[2.486422,0.830224,1.264067]`。此处靠近衣片边但仍有 3.419 mm 有限交线，身体平面距离包含 +0.356 / −0.454 / +2.483 mm，不能简单作数值零处理。

面 461 是前两组 pair 最多的面（65 / 58），**不是最长交线所在面**。不同三角对可能共享空间，不能把 pair 数或交线相加解释为独立伤害/穿入体积。这里确认实际衣表几何相交，不宣称普通镜头下的视觉严重程度或连续片已审完。

## 代码与记录共同支持的控制范围

核对了 13bb 的恢复源码 `experiments/rebuild-skirt-13bb-6b7fe0b/prototype/src/`，并比较当前主线 `fitSeatHands`：该函数段正规化文本 SHA 均为 `797a5ca974fd1c36502fe8fd6496e7a2e9e4b5724c9c6e0d818333795b4ab347`。因此不依赖仅凭旧函数名推测。

1. `motion.js` 的 `sourceActive` 分支每次 update 调用 `fitSeatHands`；入口清空 `handContacts`，没有有效 radii 或关闭 footIK 时返回。
2. 明确判断 `leavingIdle = sitProgress <= 0 && requested !== "idle"`，随后直接 return（13bb 第 895 / 946 行）。旧缓存分支仅允许**没有**校准前臂且没有真实 joint-hand workspace 时；原女性精确配置同时加载这两者，因此这不是当前 walk/dance 的补偿路径。
3. 所以实际范围是：有裙表面的 idle，以及 sitProgress>0 的坐入/坐稳/起身；`turn` 在 main 映射为 idle，也可执行。不能笼统声称“只有 mode=idle/sit”。相反，已记录的 walk/dance 且 sitProgress=0 确实跳过，不只是一个假设。两行 `handContacts=[]` 与该代码路径一致。
4. 三组 live 状态均无麦克风、无招手、speaking=false，因此没有已记录的直播手层覆盖可解释这些掌指位置。
5. final 的空 contacts 不能解释成稳定 idle 不工作：13bb `main.js` 先执行 `rig.update`、avatar/garment 更新，然后在第 1647 行根据 `dancePlaybackComplete` 才 `setMode("idle")`。采集脚本看到 mode idle 立即结束舞蹈循环并 capture final，没有再 simulate 一步。因此 mesh 与 contacts 仍对应最后一个舞蹈 update，界面/动作状态已经是 idle。下一步 idle 会否消除五对，现有数据未测，不在此猜测。

## 复跑与边界

`python evidence/skirt-open-waist-13bb00a78605/contact/classify-hand-crossings.py`

输入为同目录原始 `actual-surfaces.json.gz` 与保留的 `experiments/rebuild-skirt-13bb-6b7fe0b/prototype` 源/资产快照；缺失快照时先按原 13bb 重建记录恢复对应 `6b7fe0b` 提交，不能拿当前 GLB 代替。输出 `hand-crossing-classification.json` 含全部 373 对、端点、重心、有符号距离、原始状态及输入/脚本 SHA。未重新跑动作矩阵、GPU、浏览器或更改控制器。
