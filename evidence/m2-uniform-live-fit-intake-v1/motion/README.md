# 两具 1K 制服原发身体佩戴候选眼镜的常速记录

| 片源 | 原签身体 | 实际解码时长和帧数 |
| --- | --- | --- |
| [女性原始视频](source-female-uniform-texture-v1-1x.webm) | `1049f87a` | 14.60 秒，438 帧 |
| [男性原始视频](source-male-cc0-texture-release-v1-1x.webm) | `2e66ee6c` | 14.56 秒，437 帧 |

两段由 Chrome `157.0.8103.79` 从游戏画布直接录制为 1200 × 814 的 VP9 WebM，录制帧率请求为 30 fps。开头是佩戴后的正面与左侧近景。约 1.8 秒转全身跟拍，依次记录走路、走到椅前、坐稳和起身，最后回到正面。录制连续完成，没有重定时。两段采样墙钟均为 14.548 秒、游戏模拟均为 14.5479 秒，采样中播放倍率持续为 1×，没有暂停或后台挂起。三个动作任务均完成，镜框在正面与全身正向画面可辨，椅子及腿部动作在全身段可见。[运行采样及视频哈希](report.json) · [CPU 解码核对](decode.json)

固定游戏为 `925cc0823b5803e9adc2b9fdce91eb0f098d0ed6`，构建 `4540a27be60e`，完整源码摘要 `4540a27be60ecf5a74302b4610652c3ac1b9b03e1755ea31b478d24e05f1a003`。每段先恢复原签记录，再在 `glassesFit=candidate` 诊断模式显式佩戴。两人原签处于眼镜关闭状态，各自保留原发与制服。全段约 15 Hz 的运行采样均为同一角色、同一个眼镜实例及相同 fit SHA。录制前后七个镜架网格都与独立复算位置相符，包含两根镜腿四环。候选状态为 `fitted-candidate`，`verified=false`。[固定用例](../cases.json) · [原签记录](../../m2-uniform-lite-operator-v1/records.json) · [录制脚本](../record-motion.cjs)

侧面可看到镜腿从镜框延伸到耳前，原发遮住耳后的末端，画面无法确认镜腿在耳根的承托。已有接触复算覆盖站立和坐稳两帧，应用候选四环后，女性与男性的镜腿和皮肤相交对分别从 80 和 84 降至 0，透明发片交对分别由 22 增至 78、32 增至 80。录制观察覆盖动态摆位和可见性。全段皮肤、耳周、发片的接触没有做时序计算。[接触范围及原始数值](../posed-contact.md)

从工程根目录可使用同一固定分发树和显式用例重录。目标是工程内尚未创建的目录，使用受管 Chrome，完成后关闭浏览器和临时服务。

```powershell
node scripts/run-fixed-check.cjs experiments/worktrees/glasses-925cc082/prototype/dist evidence/m2-uniform-live-fit-intake-v1/record-motion.cjs evidence/m2-uniform-live-fit-intake-v1/motion-repeat evidence/m2-uniform-live-fit-intake-v1/cases.json
```
