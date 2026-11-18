# 原生 VRoid Bridge 制作环境

本包通过 mcjo79 原发布 stdio MCP server 调用 VRoid Studio 2.16 原生功能。没有注册 GPT 桌面宿主工具，也没有修改全局 MCP 配置。源码、许可和二进制身份见 environment.json；实验安装器不随源码提交。

复建环境：

1. 使用 assets-source/native-vroid-study-v1/study.json 中记录的官方 Studio 2.16 安装来源及校验，在 experiments/tools/vroid-2.16.0/app 保留原版。
2. 物理复制原版到 experiments/tools/vroid-mcp-bridge-0.15.0/app-2.16。解压官方 BepInEx IL2CPP be.791 到该副本，并放入发布包 plugin/VRoidMcpBridge.dll 到 BepInEx/plugins/VRoidMcpBridge/。不要复用旧 be.788 插件目录。
3. Bridge 发布包：https://github.com/mcjo79/vroid-mcp/releases/download/v0.15.0/VRoidMcp-v0.15.0.zip ，解压为 experiments/tools/vroid-mcp-bridge-0.15.0/package/VRoidMcp-v0.15.0。BepInEx 固定下载见 docs/research/VROID-NATIVE-EXPORT-MCP-2026-11-17.md；双方 SHA 必须与 environment.json 一致。不运行包内默认全局注册脚本。
4. 正常启动副本 app-2.16/VRoidStudio.exe；一次只运行一个同端口 Bridge。使用本包 call.py 调用 requests/status.json，确认 ready 后操作。界面可见启动，日常控制通过 MCP，不占鼠标键盘。
5. 先打开已有独立 .vroid → 检查/修改 → 另存新路径 → 回菜单 → 重开并回读参数 → 原生导出新 VRM 路径。requests/ 保存了本次实际输入；复现须使用新输出路径，不覆盖旧证据。call.py 的结果文件也必须是新路径。

示例：`python assets-source/vroid-bridge-study-v1/call.py assets-source/vroid-bridge-study-v1/requests/status.json evidence/NEW-RUN/status.json`。

本次输入来自已保存的 2.14 女性原生 round-waist 源；2.16 另存文件与 VRM 均保存在 generated。旧版本制作证据不改写为 2.16 参数重开通过。已实测打开、另存、截图、原生 VRM1 导出；59 项工具存在不等于全部实测。房间初测见 evidence/native-vroid-room-78912-v1/REVIEW.md。

导出保持完整原生衣发，delete_transparent=false。当前默认 VRM metadata 限作者本人/非商业/不再分发/禁止修改；它是内部技术样件，正式分发条件尚未审核。不静默改 metadata 代替来源授权。独立衣物、完整 factory、外观记录及接触仍待接入。

原2.14工具已于2026-11-17官方卸载，旧原生源和测试证据继续保留。残留工具缓存删除被执行策略拒绝，见 evidence/vroid-214-retirement-v1/after.json。日常制作不再启动2.14。

## 2.16 接收方复现及目录隔离

Bridge 随编辑器进程启动。stdio 服务器可以独立列出 59 个工具。连接的第一项证明是 `vroid_status` 成功返回插件 `VRoidMcpBridge 0.15.0` 和 Unity `6000.0.62f1`；在主菜单时 `modelOpen=false, ready=false` 符合实际状态。打开目标源副本后再检查 `currentFile`、`modelOpen`、`isEditing`、`ready`、`dirty` 和保存状态。编辑器未运行时，本机 7811 拒绝连接是预期结果。

以下为正常环境的等效启动命令。可执行文件及监听地址见本机 BepInEx 日志；历史完整命令行没有封存。

```powershell
$appDir = 'F:\gamemake\experiments\tools\vroid-mcp-bridge-0.15.0\app-2.16'
Start-Process -FilePath "$appDir\VRoidStudio.exe" -WorkingDirectory $appDir -WindowStyle Hidden
$env:VROID_BRIDGE_URL = 'http://127.0.0.1:7811'
```

包内 `python/python.exe mcp_server/vroid_mcp.py` 提供 stdio。用项目 `call.py` 的 JSON-RPC 收发方式校验内层返回。实跑的最小链在 `assets-source/native-parameter-batch-v2/calls/`，已有原始请求和响应可逐项查证。0003 打开源副本；0005–0009 列当前组、读参数、用 `vroid_set_bone` 写 `Level2FaceContour_ChinRoundness=0.78` 并回读；0011 用 `vroid_save` 另存；0013–0017 返回菜单、重开新文件、重新解析组并回读；0019 用 `vroid_export_vrm_options({"leave":false})` 进入导出；0020 用 `vroid_export_vrm` 的完整原请求导出 VRM 1。复现时替换输入、输出路径及当前组 ID，输出须是新文件。按实际文件长度、魔数、SHA 和导出设置验收。这里的冷开指同一编辑器进程中关闭文档再打开。

**测试若要求所有应用写入均留在 F:\gamemake-test，当前普通启动不满足。** 实际 Unity 日志定位到上述 app-2.16 的数据，同时 Windows 用户的 LocalLow/pixiv/VRoid Studio 内可见 Player.log、历史、设置及临时文件。当前用户注册表也存在该应用的 PlayerPrefs。Unity 的 `-logFile` 可指定 Player 日志；复制应用或修改工作目录不能据此推断历史、设置和注册表也已重定向。BepInEx 的 LogOutput.log、config、cache、interop 已观察到位于应用副本。MCP 的 `VROID_PRESET_CACHE` 指定其预设缓存目录，可分别指定 `VROID_FRAMING_CONFIG`、`VROID_FRAMING_OVERRIDES`，连状态查询也可能触发缓存扫描。上述选项只控制各自组件。在严格边界下保持编辑器关闭，记录此项未实跑；若后续换成可隔离的宿主，再分别验证文件及注册表写入。此次联调查证未启动测试进程或修改系统。 [VRoid 官方存储说明](https://vroid.pixiv.help/hc/en-us/articles/900007039003-Where-are-3D-models-and-custom-items-saved) · [Unity PlayerPrefs](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/PlayerPrefs.html)
