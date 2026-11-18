# 房间座面固定交付

| 交接项 | 固定值 |
| --- | --- |
| 源码提交 | `04f712496f9f7611b8731d5a8210f1bcc86366fe` |
| 游戏场景构建 | `003c5c0e9a18` |
| 交付清单 SHA-256 | `d42469e35093d8d6c0c09ac78b42746bb176ee29bb51eccd0c51ae11390106fa` |
| 独立接收原包 | `F:/gamemake-company-platform-c1/company-workspace/deliveries/seat-contact-v1` |
| 固定源码检出 | `F:/gamemake-company-platform-c1/company-workspace/worktrees/seat-contact-v1` |

## 接收、观看、复产

1. 在收到的原包根目录执行第一条命令，核对全部 1,753 个登记文件。第二条命令启动此包的独立预览，使用终端打印的临时本机地址。默认是新版单工位房间。将查询参数换为 `?delivery=screen-partition-rental` 可查看屏风出租屋，换为 `?delivery=textile-rental` 可查看带软装的出租屋。完整名单和逐房座位数量见[身份回执](identity.json)。
2. 在原包之外保留一份接收工作副本，在副本根目录执行第三条命令。进入其 `source` 目录，执行第二段命令即可从输入复产两间房，在实际坐面上取样，并复跑正常浏览器入口的保存和完全关闭重开。

```text
node verify.mjs . d42469e35093d8d6c0c09ac78b42746bb176ee29bb51eccd0c51ae11390106fa
node serve.mjs 0
npm ci --prefix source/prototype
```

```text
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/seat-contact-rooms.json ../my-seat-rooms
node scripts/company-platform/check-seat-contacts.mjs ../my-seat-rooms/contact-studio/save.json ../my-seat-rooms/contact-rental/save.json --report ../measured.json
node scripts/company-platform/test-seat-contact-template.mjs
node scripts/company-platform/test-seat-contact-audit.mjs ../geometry-test
node scripts/company-platform/qa-seat-contact-rooms.cjs .. 003c5c0e9a18 ../browser-results --expect-fixed
```

要重新构建，在副本的 `source/prototype` 运行 `node scripts/build-company-id.mjs`，然后运行 `node node_modules/vite/bin/vite.js build --config vite.company.config.js`。独立复产的 507 个运行文件及两份批次的 8 个结果文件与固定交付逐字节相等。 [重建与打包负例](rebuild.json) · [封存后核验](clean.json)

## 房间和回归

- 四份已有房间各增加一个修订号，沿用同一公司、实例、变换、工位、坐点和进出点，显式将六把原椅换成梯背造型。两个历史包依旧可以复现原始测量。四份操作数组可用于旧包的 `edit.mjs apply`。旧装修的自定义材质须显式映射，原存档可用于回滚。 [旧包与候选哈希](legacy/edits.json) · [四份操作](legacy/operations)
- 新制两间房的规模输入使用 `furnishingVersion: 2`。工位模板 `stream-station@3` 和独立桌椅组合均选用 `chair-ladder@1`。历史工位模板 @1/@2 和旧配方仍复现旧选择。四套工位造型可用于 @3。 [新旧模板](cpu/template.json) · [九份旧输入逐字节对照](cpu/historical-document-hashes.json)
- 固定包和独立接收工作副本分别用浏览器载入全部六份具名房间，实测 9 把单椅与 14 个沙发席位。每个席位测量中心及四个近邻位置，首轮 115 次实际网格射线均命中声明高度；六份各自保存、完全关闭浏览器并重开后，逐点复测一致。默认入口和具名 `contact-studio` 是同一房间。 [固定浏览器报告](fixed/browser.json) · [接收方浏览器报告](independent/browser.json) · [出租屋工作间原速录像，5.60 秒](fixed/seats-normal-1x.webm)
- 严格移交使用 `--seat-contacts`。用正确主房搭配含旧椅的不合格出租屋，打包器返回 `seat-contact-check-failed`、房间和使用点 ID、期望与实测高度，输出目录未创建。CPU 还覆盖楼层转向、隐藏楼层、中心命中而邻点悬空、缺 GLB、缺版本。 [CPU 回归](cpu/geometry.json) · [逐房封装和失败回执](rebuild.json)
- 可在副本的 `source` 主目录复验失败机制。先构建，再将 `../legacy-rental.json` 替换为原软装包 `data/rooms/textile-rental/save.json` 的副本，执行 `node scripts/company-platform/package-company.mjs prototype/dist-company 003c5c0e9a18 ../my-seat-rooms/contact-studio ../should-be-rejected --seat-contacts --room old-rental ../legacy-rental.json`。成功的打包结果则在默认与各房间数据目录附带 `seat-contacts.json` 并由清单登记。 [场景座面生产说明](../../docs/research/COMPANY-SEAT-CONTACT-CHECK.md)

## 联调范围

本包提供固定的场景设施几何和使用点。角色接近、坐下、起身、离开，双席位占用、身体与服装适配仍由总工用真实角色验证。软件 Chromium 的结果仅用于确认功能和保存恢复。既有 62080 画廊继续使用原观看版本；本包的版本和录像以上表为准。
