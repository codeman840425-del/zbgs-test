# Mink 原作者样例执行与失败记录

固定源码 commit 为 `5f800f0a369d05bab88b5e5582cf95122d3b82a5`。资产包及原文件副本在 `assets-source/mink-author-study-v1`。

根目录 `execution.json`、`worker.log`、`initial-*.py/txt` 是初次误选 loop-rate-limiters 0.1.0 造成的 import 失败，保持原样。`dependency-plan.json`、`dependency-install.json` 同样保留原版本。`dependency-environment-fix.json` 为唯一更新至作者锁定1.2.0的安装记录。

`environment-fix-v2/execution.json` 和日志是唯一成功求解运行。原UR5e示例200步已完成，目标保持原home，实际碰撞约束未激活。原作者自包含球体测试4步已完成且原断言通过，每步均有活跃碰撞约束，50mm间距变为11.75mm，仍保211.75mm目标残差。

`readback-verification.json` 为只读解析回算，不新求解。`package-files.json` 绑定脚本、源许可/副本、源receipt、原失败、修正后实际报告和trace。工具venv及机器人mesh留在可重建的 `experiments/tools/mink-author-study`，67上游文件逐Git blob+SHA核同。

本轮没有GPU渲染、训练、VRM坐标转换或实际人物/衣物/动作试验。机器人和球体结果仅证明原作者CPU入口及约束可运行，尚未证明VRM人体适配。
