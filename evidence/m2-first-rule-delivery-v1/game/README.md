# 两个下颌参数角色的独立游戏回读

同一配方在权重 0.625 和 0.375 生成两具男体。两人各自签出 revision 1，分别按自己的装备清单恢复制服上衣、长裤和平底鞋。固定源码 `cb3aca0dabdfb616eaff13a880fc437835e27964`，构建 `9ce414f65f55`。[两份实际签名](signed.json)

| 可观看内容 | 实际运行入口 |
| --- | --- |
| [双人冷开与依次招手，8.24 秒](ordinary-cold-02/two-rule-bodies-1x.webm) | 独立静态游戏包，左为 0.625，右为 0.375 |
| [0.625 走路、坐下、起身、离开，17.09 秒](room-0625-01/room-produced-1x.webm) | 固定工作台导入 0.625 原签 |
| [0.375 走路、坐下、起身、离开，17.09 秒](room-0375-01/room-produced-1x.webm) | 同一固定工作台导入 0.375 原签 |

独立接收包 ZIP 共 24,469,766 字节，SHA-256 为 `853586a1ae4efd24619b84a8bc32bec586713016404da25d11669eb6e5017f8b`。双构建逐件核对 555 个 dist 文件。两个独立源码分别普通导出，导出的 29 个文件与重新解压的目录逐件相同，合计 42,774,243 字节。运行清单内有两件不同的 VRM、两份新身体的装备表，三件共用 GLB 分别由各自绑定引用。清单 SHA-256 为 `0e82bd7d6b403f3589e1abcbac4f656c004f0b07c2255a06fb115f5dee022a86`。[本机接收包](../../../output/m2-first-rule-delivery-v1/game/rule-pair-9ce414f65f55.zip) · [双构建对照](../build/dist-comparison.json) · [双导出、解压和命令回执](../build/package-comparison.json)

两次独立 Chrome 均从解压目录的普通入口读取两份签名。检查逐项核对实际网络响应、身体验证摘要、装备绑定、三件可见装备和保存配方。冷开后使用游戏的左手招呼入口，两个 2.8 秒动作均由游戏自身时钟推进到结束，各观察到 463 次绘制，左腕最大位移 42.77 和 48.65 厘米。首次验收脚本把游戏矩阵的 `-0` 与保存 JSON 中的 `0` 区分，改用与签名相同的规范序列化后重新全程检查。[冷开和动作回执](ordinary-cold-02/report.json) · [首次检查原文](ordinary-cold-01/report.json) · [三段影片的完整解码信息](decoded-films.json)

将 0.625 新件原请求交给旧构建，普通制作命令因未知身体失败。新构建在原输出位置签出。两签第一次提交普通 inventory 时缺当前构建的来源审核。双固定树审核通过并登记后，原输入及目的地恢复成功。从独立 B 构建移走 0.375 身体再导出，返回 `missing-dependency`，目的地仍不存在；恢复同一身体后，在原位导出的包逐件相同。[旧构建拒绝](../build/old-runtime-first-rejection.json) · [新件签出](create-0625.json) · [审核缺失首拒](../build/original-inventory-rejection.json) · [游戏运行审核](../build/runtime-audit.json) · [缺件恢复](../build/missing-body-retry.json)

本轮验证了这两条记录的常规游戏技术读取。整套款式发行另见正式评审，实测设备为 RTX 4090 开发机。[正式款式计划](../request/README.md) · [来源与预算](../budget/README.md)

## 独立接收和重测

解压 ZIP，以解压目录本身为静态网站根目录，访问 `/record-consumer.html?records=/records/manifest.json`。接收端只需提供静态 HTTP。制作源码、身体参数工具和 npm 依赖均在包外。下列 PowerShell 命令在制作工程内串行重测，使用工程内的新证据目录和临时环回端口。

```powershell
$project = 'F:/gamemake'
$ev = "$project/evidence/m2-first-rule-delivery-v1/game"
$game = "$project/output/m2-first-rule-delivery-v1/game"
$dist = "$project/experiments/worktrees/rule-male-a-cb3aca0d/prototype/dist"
$pin = '0e82bd7d6b403f3589e1abcbac4f656c004f0b07c2255a06fb115f5dee022a86'
node "$project/scripts/run-fixed-check.cjs" "$game/independent-extract" "$ev/check-cold.cjs" $pin "$ev/signed.json" "$ev/ordinary-replay"
if ($LASTEXITCODE) { throw '独立接收核验失败' }
foreach ($key in @('0625','0375')) {
    node "$project/scripts/run-fixed-check.cjs" $dist "$project/scripts/qa-production-record-room.cjs" "$game/signed-$key.json" "$ev/room-$key-replay"
    if ($LASTEXITCODE) { throw '工作台动作核验失败' }
}
```
