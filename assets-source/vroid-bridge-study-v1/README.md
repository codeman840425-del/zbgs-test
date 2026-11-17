# 原生 Bridge 学习调用与失败回执

`call.py REQUEST.json NEW_OUTPUT.json` 启动原版 0.15.0 stdio MCP 客户端进程；不会启动编辑器、注册宿主或自动重试。请求本身可能修改当前编辑器，按 root 当前任务串行调用。

2026-11-17 独立窄审修复仅涉及 `call.py` 和离线 `test_call.py`。未调用编辑器，没有改请求样本、既有回执/模型、插件或游戏运行时。

固定来源：`mcjo79/vroid-mcp@c7367a548626cbe69e26b533e48fc9ddaf85851e` 的 [vroid_mcp.py](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/mcp_server/vroid_mcp.py)，本机原版文件 SHA256 `3db7783341056ac8d710783e9c71aa4c30760453935987e74ebbb6db68a259cf`。

实际失败语义：作者 `handle` 对普通返回只以 `error` 字段设 `isError`；`ok:false` 可被 JSON 编码进 `content[].text` 而 `isError:false`。作者 `_run_batch` 同样可能把内层失败包成外层 `ok:true`，`set_param` 也可能有成功包装。测试用 AST 仅提取这两个固定原作者函数执行，并提供纯内存 stub 重现这两种遗漏；不 import/执行整个服务器，不访问 7811。

修复后的客户端会：

- 检查 initialize 和请求回包各恰好一份、JSON-RPC 错误、进程退出码及 `isError`。
- 解码工具文本中的 JSON，递归检查 `ok:false`、`isError:true`、有效 `error`、HTTP 失败、非零/非空 `failed`、`notRestored` 及不完整批次。合法缓存提示文本和纯文本 help 不误判；普通工具只有提示没有实际 JSON/图片则拒绝。
- 在解析前保存字节原样的 `NEW_OUTPUT.json.stdout.bin` / `.stderr.bin`，记录大小与 SHA。空输出、非法 JSON/UTF-8、缺失或重复回包、960 秒超时、启动失败、图片解码失败均写 JSON 失败回执并非零退出。原版旧客户端在超时/JSON 解析异常前没有写出这些证据，不能倒称旧失败已保原 stdout。
- 图片另存；结构化 JSON 去掉图片 base64，控制台只打印文件路径、耗时、成功与失败数量。原始 `.stdout.bin` 保留完整响应，包括图片 base64，是审计原件，不应直接打印。
- 不覆盖同名 JSON/原始流/图片，不进行隐式重试。超时只说明客户端子进程结束，**不保证编辑器内部操作取消或回滚**；先查询真实状态，再从已保存 `.vroid` 恢复。

`warnings` 保留但不自动当协议失败：导出选项被拒、颜色仅部分生效等仍需操作者核实际设置/读回，`ok:true` 不是制作或准入通过。JSON/字节证据文件写盘失败本身会抛错，不宣称磁盘不可写时仍能留下完整回执。

离线复现命令（12 个测试，无编辑器调用）：

```powershell
& 'F:/gamemake/experiments/tools/vroid-mcp-bridge-0.15.0/package/VRoidMcp-v0.15.0/python/python.exe' -B assets-source/vroid-bridge-study-v1/test_call.py
```

实际结果：12/12 通过，0.039 秒测试执行时间。覆盖原作者两种漏判、嵌套/部分失败、成功警告/提示/help、空/坏/缺/重复回包、模拟超时的原始部分 stdout/stderr、进程/启动失败、图片分离/坏图片及拒绝覆盖。首轮测试自身用 Windows 默认 GBK 读 UTF-8 回执失败，已只修测试读文件的显式 UTF-8；没有因此改变生产回执编码。超时/坏返回是离线注入测试，不冒称发生了真实编辑器超时或复核了原生源保存恢复。
