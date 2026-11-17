# 轻量生产流程入口

当前能力状态只看 `docs/CAPABILITIES.md`。下面先说明旧 `flow.py` 的只读索引；文末的 `character-production-cli.cjs` 是实际执行制作/回读的独立入口，两者不能混为一谈。

从仓库根目录执行，Python 标准库即可运行入口：

```powershell
python scripts/production/flow.py list
python scripts/production/flow.py show male-shorts
python scripts/production/flow.py dry-run accessories
python scripts/production/flow.py validate all
python scripts/production/qa-flow.py
```

只有 `list/show/dry-run/validate` 四种命令；没有隐藏的执行、发布或覆盖选项。`dry-run` 输出原脚本的 argv、写入范围、阶段备注、失败恢复提示，**不执行 argv**。参数不可用会非零退出，`validate` 每条流程分别报告失败。导出与深度检查仍需后续明确执行显示的命令，且应使用隔离 worktree；没有用登记替代重建闭环。

## 流程和现有源入口

| CLI ID | 可编辑源 / 身份 | export / check / readback 的实际路径 |
| --- | --- | --- |
| `male-shorts` | `assets-source/m1b/shorts/spec.json` + `m1b-uniform-shorts-v1.blend`；style `m1b-tailored-shorts-v1`，fit `beta-base-male-62b44b-shorts-v1` | 既有 `save-shorts-editable.py -- --reuse` 真实重开 blend 导出两次→`repack-shorts-editable.py`→`audit.py`/`audit-shorts.py`；新入口读最终 GLB/精确男体 SHA/权重/原骨逆绑定矩阵 |
| `accessories` | `assets-source/m1c-accessories/parameters.json` + 两个 blend；`studio-microphone-v1` / `studio-glasses-v1` | 既有 `build-accessories.py -- --output output/production/accessories --no-preview` 批量候选导出→`audit-accessories.py --compare-dir ...`；新入口读 GLB/socket/hash 与男女 grip payload/pin |
| `technical-dance` | 当前 canonical 参数 `prototype/public/assets/motion/m1c/dance-technical-v1.config.json`，UAL1固定原骨架；`dance-technical-once-v1` | 既有 `qa-m1c-build-dance.py --config ... --output output/production/technical-dance` 自带 240 Hz 源脚面检查→`flow.py validate technical-dance --candidate-dir output/production/technical-dance` 回读候选配置/检查结果/实际动画轨；不是 Blender 动作源 |
| `female-jaw` | `assets-source/m1-variants/spec.json`、完整女性原 blend、独立 `m1a-jaw-v1/editable.blend` | `build-variants.py` 批量生成两件并各自重开导出两次→两件 `build-equipment.py`→`save-pants-editable.py`→`audit.py`/`verify-rebuild.py`→精确派生 SHA 与8件装备回读 |
| `female-waisthip` | 同一原件独立派生的 `m1a-waisthip-v1/editable.blend`；不叠加 jaw 修改 | 与 jaw 共用批量生成命令，当前脚本不能按这个 CLI 标签假称只重建一件 |

完整可复制 argv 保存在 `scripts/production/workflows.json`，通过 `show/dry-run` 读取。`source` 阶段只显示源声明；短裤另有显式 `sourceRebuild`，不得与保留人工编辑的 `--reuse` 导出混同。表中命令是可用入口，本次没有执行重建。Blender 固定 4.5.9 LTS，女性 VRM 插件 4.10.5，现有工具链记录 `assets-source/foundation/toolchain.json`。Python依赖指向各脚本已有 requirements，不自动安装。验证器只检查本地工具入口是否存在，不以文件存在冒称已运行版本检查；真实 exporter 内仍有版本断言。

## 有意义的只读回读

`validate` 不导入会写文件的生成模块，不调用 subprocess；读取现有权威 manifest/spec/build report 的精确 ID 和 SHA，而不再维护一份新的通过清单。输出会列当次观察到的实际文件 hash/字节数，便于固定构建追踪。

- 男短裤：源男性 VRM/原编辑源、当前完整男体、短裤 editable blend 与记录一致；style/fit ID 一致；802 个权重顶点、7 根骨的 GLB 真实数据可读；每点权重和、joint index 范围、manifest inverseBindMatrix 同时匹配导出衣服与目标原骨架。
- 附件：parameters hash→两个 GLB hash/bytes→真实 socket 节点/位置/语义。握麦配置独立验证 ID、身体 SHA、附件 SHA 与配置 payload，而不把麦克风 GLB hash 当整个握持版本。眼镜未被强加麦克风 fit 限制。
- 技术舞：源 UAL SHA、导入 ID、实际指定 clip、全部时间输入单调且有限、真实约 7.2 秒、201 channels；single-play/props/root 语义保持。候选目录还需配置与 canonical 源相同、生成的 source-qa 全部布尔通过。新设计故意改参数时会拒绝“旧版本可重复”结论，须明确生成新版本再接入，不自动放宽。
- 女性派生：原完整 blend/VRM 保留，派生 editable blend/两次导出/body catalog pin 一致；每套四件服装角色 ID 集合与实际 manifest 一致，服装权重和真实 raw bind 矩阵匹配各自精确新身体，不能用原女性/另一变体 hash 替代。

五条现有流程均实际只读验证通过。`qa-flow.py` 有 10 项回归：重复流程ID、越界写入范围、缺失脚本、远程资产URL、错误身体fit、过期GLB hash、20mm逆绑定破坏、未知raw骨、错误GLB长度，以及五条真实资产验证前后哈希不变。负向修改仅在内存中，不改源资源。

## 必须保留的生产边界

1. 男短裤支持已有 blend 的几何/UV/权重编辑回导；`build-shorts.py` 后无 `--reuse` 的保存会重建 blend。旧 `m1b/build.py` 还会重写仅三件原装备的清单，因此调用它后必须补短裤链，不能意外丢 outfit2。
2. 附件当前**可重复的是 parameters 驱动**。保存的 blend 可编辑，但没有现成“任意手编辑 blend→完整规范化清单”回导入口；不能谎称双向编辑已完备。默认无 `--output` 会覆盖两个源 blend 和 public manifest。比较命令还会写 audit-report，因此它不是只读验证。
3. 女性 `build-variants.py` 会从原件重建两个派生，覆盖手改派生源；`audit.py` 会写 public catalog；`verify-rebuild.py` 会实际重写两套装备。均明确列为有写入的后续命令。不要因名字含 audit/verify 就在只读任务里执行。
4. 技术舞的源参数暂在 public 路径，已诚实登记，不为这项有界入口迁移目录或重写动作管线。导出器同时产生技术舞和参考舞及 manifest，需要成组审查；结构读回不能代替男女同房间的完整动作/鞋/衣/手验收。
5. 新几何/纹理/握持/参数版本变化应更新相应源版本和精确身份，再重新生成匹配清单并验收。不要为让 CLI 变绿而修改旧 hash、关闭绑定校验或继承旧录屏。

## 失败及恢复

源或工具缺失时，入口指出具体文件；源hash不符时先区分合法未发布编辑与损坏，保留编辑，不自动覆盖。GLB hash、clip、骨或权重失败时保留候选目录和日志，不替换运行版本。批量脚本中途失败可能已经写出部分文件，应在隔离 worktree 中检查声明的 `writes` 范围，只回退本次生成文件，不删除原编辑源或用户修改。确认源/输出配对后，再跑对应阶段及只读回读，最后由负责人建立新固定构建和真实回读/视觉证据。

CLI 不创建隔离工作区、不做发布、不更新能力状态；它把现有入口与危险边界统一展示，后续真正源修改→导出→重开→接入→完整动作验证仍需逐项执行。


## 独立角色记录接缝（D01）

在已加载的对应人物上，agent调用 `__debug.captureCharacterRecord({identity:{id,name,gender}})` 保存完整记录；同基模可以保存多个不同ID。`__debug.restoreCharacterRecord(record)` 走共用外观/服装/道具prepare与同步提交，不直接写骨骼。输入来自已保存JSON也可以使用字符串。更新使用 `captureCharacterRecord({previous,expectedRevision})`，保留身份并递增revision。当前源码的主工作台restore会按记录自动选择身体：先在离场候选上准备完整造型/道具，再编译与替换；失败保留旧人物。底层restoreRuntimeCharacterRecord仍只处理匹配身体，独立对照实例不自动换体。固定发布状态只查CURRENT与CAP。

文件端 `scripts/character-record-store.mjs` 导出 `putCharacterRecord(absoluteRoot,record,{expectedRevision,validateResources})`、`readCharacterRecord`、`listCharacterRecords`；保留运行时导出的envelope而不重造时间戳。结构校验callback只返回pending，真实准入由游戏restore检查当前manifest及实际准备的资源/fit。CLI `list --root ABSOLUTE`、`validate --root ABSOLUTE --id ID`只做文件查询/结构hash校验，不声称已运行。磁盘同ID锁与CAS防覆盖；锁超时不自动夺锁，异常残锁由agent确认没有持有者后维护。

记录额外保留liveAccessories（mic/glasses启用状态、资源SHA、身体适配SHA、握麦使用配置）与派生资源身份清单。修改或伪造fit内部版本即使重算record SHA，仍须通过实际资源准备的一致性比较。旧appearance配方保持原语义，不自动增加道具。早期未发布source-only character-record缺liveAccessories时runtime拒绝保旧，不默认清空装备。数据不含动作时间、讲话状态、摄像机、收益或账号。

验证入口 `node scripts/run-fixed-check.cjs FIXED_DIST scripts/qa-character-runtime-record.cjs NEW_EVIDENCE_DIR`：两具原生体实际装备→独立记录/磁盘保存→关页回读→实际恢复→1倍速讲话、错误hash、错误fit、503、最后域提交异常与重试；旧控制器的回归见qa-whole-look-transaction.mjs。技术通过范围仅以CAPABILITIES和对应build报告为准。

工作台外观底部“完整角色记录”调用同一controller.captureCharacterRecord/restoreCharacterRecord接口。新建稳定身份后保存、选择恢复、JSON下载/读取；姓名绑定后保持原身份，外观跨体可显式更新同ID。旧草稿/配方入口不改语义。浏览器索引zbgs:character-records:v1使用Web Locks与已见raw比较，索引损坏/旧标签页覆盖/旧版本JSON拒绝保原；无Locks不静默无锁保存。该浏览器索引不是联网存档。独立磁盘store仍负责agent文件CAS。

跨体回归：qa-character-cross-body.cjs；按钮/文件/双标签页/坏索引：qa-character-record-ui.cjs，均通过run-fixed-check.cjs运行在指定固定目录。runtime资源清单是引用身份列表，不宣称完整传递依赖包；源码fixture必须随检出提供。

服装材质补充：新完整记录增加 `equipmentMaterials`（`garment-material-record-v1`），逐件保存已穿装备 ID、GLB SHA 及 active 配方身份；null 明确表示源材质。旧 appearance 配方语义不变。无材质变体的历史角色记录可确定迁移，返回 `materialMigration=legacy-record-with-no-material-variants`；有材质变体而未保存选择的旧记录拒绝猜测，agent在保留旧版中还原并确认后重新捕获，不伪造版本。材质准备不改可见mesh，整套同步提交后才释放旧材质，后域失败逆序回滚。`qa-character-material-record.cjs` 在固定build上检查真实材质加载、关页恢复、HTTP失败、最后域故障、同值重选与连续恢复；测试报告区分技术与视觉。


## 完整角色记录的实际制作入口（D02）

固定构建上的后台浏览器复用游戏人物加载器、装备事务和最终记录准入。无需桌面或工作台草稿，也不根据名字跳过精确基模适配。

```powershell
node scripts/character-production-cli.cjs --dist FIXED_DIST --request REQUEST.json --out NEW_RESULT.json --evidence NEW_EVIDENCE_DIR
node scripts/character-record-transport.mjs import --root RECORD_STORE --input NEW_RESULT.json
node scripts/character-record-transport.mjs export --root RECORD_STORE --id STABLE_ID --out NEW_EXPORT.json
```

请求格式 `character-production-request-v1`。`query` 需要 bodyType；`create` 需要 bodyType 和显式 identity（id/name/gender）；`edit`/`validate` 需要完整原记录，禁止偷偷替换身份或身体。edits 是按序执行、最多32项的数组，支持 appearance、geometry、outfit、material、liveAccessory、accessory；具体枚举先 query。未知字段、未登记适配和版本错误明确失败，不自动夹取或冒用旧身份。

编辑在独立候选上执行，成功保留身份与来源并增加修订；失败销毁候选，不改已显示人物与原文件。create/edit/validate 都真实加载资源，记录结果再经消费入口回读。query 是登记能力，不能代表每个组合已经视觉通过。旧 flow.py 的源模型制作、VRoid 导出仍是上游步骤，本入口只组合和调用已有合法资产/变形接口，不凭空生成新网格。

输出必须是新文件且位于 evidence 目录之外；必要浏览器关闭和证据写入结束后原子发布。文件传输层复用 CAS、锁和完整性检查，但单独 import/export 返回 resourceValidation=pending，不冒充运行验证。候选动画仍须房间完整动作检查。

任意1–4份已通过实际生产回读的记录可组成 JSON 数组，经 `game-record-cli.mjs inventory/export --records RECORDS.json` 输出独立包；两步使用同一数组与仓库审定运行时。入口 `record-consumer.html?records=/records/manifest.json`，最多同时两人，新增记录不改通用控制器或重新编译。没有随机生成或自动开放不兼容资源。

## 参数批产接缝：离线包准备

```powershell
python -B scripts/production/native_import.py --batch scripts/production/native-import/batch.json --output output/native-import-candidate
python -B scripts/production/test_native_import.py
```

新入口读取版本化JSON，不按face/waist分支执行；现有两个spec消费已审核的源体、三件衣物和覆盖数据。每条核实际人体SHA、资源引用、raw骨/逆绑定和文件集合，整包准备后发布到output，失败单列且退出非零；成功兄弟保留，完整相同包重试复用，不覆盖不同版本。旧stage入口保留输出语义并共用这些spec。仅在output候选区工作，不直接更新固定工作台。

这不是原生参数制作器，也不自动重绑、生产颜色/服装或修改foundation注册。源/新参数→导出、受影响适配→共同登记仍是当前主包缺口；新产物需真实验证后再进入D02。不同身体SHA不允许仅改标签沿用旧装备。导入结果明确runtimeAdmission=pending；暂不支持任意装备组合，当前合同为top/bottom/shoes三件。

## 同模板原生参数批次（当前仅已观察值）

```powershell
python -B scripts/production/native_authoring/runner.py --execute-native --batch scripts/production/native_authoring/facecontour-pair.json --output assets-source/NEW_BATCH_DIRECTORY
```

必须新输出目录；VRoid MCP 0.15.0已运行且入口为干净已保存文档或主菜单。runner不启动/关闭应用、不占桌面，发现未知状态拒绝恢复。具体说明和测试在scripts/production/native_authoring/README.md。两份配方共用一份模板与参数定义，不是每人一个生成脚本。需新增参数机制或合法范围时以真实工具数据补模板声明，不能直接放开任意浮点值。

真实v2已完成两参数配方，另复跑一项VRM字节一致；原生保存容器并非字节相同。输出中的result/manifest保留实际身份，原始失败目录不会覆盖。接着用scripts/production/native_dependency_delta.py显式baseline/candidate路径及SHA生成变化清单；它不签发装备fit、许可或游戏准入。完整身体和装备适配/运行时登记仍需下一段执行，不能将这些源VRM直接当正式人物库。
