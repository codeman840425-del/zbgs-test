# 真实手点候选独立只读审查

对象：`experiments/hand-contact-worktree-1`，非主运行时合入验收。精确文件 SHA 和实际源点统计保存在 `evidence/hand-contour-independent-review.json`。未打开浏览器，未修改候选实现；只运行既有 `qa-workspace.mjs`（3 个合成 Three 蒙皮姿态通过），不能代表角色实际接触或性能通过。

## 更新顺序与映射

`foundation-avatar.js:118` 的 `seatHandSurfaces(true)` 先执行 humanoid normalized→raw、更新 world matrix、准备同帧裙；`motion.js:948` 此后调用 workspace.refresh，故首次采到当前 raw 蒙皮，未重复推进动作或 humanoid。workspace 内 getVertexPosition 后乘 mesh.matrixWorld，结果与 normalized wrist 都在世界空间；root 参数未使用，不会额外重复 root 变换。

最终 solveChain 保持 normalized wrist 世界旋转，对手骨及全部指骨子树完全控制的点，静止指姿前提下可用 wrist delta 平移。**该推断不覆盖混合前臂权重的腕边点**。精确女性源每手选 769 点，其中 73 点具有非手/指权重，最大 94.1765%；涉及每侧 109 面。原 175 的 193 个失败皮肤面与这些混合面交集为 0，所以这是新预测误差边界，不是已知失败的根因。

`motion.js:1158` finalClearance 再查的是已采样轨的平移，并未在最终 solve 后重新同步 raw 并采皮肤。其 `finalPalmClearance/finalClearancePassed` 是代理预测，不能当最终 actualskin 测量。必须以 avatar 完整 update 后的独立原皮肤×实际裙三角检查为准，也需继续标出 live accessory 层在其后执行。现 README 已有混合边界限制；本项不要求先重写候选，但禁止据代理通过升级。

## 确认的计量与无效计算问题

1. `measureArm` 的 `narrowPhasePairs++` 只在前臂 rails 循环，新增每手 164–212 条手轨没有计入。不能用该字段比较新旧窄相成本。`timing.candidateTriangles` 会累计手轨查询，应分别标轨数与候选三角测试数。
2. `handSkinMs/handContourMs` 新项已经单记，但 finally 的 `otherMs=total-...` 未减这两项，导致 other 与新项重复归类。不会改变总耗时，影响解释和分项相加。
3. 明确的空碰撞面成本：女性裤/base 的 `seatHandSurfaces` 返回空数组，但 profile.seatHandRadii 仍来自预加载裙；sitProgress>0 时不能命中 idle 的无cacheKey早退，新增 refresh/project 仍采每手769点并排序12组。没有裙面可查询仍付新增成本。建议实际测该分支，或确认旧语义后对空surfaces跳过新增workspace；不要用裙专测代表裤成本。

轨数上限可推知但不是实测性能：每手最多5轮迭代+1最终复查，新增两手手轨最多约2544次 railClearance 调用；每次仍可能查询多个投影裙三角。工作区复用 shifted Vector3，避免每轮新向量，但 project 每组仍 sort/建数组、Set和字符串边key。先测总fit与真实帧耗时，不能仅凭预分配认定成本收敛。

## 缓存与有限覆盖

- workspace 的 meshes/groups/sides 均为实例闭包，未见跨角色缓存或骨骼引用共享。当前拓扑检查拒绝geometry/index对象或index.version变化；没有守护position/weights/skinIndex/skeleton后续替换。当前固定模型不进行这些变更，未来参数换体必须重建workspace，不能假定现guard覆盖所有源变化。
- 默认女性有 calibratedForearms，idleCache早退禁用，能重采手指。诊断组合 `?forearm=legacy` 同时保留 handSurfaceContact 时，旧idleCache只比较腕位置/旋转与上臂，不比较指姿；仅手指变化可能跳过新手采样。这不是默认配置失败，不应拿该组合证明完整手指支持。
- 6语义组的投影凸包边与最内点辐条使用真实3D端点，没有82mm平面铺深；但连接线未必是原网格边，可能跨越表面内部。凸包包含投影点不等于所有内部三角覆盖，也不保证没有保守误报。实际三角失败、腕抬升过量和正常速跳变必须分别观察。分组与拓扑选面包含历史失败部位已验证，不能替代这一运行验证。

结论：没有发现阻止独立固定候选短测的同步/跨实例错误。保留实际皮肤 gate 是准入必要条件；计量、空面计算和诊断缓存问题已直接通知实施代理及负责人。未建议扩大架构或启用已否决平面候选。
