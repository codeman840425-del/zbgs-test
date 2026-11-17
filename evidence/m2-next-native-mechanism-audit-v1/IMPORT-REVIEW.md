# 原生脸型与腰围两套资源的批量导入审查

**本次检查的是已制作资源的离线准备。** 两个历史样件来自同一女性编辑源 311a1b。脸型原生 VRM 89aa70 经完整皮肤回填成为游戏体 cc0843；腰围原生 VRM 22448d 对应 cf1574。两件共享 843acc donor 的 Body PNG，身体几何和衣物绑定仍各自独立。映射可从 `assets-source/native-vroid-geometry-production-v1/manifest.json`、`native-vroid-geometry-factory-input-v1/body-image-preflight.json` 以及该包 `readback.json` 按实际 SHA 连起来。只读源码审查，未启动编辑器、运行游戏或独立重复根任务的两包导入。

## 最小数据及验证职责

| 入参或已有生产回执 | 应核对什么 |
|---|---|
| 版本、bodyType、包名/URL 根、明确的 bodyFile 与 bodySha256，七项输入的相对源路径、目标路径和 SHA | 一份 VRM、三件不同 GLB、equipment.json、覆盖 manifest 和 PNG。读实际 VRM 验 SHA，再与每个 compatibleAvatarSha256 比对。staging-manifest.json 是第八个生成文件。历史清单包含有序 sources，迁移需同时保持字节与顺序。 |
| 源生产回执、派生体身份 | 原编辑源/参数和冷开回执、导出 VRM、donor、操作后的 body、提取记录可由相对路径与 SHA 引用，留在制作证据中。核生产记录的 `sourceSha256 → outputSha256`，不能只改 JSON 中的目标 SHA 就声称原生导出对应此体。当前导入消费已审核输出，尚不从编辑源或任意参数重建。 |
| 该身体对应的 equipment.json、三件 GLB、已有提取/fit 记录 | ID 唯一，top/bottom/shoes 各一，每件 SHA、尺寸、实际皮肤、骨语义、raw binding、IBM 对应目标身体。现有 `scripts/native-vroid-equipment-extract.py` 以源 node/mesh/skin 及逐槽 primitive 为输入。严格几何生产证明还需核原 primitive 的 indices/POSITION/NORMAL/UV/JOINTS/WEIGHTS、节点 rest/祖先、材质、图及动态配置，必要时比较受影响姿态。 |
| 该身体的覆盖与原图 | 精确材质、base/shade 图的实际消费者、basePngSha256、mask PNG SHA、尺寸、alpha 阈值、每件 required/covered 和槽位。新几何重用皮肤图时还需当前体的 UV/材质映射、原生穿衣输出或相当的 mask 来源、RGB 保持与 alpha 差。已验证的 waist mask 有 608383 个像素仅 alpha 变化。`assets-source/native-vroid-waist-body-texture-fit-v1/README.md` 记录了比较来源。 |

## 原 staging 与新入口

旧 `scripts/stage-native-face-factory.py` 的 plan 对列出的资源逐 SHA，核三 ID、装备文件字节与覆盖引用。它没有指定或读取某个 VRM 来证明该文件的 SHA 就是 bodySha256，未核每槽唯一、required、身体嵌入的 base PNG 或实际骨绑定。硬编码的脸、腰两份数据仍有上游真实生产证据。stage 先查现有文件冲突，随后逐文件硬链接；单文件创建完整，中途 I/O 失败会留下先提交的文件。旧兼容入口仍用于复现历史输出。

新 `scripts/production/native_import.py` 审查版本 SHA 为 `62a600f7788caf4e23baf88068cfd10898ccfa89aa83c84adc213a949656d652`，`native_import_bindings.mjs` 为 `14bb6132a573a6a3dd1e67b53d87fd7600aea9a07b29544aa9352b4198758c39`。它明确 bodyFile，核声明 pin 和实际 VRM 字节、槽位、required 及嵌入的 base/shade 图与 PNG 尺寸。Node 辅助脚本重新读暂存的 VRM 和三件 GLB，核字节身份及 `verifyEquipmentBindings` 的目标/衣物骨和 IBM。新包先在同父临时目录准备，整目录校验后 rename；既存包逐文件完整比对再复用，每件失败单列。离线检查适用于源码列明的三衣合同；未测量重蒙皮、穿模与动作效果。

审查版本有两个可收窄的边界，已交根任务。第一，`files` 允许未引用的文件或与生成清单重名的键，三个不同装备 ID 也可指向同一 GLB；固定三衣入口应比较七项精确文件集合、互异 URL 及保留名。第二，两个并行请求对同一空目标同时 prepare 时，后提交方 rename 可能失败；胜者的包仍完整，后提交方可复核胜者字节相同时报告复用。顺序重试已有精确比对。此段指上述源码快照，集成后状态以新版本回归记录为准。

## 可复用检查

- `evidence/native-face-factory-independent-v1/staging-regression.py` 与已存 `staging-regression.json` 涵盖历史八文件字节和 mtime、末项冲突保原、错源 SHA。该脚本把报告排他写回既存证据目录；重放用新输出位置。新入口另测真实两包与两份原八文件精确一致、失败兄弟隔离、重试时成功兄弟 mtime 不变。
- 两个 `assets-source/native-vroid-{face,waist}-factory-equipment-v1/verify.mjs` 将实际 raw GLB 与相应源 VRM 对照并做 rest、步态、坐起三种 CPU 姿态。共用 `scripts/verify-catalog-bindings.mjs` 仅查 raw bone/IBM 关系及 skin 属性存在，单独调用不足以证明权重数值、所有 primitive、辅助骨 rest 或动画接触。
- `evidence/native-{face,waist}-factory-independent-v1` 的 stage、coverage、admission 和 floor 相关证据可分别引用；已有结论绑定到各自精确候选。对新身体，覆盖 PNG 字节/尺寸匹配只证身份。覆盖正确性与游戏注册/关闭恢复需要各自实测。
