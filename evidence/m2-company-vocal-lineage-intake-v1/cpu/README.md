# 两间声房的角色侧 CPU 联测

公司构建 `7255eee31b85` 发布的两份存档都能装入公司原场景，分别解析出唯一的容量 1 站唱槽。角色源码 `822c7d41` 加载了两份制服角色的签名记录和实际 VRM。两人在两间房请求 `standing-vocal` 均收到 `unsupported-facility-behavior`，把同一槽当座椅请求会收到 `invalid-seat-use-point`。两人均保持空闲。公司与角色的生产模块在 Node 中共用同一 Three 场景，采用生产动作和模拟时钟。CPU 路径仅读取贴图尺寸。[实测回执](report.json)

| 工况 | 实测结果 |
| --- | --- |
| 同一场景从唱播间切至出租间 | 保留两个角色，解析出租间的独立实例与取音节点，旧点消失，拒绝旧房快照。把出租间与唱播间 v1 来源配对也被发布阅读器拒绝。 |
| 出租间真实工作椅 | 一人预订后另一人收到 `seat-unavailable`。开始接近后取消、接触资源加载中销毁和坐稳后销毁都释放租约。正常坐稳会保留 `occupied`。 |
| 含剩余期限的冷恢复 | 0.5 秒任务在模拟了 0.1 秒后保存。以独立场景、两具新角色和全新租约表恢复出 0.4 秒；其后 23 帧（每帧 1/60 秒）仍在运行，再推进 0.02 秒后超时并释放。零余量快照被拒，保留空租约表。 |
| 同伴阻挡 | 超时者站在工作椅通道内，另一人的尝试以 `seat-body-space-blocked` 结束并释放。同伴移除后，另一人重新请求并坐稳。 |
| 既有独立游戏组包 | 对同一固定角色包传入 v1.1 公司包，原组包命令因已固定另一份公司清单而退出 1，未写组合包。 |

在角色工程根目录运行，默认向终端输出 JSON。指定 `--output` 可将重跑记录写到本目录内一个新文件。`--company` 和 `--reviewed` 可指向相同发布清单的其他只读副本。`--game` 可替换同一固定双人包的路径，脚本会核对清单 SHA。

```powershell
node scripts/qa-company-vocal-lineage.mjs
```

声房浏览器画面与角色站唱尚待接入。现有浏览器用例可独立复验旧双房的工位椅、保存和恢复，它按 `plant-home` 和 `plant-rental` 的真实座椅编写。以下命令供统一 GPU 窗口使用，本轮未执行。

```powershell
node scripts/run-fixed-check.cjs output/m2-company-seat-fixed/rooms scripts/qa-game-facility-room.cjs be0e52c243ec evidence/m2-uniform-lite-operator-v1/records.json evidence/m2-company-vocal-lineage-intake-v1/cpu/browser-seat-control
```
