# 原生参数身体眨眼兼容核查

首轮结构核查拒绝了旧适配器的固定形态。随后只对共享适配器做了数据驱动的最小扩展，并以实际 VRM 运行 CPU 回归验证。没有修改模型、动作或 4196。

两份候选 VRM 与 `native-female-843ac-v1` 的直接 GLTFLoader/VRM 结构相同。每份都观察到 8 个面部 primitive，目标键 `EYE_Joy`、`ALL_Joy`、`EYE_Close` 的索引分别为 17、3、13，且各 primitive 有 57 个 morph target。旧眨眼适配器要求 9 个面部 primitive、每 primitive 56 个 morph target，并包含 `EyeExtra_01_EYE` 保护部件。两份候选不能直接沿用旧 admission。新增 profile 数据声明 8/57 结构、4 个目标域和 4 个保护域，适配器保留旧 9/56 默认配置，并按 profile 匹配裸 `Fcl_` morph 名和材质 `Instance` 后缀。

`cpu.json` 保留了两份候选和参考体的 material role、目标索引、字典摘要、表情绑定及首轮拒绝理由。`adapter-regression.json` 记录旧 9/56 身体、两份新 8/57 身体、happy×blink 权重和两实例 owner 隔离的 CPU 通过结果。没有运行浏览器或 GPU 检查。
