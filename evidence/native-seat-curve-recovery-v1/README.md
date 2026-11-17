# 椅角曲线移动吞入座：复现与有界恢复

已确认失败在移动状态，不是原生人物几何。固定 a462e8ff / build58f074bf7cae 的报告给出 idle 后位置 `[0.6527784619,0,1.7999856548]`、facing `-1.5707913849`，idle 只经过 `.006s`。snapshot.speed 是 `actualSpeed`，此时没有平移所以为 0；内部 `this.speed` 仍是 `.85 - 2.5*.006 = .835m/s`。因此接收 sit 后继续既有移动曲线，而非静止原地转向。

复用真实 CharacterScene、导航、turn-policy、task/lease，以120Hz重放：最初直达 approach 的线段合法，但实际 pursuit 曲线走到椅角；3.467s 时在 `[2.2745825287,0,1.1655870736]` 碰撞 veto，旧 clearPath 同时删除 target/afterWalk。25s 后仍 idle，座位 reserved。GPU 失败点 `[2.2719744395,0,1.1643434553]` 相差约2.9mm；GPU可变子步未记录，故不称逐帧精确回放。完全静止的 speed0 对照正常入座，保存在 stationary-control.json。

候选只改 main.js：

- 碰撞 veto 时从当前未碰撞位置重新规划到**原最终目的地**，保留 afterWalk=sit；不改变椅子、人物或目标，不瞬移。
- 仅这个障碍恢复分支停步，等 rig 不再 moving 后复用已有 planted turn；开放空间 steering/速度公式完全不变。
- 每个实际移动子步补完整 lineClear，与既有 blocked 一起阻止跨越障碍内部。
- 重新规划确实不可达时，sit沿已有逻辑失败并释放座位；walk明确 path-blocked。用户取消保留取消语义。
- snapshot 新增 navigationSpeed 和 afterWalk，避免以后把零实际位移误当内部速度归零。

最终 result.json 五组通过：原输入一次恢复后8.467s入座；task在120Hz/.006s/60Hz均completed、座位occupied；不可达failed/release；取消cancelled/release；开放空间960子步位置/yaw/speed逐值与旧版相同，恢复次数0。三种时钟所有实际移动段均通过 blocked/lineClear。endpoint-regression.json复跑既有10项端点、旋转椅、薄墙、占用/失败释放用例通过，不改旧证据。

限制：CPU motion.update仅提供姿态状态夹具，未重跑真实VRM蒙皮/脚步；不能据此称安全停步、足滑、入座接触或服装观感通过。碰撞点即时停止是安全恢复，仍需root固定构建检查其自然性。此修复不承诺任意动态家具导航，也不提前对所有路径提供曲率可行性规划。

复现：`node scripts/qa-native-seat-curve-recovery.mjs`；`node evidence/native-seat-curve-recovery-v1/endpoint-regression.mjs`。结果写本目录；重跑前保原结果。baseline-reproduction.json保旧版实际失败；initial-reproduction.json保首次候选读回，不冒充最终源码SHA。最终源、输入报告与运行脚本均由 package-files.json 固定。
