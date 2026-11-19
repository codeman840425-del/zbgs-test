# 灰紫束发与玫瑰发梢

在工程根目录运行以下命令，可复建原女体 CC0 束发的配色清单、适配和蒙版。相同字节可重复使用同一发布目录。

```powershell
python -B scripts/production/hair_region_release.py assets-source/hair-region-release-v1/recipe.json --output prototype/public/assets/m2-hair-region-v1
python -B scripts/production/test_hair_region_release.py -v
```

美术试色可在工程内复制 `recipe.json`，分别修改 `rootLinearRgb` 和 `tipLinearRgb` 的三个线性 RGB 倍率，给 `--output` 传入项目 `output/` 下的新目录。1 保持原通道亮度，0 关闭该区域对应通道。发布另一版时更新 `version`、`id` 和 `assetDirectory` 的版本号，收录其新目录。旧版本应能按原配方和记录恢复。

本款用原女体的 `blonde` 全局色作灰紫／玫瑰对照。原来的青蓝发色在主光项的红通道为 0，乘色保留这个 0。原发帽与脸眉仍使用原来的材质和图像。[源发型授权及制作记录](../m2-long-hair-v1/provenance.json) · [作者发束蒙版配方](../hair-region-pilot-v1/recipe.json) · [两处实物纹素的 CPU 对照](../../evidence/m2-hair-region-release-v1/cpu.json)
