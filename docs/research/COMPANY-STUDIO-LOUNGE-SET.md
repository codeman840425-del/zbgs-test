# 在既有公司安装双屏直播工位与等候区

从交付包的 `source/` 目录运行以下命令。需要与锁文件相容的 Node 和 npm。两份输入共用同一份有版本的陈设配方。出租屋在休息室沿用旧边几和杯子，两层公司只在一层指定房间安装。生成结果在各自子目录的 `layout.json`、`save.json`、`input.json`、`report.json`。

```powershell
npm ci --prefix prototype
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/studio-lounge-set.json output/rooms
node scripts/company-platform/test-studio-lounge-set.mjs output/rooms output/room-check
```

## 同一配方换一个空间

`studioLoungeSet` 放在既有的批量制作条目中。编辑者可以提供完整公司文档，也可以沿用已有的规模配置、风格、工位和独立家具。原布局有培训房时须沿用可重放的原批量输入，或已保存原始培训来源的文档。单独从历史包摘取一个缺少来源的布局会返回 `training-origin-required`。两个实例使用不同的公司身份。

| 输入 | 含义 |
| --- | --- |
| `recipe` | 陈设配方的 `id`、正整数 `version` 和文件 `sha256`。配方文件位于 `scripts/company-platform/studio-lounge-sets/<id>.v<version>.json`。 |
| `live`、`station` | 已有直播房及其工位实例。工位模板须与配方相符。主屏与副屏使用桌面局部坐标，随桌和工位移动。 |
| `shelfWall` | 直播房局部墙边 `edge` 和沿墙偏移 `along`，单位米。北、南墙沿 X，东、西墙沿 Z。墙架有自己的房间归属和分层承载面。 |
| `waiting`、`sofa` | 同楼层另一间休息室及其已有双人沙发。保留沙发的位置、朝向和两个座位。新边几按配方相对沙发的偏移定位，`tableYaw` 是边几相对房间的朝向，单位弧度。 |
| `reuse` | 可显式给出原有 `table`、`cup` 或 `secondaryMonitor` 实例 ID。沿用边几、茶杯时保留局部位置。父级、使用角色或层面不合会指出绑定问题。新安装使用稳定 ID，遇到同名既有物件会拒绝。 |

成套安装会按 `stationLook` 替换目标工位的桌子、椅子、麦克风、键盘和补光外观，将主屏放到配方指定的桌面位置，并安装或复用副屏。原有两屏保留各自开关状态，新增副屏采用配方的初始状态。只想改一件已装设备时，使用普通物品面板或已有的 `replace-resource` 操作。将同一份原输入重放到同一输出位置，批量工具逐文件核对。错误宿主、无对应版本、接触或视线不合格时只拒绝该份公司；纠正后用 `--only` 指定它的条目键重试。

## 接收方另制样式

复制已发的配方，使用新的版本号和文件名，例如 `concept-studio-lounge.v2.json`。在已有资源中选择兼容的工位组合、屏幕、墙架、层板物品、双人沙发和边几，保留各自的资源版本。以下命令给出配方文件的字节哈希，适用于各平台的 Node：

```text
node -e "const fs=require('node:fs'),c=require('node:crypto');console.log(c.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" scripts/company-platform/studio-lounge-sets/concept-studio-lounge.v2.json
```

在新批量输入中填写新版本及哈希，选中已有的两个房间、工位和沙发，使用前述批量命令生成到新的结果目录。每份报告中的 `checks.studioLoungeSet` 保留实际桌面接触、两屏间距和坐姿参考眼位的可见性。在交付包根运行 `node verify.mjs` 核对清单。运行 `node serve.mjs` 后，将打开地址的查询部分改为 `?delivery=rental-lounge` 或 `?delivery=cool-studios` 观看对应公司。配置、素材及设施使用点可供游戏读取。静态眼位和通路检查的范围止于场景数据，真实角色运行另行联调。
