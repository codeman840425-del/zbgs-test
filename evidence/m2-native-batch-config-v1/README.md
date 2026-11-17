# 由原生导出批次生成身体打包配置

在仓库根目录运行以下两条命令。

```powershell
python -B scripts/production/prepare_native_batch.py --authoring-result assets-source/native-parameter-batch-v2/result.json --template-config scripts/production/native-body-package-v1.json --output output/native-batch-config-new
python -B scripts/production/native_body_package.py --config output/native-batch-config-new/config.json --output output/native-body-packages-new
```

准备脚本读取原生批次的 `result.json` 与同目录的 `batch.json`。模板配置提供共享的源模板、基线、完整皮肤来源和覆盖图。候选身份从批次枚举，显示名优先取当项配方的 `label`，其次使用模板配置里的既有显示名或配方 ID。新增配方使用同一入口。

准备脚本逐项核源模板私本、保存的 `.vroid`、冷开参数、导出设置与最终 VRM 字节，再用原生依赖差分器重算结果。失败项和缺失项在结果中保留原因。现有身体打包器要求原生批次整体成功，因此只有全部项成功才写入可消费的 `config.json`。

真实下巴圆度 A 与面颊丰满度 B 均已生成配置。重新计算的差分 SHA-256 与原归档一致。使用生成的配置驱动同一身体打包器在独立临时目录重建，两件各七个运行资源均与已有身体包逐字节一致。三项回归覆盖自动枚举、失败项报告、导出回执变化和输出路径保留。[生成配置](config.json) [批次回执](result.json) [打包器重建校验](producer-check.json)
