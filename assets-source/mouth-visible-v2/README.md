# 原男女嘴宽可见端点 v2

本包实际制作原女性/男性 **−12% / +12%** 四个独立源端点，保留旧 ±4% 包，不改 runtime/public。源几何、表达和重新生成门通过；尚无本包的实际浏览器观看或产品验收。男性 jaw 的 +4% 不继承这些新配方。

## 为什么改变源作用域

旧 8 mm 算子直接放大到 +12% 时，男 `Face.M_F00_000_00_Fcl_ALL_Joy` 的 `M00_000_00_Face_00_SKIN` primitive 5、triangle 962、顶点 `[1011,1018,1350]` 法向变化 85.259°。原面积 14.696 mm²，变后 3.527 mm²，不是口腔/唇内极小三角；旧权重 `[0,0,.6221]` 让 Joy 中第三点向外移 2.641 mm，而另外两点固定。

只选一次 **24 mm** 测地 smoothstep 衰减（幅度从 4% 到 12% 三倍，过渡长度从 8 到 24 mm 三倍），没有试幅度/半径矩阵。该理由减少位移梯度，不是所有表情形变的数学质量保证。新同三角权重 `[.41528,.71412,.94721]`，法向变化降至 **21.799°**。原女最坏三角从 26.060° 到 23.719°；全域其他三角仍有更大变化，见下表，不能只报告旧峰消失。

新域距原鼻选点最近女 27.290 mm、男 32.529 mm；40 mm 内无原眼域点。原眉/鼻/眼的实际位置点与本域均不重叠。**法线邻域与鼻有女 8 / 男 4 点重叠**，组合必须从组合后的绝对 shape 统一重算相邻三角，不能最后写入某一单域 normal。详见 `transition-diagnosis.json`、`audit.json`。

原 FaceMouth 中，仅连接真实 32 对 Skin–Mouth 口缝的组件（口腔壁）联动；其余 **284 个断开内部点**在 Basis 和全部 absolute shape 中精确不动，保留牙齿等内部结构原形。没有仅缩放外唇并留下裂缝，也没有把整个牙弓变宽。拓扑分类并不等于已经证明牙齿与扩缩口腔壁所有表情都无相交，后续需实际张口/笑容观看。

## 已执行源门

| 端点 | Basis 变化点 / 最大位移 | 全 shape 边比 | 最大三角法向变化 | 中性口环宽 |
|---|---|---|---|---|
| 女 −12% | 190 / 1.971 mm | .876–1.345 | 18.797° | 24.931→21.939 mm |
| 女 +12% | 190 / 1.971 mm | .686–1.196 | 33.300° | 24.931→27.923 mm |
| 男 −12% | 188 / 2.767 mm | .794–1.431 | 13.023° | 40.800→35.904 mm |
| 男 +12% | 188 / 2.767 mm | .593–1.248 | 35.707° | 40.800→45.696 mm |

女 Basis+56、男 Basis+54 全部原 absolute shapes：无新增退化/法向反转，32 对口缝最大间隙为 0，284 内部点及所有零系数点精确不动。全部表达绑定映射、节点/rest、骨/权重/UV/index、Body 等非 Face 全属性、材质和纹理逐项未变。仿射位置最大误差 3.21e−9 m，relative morph 仿射最大误差 7.68e−9 m；并非宣称任意组合表情视觉已验。

每点固定 `A_i=diag(1+parameter*weight,1,1)`；Basis 与每个绝对 shape 使用相同仿射，relative POSITION 的 X 差分相应缩放。原 addon raw 导出只有 POSITION targets；final 在 251 点法线邻域对每个绝对 shape 单独重算，并导出 NORMAL 差分；域外保持原 authored normal。独立重算法线最大误差 <9.29e−8。未伪称原资产已有 morph NORMAL。

四端点均从原 pinned editable.blend 实际生成，保存新 editable.blend，重新打开并导出两次；之后从原底再次 fresh 生成并导出两次。raw VRM、final VRM、mapping、selection、normal-reference 在 generated/fresh-check 间均逐字相同。**editable.blend 容器本身字节不同**，已如实记录两份 SHA；其源/骨/属性/形态不变量相同，不能称整个目录字节一致。见 `fresh-check/rebuild-comparison.json`。

## 固定输入/输出合同

- 输入原女性 VRM SHA：`027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`；原男性：`62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。源 blend 路径/SHA 见 `spec.json`；两份原 VRM/blend 均再次核未改。
- recipe：`female-mouth-width.recipe.json` / `male-mouth-width.recipe.json`，使用现有 `character-face-geometry-recipe-v1` 结构、新 ID 和真实原底身份，参数实证值 `[-.12,0,.12]`。`recipe-manifest.json` 给精确 SHA；禁止把 recipe 改为 jaw SHA 绕门。
- final 模型：`generated/{female,male}-mouth-width-{88,112}-v2/avatar.vrm`；`addon-export.vrm` 是 raw，不能与 final 混用。每端点内包含 editable、原源映射、独立 normal-reference、表达映射、审计；fresh-check 为原底复做证据。
- 后续集成须看原/新同 camera、同表达的正侧面、讲话/张口/笑容、当前 Joy/眨眼兼容，以及嘴+鼻正常法线。未验的装备/派生身体/其他域大幅度不继承；本包不修改眉鼻眼端点。

## 可复跑命令

仓库根运行；输出目录必须不存在，生成器拒绝覆盖现有端点。正常复核直接执行 manifest `--verify`，不要为了重跑删冻结证据。独立检出时生成到新的 out 名，并按相应名字 finalize；当前 check-rebuild 固定比较已归档的 generated/fresh-check。

```powershell
python scripts/mouth-visible-v2/inspect-source.py
& 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/mouth-visible-v2/build.py -- --out generated
python scripts/mouth-visible-v2/finalize.py --out generated
python scripts/mouth-visible-v2/audit.py
& 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/mouth-visible-v2/build.py -- --out fresh-check
python scripts/mouth-visible-v2/finalize.py --out fresh-check
python scripts/mouth-visible-v2/check-rebuild.py
python scripts/mouth-visible-v2/diagnose-transition.py
python scripts/mouth-visible-v2/manifest.py
python scripts/mouth-visible-v2/manifest.py --verify
```

工具复用 Blender 4.5.9 / addon 4.10.5，后台限 2 线程，无 GPU/浏览器。首次只读定位脚本命名为 `inspect.py` 与 Python stdlib 冲突，未完成计算即失败；改为 `inspect-source.py` 后实际执行成功，没有更换模型或参数绕过。作者文件使用本目录 `-text` 保存精确哈希。manifest 不包含自身，也不包含 Python 缓存。
