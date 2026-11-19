# 两种房间的通高玻璃隔断

正式包附直播工作室和办公出租屋两个可编辑存档。玻璃隔断可原位换为清玻、磨砂、双色横楣或六格框架，四款共用宽 2.40、高 2.80、深 0.08 米的安装规格。原始清玻材质出自 Kenney Building Kit，实体玻璃、轨道及框格的生产配方和来源随包交付。[生产说明](../../assets-source/company-glass-partition-v1/README.md)

**实际画面。** 固定运行版本为 `165311a0a37c`，对应源码 `9c21ce859c8bc34a4ef90837e7e20bac1caced0f`。两段原速录像各 17.20 秒，1600×900、25 fps。两房分别完成原位换款、移动、转向、堵门拒绝和保存；四个选定外观在彻底重启后恢复。[工作室录像](browser/glass-studio-normal.webm) · [出租屋录像](browser/glass-rental-normal.webm) · [浏览器与存档回执](browser/report.json)

**实装和用途。** 每处隔断分别对地轨、顶轨各测量 15 点。出租屋的端面贴墙通过，加装凸出的木踢脚线会与底轨相交并遭拒。在隐藏楼层，非阻挡茶杯贴近隔断可以保存，茶杯进入玻璃实体会被拒绝。独立带货样例的五条商品视线穿过清玻，在同一位置换框格后均先撞中央立梃。透过磨砂面仍可看见家具轮廓，精细取景按隐私面处理。以上为设施几何、静态通路和软件渲染验收；实际角色通行、普通电脑性能和用户观感待相应验收。[地顶与侵入回执](cpu/installed.json) · [两房通路与商品取景](cpu/two-rooms.json) · [四款渲染对照](browser/recording-probe.json)

**独立复产。** 接收者在空 npm 缓存中依据锁文件重建，713 个运行文件逐字节一致。接收者将六格另制为三列三行，并把两道横梃分别设在 0.646 和 1.791 米。原六格仍可打开。两房从普通面板选择新版、保存和关闭重开，存档与独立编辑命令的输出逐字节一致。[接收回执](receiver/receipt.json) · [接收方工作室九格](receiver/browser/glass-studio-restored-glass-partition-framed-v2.png) · [接收方重开回执](receiver/browser/report.json)

**打开与复验。** 本机正式包在 `company-workspace/deliveries/glass-partition-v1`。从包目录运行 `node serve.mjs 0`，打开所打印的地址并追加 `?delivery=glass-studio` 或 `?delivery=glass-rental`。原始验收记录中的 `production-trials/glass-partition-v1/candidate` 是封存前的位置。固定包的 2,621 个文件、独立九格包的 2,628 个文件均按各自清单核对。[构建、清单与录像哈希](identity.json)

以下命令从已安装依赖的固定源码检出执行，输出使用新的项目内路径。接收者先将封存包复制至自己的可编辑目录，在副本 `source/prototype` 中按锁文件安装依赖。

```powershell
node scripts/company-platform/build-glass-partition.mjs --check
node assets-source/company-glass-partition-v1/check-geometric-controls.mjs
$run = 'F:/gamemake-company-platform-c1/output/glass-verify'
node scripts/company-platform/test-glass-partition-rooms.mjs "$run/rooms-test"
node scripts/company-platform/test-glass-partition-installed.mjs --rooms "$run/rooms-test/rooms" --output "$run/installed"
$package = 'F:/gamemake-company-platform-c1/company-workspace/deliveries/glass-partition-v1'
$manifest = 'c86dc056e1e484e9bb31bdd1b92a8fda3ce7500bdfb5aad3df1fdabdceeb7b39'
node scripts/company-platform/qa-glass-partition.cjs $package $manifest "$run/browser" --record
node scripts/company-platform/test-glass-partition-handoff.mjs $package $manifest "$run/receiver"
```
