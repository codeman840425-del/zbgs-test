# 鼻尖单端点接线准备（源候选未冻结）

2026-11-15。只读原源测量与当前嘴/眉实现，没有修改 src/public，没有执行源导出、GPU或新的参数试验。

只接受 `noseSample:'none'|'tip-forward05-v1'`，非连续鼻高/鼻宽接口。`expectedNoseRecipeSha256` 在提交前校验；`getState` 添加 noseSample/requestedNoseSample/noseAvailable/noseRecipeId/noseRecipeSha256。缺省保持最新请求的鼻值；单项 `none` 只复位鼻；`reset:true` 全部复位。原嘴宽和眉 API 保持。身份为原 baseSHA + 各已应用 recipeSHA/参数，不冒称原 VRM 文件被重新导出。

源依据：原 glTF -Z 向前，女9/男7个 Face_SKIN 顶点，原 Basis 固定 geodesic 权重，最大0.5mm。所有绝对表达加同一逐点向量，故相对 POSITION delta 不变，但各点向量不同，不能保留原表面法线。其余皮肤、眼骨与身体不动。当前仅方案，不继承未来端点的质量或外观通过。

统一求值顺序：原不可变 POSITION → 嘴宽仿射（以及原 morph 的 X 仿射）→ 鼻固定平移 → 计算需要更新的完整脸法线 → 眉每侧刚性平移（眉片自身法线不变）。完整脸 indices 按真实 primitive 去重，不能算入 outline 第二次。法线计算以实际组合 Basis 和每一绝对表达位置为准，写回相对 NORMAL delta；只更新激活参数涉及三角的所有顶点，不改保护区原法线。嘴/鼻归零后从原数组重新生成仍激活域，不能保留上一次已修改的法线。

`plan-check.json` 的实际源邻域计算：

| 原身体 | 鼻修改点 | 鼻normal邻域 | 嘴normal邻域 | 嘴鼻同时激活并集 |
|---|---:|---:|---:|---:|
| 女 | 9 | 17 | 499 | 516 |
| 男 | 7 | 15 | 496 | 511 |

鼻/嘴/眉修改点不相交，嘴/鼻 normal 邻域亦不相交；这是当前两源的事实，不把它写成通用人脸假设。原源三角数据通过完整真实VRM读取，非靠眉/鼻材质名字推断。

等 pose 最终 recipe 后需要核：base/position/index/UV/targetCount/primitiveIndex/materialName、每点固定向量或weights、所有表达名/绑定保留、实际导出端点与原源保护点、法线/翻面/边长数据。测量JSON不能直接作为准入清单。

拟 CPU 验证最小集：两体端点对独立导出所有绝对表达；三参数组合的原底数学和独立复位；正常有限与受影响邻域外严格不变；原 geometry/另一实例不改；错误source/hash/保存版本拒绝；加载或prepareRender期间新请求/reset/dispose优先；无累加与全零恢复原引用。不重复完整舞或身体矩阵。

之后实际有纹理正/侧/斜面与表情、眼镜接触由固定版 QA 检查。测量中该小域不进入当前眼镜定位带，不等于镜框接触已通过。源码模块仍采用现有共享克隆/prepareRender机制，本次不改 foundation 的预热或人物控制器。

复算只读邻域：`python evidence/facial-nose-runtime-plan-v1/check-plan.py`。当前只检查准备；最终 recipe/hash 未产生，尚不能称鼻参数已接入。
