# 完整身体与头部相加组合读回

本次独立读回没有发现新增数值阻断。结论仅为原男源 identity 和原 male-long-lean-v2 完整 13 参数组合的数值候选。没有运行生产器、55 strict、混合表情 contacts、装备适配、导出或游戏。

输入 spec SHA 为 `c42ec8f7a7a8d5b5bba4dd8a4760eb3350ec79c422753f4cf8da37a96ca36fa9`。identity raw SHA 为 `349f68232d754da063ece69797f6079aa87d42748e548f4dc939fc138f0040a9`。lean raw SHA 为 `dc58cdea7da867841563bb788958a2bf4c853634af14b2d9e94c068ae76e9b9a`。`result.json` 的 `pins` 使用仓库相对路径到 SHA256 的映射，记录源、方法、旧 G、回执和本审查脚本。root 可据这些身份接续，不需重新生产。

从原 VRM 实际 primitives/indices 重新构造 source records，完整匹配 2 个 POSITION accessor、9911 base ID、15 consumers、56 records 和 120935 实际端点。Body accessor 7 为 7855 base、6 consumers、无 morph。Face accessor 21 为 2056 base、9 consumers、54 morph。每个共享 POSITION 的 targets 签名、实际引用并集、target accessor、offset 和原端点都核对一致，没有虚构 Body targets。两次保存的 initial/completed raw 中 source、F、JF 也逐项一致。

原 8 个请求元数据和 lean 的原 13 参数逐值一致，identity 全参数为 0。独立从原 v2 `Mapper.field` 截取脸分支前的 B，完整源复算所得 `F-G` 与该原 B 最大逐分量差为 0。使用同一原 10 µm central-difference 约定独立计算 body-only J，`JF-(JG+JB-I)` 最大逐项差为 6.5512040237e-12。该舍入差来自从原 `P+B` 求差与生产器先对 B 求差的算术路径，不是新改变的准入容差。JB 仍是原数值差分约定，不是连续域解析导数证明。

lean 实际全部端点的最小 det JF 为 0.4863374765295819。101 个真实源三角水平截面逐项独立重算与报告一致，无缺段，最大半宽误差为 0.8250000316 mm。Float32 base 和全部原 morph delta 回读与保存数组逐项一致，最大位置误差为 0.1182631847 µm。使用独立 cofactor 公式核作者法线的 J 逆转置传输，最大向量分量差为 3.331e-16，Float32 base/morph NORMAL 回读误差为 7.542e-8。identity 的原作者 N 和全部 morph NORMAL 零增量保持一致。

原 68 个 neck ID、原 source P 和 endpoint 没有删改。新合同相对请求身体 `P+B` 的 head contribution 为 0，最终相对原源的最大变化为 173.985907654 µm，完全来自原 B。8 个原 frame 点完整保留，本次实际参数的 B/head/final 均为 0。上一份合同审查指出其 Y 落入可能作用高度，完整实际读回现已排除它们在本次参数下发生位移，不能据此泛化任意身体参数。17490 个固定眼表达端点相对原源完全固定，B 也为 0。

两例各 501 个 consumer/state 的原与输出三角退化索引、非正参考法向点积索引及面积比重新读回一致。源零面积出现次数、新零面积和非正点积出现次数均为 0。lean 最小 Float32 面积比为 0.5049037775。上述是离散三角退化/方向诊断，不是 self-intersection 检查。

完整 Face accessor 的 base 和全部 54 表达 mapped 位置与旧已封 head-only G 数组逐项一致。已知 happy .65 + blink 1 + oh .66 新增 mouth128–skin1020 接触仍然继承，不能称混合表达全通过。后续若复用旧 strict 或组合证据，应继续核实际 Float32 base/delta、混合坐标和资源身份。身体、源衣物、衣物 donor 适配及运行接触没有从该面部等价关系获得通过。

当前 raw 也对原嵌入 Tops/Bottoms/Shoes 等共享 accessor 直接求值了 G+B。本次核的是该明确源运算是否实现原 13 请求，不能把它写成独立装备的 body-donor 适配已过。新装备/forearm/覆盖/坐姿/动作、实际导出属性与渲染仍需后续对应证据。

实际独立 CPU 读回约 1.52 秒，未采完整峰值内存，也不作为目标普通机性能。`result-first.json` 保留初轮审查结果，最终 `result.json` 另增加了 initial/completed 保存一致性和审查自身脚本 pin。两轮都读取同一固定 raw，没有重跑 producer。
