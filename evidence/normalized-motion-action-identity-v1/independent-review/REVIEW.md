# Normalized action identity — bounded independent review

**可合入，无阻塞发现。** 当前修复只在每次 normalized clip 解析时生成本次运行 UUID。Three r187 `AnimationClip.parse` 会以 `json.uuid` 无条件覆盖构造 UUID；`AnimationMixer.clipAction` 在同一 root 下按 clip UUID 缓存 action，所以两个缺失或重复外部 UUID 的不同 clip 会错误共用 action。根已有 before/after 两轨证据与此源码一致。本审查没有修改任何源码、舞蹈资源、姿态/时间数学，也没有录屏、浏览器或 GPU 验证。

读取 `motion-source.js` 确认每 actor、每清单项独立解析，原 asset SHA/bytes/avatar 校验保留，使用 `dance:<entry.id>` 保存 clip。`motion.js` 为每 actor 创建自己的 Mixer，后续复用相同 clip 对象；dispose 执行 stopAllAction 与 uncacheRoot(vrm.scene)。没有发现依赖外部导出 UUID 作为稳定身份或跨 actor 共享动作的缓存；稳定资产身份仍是资源 SHA。`entry.id` 仍须唯一，重复清单 ID 的既有覆盖问题不在本修复范围内。

`check.stdin.mjs` 保存之前**实际执行**的独立 stdin 脚本原内容；`result.json` 保存那次退出码 0 的原 stdout JSON。归档时未重跑。检查使用真实 Three r187 Mixer 和最小 hips 骨节点，不是完整角色房间验收：同一 asset、相同骨名的两个 actor 分别到 .25/.75 秒互不影响；相同 clip 对象再次 clipAction 仍返回同一 action；卸载 A 后其 action/binding 数量归零，B 继续到 .875 秒；A 重新解析/加载后在 .5 秒得到正确轨值；原输入 JSON 不变。首次根提供的不同轨缺/重复 UUID before/after 证据只读查阅，没有冒称本次重跑。

本次实际执行后读取的 `prototype/src/normalized-motion.js` SHA256 为 `fd0c05c6542b5a177dbbad0bd4d8a1991e7663c3006a1565a21ed2476bdaa81e`，归档时再次核对相同。其余依赖/调用点 hash 在归档时记录于 manifest，区别于原 stdout 数据；没有生成另一轮测试结果。

需要日后复跑时，在仓库根目录按 stdin 执行（本次归档未执行此命令）：

```powershell
Get-Content -Raw evidence/normalized-motion-action-identity-v1/independent-review/check.stdin.mjs | node --input-type=module -
```

修复后多个动作会从错误共用旧轨恢复为各自轨道，这是加载身份错误的修复，不是舞蹈姿势二次优化；实际房间多动作回读由根另行完成。
