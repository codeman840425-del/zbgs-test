# 原生 customitem 单件生产准备

状态为一次原生单件生产、原source重用、另存冷开及三个VRM实际导出已完成。复用已验证 froz commit `6469bd3a6d00fe5fac508d992f63b5a1a783d80e` 的同一upstream、Python环境与独立lab，没有新安装或编辑器副本。源为内部女性样件311a，不把本包当跨性别、任意人物或独立游戏服装适配通过。

## 实际完成结果

负责人先执行只读inventory，再明确授权唯一 `Tops/SleeveLong` 从66改56。原native类型0..100、editable float、`exact_native_vm` owner与template绑定均从实际数据核对，组错误为空。只缩短10个百分点，未扫描其他值。完整native闭环退出0，报告创建到完成的文件时间约95秒，属于本机本次执行记录。

原source Tops的group为 `0651673b88702f454523c48963fd21a01d976554.transferablegroup`，参数为 `clothing/0651673b88702f454523c48963fd21a01d976554.transferablegroup/001`，语义为 `BlendShape_BlendShape.N00_004_01_Tops.SleeveLong`。原生保存确实生成新的user group，脚本仅为该已保存top建立完整semantic/template绑定的一对一旧新ID映射，其余衣物保原ID。新鲜native owner也已再次核验，未靠显示标签匹配。

| 实际产物 | SHA256 |
| --- | --- |
| `.vroidcustomitem`，489334字节 | `c8d50791efb75d7e5daf856d698613d2c05d1a9bf36f0cb4ea4ccfcfc47348c1` |
| 重用并冷开的`.vroid` | `a0526dc1f53003fa7c6ad24f4b1172444f6ce53701e6aeaf094a77d1a0cb980e` |
| baseline VRM | `88a34746c9563112e7c75231345c1a9efba14b9628720b1c281aecbd91ab224a` |
| direct VRM | `6a32481ef8caef06b3f3fe52528e0330b6e83334e0d9b41fa66caf7b7f5ec634` |
| 原source应用、另存冷开后VRM | `6a32481ef8caef06b3f3fe52528e0330b6e83334e0d9b41fa66caf7b7f5ec634` |

产物保存在 `evidence/vroid-customitem-study-v1/native-single-top-v1/`。direct/reused不仅实际POSITION payload相同，完整VRM文件也同字节。相对baseline有实际位置变化，face/body/colors及其他clothing参数守卫通过，完整导出metadata一致，原311a源SHA保持。13个primitive的POSITION消费均已读回，没有将共享accessor重复消费数冒称独立顶点数。

实际原生路径处于既有 `lab/profile/AppData/LocalLow/pixiv/VRoid Studio/custom_items/N00-Tops/`。`native_file_registry` registered为true，`asset_storage_registered`为false，照原样记录。保存后的原生导入、反序列化、身份与完成回执均成功，此结果没有把两种registry状态混称。全部owned进程已退出，实际进程读回仅剩原主Bridge路径，GPU窗口已向负责人释放。lab目录与这次原生文件仍保留，未发起删除。

三次导出的实际有效设置均为 `delete_transparent=true`，50799三角，与既有78912的false设置不同。本次是独立服装保存重用验证，不能当作78912完整基体的新套装准入。未来如需false设置的完整源导出，可由负责人另行使用已保存的reused.vroid，本次没有重复导出。

后续唯一CPU差分按每个primitive真实indices引用域核对，结果见 `export-reference-diff.json`。共享Body POSITION accessor126包含7579点，但Body_SKIN实际引用5103点，全部位置/作者N/UV/骨ID/权重均0变化。底裤476点、鞋600点、该mesh中的HairBack700点及其他Face/Hair消费者也0变化。仅Top实际引用700点中226个位置变化，最大6.544600039mm，278个N变化，UV/骨ID/权重0变化。13组indices、三skin各130关节的排序/骨node/IBM字节及全部node消费者保持。因此整个共享POSITION的hash变化不能当身体实际点变化。

没有做游戏视觉/动作、跨性别或其他源适配验收。该闭环只证明这一个原生top参数及customitem生产重用通道。

## 第一次只读执行

负责人安排统一窗口后，在项目根运行以下命令。它仅打开原source、枚举parts/savable_types、完整clothing分页，以及由实际clothing semantic_group元数据确定的可保存组参数，然后退出。不会自动选参数、写形体、保存customitem或导出VRM。

```powershell
assets-source/vroid-expression-study-v1/private-tools/.venv/Scripts/python.exe assets-source/vroid-customitem-study-v1/study.py --mode inspect --execute-native --out evidence/vroid-customitem-study-v1/native-inventory-v1
```

查看 `native-inventory.json`，由负责人选一个真实普通上衣类型、一个editable float原生参数ID及一个范围内适度变化值。参数还必须由 `list_group_parameters` 的 `target_binding_id` 明确归属该可保存part，只有标签相似无法通过。若真实API没有建立这种归属，停止并保留缺口，不猜ID或改原作者映射。

## 单件闭环入口

本次实际执行命令如下，没有自动选值。此输出目录和lab专用文件名现已存在，再运行会拒绝，不能直接重复覆盖。

```powershell
assets-source/vroid-expression-study-v1/private-tools/.venv/Scripts/python.exe assets-source/vroid-customitem-study-v1/study.py --mode test --execute-native --part-type Tops --parameter-id clothing/0651673b88702f454523c48963fd21a01d976554.transferablegroup/001 --value 56 --out evidence/vroid-customitem-study-v1/native-single-top-v1
```

一次窗口最多20分钟，一次参数变化、一个原生customitem、一次在新进程的原source上应用、一次另存冷开。baseline/direct/reused三个VRM使用相同有效原生导出设置。调用发生在原作者stdio SDK，不代表GPT宿主原生注册工具。

执行顺序如下。

1. 重新核source、binary allowlist和固定输入SHA。只认新读的唯一可保存part和精确参数归属。读原face/body/colors/clothing基线，导出原baseline。
2. 只写一个clothing参数，核完整衣物参数及其他域，调用 `save_custom_items(types=[实际type])`。沿原作者门确认一个新增原生注册文件、ZIP CRC和root group metadata。
3. 保存结果路径必须在既有独立lab/profile内。精确复制该文件到既有lab/saves的专用新文件名，沿原作者 `inspect_custom_item` 检查字节，导出direct。这里复制的是单个产物，没有再复制编辑器或安装工具。
4. 关闭第一进程，重新从原source打开。确认原数值仍在，再调用原作者 `apply_custom_item(filename)`。该接口要求文件与仍注册的真实文件字节/元数据一致，执行原生反序列化与兼容判定后才应用。没有自行构造registry或跳过原门。
5. 核改变值、其他衣物和face/body/colors，另存新的`.vroid`，关闭并冷开后再次核值、导出reused。
6. 沿原作者VRM容器验证回读实际Float32 POSITION。direct与reused的所有实际primitive位置payload须一致，并与baseline存在变化。metadata须全等。密集Float32 VEC3以外布局明确拒绝，不做静默转换。原源311a必须保持。

该位置读回用于证明实际导出的形体变化与重用，不自行将每个primitive映射成游戏上衣角色，也不判材质、动作或视觉通过。

## 原生目录与失败恢复

原作者 `save_custom_items` 在发出原生保存前读取 `registry._basePath`，owned模式必须是 `lab/profile` 的真实下级目录，根目录自身、越界或不存在均拒绝。底层 `CustomItemSaveUtil.SaveCustomItem(..., false, ...)` 请求新建而不覆盖。新文件匹配同group type、ZIP和registry ID，实际path/bytes/SHA均保留。公开 `list_parts` 没有返回base_path，因此只读初读不会假报已观察到真实registry根，实际保存路径门仍由冻结作者实现执行。

环境沿原作者独立USERPROFILE/APPDATA和process registry隔离，不使用attached模式，不向用户全局closet导入。若原生策略仍返回全局路径，原作者owned-profile门会在保存前拒绝，本包停止，不改环境、registry或路径门来强行保存。

部分保存或应用失败不保证回滚。脚本将状态标为failed-not-admissible并保留calls、原生日志和已保存文件，关闭其拥有的会话，不反复调用、不删已写结果、不动主Bridge。失败后原source仍按SHA核对。旧试验文件名存在时在启动前拒绝，负责人先检查现场再决定恢复，不能只换evidence目录盲重试。新lab目录沿既有生命周期保留，没有发起删除。

只读准备阶段已实际检查9个必需工具schema、allowlist与固定输入，离线10项QA核参数归属/拒绝、原作者ZIP检查和profile越界拒绝、实际合成GLB位置读回，当时native调用与编辑器启动为0。收到真实inventory后追加实际输入归属检查、合成新root ID映射及换template拒绝检查，再经负责人授权执行上述唯一native闭环。没有attach主Bridge。

## 输入及许可

source `assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vroid` 的SHA为 `311a1bd0c9137a0c5783f9ff818b686ce61f132cd0f88eb63caf408a8a73b4de`。工具源码MIT及原notice、依赖许可沿原expression包保留，全部输入身份在spec中逐文件pin。本包不授予VRoid本体、原始素材或下游VRM额外权利，不修改导出许可。原作者实现来源见固定仓库中的 `vroid_mcp/runtime_ordinary.py`、`runtime_groups.py`、`custom_item_file.py` 与 `agent/ordinary_extensions.js`。
