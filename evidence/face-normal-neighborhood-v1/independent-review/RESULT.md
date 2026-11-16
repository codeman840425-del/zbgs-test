# 法线邻域筛选独立审查

结论：当前限定 diff 未发现正确性或生命周期阻断。审查产品 SHA `047e03373fb8792517fb92604232dc451748e89def701dd3bfbf6c978a903f73`，精确旧/新源码及执行脚本、基线 commit 均保存在本目录。未改产品、未构建、未运行浏览器。

## 代码依据

- `normalNeighborhood` 遍历原 fullIndices，保留所有与 affected 输出点相接的三角，包含边界输出点连接到**未移动**点的邻面；不是只选含直接位移点的面。三角顺序、绕序和重复面均保留。
- 对每个 affected 点，旧/新累加项及累加顺序完全相同；Float32 与 Float64 accumulator 类型、叉积及 Math.hypot 公式不变。归一化一个点不读取其他点结果，因此省略外围点归一化不影响目标点。
- `apply` 仍先取嘴 affected，再并入鼻/眼 affected；嘴鼻重叠由 Set 去重。实际 position/morph 合成后才调用法线函数。眉的刚性平移保持原处理顺序，本次未改变眉算法。
- 两个 normals 调用均明确传 affected；中间数组外围值虽然不再等于旧完整结果，但唯一实际读取处仅遍历 affected。最终 normal 从原 authored 数据复制，morph NORMAL 从原数据或零数组开始，只写 affected，因此未读外围不传播到最终属性。零面积原回退逻辑保持。
- 新 filtered indices 和中间法线均为 apply 局部变量，无跨实例或请求缓存。await/prepareRender、generation、失败释放、恢复、owned maps 和 bounds 均未修改；没有新增生命周期状态。

## 小型独立 CPU 检查

`node evidence/face-normal-neighborhood-v1/independent-review/check.mjs`

直接提取 Git 基线与当前产品的真实函数，960 组 Float32/Float64 计算、30120 个 affected 分量严格 Object.is 相同；写回后的完整 Float32 NORMAL 与 morph NORMAL delta 字节相同。覆盖空/全邻域、多域重叠并集、边界未移动邻面、重复三角/反向绕序、退化面和小尺度。未放宽阈值。

这是函数级独立反例检查，不冒充真实男女所有源表达回归；root 正执行的真实源旧新全buffer对照是补充必要证据。无实际耗时/GPU收益结论。男性 mouth−12% 对 Blender final 的既有 NORMAL 1e-5 门失败不属于本补丁修复，仍保留。
