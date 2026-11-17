# wall-shelf contract audit

- 审查类型：只读代码/目录合同审查。未运行浏览器、GPU、服务或运行时录像。
- 工作树：`codex/company-platform-c1`，当前头 `035ed5de7ce49325b94ceb974ef391ee983e50bf`。合同记载的生产基线为源码 `9aa10e36bed6128e869c3c246b4c563330456985` 和构建 `5d260122791d`。
- 范围：`assets-source/company-environment-specs-v1/branches.json#wall-shelf`、现有 wall mount/support-surface/事务/保存/观看实现，以及新落盘的 `docs/COMPANY-WALL-SHELF-CONTRACT-v1.txt`、`wall-shelf-data.js`、`wall-shelf-samples.js`。

## 结论

现有通用合同足以承载拟定的静态 wall-shelf 组合，条件是四个资源都遵守同一 `mounting`、`supportSurfaces`、`supportNodes`、`footprint` 和子物安装合同，并通过真实 GLB 几何门。北墙 `yaw=0`、东墙 `yaw=3π/2` 的 root 位置和资源局部 `+Z` 朝房间与现有墙面规则相容。`footprint.blocking=true` 也可接入当前静态占地图，但它代表保守的 XZ 地面投影，不是结构承重或角色导航完成证据。

当前目录已有四个项目参数化 GLB 及 CPU readback 证据（`evidence/company-wall-shelf-production-v1/report.json`），但它们尚未登记进 `library-catalog.json`，因此当前游戏 catalog 仍不能宣称 wall-shelf 可用。现有四项 `support-shelf-*` 是 `mountRole=storage-shelf`、无 `mount` 的落地架。`wall-shelf-samples.js` 在 catalog 登记前会因找不到首个 wall-shelf 资源而失败。Kenney bookcase 候选也只能作为落地源候选，不能由名字或截图推成壁挂资产。

## 已确认可复用的接口与数据流

- `support-data.js:11-52` 校验支持面字段、唯一 ID、支持网格映射和支持面位于 blocking footprint 内。`wall-shelf-data.js` 通过 `support-data.js:3,15` 接入，固定校验 `mountRole/productionBranch=wall-shelf`、`mount=wall`、1×1.8×.35m mounting、三层面、blocking footprint、无状态/使用点。
- `document.js:177-190` 递归解析父图并用 `effectiveSupportTransform` 组成世界 TRS。`support-data.js:55-60` 对静态父架直接保留子物局部 `position/yaw`。父移动、四分之一转向和 assembly 变换会自然传递到子物。
- `document.js:262-285` 对 `mount=wall` 资源按四分之一 yaw 推导北/西/南/东墙，核墙内平面、宽高、2.8m 高度上限以及门洞冲突。它不把 support child 当 wall root，child 应直接以 wall shelf facility 为 `parentId`。
- `support-data.js:62-107` 要求 support child 直接挂到 facility，`attachment` 只能有 `surfaceId`，并检查局部 `y==surface.topY`、旋转后 XZ 包络、净空高度和同父子物重叠。拟定 patch `center.z=.19, halfSize.z=.10` 时，.18m 深的现有 life-item child 必须使用局部 `z=.19`，使用 `z=0` 会被 `invalid-support-fit` 拒绝。
- `support-geometry.js:76-138` 的实际网格门要求每个 support node 有两块向上、共四角、同一矩形顶面，且真实顶面覆盖声明 patch。`support-geometry.js:140-164` 用 AABB 检查其他网格不得侵入净空。`asset-library.js:166-213` 另核 GLB 无外部挂载包络越界，wall/bottom mounting 的 z 范围为 `[0, depth]`。
- `document.js:347-372` 的 subtree copy 会重新分配 root 与所有后代 ID，保留子物 `parentId`、`attachment` 和局部 transform。`document.js:472-477` 的 `attach-surface` 走事务，最终由 derive 重新拒绝坏父/错面/坏变换。`document.js:499-509` 的 resource replacement 经 `compareFacilityFunction` 比较，包含 mounting、supportSurfaces、footprint、mount 和状态字段而忽略 supportNodes 网格名，因此同功能换款可保留实例与局部覆盖，改功能面或净空会拒绝。
- `persistence.js:10-46` 保存依赖会固定资源 ID/version/内容 SHA，关闭恢复重新 derive 和依赖核对。`authoring.js:12-25,47-76` 在发布事务前预加载当前楼层资源并在候选失败时保留旧场景。
- `render.js:82-89,115-120` 以递归 group 建立 parent→child Object3D 层级，wall shelf root 的 wall transform 和 child local transform因此一致。`wall-visibility.js:37-52,115-132` 按墙段分组，`render.js:322-348` 对 wall root 设置 `visible=false` 时其后代 child 因 Three.js ancestor visibility 一起不可见。`render.js:354-361` 的 navigation 仍从 derived.obstacles 生成，隐藏只改显示。`render.js:415-425` 的 `wallPresentation` 只列有直接 wallBinding 的设施，不单列 support children，这是观测 API 的范围限制。

## 与拟定 fixed spec 的逐项核对

- `mounting={origin:'bottom',width:1,height:1.8,depth:.35}` 与 wall 分支元数据检查相容。root 在北墙/东墙局部底高 `.35` 时 world top 为 `2.15m`，低于 2.8m。
- 三面 `lower .35/.45`、`middle .95/.45`、`top 1.55/.25` 全部满足 generic support 面的正数范围。`center=[0,.19], halfSize=[.40,.10]` 位于 proposed blocking footprint `center=[0,.175], halfSize=[.5,.175]` 内。
- 每款局部几何必须真正处于 `x[-.5,.5], y[0,1.8], z[0,.35]`。目前 generic mounting gate 不要求底部或后背恰好接触边界，只要求不越界。
- blocking footprint 会作为二维障碍进入 `deriveCompany`/`inspectCompanyPlacement`，以半径 .22/.25 的保守方形扩张检查入口和门洞。靠近入口或门洞的壁架可能使布局被拒绝，即使视觉上它只贴墙。该行为与“墙架投影区不允许从架下穿过”的拟定语义一致，但要在验收中记录为静态占地选择。

## 最小缺口

1. **catalog/运行链尚未接入。** 四个项目参数化 GLB 已由 `scripts/company-platform/build-wall-shelf.mjs` 生成并在 `evidence/company-wall-shelf-production-v1/report.json` 通过 CPU 确定性导出/readback。仍需把 resource.json、SHA、版本和四项资源登记进 `library-catalog.json`，再以当前 catalog 重建样例和预加载链。
2. **独立 readback 仍有边界。** 新 wall-shelf builder 已检查至少一个 `z=0` wall-contact mesh、款式结构命名、包络、预算和 generic support geometry。它仍没有逐块核三层板的实际宽 `.92`、深 `.31`、厚 `.035`、板底 `topY-.035`，也没有验证后挂件/背板与每层板的实体连通，只检查支持顶面覆盖 patch 和款式名称。若这些是固定功能门，需继续补 readback，不能只由 metadata 或 generic support gate 代替。
3. **样例/UI 路由已落盘，资源仍未接入。** 当前 `appearance-samples.js:18-37,49-66` 已列 `wall-shelf` 并调用 `createWallShelfSample`，但 `library-catalog.json` 仍无四个 `wall-shelf-*` 条目，因此候选列表为空，样例首个资源查找仍失败。资源登记后需用 A 北墙、B 东墙、子物多层和换款入口实际运行核验。
4. **组合运行证据尚未产生。** 尚未证明四款逐款加载/替换、坏资源保原、父移动/换墙/复制、子物换层/局部覆盖、事务竞态、每款关闭恢复和 cutaway/full 来回。静态代码支持这些路径，不能替代实际证据。
5. **隐藏递归的可观测证据尚未产生。** 代码层面 ancestor visibility 会隐藏 child，逻辑 obstacles/document 不变。但 `wallPresentation()` 只报告直接 wall facility，不能单独证明 child 的显示状态，需在专门样例或渲染检查中记录父 root、child visual 和 navigation/saved document 三者。当前 wall shelf 的 assembly 路径已由 CPU 事务复现为明确拒绝：对 `wall-shelf/primary` 执行 `group-facilities`，错误为 `missing-mount-region`，路径为 `wall-shelf/primary`。原因是 `document.js:262-285` 要求 `mount=wall` facility 的直接父必须是 `room/area`，而 `group-facilities` 会把它的父改为 `assembly`，最终 derive 拒绝。`copy-facility`/`copy-group` 改到 assembly 也会在最终 derive 经过同一检查，因此不能把“进入 assembly 后离墙仍通过”报告为当前可达缺陷。`render.js:182-190` 使用局部 `node.transform` 的潜在风险只在未来放宽父级约束或另造绕过路径时成立，当前 wall-shelf 应保持直挂 room/area。

## 有限负例与预期拒绝

- wall root 的非墙父、非四分之一 yaw、墙外平面、超 2.8m、越墙宽度、覆盖门洞：`invalid-parent`、`unsupported-rotation`、`invalid-wall-fit`、`wall-display-over-portal`。
- child 未声明 `surfaceId`、错 parent、局部 y 非顶高、XZ 越界、超净空、同层/运动包络重叠：`invalid-support-attachment`、`missing-support-surface`、`invalid-support-fit`、`overlapping-supported-props`。
- wall replacement 改 mounting、support 面 ID/高度/范围/净空、footprint、mount 或状态语义：`incompatible-replacement`，原场景应保留。
- GLB 缺 support node、顶面不是两块向上共面三角、patch 不被真实顶面覆盖、其他网格侵入净空、mounting 包络越界：`missing-support-node`、`invalid-support-topology`、`support-clearance-occupied`、`asset-mount-envelope-mismatch`。
- 壁架 `blocking:true` 靠近静态入口或门洞：可能被 `blocked-entry`/`blocked-portal` 拒绝。这是二维保守占地结果，不代表墙体或承重求解失败。

## 未测界限与不应重测项

- 本审查没有运行浏览器/GPU/录屏，未测普通电脑性能、实际视觉美术、真实人物接近、抓取放置、结构承重或网络能力。
- support-geometry 的矩形/AABB/1mm 门、父子 TRS、save dependency pin 和既有落地 support-surface 样例已有独立合同/实现，wall-shelf 只需针对新资源和组合入口补证，不因目录标签重复宣称四款通过。
- generic support 仍是水平矩形、离散四分之一 yaw 和 AABB 规则，不涵盖曲面板、柔性结构、连续物理堆叠或真实墙体锚固。wall-shelf 的连接和板厚若未由独立门核验，应保持未通过状态。

## 审查状态

`CONTRACT-COMPATIBLE / INTEGRATION-EVIDENCE-PENDING`。拟定 fixed spec 与现有 wall/support/transaction/visibility 数据链相容，四款资源已有 CPU 生产/readback 证据，但仍须 catalog/UI 登记、板厚/连接独立门和组合保存/隐藏证据后才能从“可接入”升级为“已验资产”。







