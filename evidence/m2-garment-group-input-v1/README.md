# 原始男制服的多图元单槽交接

样件沿项目留存的旧 β Base_Male CC0 来源。原 VRM `ab9af434…` 的明确制作配方将节点 1、网格 1、蒙皮 1 的 `primitive 4 / material 10` 和 `primitive 5 / material 11` 组成一个 `top`。现有 GLB `10a51cbdac6bfea074ad5cfa30e7c0a46cd2fc099fbc2048a291deb470e10d02` 有两个图元。此前原始提取已核各图元、UV、权重、逆绑定及底色，并以该部件作字节重建。此前 source mapping 另核同源短裤在发布者导出和 Blender 重导间的具名索引及绑定区别。去衣适配已核保留的 15 个表面及两套原始蒙皮。 [明确分组配方](../m2-raw-male-equipment-v1/outfit.json) · [原提取回执](../m2-raw-male-equipment-v1/outfit-report.json) · [来源映射测试](../../scripts/production/test_garment_source_mapping.py) · [去衣与适配](../m2-source-outfit-release-v1/fit/report.json) · [许可记录](../../assets-source/foundation-male/LICENSE.md)

本次新增的是同一原始 GLB 穿过样式矩阵和 D02 精确请求的复核。已有 1K 矩阵指向另一派生 ID。本目录的诊断矩阵直接钉住原 GLB 的发布注册项 `source-outfit-release-uniform-top-v1`、确切去衣体 `cf1118a2a8d8fca8ccc094e51d051f660ec12ffdbdda4c8ecaad407b55cef9d4`、该注册项的 raw binding 与 `preserveOriginalBody`。该身体保留原有全不透明的皮肤贴图。现有矩阵验证器和 CPU 人物查询生成了一个诊断 D02 请求，`pants` 使用单一上衣 ID 及各一条裤鞋引用。结果为 1 个候选、0 项正式准入、0 项拒绝。 [诊断矩阵](matrix.json) · [输入请求](request.json) · [实际计划](diagnostic-plan/plan.json) · [实际 D02 请求](diagnostic-plan/diagnostic-requests/create-001.batch.json)

五项回归覆盖实际两个图元的合法同件接收、拿原出版身体冒充去衣适配体的拒绝、在已发布 GLB 回读中遗漏一片或在提取选择中重复一片的拒绝。请求侧漏掉上衣、重复上衣或改用原身体也不产生 D02 请求。该诊断输入的静态预算已超限，正式计划会拒绝。 [只读回归](../../scripts/production/test_garment_group_contract.py)

在包含源码、原来源证据和 Node 依赖的完整检出中复核。现有 `80fb16b7` 稀疏检出缺身体配方和 CPU 查询 shim，本次使用完整检出 `54e8a24cf81a96f1404dcb88823009b63f887e9c` 的实际项目资源。

```powershell
python -B scripts/production/test_garment_group_contract.py
$base = 'evidence/m2-garment-group-input-v1'
python -B scripts/production/variant_batch.py "$base/matrix.json" "$base/request.json" --root . --output "$base/diagnostic-plan-replay" --diagnostic
```

该用例证明项目明确分组的装备可按单槽消费。原始旧 β 没有可回读的 `.vroid` 作者组。原生新体还需要作者组与原生去衣差分共同证明每一片归属，并用同体完整供体核对索引、皮肤 UV、权重和遮罩变化。若需覆盖，应记录该件独占的覆盖、换装复原和实际动作。当前样件不需要 Body 遮罩，本次没有生成资产、执行 D02 签名或启动 GPU。

## 接续结果

原款上衣与领带已在固定游戏完成首次加载、两片同帧绘制、换回原装和关闭恢复。[游戏录像与记录](../m2-garment-group-game-v1/README.md)

原生 VRM 1 的独立提取使用同一所有者节点与蒙皮，传入 `primitiveGroups`，在每一槽中显式列出原图元、材质索引和材质全名。样件 13 的两张候选衣面各 4,072 面，两次提取输出一致。小游戏包中的男制服和这个原生候选是两份不同的测试输入。旧原生单片包可用其原制作者脚本的 `--check` 复核；两份历史样件的原导出字节相同。[原生提取回读与拒绝用例](native-group-streams.json)

从工程根运行 `python -B scripts/production/native_garment_removal_surfaces.py evidence/m2-garment-group-input-v1/native-removal-control.json` 即可复算旧女性单片控制组。工具保留每个三角形的顶点位置、UV、绕序和出现次数，允许原生导出在移除一件衣服时重排其余图元或顶点。样件 13 无同体去组对照，换用控制组的去衣件会被拒绝。其原画和模型限内部使用，本次备份只含代码与测量值。[原生控制组和错体结果](native-removal-result.json)
