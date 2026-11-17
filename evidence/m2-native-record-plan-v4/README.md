# CUSTOM-P01 批量记录规划器

从固定的 `prototype/src/native-production-catalog.json` 读取已登记身体，校验实际 VRM 和精确握麦/眼镜 fit 后，生成稳定的 `character-production-request-v1` 请求。身份由 `bodyType` 与 `recipeSha256` 派生；未知 fit 会省略并写入 `omittedCapabilities`，不会猜测旧角色配置。

```powershell
python -B scripts/production/native_record_batch.py --output evidence/m2-native-record-plan-v4
```

本次真实结果为两项 accepted。随后使用固定候选构建 `bda6fd250bb8` 调用 `character-production-cli.cjs`，并通过 `qa-native-batch-record-restore.cjs` 验证双实例、状态隔离、正常速度录像和浏览器重开恢复。该入口只消费已经登记的资源，不负责制作未登记衣服或自动适配任意新基模。
