# 原制服男体的资源来源与交接范围

已从精确源码 `797516d2187abcc519edb850399f636b5d022cb4`、固定构建 `9d520a80d731`，单独导出原色制服记录 `source-outfit-release-01` revision 1。清单 25 项，含包清单共 26 个文件、34,730,348 B。全包 SHA、长度和单条落盘原签已回读。这是该固定入口目前能生成的单人闭包。既有相同签名的同版双记录消费通过首次打开和关闭重开，代表房间完成走、坐、起身、再走。本次单人精简包仅做 CPU 导出与读回。[固定来源与尺寸](pins.json) · [单人导出回执](../../../output/m2-cc0-body-rights-r01/summary.json) · [既有游戏回读](../../m2-source-outfit-release-v1/receiver-v2/browser/report.json) · [既有房间动作回执](../../m2-source-outfit-release-v1/room-fixed/report.json)

| 原闭包依赖 | 已核事实 |
| --- | --- |
| 身体与衣物 | `cf1118…` 身体的 21 张内嵌 PNG，以及原上衣/领带、长裤、平底鞋的 4 张内嵌 PNG，逐张 SHA 与 `ab9af434…` 旧 β `Base_Male.vrm` 的嵌入图一致。原件是 hecko 的 VRoid Studio β 0.14.0 未优化导出，VRM0 元数据记 CC0、Everyone、商用允许，链接列出修改和再分发。pixiv 旧模型页声明其模型为 CC0，归档中的第三方导出缺少与官方 β 原件的逐字节对证。 |
| 启动动作 | `UAL1_Standard.glb` 含 43 个动画，Quaternius 原作者声明 CC0。另含标注 CC0-1.0 的项目派生 jog GLB 和 profile。原 `Dance_Loop` GLB、项目技术舞 GLB 及其舞清单均在首次加载时拉取，即使画面只播放 idle。 |
| 随包及缺省设备 | 招手 GLB 随包保留，旧 idle 请求里未见该文件。技术舞和招手有项目编排部分，来源中的 CC0 声明适用于各自的 UAL 源。原签的话筒与眼镜皆关闭，没有设备 GLB、抓握文件或独立外观贴图。录入的 Pexels/Rokoko 舞目录描述仍随清单，三种精确体型舞对 `cf1118…` 均不支持，动画文件和视频均未导出。 |
| JS 与 notice | 游戏入口及 9 个编译 JS 包含 Phaser 3.90.0、EventEmitter3 5.0.4、Three.js 0.187.0、`@pixiv/three-vrm` 3.5.5 及其子包，还有 Vite 7.3.8 生成的浏览器 modulepreload polyfill。源锁和实际 JS 对照见 pins。对应原始 MIT notice 与 UAL 原作者附记可随内部交接。 |

[男源归档](../../../assets-source/foundation-male/LICENSE.md) · [pixiv 旧模型说明](https://vroid.pixiv.help/hc/en-us/articles/900000088126-New-model) · [Quaternius 许可](https://quaternius.com/packs/universalanimationlibrary.html) · [本地原文 notices 附件](THIRD-PARTY-NOTICES.txt)

## 新皮肤贴图候选

- 衣物、动作及 JS 仅可按新清单中实际一致的路径、字节和 SHA 复用旧判断。JS 变化时按新固定构建的 lock 和实际模块重核 notices。固定目录里存在的其他素材以及清单链接上的非随附对象没有自动进入交接范围。
- 新身体须另记新 SHA、来源身体、制作配方、每项被改的图与前后用途。仅在能复核像素或处理过程来自相同旧源时，才沿用其旧源来源依据。新制图、外加贴图、外加设备或选择项需各自查明授权。原 `cf1118…` 的 PNG、体型适配 pin、旧签名或技术验收均只代表该输入，不能为新体身份作证明。
- 对新候选用实际固定检出重新跑 `game-record-cli.mjs inventory` 和 `export`，回读包内全文件及实际记录。核对纹理与材质消费者、装备身份、动作目标过滤、设备和动态请求。重新实测新签启动与冷开，按交接范围核走坐起或其他所需动作。运行时纹理预算与普通电脑测试沿新输入收证。

项目自制运行代码、技术舞和招手编排的对外许可声明留空，内部技术交接与公开发行分别决定。原文 notices 附件只覆盖该版闭包已核的第三方部分。

[正式打包入口](../../../scripts/runtime-package/game-record-cli.mjs) · [依赖选择规则](../../../scripts/runtime-package/record-resources.mjs) · [既有单体房间回归脚本](../../../scripts/qa-production-record-room.cjs)
