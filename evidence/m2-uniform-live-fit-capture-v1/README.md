# 两具 1K 制服身体的原始眼镜采样

固定游戏源码 `1239c0e2a7c2ecaa226fdb8a40bd4e12f710b068`，完整构建 `73d6f64eeebc`。工作台分别载入两具目标身体的原发、原脸和 1K 制服。每例均由主角色实际加载的 VRM 字节验证资产 ID 和 SHA-256；眼镜采用原始 `legacy-glasses-fit-v1`，供后续制作镜腿。此前供体的静态对照指出了试制起点，两个目标签名在同版、站姿及坐姿下均需重新采集。[目标身份](cases.json) · [供体对照](../m2-uniform-live-fit-intake-v1/glasses.md)

| 场景 | 造型序号 | 坐姿进度 | 皮肤三角 | 原发三角 | 耳区正 X／负 X | 两根镜腿 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 女性站立 | 5 | 0 | 2,917 | 394 | 45／45 | 48／48 |
| 女性坐稳 | 5 | 1 | 3,679 | 394 | 45／45 | 48／48 |
| 男性站立 | 1 | 0 | 2,717 | 408 | 49／49 | 48／48 |
| 男性坐稳 | 1 | 1 | 3,209 | 408 | 49／49 | 48／48 |

皮肤计数沿用头部世界高度以下 0.22 米的下界；坐姿下该界线随头部下降。耳区按既有四环制作工具的坐标筛选，将当前脸面变换到眼镜局部空间，保留三个角均满足对应侧 `±x > 0.072` 且 `z < -0.065` 的三角。这些计数表示具体面片样本；耳部解剖分区、镜腿接触质量、动态佩戴与正式适配仍须单独验证。[制作工具](../../scripts/build-native-glasses-fit.py) · [逐网格和运行时身份](capture/report.json)

四份 gzip 均含姿态、世界坐标顶点、索引三角、原始眼镜和头骨矩阵、耳区三角索引。四个视角的 16 张原始 PNG 与归档文件一并保留。拼图从上到下是女性坐、女性站、男性坐、男性站；从左到右是正面、左侧、右侧、斜侧。[图像总览](views.jpg) · [原图与归档](capture/) · [独立复算及各文件 SHA-256](verified.json)

在工程根运行 `python -B evidence/m2-uniform-live-fit-capture-v1/check-captures.py` 可从 gzip 独立复算坐姿状态、部件三角和双侧耳区索引，并校验 PNG。重新采集可用本机静态服务提供该固定检出的 `prototype/dist`，将 `QA_M1_BUILD` 设为 `73d6f64eeebc`，`QA_M1_RUN_ROOT` 指向尚未创建的工程内目录，执行下列命令。

```powershell
node scripts/qa-native-glasses-fit-input.cjs "$origin/" evidence/m2-uniform-live-fit-capture-v1/outfit-role-cases.json
node --test scripts/project-output.test.cjs
```

复采输入的可选第四项 `{"role":"pants-top-far"}` 在每个身体实际加载的套装清单中解析，女性为 5 号，男性为 1 号。每个姿态都复核已穿套装的实际角色字段、身体资源、姿态与三角数。省略第四项的历史输入继续使用原三元约定。原采集与复采分别保存。[复采输入](outfit-role-cases.json) · [逐例复采回执](role-replay.json)

实际采集的页面错误和控制台错误均为零。三项路径回归通过，覆盖盘根、目录回退、目录联接、现有目录、非法请求，以及模拟启动失败和启动后失败的清理。实际浏览器退出后，本轮 Chrome 进程与浏览器暂存目录均为零。
