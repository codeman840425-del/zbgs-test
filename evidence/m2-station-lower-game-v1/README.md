# 低位唱麦双房的游戏回读

[四段 1 倍速录像](index.html) · [上一版同两房](../m2-performer-anchor-game-v1/index.html)

原签名制服女角色在旧麦架前因超出 26 cm 拾音距离退出。在新麦架前，她在两房均能走近并站稳、独占麦架持续讲话、保存状态、关闭 Chrome 后恢复原位，再离开并释放麦架。另一人争用时被拒，等她离开后成功接手和退出。双方沿用原游戏行为、签名与鞋底。两房各有首开和冷开，共四次会话。[公开按钮、同帧口眼、脚底和任务状态](room-01/report.json)

|房间|女体嘴到网面|网面高于女体眼中心|男体嘴到网面|
|---|---:|---:|---:|
|唱播工作室|23.81–25.19 cm|8.80–9.25 cm|16.33–17.70 cm|
|出租屋|24.04–25.25 cm|8.67–9.07 cm|16.90–17.49 cm|

表中每房为女体 10 点、男体 3 点的浏览器持有采样。两房分别另做每体 900 帧 CPU 持有检查，女体出租屋在最紧时距上限只余约 1.60 mm。近景中女角色的麦头仍接近额头高度，已列为观感缺陷。男角网头在眼中心下方约 4.0–4.55 cm。角色可见谱面，当前注视仍朝拾音面。音频同步和按谱行注视待验。[垂直分量与身体签名](axis-summary.json) · [女体实际近景](room-01/singing-rental-cold-close.png) · [CPU 对照](../m2-station-lower-intake-v1/README.md)

角色固定源码 `545dc941`，构建 `ddcf40a56d0e`，公司双房传输清单 `64802112dd64`，合包清单 `c1ae6690963a`。两次合包的 674 个文件逐字节相同。Chrome 157、RTX 4090、1440 × 900。四次会话各自的帧间隔 P95 均约 6.2 ms，两次冷开观察窗口有约 328 ms 长帧；采样同时执行截图、录像和几何诊断，耗时归因与普通电脑实测待补。[完整重建、错配拒绝与重试](rebuild/README.md)

```powershell
$pin = 'c1ae6690963ad6291fb60b5d6380f47b06c5373f788c63a2c29330772b462f26'
node scripts/run-fixed-check.cjs output/m2-station-lower-game-v1/rooms scripts/qa-game-standing-vocal.cjs ddcf40a56d0e evidence/m2-uniform-lite-operator-v1/records.json output/m2-station-lower-game-v1/replay-room room require-anchors low-fit $pin
python -B evidence/m2-station-lower-game-v1/measure.py
```
