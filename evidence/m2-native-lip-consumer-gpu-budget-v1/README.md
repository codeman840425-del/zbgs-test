# 双角色唇妆包的 WebGL2 资源基准

固定构建 `637b3f8bb4a3`，主机 RTX 4090，Chrome 157。输入为同一独立包交付的两份 v11 记录，逐份核对了包内 JSON 和记录 SHA。每组使用新的浏览器上下文，在相同分辨率、无录屏、禁用 HTTP 缓存的情况下，从空场景加载实际共用消费者，持续讲话 12 秒后卸载。

| 人物 | 稳态纹理计数 | 空场景增量 | 稳态几何 | 帧间隔 p95 | 加载时间 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Roundness A | 50 | 49 | 31 | 6.1 ms | 1.32 s |
| Cheek B | 51 | 50 | 31 | 6.2 ms | 0.77 s |
| 双人同场景 | 100 | 99 | 61 | 6.2 ms | 1.43 s |

三组均回到空场景的 1 个纹理、1 个几何和 1 个程序。整组加载时间包含网络读取、解码、准备及渲染到第二帧，手头每个条件只有一次测量。

双人同一 WebGL2 上下文中，两份 BodySkin.normalMap 的嵌入 PNG 均为 2,958,851 字节，SHA-256 为 a58f6d153c38bae549e815a2cd6e771b2e5adb6d6982df0cb79c63f938cc882d。两人的 2048×2048 法线图分别有独立 ImageBitmap 6 和 12，以及已上传的活 WebGLTexture 8 和 17；每位的身体表面与描边共用自己的纹理对象和句柄。每位的唇妆 Face 基础图与 shade 图则共用一个 ImageBitmap，并使用两个独立 Source、两个活句柄。销毁后，逐一调用 gl.isTexture 验证的 17 个已旁路读取的脸、眼线和身体句柄全部失效。

报告中的帧间隔来自 requestAnimationFrame，渲染调度和资源计数来自实际渲染器；实际驱动显存字节、普通机性能和长时间泄漏均未测。readback.json 记录每处对象身份和复算结果；report.json 保留全部间隔、请求与原始句柄数据。执行方式见下。

```powershell
node scripts/run-fixed-check.cjs experiments/m2-native-lip-game-handoff-v1 scripts/qa-record-budget-runtime.cjs evidence/m2-native-lip-game-handoff-v1/records.json evidence/m2-native-lip-consumer-gpu-budget-replay 637b3f8bb4a3
python -B evidence/m2-native-lip-consumer-gpu-budget-v1/verify.py
```
