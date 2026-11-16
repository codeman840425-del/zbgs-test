# 独立 vest 源读回

审查固定在 `fe5ea67cbae9cd517bf57ca7047f411cf8403d56`。脚本以 `git show` 读取该版本，root 后续修复和重生成不会改变本报告输入。当前结论为 **metadata-blocker-geometry-static-verified**。

## 独立确认

- 三套真实导出 GLB 都精确符合共同 `2.25213623046875mm`、model `[0,0,-1]` 位移。原图四面 `894/901/903/904` 给出六核点，一圈十二点，实际位置变化十八点、法线变化三十六点、受影响面五十二个。没有逐案例的位移幅度。
- 按原 POSITION 和原 NORMAL 精确分组，独立用 `atan2` 角权重重算法线，三套 Float32 法线结果与导出字节相同。原节点、skin/IBM、拓扑、UV、JOINTS/WEIGHTS、材质、texture/image、alpha 和 bow 保留。原 binary 前缀也完整保留。
- 形状复算保留正朝向，边长比约 `0.986541–1.022722`，最大相邻面二面角变化约 `3.01994°`。source core 与 negative-Z 方向的法线点积至少 `0.9813`。记录姿态中的位移均朝镜头，六核点方向余弦至少约 `0.9596`。
- 源与实际 paused capture 的 LBS 复算最大点误差小于 `9e-16m`。原 JOINTS、骨名顺序、IBM 和索引与 capture 一致。capture 权重经过 GLTFLoader 的 Manhattan 归一化，与原 GLB Float32 权重略有不同，最大约 `1.1921e-7`。按实际 loader 规则归一后逐值完全一致。这不是新 GLB 改写原权重。
- body、top、bottom 和四输出文件全部实际 SHA/bytes 对应固定输入。九状态来自三套 source-bind、三套实际 paused capture、三套借用原女 live palette 的虚拟求值。原女 paused 与 virtual 数值相同，九状态不代表九段动作。pose receipt 的 build 为 `ed2153a2d822`，实际 body SHA 与各 copied/upstream pose 一致。

## 独立间隙测量

本次对真实五十二面与**所有裤三角**做投影重叠计算，未沿用作者的有界 pants candidate 列表或 gap 函数。source-bind 采用负 Z 射线，其间隙在重叠凸多边形上为仿射函数，最小值由顶点取得。透视状态分别计算实际射线距离样本和整个重叠区的保守米制下界。

| 身体 | bind 下界 mm | paused 下界 mm | virtual 下界 mm |
| --- | ---: | ---: | ---: |
| 原女 | 1.458423 | 2.013943 | 2.013943 |
| round | 0.502039 | 1.073934 | 1.077717 |
| soft | 1.030059 | 1.598110 | 1.595744 |

透视下界用标准投影关系 `z_camera=-P23/(z_ndc+P22)`。两三角的 NDC 深度差在重叠多边形上仿射，取其顶点最小值，并用两分母在顶点的最大绝对值乘积作下界。相机为刚性变换，世界射线距离不小于 camera-Z 差。所有 clip W 为正，深度顺序满足该推导。此为 Float64 数值计算，没有 interval/exact predicate 认证，也不是所有表面点之间的全局 Euclidean 最近距离。

原三套 bind 最小 gap 独立复算为约 `-0.793716/-1.750092/-1.222072mm`。加 0.5mm 目标和 2µm reserve 所需共同幅度，与实际幅度差小于固定 0.1µm 解算容差。详细原/新临界三角、点坐标与全部九状态数值见 report.json。

## 接入阻断

原女 `generated/female/fit.json` 的 `bottom.id` 和 batch manifest 的 `bottomId` 都为 `m1-uniform-skirt`，但同一 dependency 的路径、SHA 和真实文件为 `m1-training-pants.glb` / `9e41d6…7aa92`。被声明裙 ID 在原 equipment manifest 的真实 SHA 为 `065305…8d8d`，明确不一致。producer 用第一项 `slot=bottom` 的 ID 与显式 spec pants 文件拼接，触发该错配。round/soft 的 bottom ID/SHA 均一致。

主报告保留原错误身份。随后仅对 `4771fd58e2f941ef588bd6ade51f4425d3526fb9` 做补充 metadata 读回，见 `metadata-recheck-4771.json`。三套均通过，原女下装 ID 已为 `m1-training-pants`，body/top/bottom 的 ID、SHA、bytes 和 spec 一致，GLB 与本次已审几何逐字相同。

因此允许三套精确 Body+训练裤组合进入候选诊断运行。运行侧仍需落实 sidecar 精确依赖，动作和视觉验收尚未通过。补充检查没有重复几何求解或调用 producer build/qa。

新 entry 已剔除旧 `fitResource/materialRecipes/sourceResource`，使用新 top/fit ID，原 bindings 深度相等。保留的 styleId/sourceLicense 是款式族和历史来源，不可替代本次 top SHA、body SHA 或 bottom dependency。`runtimeDependencyEnforcement` 仍声明 root integration pending。

## 范围与重跑

```powershell
python -B evidence/m2-vest-layer-fit-source-audit-v1/audit.py
```

脚本只写本 evidence 的 report.json，使用固定 Git 输入，不调用 producer build/qa。作者的 77 条计数未作为本审结论。初版审查曾把 capture 权重误要求为原始字节，已依据实际 GLTFLoader 归一化纠正。独立二面角检查还覆盖了端点不移动但相邻面变化的外圈边。

本审没有运行 GPU、游戏、走跑坐起或衣物动态。Body coverage 由另一审查负责。已有未解释像素及运行浅色暴露不由本次静态层间 gap 消除。
