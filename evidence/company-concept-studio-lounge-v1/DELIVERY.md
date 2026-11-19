# 双屏直播工位与等候区

同一份配方安装在已有出租屋和两层直播公司。工位的桌、椅、键盘、麦克风和补光采用已登记的工位组合，主副屏同装在桌上。另两件小物由墙架的不同层板承载。休息室保留双人沙发的两个座位，杯子放在独立边几上。

| 场景 | 观看 |
| --- | --- |
| 出租屋 | 北墙安架，沿用休息室原有的边几与茶杯。[15.16 秒原速录像](browser/rental-lounge-normal.webm) · [双屏与壁架](browser/rental-lounge-dual-monitor.png) |
| 两层直播公司 | 一层西墙安架，等候区新增边几和茶杯。可从大楼外观进入楼层再选房，门柱在全景中挡住部分桌脚，聚焦后可见完整桌面和杯子。[19.00 秒原速录像](browser/cool-studios-normal.webm) · [等候区全景](browser/cool-studios-waiting-overview.png) |
| 接收方另制的二层 | 使用框架墙架、方边几、拱形双人沙发，保留一层已装好的 53 个节点。新样式通过公开的 JSON 配方生产，在新开浏览器中恢复。[重开后的房间](receiver/receiver-beta-room.png) · [可导入存档](receiver/beta-v2.save.json) · [v2 配方](receiver/concept-studio-lounge.v2.json) · [该次批量输入](receiver/third-input.json) |

固定源码 `cb23e9e42c10be3dc2a9565f659cd67962e17edb`，游戏查看器 `9248a1708658`。正式包位于 `company-workspace/deliveries/concept-studio-lounge-v1`。归档后 2,513 个登记文件全部匹配。接收方在 Windows 从空 npm 缓存安装并重建，689 个查看器文件逐字节相同，原两份批量结果的输入、布局、存档和报告也逐份重现。[版本身份](identity.json) · [封包校验](sealed-package.json) · [独立复产](receiver/receipt.json)

两台显示器的实际模型相隔 6 厘米。按四个坐姿参考眼位、每屏五个采样点，两份样板共 80 条射线均先命中屏幕正面。两台显示器的底脚、层板上的两件小物及隔室杯底均落在各自支承面。工位平移 5 厘米时双屏随桌移动，墙架和等候家具保持原位。普通物品面板可以只替换副屏；完全关闭浏览器后，两区保存的配置均可恢复。[房内实测](room-inspection.json) · [浏览器结果](browser/report.json) · [原速录像核验](browser/recording-probe.json)

安装保留原屏幕开关状态。回归测试发现旧检查误将关机与屏面缺失混为一谈；现有检查分别读取电源和实物屏面。已关主屏、刚开的副屏和原边几的半圈转向可同时保留。错误宿主或配方哈希会拒绝该份公司，修正后仅重试失败项。[局部状态与失败重试](state-and-retry.json) · [首次旧布局缺少培训来源的回执](first-pilot-refusal.json)

另查两份公司全部座位，原装修 19 个使用点中有 18 个通过。出租屋独立工作间的旧 `chair@1` 实测坐面比声明高 5 毫米。另存的修正版只将那把椅子显式换成 `chair-ladder@1`，两个公司的 19 个位置均通过静态接触检查。上方两段影片对应原装修。[原始测量](seats/as-delivered.json) · [单件替换操作](seats/replace-work-chair.json) · [修正版存档](seats/rental-seat-fit.save.json) · [修正后测量](seats/explicit-replacement.json)

在正式包根运行 `node serve.mjs` 即可预览。在可编辑源副本使用同一条批量命令生成两种公司，换房和改款均可直接编辑 JSON。软件渲染验收覆盖设施与观看，普通电脑性能、真实角色接近、占用和坐起仍需在集成候选上验证。[接收方使用说明](../../docs/research/COMPANY-STUDIO-LOUNGE-SET.md)
