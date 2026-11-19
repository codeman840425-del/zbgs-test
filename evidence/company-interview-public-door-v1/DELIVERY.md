# 双人访谈间 v1.1

酒店访谈房在 v1 中可以通过室内通路检查，即使有人在公共走廊里放了一块挡住整扇门的背景板。v1.1 会检查相连区域的实际入口位置，沿设施网格和阻挡范围搜索可行通道，穿过真实的门后接上主持席和来宾席各自的室内路线。房间朝向、门向、允许绕行的半开口及备用门均有固定用例。[八种布置的实测路径](door-cases.json)

实际交付的两间房沿用原布置，存档与 v1 逐字节相同。查看器构建仍为 `4ed3d907dc9d`，591 个查看器文件完全相同。新版生产工具的源码提交为 `e90e3e934e594f20a0317b656c4255e061904c0f`，区分两版请认移交清单。v1.1 的 SHA-256 为 `4bf35661762b6eba34e18a7fdcc3bf7843f74a90d173f35ad86c7b21441501fc`，封存后核对了全部 2069 个文件。[独立移交包](../../company-workspace/deliveries/interview-rooms-v1.1/README.md) · [固定身份](identity.json)

接收副本复用了融合组的单操作反例。老工具允许发布，新工具在批量生成、编辑保存、冷读验证、默认房和附加房封包时均返回 `room-door-unreachable`。已交付的房间和存档保持原字节。通过公开编辑入口移除堵门板后，整房的所有节点和规则与原件一致，重新发布的 2054 个文件全部通过清单核查。[原版复现](receiver/legacy-v1-03/report.json) · [修正版复核](receiver/fixed-01/report.json) · [原始摆放操作](receiver/corridor-blocker.json)

两间原房均使用修正版的固定移交包在浏览器中重开、换椅并从实际镜片取景。录像为 10.96 秒、1600 × 900、25 帧/秒、原速。公共通路结论来自静态实体测量，真人进场、争用和坐起仍由角色侧集成验证。[原速录像](browser/video/interview-rooms-normal.webm) · [浏览器报告](browser/report.json)

融合组从独立目录重建了 591 个查看器文件，复核 1451 个源码文件。实测走廊余宽 0.77 米可通过、0.40 米被拒绝，同时检查了旋转布局、备用门和两扇门全堵的情况。[独立回执与原件哈希](fusion-receipt.json)

在项目目录可以运行以下命令复核本版和上版。两次接收测试需要可写的新目录。`prototype` 提供与正式移交包相同锁文件的已安装依赖。

```powershell
$trial = 'output/interview-corridor-replay'
New-Item -ItemType Directory -Path $trial -ErrorAction Stop
$qa = 'evidence/company-interview-public-door-v1/receiver/qa-interview-corridor-cli.mjs'
$v1 = 'company-workspace/deliveries/interview-rooms-v1'
$v11 = 'company-workspace/deliveries/interview-rooms-v1.1'
node "$v11/verify.mjs" $v11 4bf35661762b6eba34e18a7fdcc3bf7843f74a90d173f35ad86c7b21441501fc
node $qa $v1 "$trial/legacy" prototype legacy
node $qa $v11 "$trial/fixed" prototype fixed "$trial/legacy/obstructed-edit/save.json"
```
