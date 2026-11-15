# 当前固定候选的启动与恢复

当前候选 **152b17a0c6e9**，源码提交 `4958e6b60d8d97545b9332311958431aae0b20e2`。能力只以[CAPABILITIES](CAPABILITIES.md)为准。`delivery/candidate.json`保存精确目录、摘要、端口和回滚版本。

- 当前女性：http://127.0.0.1:4194/ ，男性加`?body=male`；男性可选独立露膝短裤。
- 本版正常1倍速持麦→讲话→直接跑→移动180°重选→停止→讲话→卸下：http://127.0.0.1:4174/evidence/mic-movement-152b17a0c6e9/ 。
- 总观看索引：http://127.0.0.1:4174/evidence/m1-current-review/ 。
- 保留对照：f7/4193（持麦已接受、旧移动转向）；1a/4191；269/4192；证据4174。共5个项目端口，均为本机服务，不是多人后端。

152整合用户已分别接受的f7持麦和ece移动转向代码；14项转向/鞋底/终点回归与男女持麦跑动链已实际检查。原影片的接受范围保持其原版本，不能据此宣布整M1或未录场景视觉通过。裙装高速前边跳动、坐姿形状与成本仍未通过；普通电脑未实测。原f7/4193保持不变，用于当前裙边复现。

根目录运行`python scripts/serve-candidate.py`启动当前4194。已有服务时勿重复启动；服务核完整构建身份，不使用热更新。证据服务：`python scripts/serve-review.py --port 4174`。

新检出恢复固定产物：检出源码提交4958e6b，在`prototype`执行`npm ci`，再执行`npm run build -- --outDir ../experiments/m1-mic-curvature-integrated-1/dist`。回到保存当前指针的检出后运行服务。`evidence/rebuild-152-4958e6b/report.json`记录全新独立检出63个产物逐字节一致；锁文件/已提交资源为输入，不等于重新执行全部Blender制作。

旧f7指针保存于`delivery/candidates/f7bdc3be3de4.json`，固定目录`experiments/m1-microphone-use-v4/dist`，源码16bada2。回滚恢复相应指针和产物，不覆盖旧dist。最新已核远端恢复点见CURRENT-FOUNDATION；新生成的实验素材不自动发布到当前固定版。
