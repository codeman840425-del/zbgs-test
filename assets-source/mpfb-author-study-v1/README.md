# MPFB 原作者 targets 样例学习复现

本包实际执行 MPFB 固定 commit `9de0707fdc88438d7c53a1a2ac7937d9221e2431` 的 `script_samples/02_working_with_modeling_targets.py`。原脚本与两个 target 文件字节保持原样，权重分别为 `1.0` 和 `0.5`。输出状态为 `original-target-sample-readback-passed`，覆盖原作者形态加载及可编辑源重开。

## 实际输入与环境

- 原仓库为 https://github.com/makehumancommunity/mpfb2 ，固定代码 manifest 为 MPFB `2.0.18`。
- 使用既有 Blender `4.5.9 LTS`、build `8bf95cbd38d1`。binary SHA256 为 `42c096b04d79bd0ff234429f67178881047c1c370d25ad3aef2766f3eeac4024`。
- archive 下载 `46,052,151` 字节，包括 tree 响应的总下载为 `46,919,538` 字节。固定 tree 的未压缩源码总量为 `79,712,290` 字节。实际只提取完整 addon、自带样例 02、README 及许可证，逐项 Git blob 和 SHA256 记录在 `prepared/source-receipt.json`。
- 未下载 `makehuman_system_assets` 或其他衣库。原脚本只消费 addon 内置基模、宏观 targets 和两个鼻部 targets。
- `experiments/tools/mpfb-author-study/private-user` 隔离 Blender config、scripts、extensions、MPFB cache/log。使用标准本地 extension repo 注册和 `--offline-mode`，未改全局 Blender 配置。
- 原 sample 副本在 `original/`。`blender_worker.py` 只接入本地扩展、执行原文件、回读几何及保存重开。清空 factory 默认 cube/light/camera，并给生成的两对象加学习用角色标记，未改作者目标公式或形态参数。临时关闭 helper mask 仅用于完整索引读回，随后恢复再保存。

## 运行入口及输出

在新的同构项目检出中，工具和本包输出目录尚不存在时执行。

```powershell
python assets-source/mpfb-author-study-v1/prepare.py
python assets-source/mpfb-author-study-v1/run.py
```

既有 Blender binary 须在上述固定相对路径，且 SHA 匹配。准备入口拒绝覆盖工具源或既有 receipt，运行入口拒绝覆盖既有日志及 readback。保留失败后需明确新的实验身份，不自动覆盖或重试。

生成的 `generated/mpfb-original-sample-02.blend` 包含两个人物和可编辑 shape keys。两个对象在作者指定 X=-1/X=1 处，中性宏观 target stack 相同。`generated/create-readback.json` 和 `reopen-readback.json` 记录实际组件、keys、权重、完整与可见拓扑、局部 bbox 和位移。`evidence/mpfb-author-study-v1/execution.json` 保实际执行命令、日志身份、资源观测及执行时的 worker/runner SHA。

## 本次实际结果

| 检查 | 结果 |
| --- | --- |
| 原作者脚本执行与环境修正次数 | 执行一次成功，环境修正零次 |
| 完整源网格 | 每体 19,158 顶点、18,486 面，含 helpers |
| 默认 helper mask 后可见网格 | 每体 13,380 顶点、13,378 面 |
| 作者 target 索引并集 | 506 点 |
| 实际变化顶点 | 459 点 |
| 最大实际位移 | 0.00548634185143863 米 |
| 原 gzip XYZ→Blender X/-Z/Y、源 scale 与作者权重独立算术对实际评估坐标最大误差 | 6.790167572440293e-8 米 |
| target 索引并集外 | 18,652 点，实际位移全部为零 |
| 两人物基础坐标与面索引 | 精确相同 |
| 独立进程重开 `.blend` | 原 target 权重、组件、拓扑及所记读回数值相同 |
| create wall / RSS 采样峰值 | 2.526 秒 / 234,459,136 字节 |
| reopen wall / RSS 采样峰值 | 1.268 秒 / 225,128,448 字节 |

位移按对象局部米制比较，排除作者为了并排观看设置的两米世界位置差。算术比较容许 1µm 的 Float32 求值误差，本次实际误差约 67.9nm。最大位移并非鼻宽差，保持原作者位移指标定义。RSS 为开发机进程采样值，未做普通机性能结论。

## 组件、许可与后续边界

原版 02 只有两个默认基模和形态 keys，实际材质槽为空，armature 为零，未加载独立眼/牙/发、皮肤、衣服或表达。helper mask 与 152 个制作 vertex groups 保留。本次没有渲染、VRM/FBX 导出、游戏注册或八预设生产，尚无实际材质画面、二次元风格和动画适配结论。

`original/LICENSE.md`、`LICENSE.CODE.md`、`LICENSE.ASSETS.md` 是固定仓库的原始许可证。其源程序为 GPL3-or-later，bundled 基模、targets 等数据为 CC0，作者对输出的数据归属说明保留。原脚本作为 GPL 源码连同许可证保存，未把脚本许可与生成几何的许可混同。本轮没有第三方 asset pack。

本次确认原作者基模加已制作 target 的实际生产入口可运行、源可编辑、保存可重开。新衣服的中性版型、MHCLO 分组/对应、骨权及表达接入属于后续单独原版学习步骤，当前没有执行。
