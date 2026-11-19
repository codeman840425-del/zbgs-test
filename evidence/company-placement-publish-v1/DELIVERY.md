# 出租屋门口通路的发布复核

正式双房包位于 `company-workspace/deliveries/floor-air-v1.1`。工具固定源码 `4f478d5d8be3e86f3abeea56a800c74ae5b97d58`，查看器 `7255eee31b85`，发布清单 `74034d41ef5865a288f4bb6f45d789a71a18fc19f966a19df691541513bbdec5`。2,197 个文件通过完整性核验。民房和出租屋的存档、布局与旧版逐字节一致，可从同一位置观看前一版已验的四款落地设备。[22.24 秒原速录像](browser/video/floor-air-normal.webm) · [两房与四款造型](browser/rooms-and-four-looks.jpg) · [文件身份](identity.json)

融合组发现，风扇放在出租屋直播间局部坐标 `[1.89, 0, 0.08]` 米时，真实底座覆盖门内侧的通行点。旧批量制作和编辑入口会报堵门，打包入口却能把同一份坏存档作为默认房或具名房发布。复跑分别重现了两份旧坏包的原始清单 SHA。新版逐房读取最终存档，调用批量制作和编辑器共用的连接与摆放检查，然后才写入发布目录。新包清单的 `placementReports` 绑定房键、公司 ID、存档 SHA 和实际检查报告。[原底座与门口测量](checks/original-mesh-contact.json) · [旧版复现](checks/historical-reproduction.json) · [生产入口独立复跑](checks/independent-publisher.json)

| 接收方送来的输入 | 固定工具实测 |
| --- | --- |
| 原始堵门坏档，默认房或具名房 | 均返回 `blocked-portal`，定位同一扇门与同一台设备，区分 `@default` 和 `air-rental`。旧包、好批次、存档和原输入保全，失败目标可原位重试。 |
| 带旧清单的坏房，或保留了原通过报告的改档批次 | 三次均重算并命中同一堵门原因。[逐入口回执](checks/existing-and-stale.json) |
| 悬空、与椅重叠，及合法移动转向 | 批量、编辑、封包的结果一致；接收方独立制造的六叶循环扇也以原位和转向后的位置分别发布成功。[六叶款实测](checks/six-blade.json) |
| 房间声明已删除、来源房键错误、清单错误、未知来源版本 | 显式申请继承时，各自按对应的来源原因拒绝。[来源检查](checks/origin-regression.json) |
| 酒店访谈间外的走廊挡板挡住唯一入口 | 原反例通过通用网格检查，访谈专项实体通路检查从默认和具名入口均返回 `room-door-unreachable`，指出挡板和无法到达的两处人物位置。原酒店与工作室仍可发布。[访谈间复核](checks/interview-entry.json) |

临界对照只改变循环扇的房内 Z 坐标。Z 为 0.5000 米时底座触及门口的保守预留边界，发布拒绝。移至 0.5001 米后，默认与具名入口均通过。两个结果分别从各自封包的源码独立安装、重建和复算，查看器各 615 个文件逐字节匹配。沿门内点至门槛的连续线段复测全部 3,968 个模型三角形，距中心线最近的部件是配重底座。扣除 0.30 米通行半径后，真实底座余量约 0.267 毫米，保守方形包络余量 0.100 毫米。原坏档的中心线穿过底座。测试中的微小差值用于检验发布边界。[临界输入与两个清单](checks/boundary-packaging.json) · [两包重建](checks/boundary-rebuild.json) · [真实底座与世界坐标复测](checks/boundary-mesh.json)

浏览器从新包的两份具名存档加载，四款设备均完成换款、调速、保存与关闭重开。真实角色穿门往返仍待双方角色运行链接入这两间房。[浏览器回执](browser/report.json) · [录像与加载身份](browser/media-review.json)

## 复跑

在正式包根目录执行清单核验。将完整包复制到自己选择的工作目录，在副本的 `source/prototype` 中执行 `npm ci`。独立维护的回归脚本与原始九个输入随本次验收回执保存；脚本使用工作副本里的公开发布工具。下面的示例从场景平台工程根目录运行，最后一个参数是尚未创建的输出目录。

```powershell
node company-workspace/deliveries/floor-air-v1.1/verify.mjs company-workspace/deliveries/floor-air-v1.1 74034d41ef5865a288f4bb6f45d789a71a18fc19f966a19df691541513bbdec5
node scripts/company-platform/test-package-placement.mjs company-workspace/production-trials/floor-air-placement-v1/work company-workspace/deliveries/floor-air-v1 evidence/company-placement-publish-v1/inputs output/replay-floor-air-door
```

临界测量可使用两个存档单独重跑。用副本内的 `package-company.mjs` 分两次封包，第一次以 [临界出租屋](inputs/boundary-good.save.json) 为默认；第二次以原民房为默认，并用 `--room air-rental` 指向同一临界出租屋。随后执行以下命令，把前两项替换为生成的两包路径。脚本核对包内实际域模块、资源、锁文件与 GLB，再从世界坐标复算门口两侧和模型最近距离。

```powershell
node scripts/company-platform/test-floor-air-door-clearance.mjs output/placement-release-017/boundary/default-package output/placement-release-017/boundary/named-package company-workspace/production-trials/floor-air-placement-v1/work/source evidence/company-placement-publish-v1/inputs/inside-door/save.json evidence/company-placement-publish-v1/inputs/touching.save.json
```

[独立回归脚本](../../scripts/company-platform/test-package-placement.mjs) · [网格与实际三角形测量脚本](../../scripts/company-platform/test-floor-air-door-clearance.mjs) · [固定输入](inputs/) · [重建与六份原存档对比](checks/rebuild.json)
