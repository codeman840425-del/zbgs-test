# 原男女眼裂宽 +5% 源端点

独立 sampleId `aperture-width105-v2`，旧 +1% 样件保持原样。根据原男女独立测量重新计算固定系数，不更换原底 SHA。眼角中点及 Eye 骨 rest/pivot 不动；虹膜/高光/Extra/眉/口腔不动。仅联动 Head-bound Skin、White、Eyeline、Eyelash；没有以缩放虹膜冒充眼形，也未用近点硬认透明根。

实际女 632 / 男 630 Basis 点变化，眼角宽比约 1.05，中点误差<1e−7 m。Body、骨/节点/binds、UV/权重/index、材质/图像、原表达名称及绑定保持。每个 absolute shape 按 Basis 固定每点 `xScale/centerX` 做同一仿射；relative deltaX 同时缩放。未编辑点系数规范 scale=1/center=0。

女 Basis+56 / 男 Basis+54 全 shape 无新增退化/翻面，48 对 Skin–White 缝最大间隙 0，受保护 absolute shape 点精确相同。边比女 .834–1.118、男 .838–1.129；相对对应原 shape 的最大三角法向变化女约31.98°、男46.84°，在闭眼形态明显，应实际观看。

每个 absolute shape 在完整 Face 拓扑上独立重算法线，只替换 660 点邻域，域外保持原 authored normal；raw/final 身份分别保存，原/native targets 只有 POSITION，final 包含 POSITION+NORMAL。报告中的“相对原 authored 基础 normal 最大角”女175°/男143°不等同于新几何翻面：原资产没有相应 morph NORMAL，该项比较的是变形后法线与静态基础法线；新旧同形态几何变化按前段数值报告。

## 实际筛查与未验项

`occlusion-screen.json`/samples 是固定原虹膜/高光 alpha 样点的 CPU 正面射线，不是图像像素或实际 WebGL。检查 open、half/full bilateral blink、half/full left/right 共56条侧/材质记录：双全闭与单全闭的**闭合侧**新增可见样点均0。睁眼侧/半闭部分样点变可见，这是数据变化，不被隐藏为全记录0，也不能直接称为穿皮。注视旋转、透视、MToon、透明排序/边缘、侧面及当前实际 Joy 混合仍需游戏近景。

`composition-check.json` 是四新域组合（嘴±12%、眉+3/+3 mm、鼻+2 mm、眼+5%）的4个男女端点状态，共232个形态记录；含全部原形态与固定 happy=.65/blink=.999/aa=.512 的 legacy 及当前 eye-only EYE_Joy 负向补偿混合。无新增退化/翻面/口眼缝，正反算子顺序一致。这不是任意权重或实际渲染验收。眼 POSITION 与 normal 邻域均不交其它三域；嘴/鼻 normal 交集仍需统一组合重算。

实际每端点保存新 editable，打开导出两次，再从原底 fresh 生成；raw/final VRM、mapping、normal-reference 字节一致。editable.blend 容器字节不同单列，未把文件重开当 fresh。

## 接口与归档

- `recipe-manifest.json` / `{female,male}-eye.recipe.json` 使用现有 `character-face-geometry-affine-recipe-v1`，新 ID `female/male-eye-aperture-visible-v2`，fixedEndpoint=1.05，固定 xScale/centerX 已含端点值。
- canonical final/normal参考：`generated/{sex}-eye-aperture-width105-v2/{avatar.vrm,normal-reference.npz}`。仅原 F027bed…/M62b44… 身份准入，jaw/waist不继承。
- `manifest.json` 的 files 保 canonical editable/final/参数/完整数值证据；reconstructibleFiles 保原raw/repeat/fresh二进制哈希但局部.gitignore排重复归档。未删必要editable源。`--verify` 明确只核保留包；`--verify-full`要求全部实际输出。

## 复现

固定 Blender 4.5.9 / addon 4.10.5，后台2线程，无GPU。生成前输出不存在；冻结包只验证时不应重跑覆盖。

```powershell
python scripts/face-eye-visible-v2/prepare-selection.py
& 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/face-eye-visible-v2/build.py -- --out generated
python scripts/face-eye-visible-v2/finalize-normals.py --out generated
python scripts/face-eye-visible-v2/audit.py
python scripts/face-eye-visible-v2/screen-occlusion.py
python scripts/face-eye-visible-v2/check-composition.py
& 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/face-eye-visible-v2/build.py -- --out fresh-check
python scripts/face-eye-visible-v2/finalize-normals.py --out fresh-check
python scripts/face-eye-visible-v2/check-rebuild.py
python scripts/face-eye-visible-v2/manifest.py --verify
```
