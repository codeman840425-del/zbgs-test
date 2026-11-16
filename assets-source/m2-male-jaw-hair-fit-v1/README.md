# 男性下颌派生的既有短发独立 fit v1

同款 `male-sidepart-v1`，新 fit `male-sidepart-jaw-fit-v1` / version 1。目标身体 `25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153`，作者原身体 `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。原男 fit 不改。此包完成源与导出检查，**不代表游戏/观感已经通过**。

## 为什么不改短发几何

实际原男/jaw节点、Head/Neck逆绑定和非Face属性一致。jaw仅98个下颌点变，头顶、后脑及明确的耳侧几何包络在全部54形态精确一致；三层头部截面一致（不是校准人体头围）。变动区域仅4对短发AABB候选，原/新严格相交均false。历史Face75、Body0静态交叉保留；不宣称透明度、共面或动态零穿插。详见 `evidence/m2-male-jaw-hair-fit-v1/geometry-report.json`，包含原始点号、坐标界、测量限制。

保持原GLB字节 `fb5fd49352b7bab0e6d2c0ec3f6e565f0004062e4a8975f1afcd93fb24dd48fd`，包括原 `extras.avatarSha256`；不改作者身份来伪造跨体兼容。新 fit 显式声明精确目标身体、原身体、资产、identity TRS、刚性raw-head-bind-local、原HairBack材质隐藏规则。原身体绑定未改，禁止双重逆绑定或VRM0旋转。

## 可编辑源与来源

`editable.blend` 是原短发可编辑项目的原字节保留：对象 `Hair_candidate` 为可编辑头发，完整上下文仍是原男，不冒称已换成jaw。jaw适配来自独立fit及已证相同Head绑定；jaw源仍引用原 `assets-source/m2-male-face-v1/generated/editable.blend`，不复制重做。`parameters.json` 固定此次零几何改动/identity适配；原冠部造型参数在已锁 `assets-source/m2-male-hairstyle-v1/parameters.json`。

`source-pins.json` 固定所有输入和复用生成器；`provenance.json` 原样保留来源/许可：OpenGameArt hecko发布、VRoid Project归属、Studio0.14.0历史beta基模CC0记录。未恢复原.vroid，不将当前任意VRoid素材视为CC0；本次没有下载/新增授权推断。

## 实际检查与已知差异

- 原生成器只通过AST重定向单个OUT，源码/参数/数学不变，在本包 `fresh/original-hair-rebuild` 实际重生成fb5fd原字节。旧源目录没有被写入。
- fit/manifest/参数/GLB/editable/provenance在独立fresh目录重复生成，六文件字节一致。
- Blender4.5.9 LTS、build8bf95cbd38d1、2线程，两个独立进程从保留blend导出；SHA均 `3f2b7999794b1a5a32a7e495ff76c43ace3a06644da6f8111d86aab52335d792`，也与历史editable导出一致。内部耗时0.347/0.229秒，无渲染/GPU。
- canonical与Blender导出**不是同字节**。250点/408三角、有向三角角点位置/UV匹配，最大位置/UV分量差均0（保留≤1µm几何门）。两点7/106位置UV重合但法线不同，初版一一最近匹配断言失败，已保留诊断；改为有向三角位置UV比较，并以法线消解同位缝点歧义，未改资产或门。
- 重新导出的NORMAL与canonical最大分量差 `.0005943924188613892`，均有限/单位法线。该差异来自原导出链，当前导出与旧导出相同；不声称法线完全等价，**生产仍用原canonical法线**。不把editable-export当可无审查替换的生产件。
- Blender提示同一贴图多个shader texture节点，sampler采用首节点；记录此原导出器警告，未通过改材质规避。生产GLB/贴图原字节保持。

## 重跑（项目根）

```powershell
python scripts/m2-male-jaw-hair-fit-v1/check-geometry.py
python scripts/m2-male-jaw-hair-fit-v1/build.py
& <Blender4.5.9路径>/blender.exe --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/m2-male-jaw-hair-fit-v1/export-editable.py
& <Blender4.5.9路径>/blender.exe --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/m2-male-jaw-hair-fit-v1/export-editable.py -- --out reexport-repeat.glb
python scripts/m2-male-jaw-hair-fit-v1/check.py
python scripts/m2-male-jaw-hair-fit-v1/manifest.py --verify
```

`check.py` 先独立重生成原几何，再重复fit、核源/导出/身份，通过后才复制三项到新public目录。Python+NumPy版本见证据manifest；不需安装新依赖。若源SHA不符，build在输出前拒绝；如果导出几何/UV失败，不拷贝新的public包。已存在public不是失败回滚结果的替代，必须看当前命令退出码和检查回执。

保留：本包editable(9.17MB)、canonical、一次editable-export、fit/manifest/参数/来源/pins/README，全部脚本、public三项、证据。忽略：本包`fresh/`和`reexport-repeat.glb`可重建重复数据，核验回执保留；未删本机文件。新检出 `manifest.py --verify` 只验证保留文件及原输入，不要求fresh存在。最大文件低于90MB。

runtime manifest为`character-hairstyle-v1`，新增fit引用SHA；fit为`character-hair-fit-v1`。本包不改catalog/控制器/通用runtime，加载/保存及错误fit拒绝由集成分支实现。之后仍需固定构建下无发/短发/恢复、发色、头动/表达/走跑/坐起、原男回归、双实例和v5/v6兼容/错误版本保持原状态的真实验证。
