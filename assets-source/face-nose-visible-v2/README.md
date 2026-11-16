# 原男女鼻尖前突 +2 mm 源端点

独立于旧 +0.5 mm 包，sampleId `tip-forward2-v2`。仍仅前突，不扩鼻高/鼻宽或其它参数；旧资源保留。复用已测男女各自真实地标、8 mm 测地半径/2 mm 平台，未照搬女性索引。`measurements.json` 与旧测量字节相同，spec 固定其 SHA；原底/来源/许可保持。

实际修改女性 9 点、男性 7 点，glTF 方向 `[0,0,-1]`，其余位置、Body 全属性、骨/rest/binds、UV/权重/index、材质/纹理、眼口头颈与表达绑定不变。Basis 与全部女 56/男 54 absolute shapes 同点固定平移（A=I），原 relative POSITION 差分保持于 float 误差内。

全部形态无新增退化或翻面；女最大边比 1.2652/三角法向变化 11.074°，男 1.2578/8.824°。位置公式误差≤4.06e−9 m。局部位移梯度改变法线，因此保留 addon raw，另对每个绝对 shape 独立重算完整 Face 相邻三角的法线，只替换女 17 / 男 15 点邻域，输出真实 NORMAL 差分；独立核对误差≤3.66e−8。域外 authored normal 不变。

每端点从 pinned 原 editable.blend 生成并保存新 editable，重新打开导出两次，再次从原底 fresh 重做。raw/final VRM、mapping、normal-reference 均字节一致；editable.blend 容器不同已记录。`audit.json`、`fresh-check/rebuild-comparison.json` 是实际核对结果。

## 接口及限制

- `recipe-manifest.json` 固定男女 recipe，schema `character-face-geometry-displacement-recipe-v1`，新 ID `female/male-nose-tip-visible-v2`，`fixedEndpoint=.002`，translationVectors 已含端点位移，不能再次乘 4。
- canonical final/normal-reference：`generated/{sex}-nose-tip-forward2-v2/{avatar.vrm,normal-reference.npz}`。raw 是 `addon-export.vrm`，不可混作 final。
- 新嘴 24 mm 过渡域与鼻 POSITION 点不交，但法线邻域交集女 8 / 男 4 点；按组合后的 geometry 统一重算邻域并集，不能逐域最后写 normal。具体 IDs 在 `assets-source/mouth-visible-v2/audit.json`。
- 正面/侧面观感、真实眼镜接触及任意表达叠加未由源门放行。只适用原 F027bed…/M62b44…，不继承 jaw/waist；固定 0/+2 mm，不承诺连续/负向范围。
- `manifest.json` 保留 canonical editable/final/数值证据；raw/repeat/fresh 二进制记录为 reconstructibleFiles 并在局部 .gitignore 排除重复归档，未删除本地。`--verify` 核保留包，`--verify-full` 核所有执行输出。

## 复现

Blender 4.5.9 / addon 4.10.5，后台 2 CPU 线程；无 GPU/浏览器。命令应在干净输出路径执行，生成器拒绝覆盖已有端点。

```powershell
& 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/face-nose-visible-v2/build.py -- --out generated
python scripts/face-nose-visible-v2/finalize-normals.py --out generated
python scripts/face-nose-visible-v2/audit.py
& 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/face-nose-visible-v2/build.py -- --out fresh-check
python scripts/face-nose-visible-v2/finalize-normals.py --out fresh-check
python scripts/face-nose-visible-v2/check-rebuild.py
python scripts/face-nose-visible-v2/manifest.py --verify
```
