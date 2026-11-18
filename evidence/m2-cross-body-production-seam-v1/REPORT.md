# 男女造型共用生产接口核验

优先修复款式批次计划到 D02 的装备映射。D02 的 `outfit.index` 只在精确身体内有意义。CPU 上使用相同的 `index: 3`，原女性生成及膝裤加独立袜，原男性生成长裤加独立外搭，原生男性则拒绝该索引。原男女两个请求都实际准备了模型和装备，并在 JSON 往返后重新通过生产校验。[CPU 回读](cpu-production.json)

| 精确身体 | 已查的可复用项 | 直接关系到五张造型参考的缺口 |
| --- | --- | --- |
| 原女性 `female` | 短发、单马尾、平底鞋与配对袜、耳饰、指定帽发、眼镜 | 独立外套槽、猫耳耳机、包和双马尾没有这具身体上的登记。腰部修订使用替换上衣槽 |
| 原男性 `male` | 短发、平底鞋与配对袜、精确马甲外层、耳饰、眼镜 | 已有外层只验指定内搭和下装。西装外套、工牌和特定衬衫需要自己的样件和适配 |
| 原生男 `native-male-7586-v1` | 独立原生上衣、短裤和鞋、一款独立发型、眼镜及麦克风 | 当前只登记一套衣物。原男性马甲、袜、耳帽不能跨 SHA 使用 |
| 原生女圆度 A | 独立原生上衣、短裤和鞋、眼镜及麦克风 | 当前只登记一套衣物。原女性替换发型、帽耳、外层、袜均需精确适配 |

五张参考分别涉及西装外套与工牌、衬衫与眼镜、短发与猫耳耳机和针织开衫、长发与开衫和包、双马尾与运动外套。四张涉及独立外层，衬衫同样需要明确选定上衣。先补装备集合的准确选择和构建请求接口，可以复用现有袜、鞋、发型及配饰适配，再增加有证据的外层变体。参考图的具体画风待定。[现有资源核验](flow-validation.json)

当前体型矩阵只列制服上衣和露膝短裤。原男女及两份原生女共 8 条真实请求均被准入门拒绝。旧代码通过门后会给 D02 传入未支持的顶层 `appearance`、`admissionEvidence`，且缺少 `identity.gender`。接缝已改为显式读取身份和性别，加载精确身体查询配置套装，再以套装名称和完整装备 ID、槽位、SHA 解析唯一索引。款式、版型、覆盖和准入证据保留在计划回执。正式模式对多件套装要求完整的准入证据。当前矩阵只能证明单件，测试确认单件上衣的准入无法扩展至候选袜。修订后默认生产计划与原报告逐字节一致，仍为 0 正式准入。[当前准入计划](variant-plan/plan.json)

最小真输入选矩阵中的制服上衣条目作装备锚点，为两个身体显式指定 `pants-socks` 和各自的上装、下装、鞋、袜。双方的袜适配共享款号 `plain-crew-socks-v1`。原女性实际索引为 3，原男性为 7，男性另有同袜款的短裤索引 6。诊断计划生成两条 D02 请求，原生男因缺精确矩阵条目而拒绝，正式准入仍为 0。两条候选请求均在 CPU 由真实 D02 创建、序列化、重新加载并校验。后续增加外套时沿用此入口，按精确身体、内搭和下装核对声明叠穿及遮罩。[真实诊断输入](diagnostic-batch.json) · [诊断计划与请求](diagnostic-plan/plan.json)

固定构建 `8b41452b51c7` 已实际重跑两条诊断请求并生成 rev1 记录，独立游戏包完成双角色同场、关页重开及错误输入拒绝。这份证据固定的是逐身体核对后的数字索引基线。[固定浏览器验证](browser/README.md)

## 重跑

从项目根目录执行。CPU 回读使用实际装载器和绑定，PNG 只读尺寸。回读没有启动浏览器、VRoid 或 GPU，也没有生成正式准入。完整 1× 动作、浏览器恢复与视觉仍须对新组合验收。

```powershell
node evidence/m2-cross-body-production-seam-v1/readback.mjs
python -B scripts/production/variant_batch.py assets-source/variant-matrix-v1/representative-matrix.json assets-source/variant-matrix-v1/representative-batch-request.json --root F:/gamemake --output output/cross-body-plan-check
python -B scripts/production/variant_batch.py assets-source/variant-matrix-v1/representative-matrix.json evidence/m2-cross-body-production-seam-v1/diagnostic-batch.json --root F:/gamemake --output output/cross-body-diagnostic-replay --diagnostic
node evidence/m2-cross-body-production-seam-v1/readback.mjs output/cross-body-diagnostic-replay/diagnostic-requests/pants-socks-female.request.json output/cross-body-diagnostic-replay/diagnostic-requests/pants-socks-male.request.json
python -B scripts/production/flow.py validate male-outer-panels-source
python -B scripts/production/flow.py validate socks-layer-source
python -B scripts/production/flow.py validate paired-ear-accessory-source
python -B scripts/production/flow.py validate male-jaw-hair-fit
```
