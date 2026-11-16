# 子代理派工校验

用途：在支持该钩子的桌面工具入口，拒绝缺少显式model、reasoning_effort、fork_turns=none和难度/理由的spawn_agent调用。它不自动选择模型，也不能判断理由是否正确；主代理仍负责选型、核实际执行配置与复用会话配置。

用户要求来自2026-11-16：每次派工不能采用默认模型和默认思考深度，按任务难度明确选择，长期执行。项目AGENTS已记录。

安装：`python F:\gamemake\scripts\agent-policy\install.py --install`。脚本合并已有用户hooks.json并备份，不自行信任，不改sandbox/approval。用户在GPT桌面端当前Codex的Hooks界面审阅信任。不要以Codex CLI的版本、features开关或本地Python测试替代该桌面会话验证。

源码校验：`python scripts/agent-policy/test_guard.py`。初版有Windows引号错误，导致PowerShell把带引号的可执行路径当字符串；修正版使用固定编码PowerShell启动脚本（编码内容不含输入/凭据），已在PowerShell及cmd外壳实跑得到deny。该结果只证明启动命令，不证明桌面端已经调用。

真实拦截尚未通过：初次hook_denial_probe缺DISPATCH_CONFIG但实际子任务启动并回复HOOK_DID_NOT_BLOCK；没有读写文件。不得将开关截图当拦截通过。修正版装入后应在原桌面会话补真实非法/合法对照，日志在用户.codex/hooks/explicit-subagent/audit.jsonl，只记录时间、调用ID、工具名、模型、深度和判定，不记任务正文。若无事件日志，继续区分会话未加载和专用工具通道未覆盖；不盲目反复重装或声称绝对强制。

标准请求message包含一行：
DISPATCH_CONFIG={"difficulty":"complex","reason":"异步资源所有权与回滚跨多个模块，选Sol和high进行实现审查"}
模型和reasoning_effort仍须放在真实工具参数里，而不是只写进message。routine/standard/complex分别至少low/medium/high；可按难度选更高值。支持模型列表是当前工具目录的显式清单，目录变化后核实再更新，不能静默退回default。

followup_task没有更改模型/深度参数。复用前应核该会话已显式选定的配置与新任务匹配；未知或不适合时创建明确配置的新有界任务。该钩子目前仅拦spawn，不冒称followup已获工具层强制。旧在途任务保成果，不伪造历史配置。

持久化：版本化本目录与项目AGENTS；系统安装副本与repo源sha核对。后续开工先核钩子状态/实际拦截记录，未验证时继续执行显式参数规则，不把可选/可跳过的宿主钩子说成不可绕过安全边界。不绕过用户信任、不修改宿主二进制。

官方资料（核2026-11-16）：https://learn.chatgpt.com/docs/hooks 。特殊工具路径可能不经过钩子，错误/超时不应视为强制拒绝；最终以当前桌面真实调用证据为准。
