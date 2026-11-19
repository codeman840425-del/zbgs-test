# 圆金耳钉 · 半径 3.0 mm

新款 `round-gold-stud-3mm-v1` 沿用项目原作者制作的闭合椭球、金色材质和双侧耳垂定位法。在原配方中将半径从 2.6 mm 改为 3.0 mm，按历史名称导出时可重现样件 `902d8dcb142bcde12a7a35c4c3f5709b1f9c7955021fb31c1a8a2314b61f1cef`。以新款名导出后，GLB 为 6,436 字节，SHA-256 为 `1ce2f5c8b68e7334f60857a7e9063873c328e021b39ad883bc8de1178945ce00`。两份 GLB 的 JSON 仅在节点名上有差异，二进制块逐字节相同。114 个顶点、224 个三角形，最大横向直径 6.0 mm。[制作配方](recipe.json) · [形状与材质回读](generated/build-report.json)

## 身体和佩戴范围

每个身体有独立 fit；同一身体的左右实例引用同一份 GLB，各自使用原始头骨绑定坐标和各自耳部三角形。身体资源以完整 VRM SHA 匹配。目前两个匹配的基础 profile 为 `female` 与 `male`。同名性别、相同制服或其他 1K 身体不能据此复用 fit。女、男角色佩戴双侧时，每只耳钉检查了 338 个静态采样点，包括全部顶点和三角形中心。

| 身体与源 SHA | 左 / 右耳面号 | 左 / 右最小有符号采样间距 | 版型 |
|---|---|---|---|
| female · `027bed60…bcd5b95` | 1077 / 1162 | +0.181 / +0.138 mm | [女体双侧 fit](generated/runtime/female-fit.json) |
| male · `62b44b03…c0b35ff` | 1201 / 1286 | +0.126 / +0.308 mm | [男体双侧 fit](generated/runtime/male-fit.json) |

完整 SHA、正向法线、原耳表面连通块、三角顶点、头骨权重和局部变换见上表版型。按作者算法，先找离采样点最近的原脸部三角形，再用该三角形三个顶点法线的算术平均方向计算有符号间距。遮挡、动作中接触和房间观感须另取游戏实证。

## 重建与登记

在项目根目录运行。此处的实测环境为 Python 3.13.11、NumPy 2.4.2。命令分别构建源产物、发布四个运行文件，并在独立暂存目录实际重建和重复回读。

```powershell
python -B scripts/production/paired_ear_style.py
python -B scripts/production/paired_ear_style.py --publish
python -B scripts/production/paired_ear_style_test.py -v
```

默认源产物写入本目录的 `generated/`。发布只写 `prototype/public/assets/m2-ear-stud-3mm-v1/`。相同输入可原地重跑；不同字节或缺文件的已有目录会保留并报错。用 `--out` 指定工程内新的源产物目录可以重新构建。登记使用款式片段和 manifest SHA `4d3cc3b13232e2da20a3111c8e2e8482b61f55615b934de6bd74dcd92eb38763`；manifest 内的 provenance 字段以源包布局定位制作配方，游戏所需的四个文件都在同一发布目录。[款式登记片段](generated/catalog-fragment.json) · [发布清单](generated/runtime/manifest.json)

## 来源和许可

新尺寸的程序化耳钉沿用原作者对耳钉几何与参数源文件作出的 CC0-1.0 授权，本派生耳钉几何与新增配方也按 CC0-1.0 提供。两份基础 VRM 仅用于读取耳部三角形、法线和蒙皮权重，保留各自来源条款。耳钉 GLB 只含程序生成的几何和材质参数。[作者说明](../m2-paired-ear-accessory-v1/provenance.json) · [耳钉许可](../m2-paired-ear-accessory-v1/LICENSE.md) · [原始生成程序](../../scripts/m2-paired-ear-accessory-v1/build.py) · [女性身体来源](../foundation/source.json) · [男性身体来源](../foundation-male/source.json)
