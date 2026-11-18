# 多房间交付中的训练区

正式包在 `company-workspace/deliveries/named-training-v1`。默认公司是普通直播民房，另外附有出租屋和二层公司的训练室。编辑时按每份布局的生产配方保护活动区和进门通道。[两间训练室换款前后及入口的 23.6 秒原速录像](browser/video/named-training-rooms-normal.webm)

旧版接收工具允许把一盆盆栽放进两间训练室的活动区，还会把结果标记为有效。同一工具在训练室作默认公司时能正确拒绝。修复复用随包发布的原配方和已有网格净空检查。固定源码为 `c1fbec480a27fec2abbaeb27125c7ee3561bd844`，查看器构建为 `2070c652571c`，本次交付工具和数据由包清单哈希区分。[旧版复现](old/REPORT.md) · [版本和清单](identity.json)

独立接收方对两间训练室分别换背景板、靠墙移动、保存，再次编辑。活动区和门口在初始和续编时共触发八次正确拒绝，均返回物件身份和受阻区域，原包数据和已接受结果继续有效。普通民房更名成功。两份训练室存档在关闭浏览器后均可恢复。录像展示实际布置，拒绝结果取自编辑命令。[接收端编辑报告](receiver/cli.json) · [浏览器报告](browser/report.json) · [录像核对](browser/video-review.json)

接收方按锁文件安装依赖并重建，543 个查看器文件逐字节一致。二次打包使用一份带相邻回执的存档、一份完整编辑目录、一份历史包中的训练室。三房再交付后都保留各自的留白要求，并支持下一次合法编辑。正式包的 1,861 个清单文件、派生包的 1,860 个清单文件均通过校验。[重建比对](receiver/rebuild.json) · [二次交付回执](receiver/second-handoff.json)

## 使用与复核

在原包根目录运行以下命令。打开打印的临时地址，将查询参数改为 `?delivery=rental-training-room` 或 `?delivery=upper-floor-training-room`。

```powershell
node verify.mjs . 0b2aa384cb0d998025dcf2488cac2eb37e0854e456aaf408f3c794d4c5d4c08e
node serve.mjs 0
```

在可写副本根目录运行下列命令。`../my-training-check` 为本次新建的结果目录。每间房生成的 `first-edit`、`second-edit` 和回执可供下一位 agent 使用。

```powershell
npm ci --prefix source/prototype
node edit.mjs validate data/rooms/rental-training-room/save.json
node source/scripts/company-platform/test-named-training-handoff.mjs . ../my-training-check
```

同一公司 ID、修订号和存档字节可以对应两种配方。两个历史样例的活动区边界相差 5 厘米，同一盆栽在一份方案中受阻，在另一份中能摆放。直接编辑随包的房间路径即可选中原方案。外部副本出现歧义时，命令提示加 `--room 房间名`。编辑目录可用 `training-edit.json` 保留来源。只有独立游戏布局、原生产包和回执均已丢失时，无法反推美术组约定的训练区。[旧版兼容回归](old/COMPAT.json)

软件渲染录像用于查看房间布置。真实角色动作与目标设备性能分别验收。
