# 单次左手招手：源侧样件

本目录是新制、可编辑的动作源，初次离线制作时未改运行时。当前独立 `feat/m1c-greeting` 分支已接入最小候选，详见 `docs/M1C-GREETING-INTEGRATION.md`；**男女 VRM 的视觉验收仍未完成**，已按白名单集成主工作区源码，但未改动任何固定构建。源模型图采用真实蒙皮顶点的离线正交渲染，不是房间截图或游戏录像。

## 为什么没有直接用 Interact

已存 UAL1 `Interact` 长 2.0 秒。完整父节点 TRS / SLERP 按 240 Hz 求值，左腕向前范围 0.515 m、向上范围 0.425 m，随后回原位；右腕各轴变化只有 22–28 mm。正侧图显示左掌前伸再收回，没有挥手阶段。因此不把取物/交互动作改名为招手。见 `interact-audit.json` 和 `interact-source-views.png`。

## 样件、来源与修改点

- `wave-left-v1.config.json` 是可编辑参数源；`scripts/m1c/build-greeting-wave.py` 是离线制作及导出流程。
- `generated/greeting-wave-left-v1.glb` 保留 UAL1 的原始 67 节点骨架和蒙皮模型，新增 `Greeting_Wave_Left_Once_v1`，长 2.8 秒、120 Hz 关键帧。抬手 0–0.65 秒、两次小幅摆腕至 2.05 秒、之后收手。实际变化只有左上臂、左前臂、左腕及 15 个左指旋转；根、髋、腿、躯干和右臂保持源 Idle 的首帧参考。
- 原始文件 `prototype/public/assets/motion/UAL1_Standard.glb` 的 SHA256 为 `69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997`，制作时强校验。来自 Quaternius Universal Animation Library Standard，CC0；许可原文、归档来源见 `assets-source/m1c-turn/ual-source-audit.json` 和 `docs/ASSETS.md`。未取得作者 Blender 源工程；本样件的可编辑源是参数和脚本，GLB 保留实际骨架。
- 新姿势序列由项目程序制作，不是现成动作捕捉。离线两骨求解按源骨长制作抬手姿态，运行时不需增加这套 IK。手指展开使用原骨架静态开掌姿，掌面朝源 +Z，指向 +Y。
- 生成文件 SHA256：`eec4ef8ab2fb073f7674cc6e839cbad7aea6931e4b19e8e70c0ee46c5fda2d06`，1,566,668 字节。完整导出有 201 通道，其中只有 18 个旋转节点变化；其余为常量，不能整段覆盖游戏全身动作。

## 复建与实际检查

在仓库根目录执行：

```powershell
python -m pip install -r scripts/m1c/requirements-gesture.txt
python scripts/m1c/build-greeting-wave.py
python scripts/m1c/audit-greeting-source.py
python scripts/m1c/check-greeting-rebuild.py
```

`generated/source-qa.json` 和 `trajectory.npz` 保存连续 240 Hz 复算：可达超出量为 0，根/髋/腿/右手世界原点变化低于 1e-7 m，首尾左腕完全重合；抬掌区间掌法向 +Z 最小 0.9999999999、手指方向 +Y 最小 0.9775。最大左腕单帧位移 9.63 mm（240 Hz），只作源轨迹事实，不作自然度或目标性能通过证据。

`generated/rebuild-check.json` 证实重复导出字节一致。测试把腕摆参数从 14° 改成 20°，实际重读导出轨得到最大左腕旋转差 5.215°，根/髋/脚/右手世界矩阵差为 0；临时编辑输出只在 `output/m1c-gesture-rebuild/`，不覆盖原件。正侧六时刻图 `generated/wave-source-views.png` 已实际查看：可辨识开掌招手及收手，但静态源图不替代目标角色完整正常速度录像。

## 接口建议与待验证范围

导入数据见 `generated/gesture-import.json`，包含时长、SHA、源骨名和 normalized humanoid 语义。建议已有行为层增加 `playGesture('greeting-wave-left-v1', {restart:false})` / `stopGesture()`，这是源制作时的接口建议；独立接入候选使用统一 `__debug.command({type:"action",name:"greeting"})`，以集成说明为准。

只重定向 `layerMask` 中的 18 个左臂/左指旋转，使用现有 UAL→normalized 骨架适配，不写死目标 raw 名称；排除根轨、髋、腿、躯干、右臂和表情。每帧从当前底层 authored pose 取值，再混入该动作，最后由 VRM 同步 raw 骨。离线 Idle 首尾不是目标走路/讲话首尾，接入必须做渐入/渐出，建议 0.2 秒；打断回到**当帧底层姿势**，不回旧缓存。暂停跟随统一模拟时间；重复同请求默认不重启。

左手必须空闲。右手持麦时可以保留既有握持层所有权，但男女站/坐/走的招手+麦克风组合、袖口/脸/眼镜遮挡、手指比例及中断连续性均未实测，不得默认开放。首轮接入宜先空手站立，完整 2.8 秒正常速度正侧复核后再扩组合。舞蹈叠加不在本样件范围。
