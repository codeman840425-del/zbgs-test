# M1B 男性候选资格核查

核查日期：2026-11-14。当前女性样板归为 M1A；本文件只建立 M1B 候选，不表示男性已接入游戏或通过动作验收。没有修改运行时、替换女性模型或最终锁定通用角色规范。

## 唯一候选及已取得文件

建议进入下一次实际接入的小样板：**旧 VRoid Studio β 0.14.0 Base_Male**。它是与女性 Base_Female 同一发布页的男性导出，不是把女性改名或整体放大。

发布页：[VRoid Studio CC0 models / OpenGameArt](https://opengameart.org/content/vroid-studio-cc0-models)。页面标作者 VRoid Project，提交者 **hecko**，提交时间 2024-12-24。提交者说明 bases 用 β 0.14.0 导出，未开优化。保留了 `assets-source/foundation-male/publisher-page.html` 与 `source.json`，许可边界单列于同目录 `LICENSE.md`。它是第三方导出来源，不能写成已经与 pixiv 原始导出逐顶点认证。

| 文件 | 位置与指纹 |
| --- | --- |
| 下载包 | 原下载包 14,825,707 bytes；不重复纳入 Git，恢复脚本内存校验后只保留 VRM |
| ZIP SHA-256 | `8a6049236aae93a31392c56cf2606bd2d3a74711c156e34225616f1ab3cc91b8` |
| 原始 VRM | `assets-source/foundation-male/Base_Male.vrm`，17,914,788 bytes |
| VRM SHA-256 | `ab9af434a229283c192546486f9e6eb9cd855bf7d8d45b5037ac211938cb903c` |
| 可编辑重建 | `assets-source/foundation-male/base-male-candidate-editable.blend`，Blender 4.5.9 LTS + VRM Addon 4.10.5 导入后保存、纹理打包 |
| 数值报告 | `evidence/m1b-selection/audit.json`：原始 glTF 结构、骨架、皮肤射线、女性对照、Blender 网格与真实 morph 位移 |

ZIP **只有 VRM**，没有 `.vroid`、原始 `.blend`、发型编辑器参数或身体 morph 参数。保存的 `.blend` 是可编辑重建源，不是恢复失落的官方工程。本轮未进行再导出，也未证明浏览器 roundtrip 一致性。

直接下载：[base_male.zip](https://opengameart.org/sites/default/files/base_male.zip)。可重复执行：

```powershell
python assets-source/foundation-male/fetch-candidate.py
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python assets-source/foundation-male/audit-candidate.py
```

## 来源与许可边界

原 VRM meta 标 `licenseName=CC0`、Everyone、commercial Allow，其他许可 URL 包含 modification / redistribution allow。发布者也标 CC0。这与 [pixiv 官方旧 New model 页面](https://vroid.pixiv.help/hc/en-us/articles/900000088126-New-model) 声明旧模型 CC0、允许编辑使用相互支持。该官方页面本次通过网页工具读取；Python 直接保存 HTML 返回 403，因此未把不存在的本地 HTML 当作证据。

仍要区分 [当前 Studio Guidelines](https://vroid.com/en/studio/guidelines)：当前内容不是 CC0，公开生成或输出变形/组合模型的应用另有条款。不能据旧文件声明，把新版本预设、后加服装或第三方头发也一律纳入 CC0。当前证据支持继续用此旧文件做 Blender 编辑与游戏展示候选；未取得 pixiv 针对本项目随机生成服务的单独答复，也没有证明所有后续 Studio 工作流都不受当前条款约束。许可结论维持与女性源相同边界，不扩大解释。

## 实际几何与骨架结果

源包含两个 mesh：`Face.baked` 与 `Body.baked`，均带 skin。Blender 成功导入 Face 2,056 vertices / 3,168 polygons、Body 7,822 vertices / 12,008 polygons；UV、67 个 vertex groups 与面部 shape keys 保留。

皮肤材质 `M00_001_01_Body_00_SKIN` 有 **7,340 个三角面**。以 hips/chest 高度插值得到 7 层，在 X = −0.065 / 0 / +0.065 的中央胸腹/盆区投射 21 条 Z 方向射线，全部得到两个不同深度交点。诊断仅保留真实皮肤三角面、赋不透明灰色练功服材质，正背面渲染可见连续胸腹、臀盆、四肢。它没有原旧角色的“上衣下胸腹空洞”问题。尚未证明完全闭合流形、肩腋/裆部所有极限动作或衣服下变形均合格。

男女都映射 **54 个相同的 VRM humanoid 语义**，包括双腿、脚趾、双臂、手指、眼、胸和上胸；集合无缺项。因此现有语义重定向接口值得复用，但比例不是一个统一缩放值：

| rest pose 测量，米 | 男 | 女 | 男/女 |
| --- | --- | --- | --- |
| hips 高度 | 1.00826 | 0.90973 | 1.1083 |
| 左大腿＋小腿骨长 | 0.84496 | 0.76814 | 1.1000 |
| 左上臂＋前臂骨长 | 0.46872 | 0.43355 | 1.0811 |
| 左右上臂根部间距 | 0.29555 | 0.21736 | 1.3597 |
| 左右脚踝间距 | 0.09914 | 0.09301 | 1.0659 |

这既证实不是整体放大的同一个比例，也说明不能把女性裤腰、衣袖、椅座、手掌支撑位置或鞋底 patch 索引直接复用。鞋底仍须按该模型实际骨骼权重重新选取；不能恢复旧横向邻近选择错误。

## 表情与服装的真实能力

男脸有 **54 个 morph targets、14 个 VRM 表情组**；女脸 56 / 15。男脸有 A/I/U/E/O、Blink、Blink_L/R、Angry/Fun/Joy/Sorrow/Surprised，不含女性的 Extra 组。不能按女性 morph 数字索引硬套。

已检查真实顶点变化：双眼闭合影响 606 个顶点，最大位移约 28.75 mm；A 口型影响 615 个顶点，最大约 17.85 mm；其余四个元音与左右眨眼也有非零变化。Blender 实际渲染 neutral、blink、A：可以闭眼和张嘴，未检中文实时口型同步及组合表情。

Body 没有身材 morph。原衣物有各自 primitive/material：Tops 2,004 triangles、Tie 92、Bottoms 1,624、Shoes 540；与皮肤可按材质分开。但它们仍装在同一个 Body mesh 对象中，**不是已经建立独立服装资产库**。上衣还包含纹理表现的短袖衬衫与背心，不能当作两个可独立换层的成品。下一步应在重建源分离实际几何并核对权重、UV、遮挡，不直接套女性成品服装。

## 可观看证据与下一小样板

本次已打开检查以下渲染；这些是 Blender 静态候选预览，不是游戏截图：

- [原材质正面](/F:/gamemake/evidence/m1b-selection/male-original-front.png)。短发男性动漫外观与当前女性属于同系列，但精细度、发型及最终画风仍由实际样板决定。
- [真实体表正面](/F:/gamemake/evidence/m1b-selection/male-surface-front.png)、[背面](/F:/gamemake/evidence/m1b-selection/male-surface-back.png)。诊断删除预览副本的外衣/鞋/头发面，皮肤覆盖灰色材质；保存的可编辑源保留原材料与几何。
- [脸部 neutral](/F:/gamemake/evidence/m1b-selection/male-face-neutral.png)、[blink](/F:/gamemake/evidence/m1b-selection/male-face-blink.png)、[A 口型](/F:/gamemake/evidence/m1b-selection/male-face-aa.png)。

建议下一可观看 M1B 最小样板：此男性重建源 roundtrip 导出；同一房间中可切换女性/男性，各自独立 profile；男性先练功服与从原模型分离的一套裤装；实跑站立、三速走路/起停/换向、坐下起身、短舞与眨眼口型。复用成熟 UAL 动作，但重新量步长比例、鞋底、座面、手腿接触和服装遮挡。先完成一套男性全过程，再判断第二套轮廓服装，不能先批量资产。

**进入可复用规范的必要条件：** 男性真正进入同一生产流程和浏览器动作回归，再把已共用的语义、材质角色、接触校准与导出要求提为规范；当前女性参数仅是 M1A 实例。身高胖瘦、换脸换发和大量衣库适配仍是后续任务，本候选没有自动提供这些功能。

本次完成：一个同源男性原文件、可编辑导入、来源留档、骨架/比例/体表/表情证据、静态预览。未完成：游戏接入、动作/服装/空间/性能验收、浏览器 roundtrip、最终画风选择。未付费、注册或联系第三方。

候选记录已晋级为可版本管理目录；精选六张预览与紧凑数值报告在 `evidence/m1b-selection/`，`manifest.json` 记录原件、重建源、生成脚本和证据的 SHA-256。未将下载 ZIP、重复 glTF 展开或长渲染日志纳入候选记录；未做 commit。
