# bcade 正常成功换人：三轮资源检查

固定 `bcade40d24f1`，实际临时fixed服务构建/资产身份已核。无录像、Profiler、GC、compile wrapper、故障注入或产品修改。原female暂停、裤装outfit0、原发与所有原配色，每次真实command成功settle后固定等待2rAF再采样。

| 时点 | geometry | texture | program | usedTimes合计 |
|---|---:|---:|---:|---:|
| 初始女载入 | 89 | 44 | 22 | 106 |
| 第1/2/3轮男 | 84 | 41 | 23 | 102 |
| 第1/2/3轮返回女 | 84 | 40 | 24 | 101 |

不仅总数相同：第2/3轮与上一轮同body的**每个cacheKey及对应usedTimes严格一致**，geometry/texture也严格一致。没有观察到本次三轮成功切换累计增长。初始女载入与返回新女实例的差异单列，未要求强行等于初始，也不将program多2直接当泄漏。

六次成功切换均同document、实际body正确、loading清理，暂停/位置/模拟时钟/outfit0保持；hairStyle/hairColor/skinTone/eyeColor/lipColor保持相同原选择。0 pageerror，未扩测表情/动作/服装。实际原始cacheKey/id/usedTimes保存在report；离线复核入口summarize.py，实际执行脚本快照executed-script.cjs。

这是本次三轮有界资源引用检查，不是实际VRAM、普通PC性能、长期无泄漏或完整视觉通过。浏览器及临时服务已关闭，本批结束不继续扩测。

```powershell
node scripts/run-fixed-check.cjs experiments/body-switch-compile-fixed-v1/prototype/dist scripts/qa-body-switch-success-lifetime.cjs --build=bcade40d24f1 --out=evidence/new-unique-success-lifetime
```
