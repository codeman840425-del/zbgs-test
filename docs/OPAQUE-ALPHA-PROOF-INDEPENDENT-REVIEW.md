# 不透明 alpha 快路独立只读审查

冻结对象：`assets-source/hand-contact-v1/source/opaque-alpha-proof.mjs`，SHA256 `72d555591dda2c27930b3845c70cf15cc0281ad590e78538bd7f3950209f168c`。仅阅读该模块、现有 `forearm-contact-workspace.js` 原式、motion.visible和待运行测试；没有执行像素扫描、构建或浏览器。

**结论：未发现阻止进入等价试验的数学错误；不是优化通过。** 下列结论只对当前不可变 alpha 快照及每子步重新prepare的集成前提成立。

- 区间从实际world AABB出发，按原dot左结合、原u/v运算、`[1-u-v,v,u]`及`0+a*x+b*y+c*z`顺序计算。乘法端点取四角，允许负UV/倒向轴；固定几何系数使用与旧查询相同的已舍入数。每步向外加减 `max(MIN_VALUE,abs(endpoint)*EPSILON)` 对有限binary64端点至少扩一个相邻间距，零/次正规有MIN_VALUE兜底。溢出或NaN传播后finite检查拒绝证明，不进入快路。
- world box覆盖的是查询hit实际坐标，不假设浮点hit一定在数学三角内部；opaque检查任意一轴越界即回旧。这也避免直接根据理想bary范围[0,1]漏算误差。
- SAT计数原谓词 `alphaByte/255 >= cutoff` 的补集，不是抽样不透明判断。最多16,777,216像素，计数小于Uint32上限，JS加减也处于精确整数范围。零拒绝矩形即所有覆盖像素都被原谓词接受。
- UV floor/clamp与原式一致；flip时先对V做`1-V`区间再乘height，包含域外UV钳制。零denom、病态比例或非有限系数回旧，门槛只缩小优化适用范围，不改变原alpha接受标准。

必须在集成中确认：每次实际蒙皮/UV刷新后调用prepare（它先清旧bounds）；从prepare到opaque查询时points/edges/uv/alpha不能改变。helper不会在每次opaque再次验证这些字段。texture缓存检查像素数组引用/尺寸/cutoff/flip变化，但不能检测**同一个pixels数组原地改值**。现fitSeatHands.alphaCache提供只读Canvas快照，符合前提；未来换纹理/染色alpha必须明确刷新快照及证明，不能套用本结论。

需要保留的成本：每controller首次全图SAT扫描和额外Uint32存储；每子步每实际三角的区间计算、数组构造和矩形检查。即使queries变快，预处理可能抵消收益。首次扫描和持续成本都应记录，不能把它们藏进原skin计时，也不由最大16M保护推出实际内存已合格。

待运行的合成测试主要为轴平行三角，已向QA建议有限补充：非轴平行3D三角、127/128字节阈值、整数UV像素边界±ulp、正负clamp、cutoff/flip/pixels引用变化使SAT重建。随后仍需同版270姿态完整旧/新字段等价、最终实际raw皮肤×显示裙检查和无录制成本；不能以随机查询没发现反例替代这些准入门槛。
