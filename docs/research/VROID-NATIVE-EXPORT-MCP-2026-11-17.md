# 可原生导出 VRM 的第三方 MCP 核查

2026-11-17。只读仓库固定源码、作者资料及 GitHub 发布元数据。本轮未下载或安装这两个实现，未启动、重启或 attach 当前 VRoid 2.14 会话，未发编辑/导出请求，未改全局 MCP 配置。沿用 requested `gpt-6.1-sol/high`，实际 provider/Hook 拦截未独立暴露。

## 本次结论与固定身份

两个仓库都有实际调用 VRoid 内部原生导出方法的实现。mcjo79 有版本化 Windows 发布物及较短的 BepInEx→HTTP→Python stdio 链，适合负责人下一次独立原版接入。froz3ncore 使用 Frida，含已有窗口 attachment 与更严格的文件/模型身份读回，但当前是开发快照。当前 brainrom 会话缺少导出工具，不能据此推定其他 MCP 都需要桌面点击导出。这两项新实现尚无本项目本机导出证据。

| 工程 | 本次固定版本 | 已核发布/依赖 |
| --- | --- | --- |
| `mcjo79/vroid-mcp` | `c7367a548626cbe69e26b533e48fc9ddaf85851e`，与 `v0.15.0` release tag 指向相同 commit | C# plugin `0.15.0`、net6.0、BepInEx6 IL2CPP。Python MCP 核心为标准库实现，Windows 包自带 Python3.12。作者当前声明 VRoid2.16，另保2.14原生导出记录。固定源码 `TOOLS` 列表为59项，当前作者网站也显示59，早先53项摘要不能作为当前数量。[源码](https://github.com/mcjo79/vroid-mcp/tree/c7367a548626cbe69e26b533e48fc9ddaf85851e) [release](https://github.com/mcjo79/vroid-mcp/releases/tag/v0.15.0) [作者页](https://mcjo79.github.io/vroid-mcp/) |
| `froz3ncore/VRoid-Character-MCP` | `6469bd3a6d00fe5fac508d992f63b5a1a783d80e`，`0.5.0.dev0` | 无 GitHub release。Python≥3.10、Frida17.16.0、MCP1.30.0、Node/npm，frida-il2cpp-bridge0.14.0。实际源码限定 Windows 及精确 GameAssembly/IL2CPP metadata，支持集合含2.14和签名 standalone2.16，Steam2.16未准入。[源码](https://github.com/froz3ncore/VRoid-Character-MCP/tree/6469bd3a6d00fe5fac508d992f63b5a1a783d80e) [Python依赖](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/pyproject.toml) [JS依赖](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/package.json) |

这里的“原生”表示调用编辑器内部导出器。两项都是第三方互操作工程，所用接口具有版本依赖，本文没有将它们称为 pixiv 官方公开 MCP/API。

## mcjo79 的真实导出调用链

Python 的 `vroid_export_vrm` 不是空工具声明。固定文件 `mcp_server/vroid_mcp.py` 将参数送到 `/vrm_export`，timeout900秒。`HttpBridge.cs` 将该请求构造成 `VrmExport.Options`，再调用 `VrmExport.Export()`。[MCP工具及分发](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/mcp_server/vroid_mcp.py) [HTTP路由](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/HttpBridge.cs)

`VRoidMcpBridge/VrmExport.cs` 的实际过程如下。

1. `EnsureExportScreen()` 在 Unity 主线程调用 `EditRootScreen.ViewModel.EnterToVRMExport()`，等待 `PhotoBoothViewModel`、`ExportSettings` 和 preview avatar。
2. 应用与编辑器导出界面相同的 mesh/hair bone/material/atlas/texture 选项，再重开导出 screen，使 reduction 真正重建。读取实际设置，不接受的值记入 warnings。
3. VRM1 调 `PhotoBoothViewModel.OnVRM1SettingChanged(meta, fullPath, TaskCompletionSource<bool>)`。VRM0 调 `OnVRMSettingChanged(...)`。直接传路径，绕过文件选择框。
4. 等待原生 Task 完成，读取 fault/cancel/result，再检查文件更新时间、长度和稳定等待。可返回编辑器，回执含实际 settings、warnings、bytes、版本及 elapsed。
5. `_exportRunning` 阻止该 exporter 的两个同时调用。原代码还处理导出 screen 的旧 reduction mesh 失效与 coroutine 清理时序。

[实际 VrmExport.cs](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/VrmExport.cs)

这条链没有 OS 鼠标、窗口坐标或文件对话框自动化。它仍需要编辑器进程和 Unity 主线程正常更新，也会切换编辑器内部 screen。本轮未实测最小化/后台状态，不能仅凭代码声称在所有后台状态都可完成。

作者保留 `echecexport.md`，记录在2.14以 `Konoha.vroid` 做 VRM1 导出约16.6MB/10.1秒，且归档了早期“Coroutine continue failure”及修复。README 另列 VRM0、材质/atlas等作者测试。这是原作者运行记录，本轮没有独立重跑或核验其输出二进制。[原作者失败与修复记录](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/echecexport.md)

### 可直接消费已保存的 `.vroid`

`FileLifecycle.Open(path)` 核文件存在，然后在主线程调用 `MainViewModel.ImportFileAndMoveToEditRoot(fullPath,false,false)` 并等待 context ready。源文件已经存在即可进入这条入口，不要求从 MCP 新建角色。已有打开模型时先拒绝替换，需要显式保存/返回菜单。[Open与生命周期](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/FileLifecycle.cs)

当前2.14窗口只加载 brainrom 时，改客户端名称不能让它出现 mcjo 导出方法。mcjo plugin 的 `Load()` 注册自己的 C#组件、Harmony hooks 和7811桥，源码未提供把该 DLL 热装进既有窗口的入口。最短已核路径是由负责人保留已保存 `.vroid`，在加载 mcjo 的独立编辑器副本中调用 open→ready→export。本轮没有验证两个插件同进程共存或 be.788 与 mcjo release 的兼容性。[Plugin加载入口](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/Plugin.cs)

### Windows 发布物与依赖

以下大小和 SHA 来自 GitHub release asset 元数据，本轮未下载包，未冒称做过本地 ZIP/DLL 字节校验。

| 发布物 | 大小 | GitHub发布SHA256 |
| --- | --- | --- |
| [VRoidMcp-v0.15.0.zip](https://github.com/mcjo79/vroid-mcp/releases/download/v0.15.0/VRoidMcp-v0.15.0.zip) | 36,150,765B | `5fb7438b9a58c30dd69ca81e7d31ba69d2c6598f1a4c0ceabfbb552091727f87` |
| [VRoidMcp-Setup-v0.15.0.exe](https://github.com/mcjo79/vroid-mcp/releases/download/v0.15.0/VRoidMcp-Setup-v0.15.0.exe) | 22,395,805B | `81c3c69567061571ea00bd3843816e7264e7cb3d120fd976fc71b8b96a7c46ce` |

固定 `installer/build_release.py` 中的 ZIP 布局为 `VRoidMcp-v0.15.0/` 下的 `plugin/VRoidMcpBridge.dll`、`mcp_server/`、`python/`、`agent/`、`docs/`、`tools/`、`config/`、安装脚本与许可。安装目标为 `<VRoid>/BepInEx/plugins/VRoidMcpBridge/VRoidMcpBridge.dll`。包附 Python3.12、NumPy/Pillow，核心编辑/导出 Python 桥不依赖这些图像库。这里只核打包代码，实际 ZIP 清单与 DLL SHA 待下载后核。[打包脚本](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/installer/build_release.py)

`installer/install.ps1` 固定测试 BepInEx6 IL2CPP be.791，下载地址为 [be.791原包](https://builds.bepinex.dev/projects/bepinex_be/791/BepInEx-Unity.IL2CPP-win-x64-6.0.0-be.791%2Bb782da4.zip)，预期SHA256 `bb1c510909b69522733791f3a0817a487379a52da6468a492f1c9c19b3ec6f9a`。BepInEx未包含在上述ZIP内。安装器发现已有 BepInEx6 时可保留，源码同时提示其测试版为791，这不构成现有788已通过的证据。[安装脚本](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/installer/install.ps1)

该脚本默认注册 Claude/DeepSeek Harness 配置并安装对应 skill，有 `-NoClaude`、`-NoDsh`、`-SkipBepInEx` 等明确参数。当前要求是独立接入，不应把运行其默认注册流程写成 Codex 原生配置完成。本轮未运行安装器。[安装与注册代码](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/installer/install.ps1)

### 最小客户端接缝

mcjo 的7811是普通 HTTP JSON桥，Python程序 `mcp_server/vroid_mcp.py` 才是 stdio MCP server。它不与 brainrom 的17891 Streamable HTTP endpoint 互换。可以复用发 HTTP/JSON 的基本客户端方式，但 URL、路由、参数与工具名须按本实现消费。

| 目的 | mcjo桥调用 | MCP工具 |
| --- | --- | --- |
| 读状态 | `GET http://127.0.0.1:7811/status` | `vroid_status` |
| 打开已有源 | `POST /open`，JSON含 `path` | `vroid_open` |
| 导出 | `POST /vrm_export`，JSON含 `path`、字符串 `version`及可选metadata/选项 | `vroid_export_vrm` |

例如下面是交给已加载 mcjo plugin 的普通 HTTP `/vrm_export` 请求体，当前研究未发送。

```json
{"path":"F:\\gamemake\\evidence\\native-export-candidate\\study.vrm","version":"1","title":"Native author study","author":"Project study","model_version":"1","leave":true}
```

对应 stdio MCP 的消息为以下单条 JSON-RPC。先进行其 initialize/initialized/tools-list，再按实际 schema 调用。

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"vroid_export_vrm","arguments":{"path":"F:\\gamemake\\evidence\\native-export-candidate\\study.vrm","version":"1","title":"Native author study","author":"Project study","model_version":"1","leave":true}}}
```

导出成功回执还没有证明完整 GLB/VRM 结构或视觉。固定 `WaitFileStable()` 超时返回也没有单独的失败标志，且 export API允许目标路径原已有文件。负责人实际验证应给新路径，保输入/输出SHA并回读 VRM、表情和实际画面。此处记录接缝不足，不修改该实现。[导出完成与文件判断](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/VrmExport.cs)

## froz3ncore 的真实原生导出与已有窗口

`vroid_mcp/tools_ordinary.py` 实际注册 `export_vrm(expected_model,filename,version,...)`。`runtime_ordinary.py` 校验最新 model token、异步串行锁及目标路径，建立 fresh export screen，调用 Frida操作 `start_vrm_export`，等原生 completion、输出稳定与preview quiet，再验容器并把 stage 文件 rename 为新输出。[工具schema](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/vroid_mcp/tools_ordinary.py) [Python实际调用](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/vroid_mcp/runtime_ordinary.py)

`agent/vrm_export.js` 的 `start()` 核导出方法第三参数为真实 `TaskCompletionSource<bool>` 类型，分配并retain相关对象，再经 `invokeManaged()` 调同一 `OnVRM1SettingChanged` / `OnVRMSettingChanged`。`status()` 检查Task，`finish()` 要求输出已稳定和preview ready。Python的 `vroid_mcp/vrm_export.py` 进一步核自包含 GLB/VRM 引用，代码中未用桌面点击替代这条导出。[原生JS操作](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/agent/vrm_export.js) [VRM容器读回](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/vroid_mcp/vrm_export.py)

它默认使用物理复制的lab，`launch.py --lab ... --model ...` 可以给lab内部已保存的`.vroid`。另有 `attach_open_vroid(pid)` 接已有进程，支持模型token和当前文件身份，普通VRM输出仍限制在lab/saves。该路径可在源码层面避免为每次编辑重新接管桌面，但 Frida注入、当前brainrom hooks共存及本机现有模型的兼容性未测，本轮没有 attach。[stdio入口](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/vroid_mcp/server.py) [已有会话合同](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/ATTACHED_SESSION.md)

固定 `supported_builds.py` 准入三份GameAssembly SHA，2.14的签名standalone为 `ed65ebbc1e806db635566347a9022b9577f6b3d373db128ea23f0e862e005296`，其metadata为 `5c018d995e25b59677c9c4bb9171746d742ca94d9ed9c236b972ebca65493b8e`。签名standalone2.16为 `c8daa116938b40896e3a09208bbde71604a92d5ca6d86f9ff8b89fea3c1a5ad2`，metadata为 `089fe945572695f0592e04abaae096c54f7ea74a382a3ce68440e0425b8486b8`。另一个原作者已验2.14指纹独立保留。版本字符串相同不足以越过这个门。[实际准入代码](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/vroid_mcp/supported_builds.py)

## 来源、许可与当前选择范围

mcjo 为MIT，`THIRD_PARTY_NOTICES.md` 明示改编 brainrom 的IL2CPP reflection helpers及部分catalog思路，保留原MIT通知。它增加自己的导出、lifecycle、HTTP和stdio MCP实现，当前17891服务不能仅靠已有brainrom客户端凭空获得这些新功能。[mcjo许可](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/LICENSE) [来源通知](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/THIRD_PARTY_NOTICES.md)

froz3ncore代码为MIT，LICENSING逐项说明原Karylcode来源、历史重实现，以及经BunnyBlack接入mcjo `0dc7d5e...` 迁移。它保留brainrom labels/算法和其他来源通知。导出JS文件头也直接标出mcjo来源。Frida/IL2CPP架构是其控制内核，未纳入mcjo的BepInEx运行核。VRoid本体、人物与第三方资产权利不由这些MIT代码许可授予。[许可与来源](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/LICENSING.md)

本轮证据支持负责人先以已保存源文件做 mcjo原版最小导出试跑，保留froz3ncore为有真实实现的另一接入选择。尚未证明任一在本机可用，也未完成宿主原生工具注册或批准更换角色基模。实际成功需要独立输入/工具/输出身份、原生导出回执、VRM结构和游戏消费证据。本轮不要求用户再交出桌面做点击导出。

## 追补，相对已运行 Bridge 的独有价值

追补时负责人已在独立 VRoid2.16、Bridge0.15、BepInEx791 实际导出 VRM1，并枚举59工具。前文“本轮未本机试跑”保留其当时研究范围，不能覆盖这项后续事实。本次继续只读比较固定 froz `6469bd3...` 与 Bridge `c7367a...`，未安装、attach或调用新编辑器，也未触及将删除的2.14环境。

判定为**有值得窄试的新增实现，首选表情定义保存/导出，暂不整体替换已跑通 Bridge**。157工具数量本身不构成采用依据。以下比较核到实际 native调用或制作代码，仍需区分代码通道与本机结果。

| 领域 | 相对 Bridge0.15 的实际差异 | 对当前M2的价值与限度 |
| --- | --- | --- |
| 表情定义 | Bridge `FacePreview.Set()` 直接对活动renderer调用 `SetBlendShapeWeight`，注释明确只预览、不写模型。froz `expressionDomain()` 从 FaceEditor 的 `ExpressionParameterCategories→ParameterParts→Parameters` 读取 `Value/min/max`，`writeDomain()` 对已枚举原生参数调用 setter，公开为 `list_parameters/set_parameters(domain='expressions',scope=expressionId)`。另有 `preview_expression` 单独预览 | 新增了作者表达定义的候选写入通道，可检查闭眼/笑脸/口型定义能否随`.vroid`保存并进入VRM。实际持久化与导出变化仍未在本机证实。它没有自动生成新表情几何或解决任意混合口型碰撞。[Bridge实际预览](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/FacePreview.cs) [froz参数枚举与写入](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/agent/parameters.js) [工具触发](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/vroid_mcp/tools_parameters.py) |
| 区域妆容与皮肤标记 | Bridge已有原生PNG层导入/替换/改色。froz额外有绑定model/image/geometry身份的区域mask、受限stamp/stroke、seed雀斑/痣、preview→新native层，以及层名/顺序/blend管理。`paint_makeup_marks()` 最后仍经原生层导入和history | 可复用受限源妆容生产、精确遮罩与冷开读回脚本，不必把已有PNG导入再实现一遍。under-eye等区域按实测拓扑/UV映射，不能直接套到当前62b/027导出VRM或其他基模。画布坐标不等于面部世界坐标，最终可见效果另验。[mask与绘制](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/vroid_mcp/makeup_tools.py) [身体标记](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/vroid_mcp/body_paint_tools.py) [Bridge层导入](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/Textures.cs) |
| 同槽原生衣物叠层 | Bridge有服装参数、begin clothing edit和图像层工具，59工具未注册Add Template。froz `withClothingTemplateDialog()` 真实调用 `TextureEditor.ActionHandler.AddTemplate`，从原dialog枚举模板，再对精确row调用 `Select`。Python读回旧part/image子集仍存在及新增images | 比单张PNG叠图多了原生衣物模板追加入口，能补同槽内外衣的源制作研究。不是自动版型设计或体型碰撞适配。其 `existing_layers_preserved` 当前由part/image ID集合确认，不是全部旧层像素的证明，实测需补像素/形体回读。[原生模板调用](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/agent/textures.js) [读回实现](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/vroid_mcp/runtime_edit.py) |
| 外部服装Dress-up | froz有XWear导入、XRoid保存、实际assembly snapshot、内置动作采样和VRM导出，Bridge当前59工具没有这条wear域 | 对后续外部衣物原生装配有研究价值，但需合法XWear源及独立试验。`set_wear_fit`只是已测范围内的原生Y/Z控制，`pose_wear_preview_legs`只是冻结预览姿态，均不能冒充人体/衣物自适应动作求解。[wear工具合同](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/vroid_mcp/tools_wear.py) |
| 制作事务、批量恢复 | froz增加model token、lab新文件边界、取消后的uncertain状态和native资源保留。其 `run_batch` 明示非事务，原生参数多写也可能部分完成 | 有利于保护制作现场，未提供整批全域原子恢复。不能替代本项目已用配方、稳定角色ID和关闭恢复合同。[batch实际实现](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/vroid_mcp/batch.py) [参数写入及partial返回](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/agent/parameters.js) |

普通创建、体脸参数、颜色、原生导出及大部分发束/材质编辑已有 Bridge 对应工具，这些重复部分不构成再开控制内核的理由。froz的ownership读回更细，但仍是额外可复用代码与待试接入，不能将作者的offline doubles或历史native记录当作本项目已验。

### 可复用脚本与指导

固定froz树未发现 `SKILL.md` 或skills目录。它通过 `vroid_mcp/workflow.py` 向初始化说明追加参考图、服装层次、实际观看和保存流程，另有 `client_repl.py` 与 `tools/replay_makeup_recipe.py`。后者真实核输入`.vroid` SHA、预检全部区域，按mask制作新层，核旧层PNG不变，保存新文件并在冷开后核层像素。默认不apply，但仍会通过其client进入独立编辑器流程，本轮没有运行。[工作流代码](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/vroid_mcp/workflow.py) [配方回放脚本](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/tools/replay_makeup_recipe.py) [本地client](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/client_repl.py)

这些制作步骤和纯Python遮罩/配方逻辑可以保MIT来源另行评估。原脚本使用froz的model/region/layer IDs，不能直接将其客户端指向Bridge7811。Bridge已经带有 `agent/skills/vroid-studio/SKILL.md`，普通操作指导继续复用已跑通的这一份，不为工具数量另外注册新skill。[Bridge既有skill源](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/agent/skills/vroid-studio/SKILL.md)

### 建议的唯一首轮试测

首先只验证**一个原生表情定义是否真正保存并导出**。它具有Bridge当前预览工具不具备的明确验证价值，成功前不扩157工具回归。

- 输入为固定froz commit、匹配其2.16双SHA的独立物理lab、一份Bridge已保存的正常`.vroid`副本及其SHA。源码/依赖许可沿前文记录，不复制未授权作者角色或私有衣物。当前Bridge进程不attach、不并发修改。
- 初读用 `list_expressions()` 和完整分页 `list_parameters(domain='expressions',scope=<返回ID>)`。记录一个实际原生表达ID及原数值范围，以该source允许的单一参数值做一次修改，其他表达/体脸参数保读回基线。实际ID和改值在试测spec内冻结，不猜固定名称，也不扫描幅度。
- 经 `preview_expression` 读取原/新同相机画面，恢复neutral后另存新`.vroid`，关闭该独立lab并冷开，核刚才的定义值。再做baseline和candidate各一次原生VRM导出，核对应表达绑定/形态的实际差异与其余请求外状态。原source SHA始终保持。
- 输出为工具/安装/输入SHA、参数前后JSON、保存重开结果、两个VRM身份及表达读回、原/新/neutral有限图。若只出现renderer临时变化而冷开或VRM不保留，就记录该通道未通过，不改native方法或另补自写导出器。
- 成本预算为一个物理安装副本、Python/Frida/MCP及Node依赖，一个源角色、一个参数、一轮保存冷开和两个导出，执行窗口上限20分钟。磁盘与下载量先按实际安装目录及依赖计划核算，本次未下载，不能给实测成本。需要负责人分配一个独立编辑器/GPU窗口，当前并行只读无需占用。

若精确build门不匹配、首次native接入失败或表达域缺失，保留失败并搁置froz内核，继续已可用Bridge。妆容mask/冷开脚本仍可保为后续制作参考。同槽模板与Dress-up列为后续有具体衣物输入时再测，当前不因它们开新衣库或重做角色控制器。
