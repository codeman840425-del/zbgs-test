# 制服底色图半尺寸发布候选

配方指定原装备目录、装备 ID、身体及 GLB SHA、蒙皮节点、primitive、材质与纹理引用链，以及原图和派生图 SHA。读取 2048² 全不透明底色 PNG，在直线光空间对每组 2×2 像素求平均，再编码为 1024² sRGB 底色 PNG。两件的 256² 领带图均保留。[配方及两个 GLB](../../assets-source/garment-basecolor-release-v1) · [两套原图和既有压缩试验的对照](../m2-source-outfit-release-v1/budget/next-mechanism.md)

| 独立上衣 | 原 GLB 字节 | 候选 GLB 字节 | 蒙皮关节数 | 新 GLB SHA-256 |
|---|---:|---:|---:|---|
| 原始男制服 | 2,762,796 | 743,232 | 10 | `eef03164931297e1ae0b4bddfadde40e4458a317a6490e889867cf6ea3759a1d` |
| M1 女制服 | 2,696,548 | 765,288 | 16 | `030a58142ce8fe29cd5bfcbe6a133fc0bb9675384e27e6e4ff0b04a5bbe3caa8` |

对两件实际候选分别运行 `m2-technical-v1` 单件检查，纹理完整 mip 上界均由 22,719,144 B 降至 5,941,928 B，达到单件预算。重读各 15 个缓冲视图、13 个 accessor、蒙皮声明、材质、领带图及完整 GLB 声明，仅选定的图片、必要的打包偏移和新增的派生身份有变化。原文件内的身体来源和作者许可仍可追溯。候选尚待装备登记、房间近景、动作和普通设备验证。[逐件回执](report.json)

从仓库根生成和核对。已存在的文件若内容不同，正常命令会拒绝覆盖。当前复算环境使用 NumPy 2.4.2 和 Pillow 12.1.0。

```powershell
python -B scripts/production/garment_basecolor_release.py
python -B scripts/production/garment_basecolor_release.py --check
python -B scripts/production/test_garment_basecolor_release.py -v
```
