# 原生参数身体眨眼兼容核查

本次只做 CPU 结构核查，没有修改眨眼 runtime，也没有加入两个新 SHA 的 admission。

两份候选 VRM 与 `native-female-843ac-v1` 的直接 GLTFLoader/VRM 结构相同。每份都观察到 8 个面部 primitive，目标键 `EYE_Joy`、`ALL_Joy`、`EYE_Close` 的索引分别为 17、3、13，且各 primitive 有 57 个 morph target。现有眨眼运行适配器的实际入口要求 9 个面部 primitive、每 primitive 56 个 morph target，并包含 `EyeExtra_01_EYE` 保护部件。两份候选均缺少该运行时形态，因此 admission 被拒绝。

`cpu.json` 保留了两份候选和参考体的 material role、目标索引、字典摘要、表情绑定及拒绝理由。没有生成数据驱动 admission JSON，没有改 `eye-blink-compatibility.js`，也没有运行浏览器或 GPU 检查。
