# 两条原签的三项验收缺口

本页对应 `public-batch-a`、`public-batch-b` 原签，运行 `bc42048f / 241ce1c278f0`，普通包清单 SHA-256 `0d3edadf098d99d985a816adccdaa7a97895498f6c7da3006cd849cdafa5e392`。提交资料须绑定本版、两条原签及各自的身体、三个装备和适配摘要。仓库整套审核索引当前为空，以下三项均未登记通过。[固定包身份](build-and-package.json) · [整套审核索引](../../scripts/production/outfit_admissions.json)

## 普通电脑实测

- **既有决定和参考配置。** 用户于 2026-11-15 确认“暂时没有，保留实测缺口继续”。目前没有已登记、可安排的普通机，现有样本均来自开发机。暂定参考为 Windows 11 / Chrome、i5-1135G7 / Iris Xe / 16 GB、1440×900、60 FPS（每帧约 16.67 ms）。未找到另外获批的 p95、长帧比例、冷开时间或持续时间阈值。暂定资产静态预算单列。[用户决定](../ordinary-pc-deferred-2026-11-15.json) · [设备与采样尺度](../../docs/M1-QA.md#目标设备与未验证项) · [能力表 PERF-01](../../docs/CAPABILITIES.md) · [里程碑](../../docs/FOUNDATION-MILESTONES.md)
- **接入与交件。** 设备可用时，技术负责人可沿 `run-fixed-check.cjs` 和 `qa-record-budget-runtime.cjs … --ordinary-package <清单SHA>`，使用 `output/m2-rule-image-release-build-v1/game` 与已归档 `records.json`。该入口现支持 `--capture-config`，可在真实机器用已安装的系统 Chrome 运行，并记录声明的设备、实测浏览器、WebGL 渲染器、视口与各组帧间隔。采集站立讲话时可按 1440×900、单人 A、单人 B、双人三组复用相同包。选择单人的测量始于双人冷开后；走坐起性能及普通机整段接触仍须另外实测。16.67 ms 用于对照，正式统计判定须有明确尺度。现有同版开发机回执只可定位性能量级。[固定服务](../../scripts/run-fixed-check.cjs) · [归档原签](../m2-rule-batch-delivery-v1/records.json) · [普通包采样脚本](../../scripts/qa-record-budget-runtime.cjs) · [本版开发机回执](current-cost/report.json) · [旧工作台 30 秒采样](../m1-fixed-perf-77e46efb5441/RESULT.md)
- **正式入口。** `budget_admission_index` 要求 `native-budget-admission-v1`、确切 `bodySha256`、`recordSha256`、预算版本，且 `transport`、`decodeCanvas`、`gpu`、`ordinaryPC` 四层均为 `passed`。当前脚本只核对结构、状态和身份，原始实机与各层证据需随审核交件。普通机确认后仍须补齐该构建其余层的正式证据。[四层预算校验](../../scripts/production/native_batch_gate.py#L382) · [整套校验](../../scripts/production/outfit_admission.py)

## 人工观感

- **批准人及尺度。** 观感和产品选择由用户决定，技术负责人负责采集、核身份和提交。2026-11-15 原话允许动作连贯时的轻微穿模，仍要保留其时间点和范围；明显肢体错位、跳姿、持续滑步和严重穿插须处理。过去用户仅接受所展示的 `77e46efb5441` 链作为下一阶段基础，两条当前原签仍待决定。[项目职责](../../AGENTS.md#继续有效的项目规则与历史阶段记录) · [用户原始量表](../visual-acceptance-scale-2026-11-15.json) · [历史实批回执示例](../m1-close-77e46-user-review.json)
- **最短观看材料及提交。** 用本目录两段 1× 单人房间片核对实际服装下的走、坐稳、起身、再走和座位接触，再用同版双人片核对两名角色的普通游戏正常速度招手及同屏效果。房间技术状态为 `technical-pass-visual-candidate`。取得用户真实决定后，按既有回执方式记录原话、来源、范围、构建、原签和录像的路径与 SHA-256。真实回执可随本版证据归档，由 `humanVisualReview` 以项目内 `{path,sha256,bytes}` 引用。正式动作项 `normalSpeedMotion` 另须同版单人报告和 `.webm`。保留现有录像即可提交这两套的观感材料。[A 走坐起 1×](public-batch-a/room-produced-1x.webm) · [B 走坐起 1×](public-batch-b/room-produced-1x.webm) · [双人招手 1×](game-cold/dual-external-cold-1x.webm) · [证据入库代码](../../scripts/production/outfit_admission.py)

## 来源与权属

- **已持有的声明与材料。** 归档源 VRM、发布者页、下载 ZIP 和 VRM 摘要、旧版官方许可页定位以及本地说明均可核对。项目归档将源记为 hecko 发布、归属 VRoid Project 的旧版 VRoid Studio beta 0.14.0 导出；源 VRM 内含 `CC0`、Everyone 和可商业用声明。配方模板将 1K 身体和项目自制的下颌端点绑到此原件。上衣、长裤、鞋的原件到最终 GLB 复算已有旧样本证据，当前两条签名及接收方一份盲例已逐件重建；复核给出每条签名对应的身体、装备、源材料及成品摘要。[当前三份逐件回执](../m2-rule-outfit-source-v1/README.md)归档没有原始 `.vroid`，也没有与官方对应导出的逐字节比对；这些是已知来源限制。声明范围只覆盖该旧资产，其他动作、软件以及当前 Studio 预设有各自条款。[归档说明和许可](../../assets-source/foundation-male/LICENSE.md) · [源与哈希](../../assets-source/foundation-male/source.json) · [存档发布者页](../../assets-source/foundation-male/publisher-page.html) · [配方端点](../../assets-source/rule-body-recipe-v1/template.json) · [旧逐件来源复算](../m2-first-rule-delivery-v1/budget/source-rights.json)
- **审批人和实际关口。** 仓库有 `provenanceAndRights` 必需项和制作方审核索引，未发现另行指定的权属审批人、现成的逐许可自动审查器或这两套的权属批准。代码检查每份证据有精确仓库路径、大小和哈希及审核状态，许可判断仍由获授权的人审查。由项目负责人整理原件、逐件派生和本批身份、拟公开分发范围及缺件交审，并确认权属审核归属；涉及新素材授权的决定仍按用户现有规则办理。取得真实权属结论后，才随同版其他必要材料由制作方登记正式索引。是否还需原始 `.vroid`、官方对照或权利人书面授权，由该范围的实际审查决定。[用户授权范围](../../docs/research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt) · [正式项与文件级检查](../../scripts/production/outfit_admission.py) · [制作方准入入口](../../scripts/production/variant_batch.py)
