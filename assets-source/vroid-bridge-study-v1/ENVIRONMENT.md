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
