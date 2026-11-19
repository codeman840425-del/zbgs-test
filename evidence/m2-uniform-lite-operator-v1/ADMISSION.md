# 1K 制服的制作与准入核查

后续固定游戏 `4959572f6d5e` 已对新签 `e9a1c33d…`、`54ade1c3…` 补齐男女房间动作、双人换装失败保旧、两版本 Chrome 冷开、整包复算和开发机双人短测。以下表格保留 `b37d45ef0fe4` 针对当时原签的核查。正式准入仍为 0/2。[新签实包与同镜头录像](../m2-motion-response-compat-v1/README.md)

**当前可做项目内技术制作与游戏复验。正式整套准入 0/2。** 固定构建 `b37d45ef0fe4`、源码 `553906dbac9d1ca5e2464e004ff5ef23d71ede0c`。已用 `source_commit` 和 `verify_runtime_source` 复核干净检出及全部构建输入字节。现有 `technical-candidate` 模式可制作签名记录、独立游戏包和回放。正式计划已逐项拒绝，`outfit_admissions.json` 的审查索引当前为空。[制作规范](../../docs/PRODUCTION-PARAMETER-CONTRACT.md) · [候选计划 2 条](plan/plan.json) · [正式计划 0/2](formal/plan.json) · [整套审查索引](../../scripts/production/outfit_admissions.json)

本次只审原色 `pants-top-far`。女 `source-female-uniform-texture-v1`（身体 `1049f87a…`、outfit 5、原签 `4e930af1…`），男 `source-male-cc0-texture-release-v1`（身体 `2e66ee6c…`、outfit 1、原签 `154d3010…`）。本目录重新制作的 `records.json` 同配方，生成时间和签名为新身份 `e9a1c33d…`／`54ade1c3…`。下面的房间、恢复和预算证据以原签为准。[原签](../m2-female-uniform-texture-game-v1/far-records.json) · [重生记录](records.json) · [实际文件及逐件 fit](../m2-female-uniform-texture-game-v1/receiver/closure.json)

| 正式证据项 | 现有证据与下一步 |
| --- | --- |
| `equipmentFit` | 男女各三件按身体 SHA、装备 SHA、fit ID 和槽位实包回读。女 1K 遮挡与 VRM 实际索引的 252 个三角形完全一致，男登记保留完整身体。已有强静态依据。维护者须结合该版整套接触复验审定，所见肩领、袖口、下摆及鞋／座接触按实际记录。 [女 fit](../m2-female-uniform-texture-game-v1/fit.json) · [男 fit](../m2-cc0-body-release-fit-v1/report.json) |
| `normalSpeedMotion` | 女性原签的同版房间报告已实际通过 `verify_room_report`，附 1× WebM。要求同一完整记录正常速度走、坐、起、再走，报告零错误且恢复到同一 SHA。男性已有旧构建 `f4966554bcfc` 回放，当前原签没有对应同版报告与影片。 [女房间报告](../m2-female-uniform-texture-game-v1/room/report.json) · [女实拍](../m2-female-uniform-texture-game-v1/room/room-produced-1x.webm) · [男旧证](../m2-cc0-body-release-game-v1/room/report.json) · [现有采集脚本](../../scripts/qa-production-record-room.cjs) |
| `recordAndRestore` | 两个原签都已用 `verify_runtime_readback` 直接核过下列两份证据。核对同版清单、零页面／资产错误、完整外观／道具／材质／发中线，以及冷开新实例。另有逐次网络和上衣验证的 `cold-far`，可作辅助。 [正式读取形状的双人报告](signed-game/report.json) · [固定包清单](../m2-female-uniform-texture-game-v1/receiver/far-inventory.json) · [网络回读](../m2-female-uniform-texture-game-v1/cold-far/report.json) |
| `selectionGuards` | 女性 503 留旧上衣与遮挡已有实测。仍需对两条确切记录产生门可读的报告，逐人核错身体／装备或坏记录拒绝、失败现场不变、有效重试修订号，并对比前后完整配方 SHA、资源身份及可见三件装备。既有脚本固定四件裤袜，可复用其回归方式。 [女性换装证据](../m2-female-uniform-texture-game-v1/outfit-rollback.json) · [裤袜负例脚本](../../scripts/qa-production-outfit-selection-guards.cjs) · [读取合同](../../scripts/production/outfit_admission.py#L130) |
| `runtimeRecordAndBudget` | `m2-technical-v1` 静态预算已通过，女身体 96,469,680 B、男身体 92,625,244 B，均低于单体 100,663,296 B。两件 1K 上衣各 5,941,928 B，均低于单衣 16,777,216 B。双角累计 209,367,384 B RGBA8 mip 估算，实包 43,841,934 B。完整预算需对同一 bodyType／body SHA／record SHA 交付 `native-budget-admission-v1`，标明版本，`transport`、`decodeCanvas`、`gpu`（含资源生命周期）和 `ordinaryPC` 均有通过证据。现有实包 HTTP/冷开可作为传输层依据；静态报告被该解析器拒为不支持的 schema，解码与 GPU 成本、目标机测试仍须按确切记录补齐。 [实包预算](../m2-female-uniform-texture-game-v1/receiver/far-budget.json) · [四层合同](../../scripts/production/native_batch_gate.py#L382) |
| `humanVisualReview` | 有录像、坐姿和 4090 开发机取样。当前没有两条确切记录的人类观感通过回执，也没有普通电脑实测。请分别留具体候选、画面时间段、实际复核者和结论。 [回放与限制](../m2-female-uniform-texture-game-v1/README.md) |
| `provenanceAndRights` | 现有原文与实际资源已足以核对项目内技术制作的来源链。正式登记须由维护者签所采用用途范围。公开发行另按实际整包审定，见下。 |

## 权利原文与范围

- 本地发布页把原件归属 VRoid Project，上传者 hecko 明载旧 β 0.14.0 无优化导出。两旧源的 VRM0 记 CC0、Everyone、commercial 允许，嵌入权限链接含修改及再分发；派生体的整个 VRM0 meta 与各技术父体相同。旧 New model 专页的 CC0 依据仅及指定旧模型。当前是带原件 SHA 的第三方导出，欠官方 β 逐字节核对及原 `.vroid`。两件 1K 上衣是已留档的同源底色缩图。男裤鞋抽自旧男模型，女及膝裤是项目从旧女体拓扑制作的独立裁片。 [发布者原文副本](../../assets-source/foundation-male/publisher-page.html#L232) · [男源](../../assets-source/foundation-male/LICENSE.md) · [女源和嵌入权限](../../assets-source/foundation/source.json) · [旧模型官方条件](https://vroid.pixiv.help/hc/en-us/articles/900000088126-New-model) · [女衣制作档](../../assets-source/m1/README.md)
- 本次 33 个清单文件实际没有冻结 Pexels／Rokoko 动作文件。随包 Quaternius UAL 来源为原作者 CC0，另有项目派生的 jog、技术舞及招手，项目代码、编排及女裤衍生成果的公开交付范围由权利方确认。按本版实际 JS 和锁复核第三方 notice，旧单体版的 MIT／CC0 notices 是原文对照。当前 Studio 预设和公共角色生成服务继续按其独立条款处理。 [本版清单](../m2-female-uniform-texture-game-v1/receiver/far-inventory.json) · [Quaternius 原文](../../prototype/licenses/quaternius-CC0.txt) · [旧构建原文 notices](../m2-cc0-body-release-fit-v1/rights/THIRD-PARTY-NOTICES.txt) · [历史来源边界](../../docs/FOUNDATION-ASSET-AUDIT.md)

## 制作 Agent 使用方式

在项目根从独立矩阵走已验证的候选入口，使用新输出目录。交接现有证据时保留原签身份。

```powershell
$fixed = 'experiments/worktrees/female-uniform-553906db'
$matrix = 'assets-source/variant-matrix-v1/uniform-lite-top-matrix.json'
$request = 'assets-source/variant-matrix-v1/uniform-lite-top-request.json'
python -B scripts/production/variant_batch.py $matrix $request --root $fixed --input-root . --diagnostic --output output/uniform-lite-admission-review
```

正式用途走现有 `zbgs-whole-outfit-runtime-admission-v1`。这两行 `uniform-top-v1 / basecolor-1k-v1` 已用固定源码验证独立矩阵；当前构建编入的 `representative-matrix.json` 没有两行。正式计划启用审查索引后只接受其固定源码内的编译矩阵。先将精确候选行纳入编译矩阵并固定新构建，再关联七项证据与同版同签记录。收据固定 style／version、身体、矩阵配方、资源／fit／coverage 文件及 SHA、角色套装 role 和全件 id／slot／SHA，以及原签单记录、reviewed runtime、原始 build-info。每项需 `passed` 和工程内 path／SHA／bytes。通过后由维护者登记，使用上面相同的 planner，去掉 `--diagnostic` 并传新固定检出的编译矩阵。外部记录构建审查仅证明选定资源打包可复验。 [固定矩阵约束](../../scripts/production/variant_batch.py#L301) · [收据校验](../../scripts/production/outfit_admission.py#L147) · [本版独立矩阵](../../assets-source/variant-matrix-v1/uniform-lite-top-matrix.json) · [本版运行时构建审查](../../scripts/runtime-package/game-record-female-uniform-texture-reviewed.json)
