# 公司配置与共享角色接缝

本目录拥有公司场景数据、设施实例、素材加载和显示资源，以首包固定源码 `c4b799d131dcb372ab3a740bff81e817a95ec626` 为起点，保留原角色模块。按用户长目标 v2，C1 先完成生产和预览，C2 扩规模、批量与移交，C3 再集中接入真实角色。日常独立实施，不把每个场景小问题交给总工。

## Agent 制作入口

在仓库根目录执行，输出文件必须尚不存在：

```powershell
node scripts/company-platform/company.mjs create output/company.json
node scripts/company-platform/company.mjs validate output/company.json
node scripts/company-platform/company.mjs apply output/company.json changes.json output/company-edited.json
```

示例 `examples/c1-two-stations.json` 包含两个独立组合工位，每个含桌、椅、显示器、键盘、桌面麦克风和补光系统。设备的父节点是桌子，椅子和灯是工位子节点。`c1-two-stations-alternate.json` 是整体旋转与桌子局部调整后的第二输入；`c1-studio.json` 增加真实 GLB 双人沙发和装饰。运行资源在 `library-catalog.json`，运行组合定义在 `templates-extended.json`（保留原 `templates.json` 的 v1）；保存数据绑定明确 ID、版本与内容摘要。

操作数组支持 `add-workstation`、`add-facility`、`copy-workstation`、`move`、`remove`、`replace-resource`、`set-state`，以及 `unpack-workstation`、`group-facilities`、`unpack-group`、`copy-group`、`add-room`、`add-area`、`set-room`、`set-appearance`。`document.js` 先在副本执行整组操作，检查后返回新文档；失败不修改输入。拆分保留实际设施身份和世界变换，桌面设备继续依附桌子；一般 assembly 是制作组合，不自动计为经营直播工位。

替换按 `appearance-contract.js` 比较固定功能，包括完整使用点、阻挡足迹、承载/安装、状态字段与语义；同名或同座位数不等于兼容。模型网格和接触网格映射可以不同，但必须在源端适配同一功能规格。外观覆写为 `{materials:{fabric:{color:'#345c83',roughness:0.9}}}`，只接受资源声明的材质槽。普通外观变化保留设施身份及原有效状态；新模型尺寸必须仍在固定功能包络内。旧 lounge-sofa@2 保留原存档语义，因足迹不同不再作为 sofa@1 的兼容换外观候选；timber-sofa@1 是同固定双座规格的真实不同木框造型。详细操作形状及失败例见 `evidence/company-authoring-operations-v1/REVIEW.md`。

坐标为米制、Y 向上、局部 +Z 朝前。实例 transform 为 position 与 Y 轴 90° 倍数 yaw；不支持实例缩放、倾斜或负缩放。房间和公共区域为 3–20m 的开放矩形，地面设施必须在所在楼层地面。原单间代表房为 9×7m，新增半面积民房样件为 6×5.25m，座高 .47m。绝对米数为当前样件，未代替用户最终产品观感验收。实际显示网格越界、超出桌面、阻挡重叠与非法依附均拒绝。

`placement.js` 用 .25m 保守预留、.20m 四邻接格点及连续线段检测检查每个声明接近/离开点。`room.entry={position:[x,0,z]}` 是房内检验起点，默认右前内侧；这不是实际门口。静态规则可能保守拒绝窄或斜通路。C2 已检查实际门户两侧端点、共享边穿越与同层连接图。最小门户 .60m，代表门户1.4m，宽度余量每侧.05m；门洞位置同时生成真实墙段和静态导航记录。C3 再验真实人物导航与接触，不把静态检查称为角色已通过。

## 新素材生产与登记

`assets-source/company-sofa-v1/` 保存两份实际可编辑参数。源修改后重新生成 GLB、登记摘要/适配和材质槽，再进入统一资源库，无需改通用渲染代码：

```powershell
node scripts/company-platform/build-sofa.mjs
node scripts/company-platform/build-sofa.mjs --check
node scripts/company-platform/build-timber-sofa.mjs --check
node scripts/company-platform/build-library.mjs
node scripts/company-platform/build-library.mjs --check
```

登记清单为 `scripts/company-platform/library-inputs.json`。新增标准素材提供 resource.json：稳定资源 ID/版本、来源/许可/可编辑源、米制方向基点、`asset:{format:'glb',url,sha256,bytes}`、占地、使用点、挂接/承载面、材质槽、设备状态等。不可复用旧版本给不同字节改标签。程序旧资源仍由 `facility-catalog.json` 生成，制作库为其附加已声明的接近/离开空间和可修改材质槽。

标准模型当前支持内嵌 buffer/PNG/JPEG 的静态 GLB；外部 URI、骨骼动画、缺 UV、坏图片、未配置解码器的压缩扩展、非有限几何及缺接触节点均明确拒绝。GLB 实际包络必须被阻挡声明覆盖。适配时在源文件规范单位/轴/基点，保留有用网格名称，重新导出、登记新的真实尺寸/安装与使用信息，再重跑。脚本不能凭声明猜测模型单位或自动保证任意形状适配。

## 实际预览与持久化

在 prototype 目录构建，然后在仓库根启动随机临时端口（BUILD 为命令输出的真实构建号）：

```powershell
node scripts/build-company-id.mjs
npx vite build --config vite.company.config.js
```

```powershell
node scripts/company-platform/serve-company.cjs prototype/dist-company BUILD
```

该入口只打包场景设施，复用 Three 和 Phaser 调度，无人物、另一套动作时钟或占用状态机。人类可以切方案/视角/样件/面料、看屏幕补光状态、保存恢复及导入导出。agent 使用 `window.company.apply(ops)`、`load(document)`、`save()`、`restore()`、`export()`；它们走同一 `authoring.js`，异步资源准备完成后才提交，失败或过时请求保留有效场景。

存档为 company-save@1，保存完整布局、父子关系、局部变换/材质/状态与全部使用资源和模板的 ID/版本/SHA；启动按最后保存的公司身份恢复完整文档，并可继续修改。更新模板或资源内容不会静默改旧档。不支持多个浏览器标签同时写同一公司；同一会话内的异步 save/import 采用最新意图，过时写入被拒绝。全部楼层均保存，包括当前未显示楼层；异步校验过期后不能再启动新加载。`session.upgrade(stationId,{id,version})` 显式迁移组合，保兼容局部调整和状态，失败保原。未修改的默认部件可采用新模板默认位置；不能据相同值推断历史编辑意图。

## C3 集中对接时使用的接缝

`createCompanyScene(world, document)` 只向既有 Three world 添加环境，不创建人物或推进时钟。共享运行入口持有一个实例：

- `resolveUsePoint(id)` 返回 `{id,facilityId,floorId,chair,chairSeat,chairBack,seatHeight,footprint,...}`。接触网格是真实 Mesh，`chair` 为设施局部基点；局部前向 +Z，当前椅实例按工位旋转 π 后面向桌子。世界朝向应读取世界变换，不直接取嵌套节点的局部 `rotation.y`。
- `listUsePoints()` 列出实际当前楼层使用点。首两个稳定 ID 为 `station-1/chair#seat` 与 `station-2/chair#seat`。
- `navigation(floorId)` 返回 `{floorId,floors,obstacles,regions,connections}`，可查询离屏楼层的逻辑阻挡；离屏 object 为 null。障碍携带实例 ID、真实物体和世界 x/z/hw/hd，区域携带世界 transform、矩形 bounds 与导航 inset；来自与显示及使用点相同的实例数据。
- `prepareChange(ops, guards)` 在场景外构造完整候选，`commit(handle, guards)` 在提交瞬间再次检查修订与真实占用。C3 接入必须传 `isUsePointBusy(id)`，数据源为总工的既有 `seatLeases.forSeat(id)`。当前无人物的制作模式无占用，不另造占用表。
- `discard(handle)` 清理未采用候选；`dispose()` 清理当前及所有候选。无关屏幕状态修改保留被角色持有的原座面对象，恢复后旧候选不能覆盖新状态。
- `save()/restore()` 是校验后的纯文档序列化与显示恢复；持久化交换文件使用 `persistence.js` 的带资源和模板内容摘要的 `company-save@1` 封装。恢复整场景时现有忙碌点拒绝，角色/任务/占用不从旧存档盲目重建。

C3 待集中处理：原 `CharacterScene` 需消费指定 `payload.usePointId` 的 sit 请求，并在原任务/租约中保持使用点身份。所选点应一致用于接近、坐稳、接触、实际离位及释放；两个角色不得共享一个全局 chair。配置提交后，既有导航执行者刷新阻挡及受影响路径；制作预留点不能代替角色自己的实际适配。这些不是 C1 的前置任务。

默认旧房间与 `room-chair-1` 可继续兼容。新模式的 `floor/chair` 引用来自本 provider，不再叠放旧房间。接入/共享 main.js、角色控制器和最终固定集成提交由总工负责；公司模块及 QA 在本独立树继续。

## 当前限制及证据

`qa-preview.cjs DIST BUILD OUTPUT_NEW_DIR` 检查实际浏览器中的新 GLB、外观替换、组件变换、材质与状态、真实关闭重开、PNG 解码以及失败保旧。CPU 证据分别覆盖数据、组合操作、摆放、Three 对象、存储和标准资源库；独立报告保留首次缺陷与修复。真实男女使用、争用/取消/离位和角色受光仍待 C3。

补光暂定最多两个无阴影 SpotLight，屏幕状态改变真实材质；这不是已测普通电脑预算或角色受光结论。补光灯本体是程序代表件，真实新模型生产以沙发源/两输入/GLB/运行/恢复为证。C2 已有同层门洞、楼层观看、批量与完整移交入口，C3 集中角色联调。用户新增五档产品比例、16房酒店式平层、可配置楼层及老板专属方向见后续设计记录，不因此延长当前包。当前10房/5层压力输入保留为部分配置技术样件，不称为新的产品最大值。

## C2：楼层观看、批量和独立移交

`space.js` 提供矩形同层连接工厂及 `inspectCompanyConnections`；`architecture.js` 从同一门户数据生成完整2.8m物理墙段。预览只把墙顶剖至.504m，物理阻挡不变。`examples/c2-rental-home.json` 是三房各31.5㎡围绕公共厅的真实第二布局输入；`build-home-examples.mjs --check` 可重建核验。行列压力工厂不是住宅产品格局标准。

`session.setView({mode:'floor'|'room'|'building',floorId,roomId})` 只改观看，不修改公司修订、设施状态和身份。详细几何仅构造所选楼层；房间聚焦时同层其他区域显示阻挡代理，原详细几何留在当前层但不绘制；切层释放旧实例及无用的解析资源缓存。大楼外观及竖向侧剖面使用独立轻量DOM示意，进入剖面时过渡600ms；不构造室内Three网格或加载设施。点选楼层才加载该层真实3D，单层总览限制镜头，房间聚焦开放OrbitControls。具体角度和远近为当前候选，不把用户的游戏举例当作画风或投影标准。角色在离屏楼层的运行及接触引用由C3统一接缝处理，不能用显示加载替代角色任务状态。

同时最多启用2盏无阴影补光，优先当前聚焦区域，其余灯关闭实时发光但保留设备开关和强度配置；视图返回后重算可用灯。太阳光仅在单间/房间聚焦时使用一个1024²阴影贴图。屏幕使用自发光材质。浏览器短功能采样记录draw calls、三角数、分配数量、CPU提交时间与帧间隔，既非GPU显存测量，也非隔离基准或普通电脑结论。

```powershell
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/sofa-rooms.json output/my-batch
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/sofa-rooms.json output/my-batch --only ITEM_KEY
node scripts/company-platform/package-company.mjs FIXED_DIST BUILD SAVE_OR_BATCH_RESULT OUTPUT_NEW_DIR --source FIXED_SOURCE_ROOT
```

以实际batch-input文件名为准（`batch-inputs`保留历史输入）。每项保存明确input、完整layout、带版本内容pin的save和来源报告；同输入幂等，已存在但不同的结果拒绝覆盖，单项可独立重试。

打包核固定源码摘要、运行文件与全楼层资源依赖，带viewer、完整数据、可编辑源/参数/生产脚本和锁文件。输出中的serve.mjs启动临时HTTP预览，source包含重建和继续编辑入口，需Node与按锁文件安装依赖；不得用只复制dist冒充完整源移交。缺资源、版本不符、路径出界或已存在产物均拒绝。

当前真实浏览器检查入口为 `qa-views.cjs DIST BUILD OUTPUT_NEW_DIR`；旧 `qa-preview.cjs` 和 `record-authoring.cjs` 对应冻结C1旧候选，不拿旧v1→v2兼容预期来判断当前固定功能标准。正常速度录制与固定源码/构建身份同行。
