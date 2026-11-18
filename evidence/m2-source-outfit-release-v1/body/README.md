# 原始男体制服分件版重建

在工程根目录运行。第一条命令重建身体和适配清单，第二条复算并逐字节核对现有产物。重复生成遇到相同文件时保留原文件，遇到内容冲突会报错。

```powershell
python -B scripts/production/build_source_outfit_release.py
python -B scripts/production/build_source_outfit_release.py --check
```

入口使用游戏 profile `source-male-ab9a-release-v1` 中的身体 SHA、装备清单 SHA、两个 URL 和三件装备 ID。身体制作先从固定原模型剔除已提取的四个制服 primitive，再与本目录保存的身体回执核对。适配器读取实际派生身体，复算上衣、长裤和鞋的绑定。写入前校验装备清单的字节摘要、槽位和每件的身体 SHA。[游戏 profile](../../../prototype/src/source-outfit-profiles.json) · [身体配方](recipe.json) · [身体回执](report.json)

输出为 `prototype/public/assets/source-outfit-release-v1/body.vrm`、同目录 `equipment.json` 和 `evidence/m2-source-outfit-release-v1/fit/report.json`。三件装备 GLB 沿用原始固定文件。本命令验证离线生产与适配。游戏动作、接触和设备预算按各自回执判定。[适配回执](../fit/report.json)
