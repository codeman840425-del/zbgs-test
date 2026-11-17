# 原作者原生表情单参学习复现

固定 froz3ncore/VRoid-Character-MCP `6469bd3a6d00fe5fac508d992f63b5a1a783d80e`，通过原作者stdio client/server和精确二进制allowlist进入独立物理lab。主Bridge实例不attach，本包不修改宿主配置。

## 实际结果

负责人已执行初读和一次单参测试。原生 `Joy` 的 `expressions/Joy/0/3`（眉毛女性、原生标签欣喜）从100改为65，另存并冷开后仍为65。baseline/candidate原生导出均为VRM1，仅 `preset/happy` 表达绑定及所引用morph数据的组合payload变化。其他表情定义、体脸参数和原源SHA由执行脚本核对。定义持久化及实际VRM变化已观察，游戏光照和表情过渡不由此脚本判定。

| 产物 | SHA256 |
| --- | --- |
| 原源 `.vroid` | `311a1bd0c9137a0c5783f9ff818b686ce61f132cd0f88eb63caf408a8a73b4de` |
| 另存 `.vroid` | `04cbad7ca92e251e61f62b71c933600215df809b5b187f2f5dccb36237a48e2e` |
| baseline VRM | `48b08e0548a4ce58298fa1f2cc18b02c79d65b7cb4b0f4a199dffc5019689c8d` |
| candidate VRM | `b839ed1429213a6e4bc1d4db450b358cc2c03effb2da3e5ca405c554f10b113b` |

三个另存产物均在 `evidence/vroid-expression-study-v1/native-single-expression-v1/`。原始回执、逐次calls、完整表达初读、冷开数值、两个VRM读回均保留。执行脚本与原作者代码没有为结果修改参数语义或导出器。

## 复现入口

在项目根执行。`prepare.py` 是已执行的最小下载/环境接入步骤，准确输入与原作者文件清单见 `prepared/source-receipt.json`。第三方代码及runtime位于忽略的 `private-tools`，该目录不作为项目源提交。Python依赖按本包hash锁安装，Node依赖沿原作者lock执行 `npm ci --ignore-scripts --no-audit --no-fund`。准确安装报告与许可身份见prepared及evidence。

```powershell
assets-source/vroid-expression-study-v1/private-tools/.venv/Scripts/python.exe assets-source/vroid-expression-study-v1/study.py --mode inspect --execute-native --out evidence/vroid-expression-study-v1/native-inventory-fresh
```

初读返回后由负责人选择真实ID与一个允许值。单次测试实际使用的命令如下，复现须提供全新输出目录。

```powershell
assets-source/vroid-expression-study-v1/private-tools/.venv/Scripts/python.exe assets-source/vroid-expression-study-v1/study.py --mode test --execute-native --expression-id Joy --parameter-id expressions/Joy/0/3 --value 65 --out evidence/vroid-expression-study-v1/native-single-expression-fresh
```

原作者lab的固定导出文件名拒绝覆盖，重复完整测试前需另建干净lab或由负责人安排已封存lab的恢复。不把更换evidence目录当作整个native环境已重置。单次窗口上限20分钟，不猜参数、不扫值、不自动重试原生失败。

## 身份和边界

- 裸VRoid2.16的GameAssembly `c8daa116938b40896e3a09208bbde71604a92d5ca6d86f9ff8b89fea3c1a5ad2`，metadata `089fe945572695f0592e04abaae096c54f7ea74a382a3ce68440e0425b8486b8`，匹配原作者allowlist。物理app共35文件、1,283,207,616字节，仅复制既有官方文件，无第二次安装。
- 原作者源码archive 3,997,973字节，SHA `a708853dcbe38bfb2608a3fe0e72ee29b93db767443c1ad29012a41d26086d26`。Python3.13.11、Frida17.16.0、MCP1.30.0和31个锁定wheel，frida-il2cpp-bridge0.14.0沿原作者npm lock。下载及安装报告保留，下载总字节未独立计量。
- 原作者代码MIT及各上游notice已保留。Frida为wxWindows Library Licence3.1，MCP/IL2CPP bridge为MIT，依赖各自许可见 `prepared/dependency-identities.json`。这些许可不授予VRoid本体或输出人物权利。
- baseline/candidate下游VRM均为onlyAuthor、personalNonProfit、不可重新分发、modification prohibited，未修改权限。公开工具没有这些许可字段的写参数。原始素材许可与下游VRM限制分别核查。
- 原SDK实际离线枚举157 schema，另有7项合成GLB读回QA。合成QA覆盖dense/interleaved/sparse实际morph字节及无效引用拒绝，未当作原生持久化证明。表达payload包含binding IDs，因此重排可能改变组合hash，实际数据hash同时保留。
- `save_custom_items`的原生完整part保存仅完成代码审查，本次没有调用、没有保存衣物。详细价值与限制见研究报告。
- 负责人已确认本lab进程退出，lab目录仍保留。此前遭工具策略拒绝的递归删除仅涉及三个旧2.14/brainrom工具目录，没有对本froz新lab发起删除。lab后续清理由负责人处理，不无限期当常驻工具。主Bridge继续独立工作。

本包只验证该来源、该版本、该单参数。未完成全部表达、任意表情混合碰撞、角色全套装备或八预设验收，也未将工具原生注册进GPT宿主。
