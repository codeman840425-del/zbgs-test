# 已签身体及制服的离线来源核验

两份工程原签和接收方 Orchid 原签均重建出发布包里的身体、上衣、裤及鞋的精确字节。三人共用相同的制服 GLB，每条回执分别核对本人的身体摘要、装备 ID、骨骼绑定和源材料字段。[工程 A](public-batch-a.json) · [工程 B](public-batch-b.json) · [接收方 Orchid](receiver-jaw-orchid.json)

接收方从原签发回执取得 `recordSha256`、`indexSha256`，再独立提交原签、发布 shape-pack 和来源材料检出。可从盘根运行以下命令。输出文件位于制作主工程内，相同输入可以重跑。

```powershell
python -B F:/gamemake/scripts/production/verify_outfit_source.py --record $signed --record-sha256 $signedSha --pack $pack --index-sha256 $indexSha --source-root $sourceKit --source-binding $originalBinding --out $receipt
```

当前适用范围是已登记的旧版男体下颌形态模板和三槽制服。`--source-binding` 缺省读取资料检出里的 `evidence/m2-source-outfit-release-v1/body/recipe.json`。它绑定原 VRM、拆件配方、蒙皮读回及原始装备表。核验先从发行包配方重算身体与三槽适配，再从保留的发布者 VRM 提取原始带权重三角面，核对拆衣、身体贴图缩减、上衣贴图缩减后的字节和最终选件。验签使用制作方的 D02 规范化实现。

本次离线核对的发布者 VRM 为 17,914,788 字节。存档页面标记 CC0，将作者归为 VRoid Project；发布者 hecko 称原件来自 VRoid Studio β 0.14.0。VRM 元数据载明 CC0、Everyone、Allow。下载 ZIP 摘要和旧版官方说明链接取自发布来源回执。本次未重新下载 ZIP，也没有官方 β 导出物的逐字节比对或权利方对本项目用途的专项授权文件。整套审核中 `provenanceAndRights` 的人工判断仍待审。动作、软件、其他配饰和材质另有来源范围。[发布者页面存档](../../assets-source/foundation-male/publisher-page.html) · [原始使用条件记录](../../assets-source/foundation-male/LICENSE.md)

接收方首次读取的历史 JSON 为 992 字节 LF，原始绑定记录为 1,008 字节 CRLF。重放在内存恢复原换行后，SHA-256 与原始绑定完全一致，两份摘要均记入 Orchid 回执。九项负例覆盖交叉提交真实身体、保留原索引但修改上衣、错误来源绑定和越界写入。失败后在同一目的地成功重试。[回归结果](checks.json) · [盘根重放脚本](replay.py)
