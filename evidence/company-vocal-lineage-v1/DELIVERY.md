# 唱播工作室与出租屋 v1.1

接收方可以逐房确认唱播站位沿用了哪次验收，再取出这间房当前的接近点、站位和离开点。工作室和出租屋的布局与存档四个文件沿用 v1 原始字节。正式包位于 `company-workspace/deliveries/vocal-use-v1.1`。[两间房与麦架近景](browser/rooms-and-pickups.jpg) · [21.40 秒原速录像](browser/video/vocal-slot-rooms-normal.webm)

固定源码 `4d6f1ce9f4b5bb55e4c69e9170aa2b7facfbb5a0`。查看器为 `7255eee31b85`，独立安装与构建复现了全部 615 个运行文件。归档后按清单复核 2,188 个文件。两间房经过普通界面编辑、关闭重开和背景板挡路拒绝检查。[文件身份](identity.json) · [独立构建对比](cpu/rebuild.json) · [浏览器回执](browser/report.json)

在新包根目录运行以下命令。默认场景也绑定具名来源 `singing-studio`。取出租屋时将命令中两处房键都改为 `singing-rental`。

```powershell
node check-vocal-origin.mjs singing-studio 5c676cafa500ac5fc79d2461935fc323844e02fa0a1baa01c8025cd75d3e4012 ../vocal-use-v1 2f36e3dc92939fdb93f4c99902196ed6b5e7ec4312cceecb7f48c1237d073c57 singing-studio
```

原工作室读出站位 `[0, 0, 0.77]` 米。另一位制作者把麦架平移并转身后，同一个站位 ID 读出约 `[0.82, 0, 0.05]` 米。接收试验同时覆盖重新创作、批次声明和严格继承。删除站位或改动人眼局部位置 5 毫米仍可作为独立设计制作，若申请继承原验收，公开打包入口在写出成品前拒绝这两种输入。错误清单、版本和房键也各有具体原因。[正式两房读数](cpu/reader.json) · [公开入口六项拒绝](cpu/public-negative.json) · [接收方混合来源试验](receiver/report.json) · [原始缺口回执](../company-vocal-use-v1/INDEPENDENT-RECEIPT.md)

同样的申请与读取方式可用于下一个由其他 agent 制作的唱播房。真实角色的接近、占用争抢、任务中途重开及释放仍由总工在角色运行链联调。[唱播房制作与复跑方法](../../docs/research/COMPANY-SINGING-ROOM-PRODUCTION.md)
