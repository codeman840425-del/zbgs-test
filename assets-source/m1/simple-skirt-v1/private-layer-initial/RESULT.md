# 58394 实际私有palette初值：身份已核，cloth尚未准入

固定 build `58394ce674e4`，query `skirtSample=layer1&handTarget=authored`；完整实际两primitive、body/open-top、椅、raw骨与私骨矩阵已保存。与旧269 source-raw gate独立，不改旧标签。

六私骨在四姿反算的创建local与源inverse父rest、原VRM节点local最大元素误差均4.44e−16；四姿常量变化≤8.88e−16。实际最终1392点与独立LBS最大误差0.3624µm。证明当前创建常量确实一致，不仅假设“创建时未播放动画”。

| 实际私有palette姿势 | body | opened-top | chair | self |
|---|---:|---:|---:|---:|
| 站 | 0 | 0 | 0 | 1 |
| 坐入 | 0 | 0 | 0 | 1 |
| 坐稳 | 194 | 0 | 98 | 95 |
| 起身 | 0 | 0 | 0 | 2 |

站姿精确近三角全局最近距：body0.338647mm（裙face255/body750，zipper），top0.095168mm（裙808/top1171，过渡row2）。两者都不满足旧2mm源储备；top甚至低于既有native配置换算后的cloth+collider总距0.3mm。source内折边自交仍存在。

不能用全局min否定每个下摆区域。`region-admission.json`分区：

- 保留120面：body1.658mm/top2.756mm，四姿无body/top交叉。
- zipper：body0.339mm；其top在3mm范围内无更近对，四姿无body/top交叉。
- 过渡row0/1：top1.143mm；row2：top0.095mm。
- row3与更低下摆：本次3mm近距搜索无任何小于3mm的body/top距离；搜索候选的较大距离不冒称全局最小值。

但不能将薄带全部pin后声称cloth准入：坐稳row1/2/3分别61/29/23个实际body pair。具体face658站姿top间距1.143mm，坐稳body2pair；最薄face808四姿本身body0，单个点的安全不能扩大成整个过渡带安全。全衣真实面门没有豁免。

旧8.5mm局部规格对应旧source面253/494，不能直接用相同整数索引新拓扑，也尚未做地理区域重映射；没有宣称这道门通过。当前没有native cloth运行、没有新的正常动作通过。所有浏览器、临时服务和Blender进程已退出。
