# 原签名角色使用随包唇部定位

[打开两房原速录像](index.html)。游戏源码为 `545dc941498673f008f85748134778fe831f3d35`，构建为 `ddcf40a56d0e`，组合门与正式审核登记在 `f75e681afb23e4a147e8d46181035f23b9d0dddb`。该候选供游戏集成方独立复验。

生产入口按真实身体重新计算 32 个唇边顶点、VRM 原始口型绑定与参考姿势，并将结果登记在身体 SHA 下。四具已登记身体中，本次双人游戏包仅带两份文件，共 3,854 字节。两次独立构建的 538 个文件一致，原男女签名不变。双人游戏包有 37 个文件，两间房合包有 658 个文件。两次合包 SHA-256 均为 `422bebec08693526157fcfcc59aef9add05d5ae6c18f0370be67996967917664`。[原始输入、摘要和重建命令](rebuild/package-comparison.json)

| 真实操作 | 所见结果 |
| --- | --- |
| 打开工作室、出租屋，轮流点击站唱 | 两人初始加载均未取唇缝文件。首次使用只取当事人的一份。女体距网头分别为 31.84、32.26 cm，退出后男体接手。 |
| 男体站稳、讲话、保存、关闭重开、离开 | 四段每段五次的持有采样落在 23.15–24.71 cm。重开只取男体定位，保存的角色、房间、设施 ID 和最终状态恢复。 |
| 男体定位首次返回 404，再次点击 | 两房均明确报告原因并释放未用的预约。同页重试后命中已核文件并正常就位。另一人未发出定位请求。[逐步回执](retry-01/report.json) |
| 下载中取消或销毁 | 旧请求结束后未取得设施。未销毁的角色及签名保留。 |
| 旧座椅角色包进入声房 | 旧产物能进两间房并点“站唱”，两次均返回 `unsupported-facility-behavior`。修正后普通合包命令在创建目标目录前拒绝这对版本。原座椅房与已核声房组合仍可生成。[旧包浏览器回执](legacy-before-01/report.json) |

运行环境为开发机 RTX 4090，Chrome 157.0.8103.79，1440 × 900。两间房首次接替的帧间隔 P95 约 6.20 ms。冷开、截图和离场在同一采样窗，两房各有 3 帧超过 50 ms，最大 254.8、260.8 ms。当前采样未把这几帧归因到某一项活动。融合方独立运行组合门 15 次，4 次通过、11 次拒绝，已核对原误放行输入、修正后的拒绝及新组合摘要。四组浏览器分项由融合方报通过，综合报告待归档。普通电脑帧耗时及真实音频驱动待测。[独立复核的文件摘要](independent-gate.json)另两具登记身体已在游戏加载器核对绑定与变形，尚无这两具在双房使用固定麦架的实录。

角色、组合门、房间及摄像机的 18 项源代码回归已在本地两个实际公司包上全部通过。首次 Node 验证缺少纹理解码器搜索路径；给该命令指定公司锁定依赖所在的 `NODE_PATH` 后重试通过。Chrome 实跑直接读取游戏包。融合方旧基线的男性离场鞋底曾测得短时离地约 22 mm，本次未重做离场鞋底逐帧测量。

重新录制时，从工程目录运行以下命令，为输出选择未使用的工程内子目录。临时 HTTP 服务随检查退出。

```powershell
python -B scripts/production/register_performer_lip_anchors.py --check
node scripts/run-fixed-check.cjs output/m2-performer-anchor-game-v1/rooms scripts/qa-game-standing-vocal.cjs ddcf40a56d0e evidence/m2-uniform-lite-operator-v1/records.json output/performer-anchor-replay room require-anchors
node scripts/run-fixed-check.cjs output/m2-performer-anchor-game-v1/rooms scripts/qa-room-lip-anchor-retry.cjs ddcf40a56d0e evidence/m2-uniform-lite-operator-v1/records.json output/performer-anchor-retry 422bebec08693526157fcfcc59aef9add05d5ae6c18f0370be67996967917664
```
