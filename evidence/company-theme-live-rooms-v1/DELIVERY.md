# 四类直播主题房联合交付

同一份生产批次生成五间可继续编辑的房间：出租屋舞播间、楼层舞播间、唱播工作室、酒店访谈间、出租屋带货间。接收方从固定包重建查看器，逐间换了一件设施，再发布自己的五房包。每份保存可单独读回。[固定交付包](../../company-workspace/deliveries/theme-live-rooms-v1/README.md) · [完整批次](production/theme-batch.json) · [派生包](../../company-workspace/production-trials/theme-live-receiver-v1/check-01/derived-package/README.md)

## 看舞播机位

在房间内点「机位取景」，工具栏会移到画面上方。点「房间全景」返回。录像从正式包运行并按 1 倍速记录，时长 21.76 秒，逐帧解码 544 帧。两房均有 1280 × 720 的原始镜头截图，加框图中细线圈出约定拍摄范围。[原速录像](browser/video/dance-broadcast-normal.webm) · [出租屋原图](browser/rental-dance-broadcast-initial-feed.png) · [楼层训练房原图](browser/upper-floor-dance-broadcast-initial-feed.png)

| 房间 | 可拍的横向活动线 | 取景与通路 |
| --- | --- | --- |
| 出租屋舞播间 | 宽 1.97 米，地面至 2.00 米 | 桌面相机从北侧拍软包背景。活动区整体南移 0.38 米，保留 2.25 × 2.50 米的净空面积、2.20 米净高和客厅西门通道。 |
| 楼层舞播间 | 宽 2.48 米，地面至 2.02 米 | 相机朝北拍条板背景，保留 3.00 × 3.00 米活动区、2.20 米净高和南门公共走廊。 |

两台相机的底面均贴合实际桌面。镜片到指定拍摄面的整个空间经过三角面遮挡检查，能检出夹在采样线之间薄至 1 毫米的前景板。浏览器在 16:9 画布分别验证了每房四角、45 个前景样点，以及中央胸肩位置的三处真实背景命中。公共区经指定房门到拍摄线中点可通。出租屋同桌临时增加第二台相机后，按钮仍选中配方指定的镜片。结论适用于两房的指定拍摄面，实际舞者运动及设备表现留给角色和目标机验收。[几何与通道](production/rooms.json) · [桌面实测](production/desk-and-layout.json) · [浏览器回执](browser/report.json)

原出租屋镜头朝向客厅门，三条胸肩视线均错过背景。首次楼层取景中，房名和说明又挡住了全身区的头脚。新版将实物背景纳入房间检查，取景工具栏与画布分开；退出机位恢复房间说明。[原出租屋构图](diagnostics/old-rental-feed.png) · [原视线命中](diagnostics/old-rental-geometry.json) · [原楼层界面](diagnostics/obstructed-controls.png) · [新楼层界面](browser/upper-floor-dance-broadcast-initial-controls.png)

## 独立接收结果

固定源码为 `5c0ff1e8ce43c11d6a91b1143aed83c1bbe584f2`，查看器为 `66de2c6a46fc`。正式包清单 SHA-256 为 `5e900b511c5d52bb22995c737d22093f88bfefa999fe512c4f9d2036881ce35b`，2122 项全部复核。独立副本按锁文件重新安装并重建，595 个查看器文件逐字节相同。[版本身份与录像哈希](identity.json) · [重建回执](receiver/rebuild.json)

接收方分别替换了两块舞播背景、唱播相机、访谈来宾椅和带货商品，实例 ID、父级、变换与有效状态均保留。接收方将修改后的五间房重新封包，2107 项全部复核。在新进程直接读回派生包五间房和默认房的存档后，再用浏览器打开两间派生舞播房。将出租屋相机转向背面，公开编辑、冷读校验和封包均返回 `dance-shot-out-of-frame`，原存档和已发布版本的哈希保持一致。[独立改款、失败与冷读回执](receiver/report.json) · [派生浏览器回执](receiver/browser/report.json)

在项目根目录可按下列命令复验，输出目录应是新的可写位置。接收方独立运行时，先从正式包复制工作副本，在副本的 `source/prototype` 目录运行 `npm ci`。五房制作声明、配方修改与公开发布沿用原入口。[面向制作 agent 的说明](../../docs/research/COMPANY-DANCE-BROADCAST-PRODUCTION.md)

```powershell
$fixed = 'company-workspace/deliveries/theme-live-rooms-v1'
$pin = '5e900b511c5d52bb22995c737d22093f88bfefa999fe512c4f9d2036881ce35b'
node "$fixed/verify.mjs" $fixed $pin
node scripts/company-platform/batch.mjs evidence/company-theme-live-rooms-v1/production/theme-batch.json output/dance-broadcast/replay-rooms
node scripts/company-platform/qa-dance-broadcast.cjs $fixed 66de2c6a46fc output/dance-broadcast/replay-browser --record
$work = 'company-workspace/production-trials/theme-live-receiver-v1/working'
node "$work/source/scripts/company-platform/test-live-kit-handoff.mjs" $fixed $work company-workspace/production-trials/theme-live-receiver-v1/replay
```

本包供 C1 的 `theme-live-kit` 以及 C2 的批量生产、单件替换、独立移交核对。浏览器取景使用 Chromium 软件渲染。真实角色联调单独固定版本：本次已核收总工的两间盆栽房合包 597 个文件，两份原房存档逐字节相同；名册、争座和接替的实际角色录像由总工提供。[角色合包核收](receiver/character-roster-receipt.json)

后续独立验收提出 ENV-015。原唱播工作室加入品牌背景板后，右页外侧谱线受遮挡，旧检查仍允许发布。五房包复用了这条唱播检查，该反例在五房包上的结果待复测。固定包和录像保留本次实际状态。
