# 唱播双房的麦架站位交付

固定源码 `ab31a6763f05934fc85da5dbcf7dfd6d2c69799e`，构建 `c2263e74556c`。主目录下的 `company-workspace/deliveries/vocal-use-v1` 保存正式包。批次输入为 `source/scripts/company-platform/batch-inputs/vocal-use-rooms.json`。本机独立复产和派生包的位置见 [identity.json](identity.json)。

工作室与出租屋各有一支麦架和一个容量为 1 的站位。包内 `data/rooms/<房间键>/use-points.json` 的 `saveSha256` 绑定同目录的房间存档。运行侧按 `kind=standing-vocal` 和稳定槽位 ID 查找，可读到从楼层、房间到麦架的变换、场景中的站位、进退点、朝向和拾音网格标识。旧房间继续按原存档定义工作。[接口与生产说明](../../docs/research/COMPANY-SINGING-ROOM-PRODUCTION.md)

独立接收方用公开入口平移麦架并转向 90°，重新封包后冷读。槽位 ID 保持一致，工作室世界站位变为 [0.82, 0, 0.05] 米，口部参考点到实际拾音面的射线距离为 0.1302 米。挡板堵住最后 35 厘米的进场通路时，批量制作和编辑入口均指出挡板与槽位，原场景及存档保持有效。占用期间的设施修改在场景准备及提交阶段都被拒绝。独立重建的 607 个预览文件和另一房间的 7 个数据文件均已逐字节核对。[场景检查](cpu/report.json) · [独立复产](receiver/report.json) · [独立重建](cpu/rebuild.json)

普通预览界面验证了两房的实际拾音面、转向后的关闭重开、保留原布置的拒绝提示。原速录像展示两间原房及各自的一次 0.10 米平移，时长 21.68 秒、25 帧/秒。[原速录像](browser/video/vocal-slot-rooms-normal.webm) · [挡板被拒画面](browser/singing-studio-blocked-panel-rejected.png) · [浏览器报告](browser/report.json)

从正式包根目录核验全包，向接收方交付下列固定清单哈希。在独立副本 `source/prototype` 内按锁文件安装再重建。浏览器复跑用固定源码中已有 Playwright 的环境，参数为正式包、构建、项目内一个全新输出目录和可选的 `--record`。

```powershell
node verify.mjs . 2f36e3dc92939fdb93f4c99902196ed6b5e7ec4312cceecb7f48c1237d073c57
```

原始报告使用封包前的候选路径。该目录已按同一清单归档到上述正式位置。固定检出的谱面回归须显式传入既有接收方样件的绝对路径，结果见[谱面回归](cpu/score-regression.json)。本轮验证使用软件渲染和几何参考点。真人进场、争用、接近途中重启时的剩余预约期限、最终释放由总工使用正式角色包联调。[联合验收约定](../../docs/COMPANY-C3-INTEGRATION-HANDOFF-2026-11-16.md)
