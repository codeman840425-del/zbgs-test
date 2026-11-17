# brainrom/vroid-studio-mcp 固定源码审查

2026-11-17。范围：GitHub 插件读取固定提交 `0696c3434677643d5e098405b42087542447213e` 的文档/C# 实现，网页读取 release、BepInEx 官方加载说明和 VRoid Guidelines。未安装、编译、启动插件或编辑器；未调用实际 MCP。沿用 requested gpt-6-astra/high，不声称宿主配置或 Hook 已独立验证。

**结论：这是真正调用编辑器内部 API 的第三方自动化插件，具备原生新建、部件/参数制作、预览和 `.vroid` 保存/重开路径；指定提交没有 VRM 导出或表情编辑工具。** 按用户选择可先用匹配的 Studio 2.14.0 做有界接入；有功能的环节优先 MCP，表情、发束设计/发骨、VRM 导出等缺口由 GUI 兜底。源码存在不等于本机加载/保存通过，更不等于 pixiv 官方支持。

## 固定身份与加载依赖

- 作者明确要求 **VRoid Studio 2.14.0**，Windows 或 Wine；不能把已准备的 2.16.0 默认视为兼容。指定 BepInEx 是 **Unity.IL2CPP / Windows x64 / 6.0.0-be.788+5b766a3**，不是 BepInEx 5、Mono 或 x86。DLL 以 `net6.0` 编译，依赖 BepInEx core、Il2CppInterop、Harmony 和首次生成的 Unity/Mux interop assemblies。[固定 README](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/README.md)、[csproj](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/plugin/VroidStudioMcp/VroidStudioMcp.csproj)
- [公开 v1.1.0 release](https://github.com/brainrom/vroid-studio-mcp/releases/tag/v1.1.0) 指向 `5cbeb9f987755cf06edcdbb123ae58d0a2af5988`，**不等于本审查的 0696 提交**。release 说明 DLL 为作者本地构建、非 CI，并附 archive SHA256；本轮未下载/核二进制。安装 release 就记录 release/DLL 身份，不能称已运行 0696 源码；若构建 0696 则需另记实际构建输入和输出。
- 0696 的 `Plugin.cs` 声明版本 1.1.0，但 `McpHost.cs` 的 initialize `serverInfo.version` 仍为 1.0.0。因此握手版本字符串不能单独识别 DLL。release/archive/DLL hash、源码提交和实际 tools/list 都要保留。[Plugin.cs](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/plugin/VroidStudioMcp/Plugin.cs#L24)、[McpHost.cs](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/plugin/VroidStudioMcp/MCP/McpHost.cs)

作者规定的 Windows 顺序是：将指定 [BepInEx 包](https://builds.bepinex.dev/projects/bepinex_be/788/BepInEx-Unity.IL2CPP-win-x64-6.0.0-be.788%2B5b766a3.zip) 解压至 `VRoidStudio.exe` 同目录，先运行一次完成 interop/config 生成；关闭应用，再放置 `BepInEx/plugins/VroidStudioMcp.dll` 与同根目录 `i18n/`、`labels/`；再启动应用。首次 IL2CPP 生成可能较慢，应看 `BepInEx/LogOutput.txt`，不是只凭窗口出现判断已加载。[BepInEx 官方 IL2CPP 安装](https://docs.bepinex.dev/master/articles/user_guide/installation/unity_il2cpp.html)

作者附带的 `BepInEx.cfg` 会关闭日志，初次核验不宜直接套用；保留生成配置并记录必要日志。插件 JSON 位于 `BepInEx/config/com.kokokoshka.vroidstudiomcp.servers.json`。默认 MCP 为 `http://127.0.0.1:17891/mcp`（Streamable HTTP JSON-RPC）；raw TCP 为 `127.0.0.1:17890`。保默认 loopback，避免改变地址扩大访问范围。源码仅当配置 host 为 loopback 时执行对应远端检查，并非任意配置都保证本机隔离。[ServerSettings.cs](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/plugin/VroidStudioMcp/Runtime/ServerSettings.cs)、[McpHost.cs:225](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/plugin/VroidStudioMcp/MCP/McpHost.cs#L225)

## 实际工具与源码路径

固定 `McpHost.BuildTools` 有 **23 个工具**：`state, sections, open, create, categories, enter, presets, preset_preview_list, preset_preview_range, select_preset, create_custom_preset, import_custom_preset, export_custom_preset, set_param, camera, screenshot, ui_screenshot, save, main_menu, help, status, exit, batch`。它们经 dispatcher 排队在 Unity 主线程执行；不是控制系统鼠标。[工具注册](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/plugin/VroidStudioMcp/MCP/McpHost.cs#L852)、[命令路由](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/plugin/VroidStudioMcp/Commands/CommandDispatcher.cs#L106)

| 操作 | 实际实现与边界 |
|---|---|
| 创建原生项目 | `create(female/male)` → `Preset_F/F00` 或 `Preset_M/M00` → `MainViewModel.InitializeCurrentFileAndMoveToEditRoot`。要求处于开始页，已有工程时先明确保存/返回。不是从旧 VRM 还原参数。 |
| 打开 `.vroid` | `open(path)` 检查文件存在/普通文件后反射调用 `ImportFileAndMoveToEditRoot(path,false,false)`，监听 selector、重建与错误对话框；不独立解析 `.vroid`。 |
| 保存原生项目 | 显式 `save(path)` → `MainActionHandler.SaveSync(path,true)`，检查返回值和文件存在，再更新 currentFile.path；无 path 则调用编辑根 `Save` 并等 dirty 清除。**不是 VRM 导出，也不是独立保存内容完整性检查。** |
| 脸/身体/衣服 | Face、Hairstyle、Body、Outfit 四 section；从实际 `categories/enter` 读类别/参数，再 `set_param` 写引擎 `Value/CombinedValue/Color`。骨变形/BlendShape 关联由原编辑器处理，不是我们的外加 G。正常比例仍需看实际预览。 |
| 成套/局部预设 | `presets` 返回当前连续 id/index；custom 在 stock 前，增删 custom 后索引可能变。Face Set 与局部 tab 共用 parameter key，换预设可能覆盖别的 tab 所见参数；必须先选预设再设局部值并重读。 |
| 发型 | 能选现成分区/整套、改暴露颜色、创建空 custom、导入导出 Hairstyle custom item；没有已注册发束绘制、guide 控制点或 Hair Bounce 编辑工具。创建空项目不等于制成发型。 |
| 可复用部件 | import/export custom preset 实现仅 Hairstyle/Outfit；`export_custom_preset` 输出 `.vroidcustomitem`，不是 `.vrm`。不能从官方 Studio 有脸部 Custom Items 推定本插件也支持其导出。 |
| 表情/附件/灯光 | `Expression Editor` 在 `Categories.cs` 明确 masked；Accessories、Look 不暴露。需原版 GUI，不假造 MCP 工具。 |
| 预览 | 相机有 face/body/head 与正/侧/3/4视角，截图为编辑器 render texture 或全窗口；实际角色 screenshot 优于只看 generic head 的部分预设缩略图。是编辑器画面，非游戏灯光验收。 |
| VRM 输出 | MCP registry 和 raw dispatcher 均无 VRM exporter 命令。用原版 GUI 的 Export VRM，并按真实格式/设置回读；本轮不扩插件内部导出 API。 |

直接依据：[SessionHandlers.cs](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/plugin/VroidStudioMcp/Commands/Handlers/SessionHandlers.cs)、[Files.cs](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/plugin/VroidStudioMcp/Editor/Files.cs)、[Categories.cs:27](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/plugin/VroidStudioMcp/Editor/Categories.cs#L27)、[external-api.md](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/docs/external-api.md)。文档里的 `hair_group_add` batch 示例不在该提交的两个注册表中，不能照抄当已实现能力。

## 接入时不能忽略的实际差异

1. **以实际 tools/list schema 调用。** `set_param` 的命名参数为 `section/category/index/value`，其中 `index` 字符串可填刚查到的 path/key/name，不是另传未经 schema 声明的 `key` 字段。参数数字读/回显舍入到 3 位；setter 返回的 value 是发送值的 echo，不是独立引擎回读。应随后 `enter`，保存重开再核；不能用三位数字证明底层 float 完全相等。[ParamHandlers.cs:15](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/plugin/VroidStudioMcp/Commands/Handlers/ParamHandlers.cs#L15)
2. **范围限制不是造型保证。** 数值 clamp 使用滑条范围与当前值的并集，原预设可已在范围外；返回 `clamped:true` 时按真实值入账。读当前预设/截图再改，不能认为任何允许值都正常。
3. **明确保存后再返回/退出。** `main_menu` 清 dirty 并返回，会丢弃未保存修改。`exit(save)` 当前实现在等待后仍调用 `QuitClean`，首次未给文件路径或等待到期并不拒绝退出；不能把它当可靠提交。最小流程是 `save(新.vroid路径)` → 文件存在/哈希 → `main_menu` → `open(该文件)` → 参数/截图核验，最后才退出。[SessionHandlers.cs:130](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/plugin/VroidStudioMcp/Commands/Handlers/SessionHandlers.cs#L130)
4. **成功回包仍需状态与产物。** `WaitUntil` 有期限，`WaitModelBuilt` 未逐项把期限到达变成错误；参数 Settle 也有 fallback。超时先查 `status/state`，不立刻重发突变或 batch；已排队操作可能仍在执行。batch 非事务，失败不会自动回滚。[CommandUtil.cs](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/plugin/VroidStudioMcp/Commands/CommandUtil.cs)
5. **改的是运行中编辑器。** `Plugin.Load` 用 Harmony 捕获/修补内部方法、强制 `Application.runInBackground=true`，并安装 i18n、渲染质量与 Settings UI 修改。README 的“未操作GUI”指不模拟鼠标键盘，不能理解为不影响界面/渲染。默认 SSAA render_scale=2、MSAA=4；编辑器 CPU/GPU 成本仍存在，不能与重型录屏并行后冒认无影响。[Plugin.cs](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/plugin/VroidStudioMcp/Plugin.cs)

## 原版学习的最短消费顺序

加载确认后：`initialize → tools/list → state → create → categories/presets → preset_preview_* → select_preset → enter → 必要set_param → enter → camera+screenshot → save(新路径) → main_menu → open → enter+screenshot`。优先原版完整 Face Set、现成头发/衣服，先看正常全身与三视再做小范围部位调整；不是继续尖脸曲线试验。使用新文件名保存基线和变体，不覆盖当前项目源。

随后暂停 MCP 变更，由 GUI 操作 Expression Editor 检查 NEUTRAL/笑/闭眼/张口、必要发骨和 Export VRM；保存原生源，再导出固定版本/减面设置。已有 [原版流程研究](F:/gamemake/docs/research/NATIVE-ANIME-AUTHORING-WORKFLOW-2026-11-17.md) 的 GUI 步骤可直接补这些缺口。无需 Hub，也不把任何 customitem export 当 VRM export。本轮没有执行以上步骤，没有接入 4196、建 profile 或替换正式源。

## 许可与官方支持的准确边界

插件 [LICENSE](https://github.com/brainrom/vroid-studio-mcp/blob/0696c3434677643d5e098405b42087542447213e/LICENSE) 为 MIT，要求保留版权与许可声明，按 AS IS 提供。release 明确项目与 pixiv 无隶属关系；MIT 只授权作者的插件代码，不授予 VRoid 软件、素材或对外造人服务额外权利。README 也明确称内部 API 为 reverse-engineered；这不是官方 SDK。

pixiv [Studio Guidelines 的禁止行为第 5 项](https://vroid.com/en/studio/guidelines) 原文为：

> Conduct involving parsed code, such as reverse engineering, decompiling, or disassembling the program

这是可核的条款；不能把它说成 pixiv 明文允许该插件，也不能仅凭第三方插件存在断言本次“使用插件”已经被作者个别批准或必然触犯某司法结论。用户现已明确选择该第三方方案，本报告记录实际内部 Hook 与条款差异，**不另造安装审批、不用未证推断阻断已授权技术核查**。有关内部自用生成程序与玩家生成/导出服务的区别仍按 Guidelines 单独判断；不能拿插件 MIT 覆盖素材许可。完整 Terms 页本轮未取得可读全文，不声称完成法律意见或已接受授权。

最终状态：**源码/文档已核；2.14.0 + 指定 BepInEx + 插件的本机加载、握手、保存重开、GUI 表情与 VRM 导出均未在本审查执行。** 下一实际成功须来自真实产物和可观看结果，不能从源码测试宣称直接继承。
