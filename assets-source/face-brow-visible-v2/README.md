# 原男女眉高/眉距 +3/+3 mm 源端点

独立于旧 `face-brow-parameters-v1`，原女性/男性各一个组合端点：眉高 +3 mm、每侧向外 +3 mm（总间距增加 6 mm）。旧 +1/+1 mm 不改；不声明负向、独立单轴极值或派生身体已验。

已实际从两份 pinned 原 editable.blend 生成，110 个真实 FaceBrow 点按每侧刚性平移；Basis 和女 56 / 男 54 全部 absolute shape 同平移，relative POSITION delta 保持在 float 误差内。Body 全属性、骨/rest/binds、UV/权重/index、其他脸材质、贴图、表情绑定保持原样。`audit.json` 与 `normal-audit.json` 保存实际解码检查。

每个端点保存新 editable，重新打开导出两次；再次从原底 fresh 重做。VRM 与 mapping 字节一致，editable.blend 容器字节不同如实记录，见 `fresh-check-result.json`。不是只重开生成后的文件冒充原底重做。

## 仍需观看的风险

`source-inspection.json` 是原/候选全部 absolute shapes 的 CPU 正面投影筛查。16 个 alpha≥.5 的既有顶点/三角中心样点无新增穿皮或缺投影；女性 BRW_Sorrow 的最大离皮距离由 4.125 mm 增至 6.007 mm，**侧视悬浮风险未过**。透明网格边缘女有 4 次新增缺投影样点；没有删除这些数据。此前更密的 Basis alpha 样点也显示女最大间距增大，故不以“无三角翻面”宣称贴面合理。

本候选未作贴面补偿。若真实侧视发现浮起，最小下一修复是保持既定 XY 的 +3/+3 幅度，独立生成受源额头表面约束的深度适配并重验全部表情/法线，不能暗改本冻结 recipe 或缩小用户幅度。

所有眉三角在全部形态中的边向量误差≤7.46e−9 m；没有新增退化/翻面。刚性平移可让 runtime 保原 authored normal。addon 原生导出的 Basis 眉 normal 有女 2.58e−5 / 男 1.44e−5 的向量数值漂移，保护域 normal 精确不变；本包仍为 POSITION-only morph，没有伪造 NORMAL targets。

## 接口与保留边界

- `recipe-manifest.json` 固定男女 recipe 身份；schema `character-face-brow-translation-recipe-v1`，新 ID `female/male-brow-translation-visible-v2`，`testedCombinedEndpoint=[.003,.003]`，`heightVectors/spacingVectors` 为单位方向，sourceSpace 为 glTF mesh-local metres。
- 已补原底 `primitiveIndex/UV/NORMAL` 身份及完整 expressionNames。原 F027bed…/M62b44… SHA 完整值见 spec/recipe，不继承 jaw/waist。
- `generated/{sex}-brow-height3-spacing3-v2/` 的 editable.blend、avatar.vrm、mapping、表达/审计是 canonical。新嘴 ±12% 与眉位置点不交，全部形态的算子交换误差≤3.47e−18 m；不是任意组合视觉验收。
- `manifest.json` 的 `files` 是必须保留项；`reconstructibleFiles` 保存原生重复导出/fresh 二进制的实际哈希，局部 `.gitignore` 只排这些重复文件，未删除本地源。普通 `--verify` 明确只核保留包，`--verify-full` 核全部输出。

## 复现

Blender 4.5.9 / VRM addon 4.10.5，2 CPU 线程，无浏览器/GPU。原输入均从 spec 校验；输出目录不得已存在。冻结包日常使用 `manifest.py --verify`，勿删除必要源以重跑。

```powershell
& 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/face-brow-visible-v2/build.py -- --out generated
python scripts/face-brow-visible-v2/audit.py
python scripts/face-brow-visible-v2/check-normals.py
python scripts/face-brow-visible-v2/source-check.py
& 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/face-brow-visible-v2/build.py -- --out fresh-check
python scripts/face-brow-visible-v2/check-rebuild.py
python scripts/face-brow-visible-v2/manifest.py --verify
```

仅源候选可安装，不是实际游戏/用户观感已通过。
