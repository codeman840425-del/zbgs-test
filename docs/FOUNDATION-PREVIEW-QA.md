# 完整人体候选：运行与再导出独立检查

日期：2026-11-14。最终检查绑定 **c14a9e3b4083**，`http://127.0.0.1:4191/foundation.html`，再导出对照加 `?source=roundtrip`。这是资产资格页，不是主房间角色已更换，也不是新身体的足地/椅面/服装接触验收。

## VRM0方向问题确实发生，修复后已复核

早期候选 da825e30bc68 原地 Walk 的双手举过头、膝盖向身后弯。量化：双手高于头部约0.22～0.30m；坐姿膝相对髋朝 −Z 约0.344m，而脸朝 +Z。normalized 与 raw 骨点几乎完全一致，因此不是漏调用 VRM 更新，也不是蒙皮未执行。

负责人修复了 VRM0 局部动画坐标转换（四元数x/z与位置x/z的版本限定转换）；仅旋转整个scene不能代替动画轨道转换。修复后双手在走路时低于头约0.45～0.53m，坐姿膝相对髋为 +Z 约0.349m。已看前/侧完整走路、坐下/坐姿/起立和短舞蹈连续片及帧图，未再看到这次反向肢体问题。没有修改旧VRM1分支的轨道转换。

失败画面/骨点保留于 `output/playwright/foundation-qualification-failed-vrm0/`，修复后开发版检查在 `foundation-qualification/`。最终固定版本短片另存，不覆盖前面失败记录。

## 原件 → Blender → 再导出：最终同刻对照

主代理提供 Blender 4.5.9 + VRM addon 4.10.5 再导出。本岗位独立加载原件及再导出，不根据导出日志认定一致：

- 同时刻测试：参考姿势、Walk t=1/3s、SitIdle t=5/12s、Dance t=.25s；另在参考姿势施加 aa、blink、happy 各1.0。
- **896个实际被索引引用的网格顶点样本**，按参考姿势空间位置匹配，匹配容差0.05mm，全部找到对应点。允许导出重排索引和重复顶点，不要求数组编号相同。对每个姿态独立调用 `SkinnedMesh.getVertexPosition()` 后转世界坐标。
- 七个状态中最大抽样顶点差 **0.000527mm**，21个关键 humanoid 骨点最大差 **0.000270mm**。这是抽样一致性证据，不是所有拓扑、UV、法线、材质和极限姿势的逐项形式证明。
- 面部保留56个 morph 通道、15个VRM表情组。aa / blink / happy 相对中立状态的抽样顶点最大形变分别约 **12.75 / 32.01 / 25.63mm**，所以不是两边都没表情而得到零差。Body仍没有体型morph，不能声称胖瘦/身高参数已经存在。
- 逐对截图包含脸部近景、同刻坐姿和走路；原件/再导出各补了原地走两周期、坐下和坐姿短片。当前抽样和画面未发现再导出造成反向骨骼、爆炸顶点、丢失上述表情或明显脸型变化。

证据：

- `output/playwright/foundation-roundtrip/c14a9e3b4083/observations.json`
- 同目录 `original-*.png` / `roundtrip-*.png` 同刻对照。
- `output/playwright/foundation-qualification/c14a9e3b4083/original/qualification.webm`
- `output/playwright/foundation-qualification/c14a9e3b4083/roundtrip/qualification.webm`
- 临时固定2b31a31c4d51对照留在其独立ID目录。

可复跑：

```powershell
$env:QA_BUILD='c14a9e3b4083'
node scripts/qa-foundation-roundtrip.cjs http://127.0.0.1:4191
$env:QA_FOUNDATION_URL='http://127.0.0.1:4191/foundation.html'
$env:QA_FOUNDATION_LABEL='foundation-qualification/c14a9e3b4083/original'
$env:QA_FOUNDATION_SHORT='1'
node scripts/qa-foundation-preview.cjs
```

## 完整身体与仍未通过的边界

中性材质下胸腹、臀盆和四肢表面可见，走/坐/短舞观察没有重复原角色的大片胸腹缺面；来源审计另有躯干射线证据。但本次没有完成全身封闭流形证明、腋下极限举臂、所有扭转组合、不同体型、男女版本或任意服装的验证。1秒Dance_Loop也不能覆盖全部极限动作。

这里**没有使用旧角色专用鞋底IK、椅子高度或服装修正**。原件在坐下源动作的抽样网格最低可达约 −5.08cm；原地播放不代表脚底已贴地，画面也没有可验收的椅子。新体型足地、椅面与衣物接触仍是未标定项，不能把裸足新基模成功重定向等同于旧体型问题已修复。

通过的是受限范围：反向重定向缺陷已修复，已测试的骨点、蒙皮样本、表情与原件→Blender→再导出链路一致。当前只能继续小范围资产制作验证，不能据此批准批量角色/衣库、完整捏人或最终画风。
