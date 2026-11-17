# VRoid 受支持版本与 MCP 原生制作验证

这是原作者工具学习与接入包，不代表八预设、正式基模或 M2 已通过。
Studio 2.14.0、BepInEx 6 IL2CPP Windows x64 be.788、brainrom MCP 1.1.0 使用匹配版本。
`study.json` 保存来源、实际文件身份与逐步验证状态。安装器及依赖工具保存在
`experiments/tools/`，不提交第三方大型二进制；2.16.0 和既有4196工作台不覆盖。

## 恢复顺序

1. 从 `study.json` 的原始发行地址取得三个包，校验长度、MD5/SHA256；Studio 安装器还须验证 pixiv 的有效 Authenticode 签名。
2. 执行 `install-supported.ps1`，在独立2.14目录安装并解压BepInEx。脚本拒绝覆盖已存在的应用目录。
3. 只启动这个新目录的 `VRoidStudio.exe`，完成BepInEx首次interop生成，检查日志；退出这个新实例后放入MCP发布包的 `BepInEx/plugins/VroidStudioMcp.dll`、`i18n/`、`labels/`。保留初始化日志，不覆盖为发布包的禁日志配置。
4. 再启动2.14；按 `requests/` 初始化、枚举真实工具与读取状态：

   `python assets-source/vroid-mcp-study-v1/call.py assets-source/vroid-mcp-study-v1/requests/initialize.json evidence/vroid-mcp-study-v1/initialize.json`

5. 之后按实际工具schema新建请求文件；每次输出用新路径，脚本拒绝覆盖证据。参数写入后独立读取，显式保存新 `.vroid`、重开、再检查；不要把 setter 回显或文件存在当作完整内容验证。

本地协议客户端复用固定作者 `tools/api-tests/api_tests.py` 的 `Harness.mcp_raw`；原文件与 MIT LICENSE 保存于 `original/`。不运行作者整套测试（包含模型修改），只调用指定请求。它是脚本通过MCP协议操作本地编辑器，不是宣称GPT桌面已原生注册新工具。

功能与平台边界见 `docs/research/VROID-MCP-CODE-AUDIT-2026-11-17.md` 和
`docs/research/VROID-MCP-TRANSPORT-2026-11-17.md`。MCP未提供VRM导出、Expression Editor、发束/发骨编辑；这些步骤需要原版界面兜底，不能拿 `.vroidcustomitem` 当VRM。
插件MIT不代表pixiv官方支持，Studio、部件及导出资产分别保其来源许可。工具能修改原生参数不代表全部造型正常、服装适配通过或游戏动作通过。
