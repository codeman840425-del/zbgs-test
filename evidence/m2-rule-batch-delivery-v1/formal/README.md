# 两条原签的整套准入复核

固定游戏 `60e3934ddd8a`、源码 `7857eb77d3dbe3b925aa07ff70a99757eab7b104`。正式计划接受 **0/2**。两条请求均返回 `Whole-outfit runtime admission evidence is required from the reviewed index`。仓库的整套审核索引有 0 项。[原函数输出与逐文件摘要](review.json)

| 角色 | D02 原签 SHA 前缀 | 身体 SHA 前缀 | 整套 |
| --- | --- | --- | --- |
| public-batch-a | 4e999cee59ac | 876951f25416 | 自身绑定的 1K 制服上衣、长裤、平底鞋 |
| public-batch-b | 01f6c12f8f06 | 3cfa8ea11e98 | 自身绑定的同款三件装备 |

复跑先验证原始批次、两条签名、普通包和冻结编译文件，再调用既有 `received_outfit_request.outfit_payload`。该函数从实际身体 VRM、装备清单、接收回执和配方重建样件矩阵与三件套选择。调用 `variant_batch.plan` 时使用真实 D02 身份、冻结提交、仓库审核索引和正式模式。三件装备的 ID、槽位、摘要以及裤装角色在调用前均与原签逐项比对。复跑保留候选状态，登记表保持原值。[可重复执行的脚本](replay.py)

| 正式要求 | 本次实际证据 | 待补或待审 |
| --- | --- | --- |
| 装备适配 | 两套真实 VRM 和三槽装配复算成功。每件资源摘要、原骨架、体型绑定及静止距离界限均来自接收回执。 | 整套适配审核仍待登记，局部静止适配有明确范围。[逐件复算](../readback.json) |
| 正常速度动作 | 两人均完成招手与真实座椅使用；房间报告含各自签名、走入位移、坐稳和起身。 | 原 `verify_room_report` 对两人都返回 `KeyError: 'shortId'`。它要求单人构建信息、恢复签名和完整 `walk/sit/stand/walk` 任务列表。现有工位报告使用 `buildId`、双人观察和四次坐/起任务；对应格式的单人报告仍缺。[场景报告](../seat/report.json) · [33.76 秒实录](../seat/room-1x.webm) |
| 记录与恢复 | 原 `verify_runtime_readback` 逐人通过，两人签名、全套装备及资源摘要均与此次普通包一致，关闭并重新打开后实例更新。 | 已有正式校验器可接受的技术报告，待作为整套评审材料审批。[标准恢复](restore/report.json) |
| 选择保护 | 原 `verify_guard_report` 逐人通过，同一冻结游戏执行 9 个用例。 | 已有正式校验器可接受的技术报告，待随整套审核。[标准保护](guards/report.json) |
| 运行预算 | 两条精确签名的静态预算均在限额内，双人暂定参考通过。22 个去重输入共 39,940,488 字节；双人静态估计 50 个纹理对象、211,115,352 字节 RGBA8 含 mip。 | 四层预算入口实际返回 `Unsupported budget admission report`。传输、解码/Canvas、GPU 和普通机尚无这两条原签的完整四层通过回执，普通机未测。[静态预算](../budget/record-measure.json) |
| 人工观感 | 可观看本批招手和坐起的 1 倍速实录。 | 两套外观均待人工确认。[双人招手](../cold/dual-external-cold-1x.webm) |
| 原件来源与权属 | 身体及三件衣物经原件摘要、VRM 与装备声明核对，来源回执记录 hecko 发布、归属 VRoid Project 的旧版 CC0 基础。 | 第三方导出缺少原始 .vroid，也未与官方旧版导出逐字节比对；精确整套的来源审批尚待登记。[来源回执](../../../assets-source/foundation-male/source.json) |

从任意目录执行 `python -B F:/gamemake/evidence/m2-rule-batch-delivery-v1/formal/replay.py`。再次运行会逐字节比对已有结果。完整角色、身体、装备、库存和证据摘要见机器回执。[复核结果](review.json)
