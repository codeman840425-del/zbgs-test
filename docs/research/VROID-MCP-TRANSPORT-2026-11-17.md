# VRoid MCP 平台与客户端调用核查

2026-11-17。本次只读固定源码、发布元数据和本地包，未安装或启动编辑器、插件，也未修改全局 Codex 配置。沿用 requested `gpt-6.1-sol/high`，实际 provider/Hook 拦截未独立暴露。这里覆盖传输和调用接缝，编辑功能与适配风险由另份 brainrom 源码审查负责。

## nhodges 固定实现依赖 Linux 桌面

固定仓库为 `nhodges/mcp-vroid@1a8a30e7322eb2018d9f2198414d88b3f54fc4a5`。作者声明开发测试环境为 Arch Linux、Hyprland、VRoid Studio 2.14.0 English UI，经 Steam/Proton 运行。该服务将截图、OCR、鼠标和键盘自动化包装为 stdio MCP tools。其 `main()` 调 `server.run(transport="stdio")`。[README](https://github.com/nhodges/mcp-vroid/blob/1a8a30e7322eb2018d9f2198414d88b3f54fc4a5/README.md) [服务入口](https://github.com/nhodges/mcp-vroid/blob/1a8a30e7322eb2018d9f2198414d88b3f54fc4a5/src/mcp_vroid/server.py)

| 实际文件 | 平台依赖 | Windows 上直接运行的缺口 |
| --- | --- | --- |
| `pyproject.toml` | 声明 POSIX/Linux，Python≥3.11，依赖 `python-xlib`、MCP、Pillow、OpenCV、pytesseract 等 | Python 本身跨平台不足以提供其桌面后端。[文件](https://github.com/nhodges/mcp-vroid/blob/1a8a30e7322eb2018d9f2198414d88b3f54fc4a5/pyproject.toml) |
| `driver/window.py` | 直接调用 `hyprctl` 查询窗口、workspace、聚焦和 Lua dispatch，启动路径按 Steam appid 1486350 | 需要 Windows 窗口发现、聚焦及启动后端。其只读 `vroid_status()` 也会经过这些调用。[文件](https://github.com/nhodges/mcp-vroid/blob/1a8a30e7322eb2018d9f2198414d88b3f54fc4a5/src/mcp_vroid/driver/window.py) |
| `driver/capture.py` | 调 `grim` 和 Hyprland monitor 信息，按 compositor 的 layout/physical scale 换算 | 需要 Windows 截图及坐标缩放实现。[文件](https://github.com/nhodges/mcp-vroid/blob/1a8a30e7322eb2018d9f2198414d88b3f54fc4a5/src/mcp_vroid/driver/capture.py) |
| `driver/input.py`、`native/vpointer.c` | 鼠标走 `zwlr_virtual_pointer_unstable_v1`，键盘/滚轮走 Xwayland XTEST | Win32 没有该 Wayland compositor 与 X11 输入层。[输入](https://github.com/nhodges/mcp-vroid/blob/1a8a30e7322eb2018d9f2198414d88b3f54fc4a5/src/mcp_vroid/driver/input.py) [原生 helper](https://github.com/nhodges/mcp-vroid/blob/1a8a30e7322eb2018d9f2198414d88b3f54fc4a5/native/vpointer.c) |
| `native/build.sh`、`session_env.py` | 需 gcc、wayland-scanner、libwayland-client，恢复 `/run/user/…`、WAYLAND_DISPLAY、Hyprland 与 DISPLAY 环境 | 安装 Python 包或把 Windows VRoid 降到 2.14 不会补齐这些依赖。[构建](https://github.com/nhodges/mcp-vroid/blob/1a8a30e7322eb2018d9f2198414d88b3f54fc4a5/native/build.sh) [环境恢复](https://github.com/nhodges/mcp-vroid/blob/1a8a30e7322eb2018d9f2198414d88b3f54fc4a5/src/mcp_vroid/session_env.py) |

当前固定实现没有已核 Windows backend。改造成 Windows 工具需要移植上述输入、窗口、截图和坐标接缝，不能记作已有可直接使用的 Windows MCP。仓库代码 MIT；本次没有安装或执行它。[项目身份与许可声明](https://github.com/nhodges/mcp-vroid/blob/1a8a30e7322eb2018d9f2198414d88b3f54fc4a5/pyproject.toml)

## brainrom 发布包与原作者客户端

本次传输核查固定到 `brainrom/vroid-studio-mcp` 的 v1.1.0 tag commit `5cbeb9f987755cf06edcdbb123ae58d0a2af5988`。另份功能源码审查使用较后的 `0696c3434677643d5e098405b42087542447213e`，两者身份分别保留。发布说明要求 Windows VRoid Studio 2.14.0 与 BepInEx 6 IL2CPP be.788，属于第三方编辑器插件。[固定 README](https://github.com/brainrom/vroid-studio-mcp/blob/5cbeb9f987755cf06edcdbb123ae58d0a2af5988/README.md) [release](https://github.com/brainrom/vroid-studio-mcp/releases/tag/v1.1.0)

| 本地资源 | 实际身份 |
| --- | --- |
| `experiments/tools/vroid-mcp-1.1.0/plugin.zip` | 190,462 字节，SHA256 `4c68e4ff3d84a6bc234f3769ce5fb4177737a274dac3d4e1ee2047c203f6e012`，与 GitHub release asset digest 一致 |
| 解包的 `BepInEx/plugins/VroidStudioMcp.dll` | 403,968 字节，SHA256 `16740305532cfb090a4de197eea4a020724fab42b5a89284fa957a75987e5c83` |
| ZIP 内容清单 | 41 个文件、解压合计 622,528 字节。包含 DLL、BepInEx config、labels、i18n、两份 README、MIT LICENSE，未含 `.py/.ps1/.sh/.js` 客户端脚本 |

发布 ZIP 的 README 给出 HTTP 客户端配置示例。仓库另有 `tools/api-tests/api_tests.py`，使用 Python 标准库 `urllib.request` 和 socket，对真实已运行的应用发 MCP HTTP 与 raw TCP 请求。它的 `mcp_raw()`、`mcp_rpc()`、`tool_text()` 是实际可复用的传输范例。`tools/q.py` 只查询本地 IL2CPP `types.jsonl`，用途是反编译索引检索。仓库脚本未随该 ZIP 分发。[原作者 HTTP harness](https://github.com/brainrom/vroid-studio-mcp/blob/5cbeb9f987755cf06edcdbb123ae58d0a2af5988/tools/api-tests/api_tests.py) [q.py](https://github.com/brainrom/vroid-studio-mcp/blob/5cbeb9f987755cf06edcdbb123ae58d0a2af5988/tools/q.py)

原 harness 要求应用已经运行，`--suite protocol` 仍要求提供 `--model=`，并先检查 TCP/HTTP。该 suite 含 300 次 sequential ping 和误用测试，远多于本文最小只读握手。其其他 suites 有真实编辑/保存等操作，因此本次没有直接跑整套 harness。发布二进制和 source tag 的可重复构建对应未在本轮证明，DLL 身份以实际 SHA 单列。[harness CLI 与各 suite](https://github.com/brainrom/vroid-studio-mcp/blob/5cbeb9f987755cf06edcdbb123ae58d0a2af5988/tools/api-tests/api_tests.py)

## 最小 HTTP MCP 请求

使用 `http://127.0.0.1:17891/mcp/`。README 简写为 `/mcp`，源码实际注册 `/mcp/` prefix，原 harness 也用带尾斜线地址。raw TCP 为 `127.0.0.1:17890`，它是独立调试协议，不应向它发送 HTTP 请求。[传输实现](https://github.com/brainrom/vroid-studio-mcp/blob/5cbeb9f987755cf06edcdbb123ae58d0a2af5988/plugin/VroidStudioMcp/MCP/McpHost.cs) [外部 API](https://github.com/brainrom/vroid-studio-mcp/blob/5cbeb9f987755cf06edcdbb123ae58d0a2af5988/docs/external-api.md)

每条消息独立 POST，使用 `Content-Type: application/json` 及 `Accept: application/json, text/event-stream`。协商后带 `MCP-Protocol-Version`，若初始化返回 `Mcp-Session-Id` 则后续带回。插件当前返回 JSON，GET 返回 405、不提供 server-initiated SSE。通用 MCP 客户端仍应支持标准规定的两类 POST 响应。[固定插件](https://github.com/brainrom/vroid-studio-mcp/blob/5cbeb9f987755cf06edcdbb123ae58d0a2af5988/plugin/VroidStudioMcp/MCP/McpHost.cs) [MCP 2025-06-18 传输规范](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)

首先初始化，以下为单个请求体。

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"vroid-read-only-study","version":"1"}}}
```

读取返回的 `result.protocolVersion` 后发送无 id 的就绪通知，预期 HTTP 202 且无响应体。

```json
{"jsonrpc":"2.0","method":"notifications/initialized"}
```

枚举实际工具 schema。

```json
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

读取不经过 Unity 主线程命令队列的存活/队列状态。

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"status","arguments":{}}}
```

读取编辑器状态。

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"state","arguments":{}}}
```

`status` 返回 queued 及可选 inflight/batch 信息，模型未打开时也可用。`state` 返回 ready/updating/selectors/in_edit/section，经过主线程队列。连接成功、编辑器主线程可响应、模型可编辑是分开的事实。工具结果还要检查 `result.isError`，其文本 content 可能包含第二层 JSON。该 tag 的 `serverInfo.version` 硬编码为 `1.0.0`，不能据此替代 v1.1.0 ZIP/DLL SHA 身份。[实际工具与 initialize 处理](https://github.com/brainrom/vroid-studio-mcp/blob/5cbeb9f987755cf06edcdbb123ae58d0a2af5988/plugin/VroidStudioMcp/MCP/McpHost.cs) [标准初始化顺序](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle)

以下最小 Python 客户端仅覆盖这份插件的 JSON 响应，不启动应用，不修改模型，不写宿主配置。应用与插件已经由负责人运行后才可获得成功响应。

```python
import json
import urllib.request

url = "http://127.0.0.1:17891/mcp/"
headers = {"Content-Type": "application/json",
           "Accept": "application/json, text/event-stream"}
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def post(payload):
    request = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"),
                                     headers=headers)
    with opener.open(request, timeout=5) as response:
        session = response.headers.get("Mcp-Session-Id")
        if session:
            headers["Mcp-Session-Id"] = session
        raw = response.read()
        result = json.loads(raw) if raw else None
        print(response.status, result)
        return result

init = post({"jsonrpc": "2.0", "id": 1, "method": "initialize",
             "params": {"protocolVersion": "2025-06-18", "capabilities": {},
                        "clientInfo": {"name": "vroid-read-only-study", "version": "1"}}})
version = init["result"]["protocolVersion"]
if version != "2025-06-18":
    raise RuntimeError("Unexpected negotiated protocol")
headers["MCP-Protocol-Version"] = version
post({"jsonrpc": "2.0", "method": "notifications/initialized"})
post({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
post({"jsonrpc": "2.0", "id": 3, "method": "tools/call",
      "params": {"name": "status", "arguments": {}}})
post({"jsonrpc": "2.0", "id": 4, "method": "tools/call",
      "params": {"name": "state", "arguments": {}}})
```

## 本机只读尝试与身份边界

本次查询监听表时未读到 17890/17891 listener。向上述 loopback URL 的 initialize 尝试两次，每次 timeout 为 2 秒，第二次显式关闭 HTTP proxy，均未获得响应，返回 urllib 超时。该结果只说明这两次请求未完成，不能推断已安装插件故障或编辑功能不可用。没有继续重试，没有自行启动/安装应用。

本机脚本能通过 MCP HTTP 调用真实插件时，可以记录为“脚本客户端完成 MCP initialize/tools/list/tools/call”。GPT 宿主原生注册还需宿主实际提供该服务工具的独立证据，本轮未做此操作或核验。发布 README 里的其他客户端配置范例也未应用到 Codex。当前明确可交付的是固定源码的平台结论、发布包身份及最小请求方法。
