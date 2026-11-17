# Mink 原作者 CPU 求解学习样例

本包固定 `kevinzakka/mink@5f800f0a369d05bab88b5e5582cf95122d3b82a5`，源码项目版本 `1.4.0`。实际完成原 `examples/arm_ur5e.py` 的有限 headless 执行，以及原作者自包含碰撞测试的四个时间步。输出为 `original-author-headless-samples-passed`，属于原作者接口学习，不是 VRM 人体适配通过。

## 输入、许可和独立环境

- `experiments/tools/mink-author-study/source` 保存固定上游 67 文件，含完整 `src/mink`、原 UR5e example、所用 XML/mesh、原 collision test 和许可，下载含 tree 合计 31,515,308 字节。每份 Git blob、SHA256 与字节见 `prepared/source-receipt.json`。
- Mink 源码 Apache-2.0，原机器人模型 BSD-3-Clause，原许可在 `original/LICENSE-mink`、`LICENSE-ur5e`。UR5e 来源说明保留在工具源的 `examples/universal_robots_ur5e/README.md`。
- 使用独立 `.venv` 的 Python 3.13.11，MuJoCo 3.10.0、qpsolvers 4.12.0、DAQP 0.11.2、NumPy 2.5.5、SciPy 1.18.1、loop-rate-limiters 1.2.0。完整依赖与 wheel hashes 在 `requirements-lock.txt` 和 evidence 中的安装 report。
- Mink 通过 `PYTHONPATH` 导入固定源 `src`，未把 PyPI 的其他 Mink 替代为此 commit。使用作者原有 `MINK_DISABLE_NATIVE=1` 选项走 Python Lie 实现，未自行构建 native 加速。
- MuJoCo wheel 同时携带 viewer 依赖，实际未创建 viewer/OpenGL context，未渲染或训练。运行环境给 OMP/OpenBLAS/MKL 设置 2 线程，未改系统/共享 Python 环境。
- 安装依赖各有许可。MuJoCo 为 Apache-2.0，qpsolvers 元数据为 LGPLv3，DAQP 为 MIT。`dependency-licenses.json` 保留实际安装 metadata 与相应 dist-info 许可位置。本轮只在离线工具环境使用，未随游戏分发这些库。

## 预算内失败与唯一环境修正

第一次由本包选择 `loop-rate-limiters==0.1.0`，虽符合作者 pyproject 的宽泛最低依赖，但该旧版本没有样例使用的 `RateLimiter` 导出，原入口在 import 处失败，尚未求解。原日志、执行回执、worker/runner 和依赖锁快照保留在 `evidence/mink-author-study-v1` 根目录。

唯一环境修正核到作者同 commit 的 `uv.lock` 使用 `loop-rate-limiters==1.2.0`，按其原 wheel SHA256 `482f720f409e05dfca8b7b63df180217afa9a51564def681853cb7370a020b74` 更新独立环境。锁片段保存为 `prepared/author-loop-rate-lock.toml`，上游 uv.lock Git blob 为 `3e5b2f9462ed54eebd04a20f55c01d2c411d69a5`。初次失败没有覆盖。修正后唯一完整执行位于 `evidence/mink-author-study-v1/environment-fix-v2`，无后续求解或参数搜索。

## 与原作者执行的差异

原 `arm_ur5e.py` 文件和场景字节完全保留。`worker.py` 仅将 `mujoco.viewer.launch_passive` 替换为无窗口的生命周期对象，`is_running()` 限定 200 次，`sync()` 无操作。`RateLimiter.sleep()` 去掉实际休眠，但原 `rate.dt=0.005`、目标、任务、权重、limits、原 `solve_ik` 和积分调用均保持。相机/传感器的 CPU 更新仍按原代码执行。原示例需要用户拖动 mocap 目标，本次没有模拟用户拖动，保其初始化目标。

另从原 `tests/test_collision_avoidance_limit.py` 提取 `TestCollisionAvoidanceLimit.test_step_closes_gain_fraction_of_gap_independent_of_dt` 的原 AST 函数，数学和断言未改。它的 XML 与目标完全自包含，故仅跳过不被此函数使用的 class-level UR5e/robot_descriptions 下载和其他测试方法。保原四个 dt，没有新增扫描。

观测 wrapper 记录原 `solve_ik` 输入、实际返回速度、积分后的 q、geom signed distance、启用 pair、活跃约束行和 `G·(v·dt)−h`。实际返回值原样交回原积分，没有额外修正循环。

## 实际求解结果

| 项目 | 原 UR5e 示例 | 原作者 active-contact 测试 |
| --- | --- | --- |
| 模型 | 原 UR5e 6 个 hinge DOF | 原两 sphere、两个 slide DOF |
| 输入目标 | 原 home frame 匹配的 mocap | 原 `SE3.identity()` |
| 求解 | 200 步，dt=0.005，DAQP | 每个 dt 一独立步，共 4 步，DAQP |
| 限制 | ConfigurationLimit、CollisionAvoidanceLimit、VelocityLimit，六关节各 π rad/s | 原 CollisionAvoidanceLimit，gain=0.85、最小5mm、检测100mm |
| 实际 pair | wrist_3_link 对 floor、wall，共2对 | wall、ball，共1对 |
| 活跃碰撞行 | 0，最近实际间距274.84137mm | 每步1行，4/4活跃 |
| 输入→输出间距 | 保原 home 安全间距 | 50mm→11.75mm，符合原作者解析预期 |
| 目标残差 | 原 task 已在目标，未人为移动 | 球中心距 identity 目标仍211.75mm，未称任务可达 |
| 约束残差 | 无活跃行 | `GΔq−h≈−1.38778e−17m` |

作者四个 dt 是 1、0.1、0.01、0.001 秒，每次从同一原始状态开始，均只积分一个步长。这不是四段连续轨迹。末项速度随 dt 缩放，该最小测试没有速度限制，不能把该速度直接用于人体。

本次唯一成功 worker wall 为1.276秒，CPU solver 为DAQP。外部进程 RSS 采样仅记录到4,255,744字节的低值，不能用于推断实际峰值内存或普通机性能。完整 q/速度/距离、200+4次求解 trace 和任务残差在 `generated/trace.json`，状态与版本在 `generated/report.json`。

## 重建与只读回读

在新同构检出和新独立工具目录中，可按以下固定输入恢复。

```powershell
python -m venv experiments/tools/mink-author-study/.venv
python assets-source/mink-author-study-v1/prepare.py
experiments/tools/mink-author-study/.venv/Scripts/python.exe -m pip install --only-binary=:all: --require-hashes -r assets-source/mink-author-study-v1/requirements-lock.txt
python assets-source/mink-author-study-v1/run.py --environment-fix
python assets-source/mink-author-study-v1/verify_readback.py
```

原 `run.py` 使用现有 host psutil 监视子进程，限120秒/2GiB观测RSS。运行和回读均拒绝覆盖已存在的执行记录。本包当前已经有完成输出，应读取而不重复执行。`verify_readback.py` 仅核固定源 hashes、记录数量、两个球体的解析距离与积分算术，没有新的求解调用。

VRM 所需最小数据在 `VRM-ROUNDTRIP-INPUTS.md`。当前没有 VRM/MJCF 转换、动作烘焙、真实 LBS/衣物碰撞、脚接触或游戏通过结论，未改变现有控制器、工作台或封存30秒舞。
