# 日野可可燕麦纸盒

编辑 `make_carton.py` 中的文字、配色、日出图案和纸盒截面，再用 Python 3 导出。图案、字形、八折纸盒、偏置屋脊和实体封条均为此试制原创，许可随 `License.txt` 提供。

```powershell
python make_carton.py new-art-output
```

将源脚本和输出的 `carton.glb`、`carton-label.png`、`License.txt`、`recipe.json` 放到接收副本的 `source/assets-source/company-receiver-printed-carton/` 下。用版本化 `recipe.json` 提交现有发布器。GLB 原件的 `art/carton-label.png` 由配方绑定到原 PNG，发布后完整含图的 GLB 可以独立打开。
