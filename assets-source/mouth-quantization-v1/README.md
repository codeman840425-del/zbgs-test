# 男嘴 −12%：明确 glTF 量化的隔离源候选

只处理已定位的男性嘴 −12% 源 NORMAL 比较失败。原源、原四端点、公开 recipe 与 runtime 全部未改；本包没有新幅度/逐点修正/阈值调整。新模型是 **Blender 作者源经过明确规范化的交付导出**，不是 Blender addon 原样导出。

固定原男性 SHA `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`；新模型 `candidate/avatar.vrm` SHA `68a1050af661809282ad736add798f72187f69f40347abc3a3ac7dbe61a8de7a`；新 recipe `candidate/male-mouth-width.recipe.json` SHA `579f489bf1371f9171f6102d43815b4fd82004405ac3d103c77529cb2dc9d7fa`。新 id `male-mouth-canonical-v1`，仅 `[-.12,0]` 两个实证值。它未被安装到产品。

## 原理及生产合同

作者源路径先将变形后的 Basis 与每个 absolute shape 存为 Float32，再导出相减的 morph；运行路径对原 glTF Basis 和 relative delta 各施加固定仿射，再各存 Float32。浮点舍入与减法不交换。在 Sorrow、FaceMouth v314 的两片约1.74/1.44mm²口腔面，邻点约0.87–2.60nm的位置差足以产生约1.107e−5法线分量差。这不是要单独移动v314或给法线加补偿。

本版本统一交付边界：从已锁原 glTF 和**作者真实拓扑映射/固定权重**计算 `B'=f32(c+(B-c)*s)`、`D'=f32(D*s)`，`s=1-.12*w`；零权重点原字节保留。只规范化存储，不改源操作域/12%参数。所有54个 morph 与Basis都须同原 Blender raw 满足既有 `3e-7m` 位置门，保护点须精确一致。每个最终 absolute shape 的几何法线在已序列化 Float32 `B'+D'` 的 Float64 和上重算；正常邻域外保留 authored NORMAL。不是只用运行法线覆盖不相同的源位置。

保留完整可编辑链：

1. 原底 `assets-source/foundation-male/base-male-candidate-editable.blend`（原规范/参数沿 mouth-visible-v2）。
2. 已保留的作者端点 `assets-source/mouth-visible-v2/generated/male-mouth-width-88-v2/editable.blend`，SHA `3f868cc51362c195a5dc77eae72058c91e357bbdde132c9b4070b71c8fb0cc82`；不为本包重复复制或覆盖。
3. Blender 4.5.9 + VRM addon4.10.5 导出作者 raw，SHA `1b7579a040b85576b4b888a983741bc1ad7494b25d5dac18d65697084e5f337e`。
4. 本包 `generate.py` 做上述固定量化/法线步骤生成新最终文件。

只重新打开作者 blend 再导出不会直接得到本包final，必须执行第4步。`rebuild-author.py`是旧已冻结生成器的有出处隔离副本，只限制男性−12%与新输出路径，几何算法不改；当前实际从原底重建、两次raw导出、再次规范化所得 avatar/recipe均逐字相同。editable容器不声明字节重复；raw/final的复现依据在 `evidence/mouth-quantization-v1/rebuild-comparison.json`。

## 通过的范围与没有通过的范围

- 独立解码作者raw与final全部55形态：最大位置差3.026798e−9m，全部未编辑点/284内部口腔点精确不变，32口缝最大0；Body、UV、权重、骨/rest、表达映射、纹理/材质不变。
- 独立 `math.fsum` 按点汇总法线（不导入生成器/normal_core/runtime）误差最大5.151861e−8，小于原1e−5门。相对raw无新增退化/翻面，最大三角法向变化0.000363154°。
- 实际现有运行模块、现有公开旧recipe，在同一CPU夹具中重现旧final失败1.105666e−5；新final所有形态 POSITION差0、NORMAL差最大1.776357e−15。原门槛没有改变。
- **该运行门证明现有算子与新规范源一致，不代表新recipe id/SHA已被产品准入。** 未做GPU/浏览器或新观感验收，也不反向改旧失败报告。

## 复跑与保留

从仓库根运行，输出目录必须不存在。新检出不要求ignored raw存在；先从已保留源重建raw。环境依赖复用锁定Blender/addon和现有Python NumPy；无需新增模型或安装包。

```powershell
python scripts/mouth-quantization-v1/verify-retained.py
& 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/mouth-quantization-v1/rebuild-author.py -- --out author-rebuild
python scripts/mouth-quantization-v1/generate.py --out canonical-repeat --raw assets-source/mouth-quantization-v1/author-rebuild/male-mouth-width-88-v2/addon-export.vrm
python scripts/mouth-quantization-v1/check-source.py --raw assets-source/mouth-quantization-v1/author-rebuild/male-mouth-width-88-v2/addon-export.vrm --endpoint assets-source/mouth-quantization-v1/canonical-repeat/avatar.vrm --out evidence/mouth-quantization-new-source-check
node scripts/mouth-quantization-v1/check-runtime.mjs --endpoint assets-source/mouth-quantization-v1/canonical-repeat/avatar.vrm --out evidence/mouth-quantization-new-runtime-check
```

仓库保留candidate canonical模型/recipe/generation、脚本、manifest和本报告；作者editable/mapping/selection沿已版本化旧包依赖，哈希逐项列manifest。`author-rebuild/`及`canonical-repeat/`是可重复的raw/blend/final重复输出，忽略但不删除本机文件。最大保留单文件20,647,904bytes，无>90MB单文件。固定SHA不因缺件或比较失败改写；缺依赖应按原工具恢复，不伪造验证成功。

旧保存兼容建议：现有v5记录继续使用其原recipe id/SHA；其运行几何无需改变。新id如决定接入，须独立清单准入、明确保存版本关系，不能给旧recipe换字节或把旧失败改成通过。也可先只将本规范源作为当前算子的新增参考证据，保留旧历史reference；这不需要改变产品形变数学。此包本身不作迁移或发布。
