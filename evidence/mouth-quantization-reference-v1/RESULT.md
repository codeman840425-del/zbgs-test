# 当前男嘴 ±12%：生产参考合同已实际核验

使用真实 `createFacialGeometry` 与**当前公开旧recipe**（id `male-mouth-visible-v2`，SHA `1b3e019f…`），将负端点的交付参考指定为新量化规范模型，正端点继续采用旧已过final。没有改产品配方/旧保存/运行数学，不声称新recipe已准入。

| 当前实际对照 | POSITION最大差m | NORMAL最大差 | 结论 |
|---|---:|---:|---|
| −12% 新canonical参考68a105… | 0 | 1.7763568394002505e−15 | 原门通过 |
| +12% 原final参考cb0a20… | 7.450580596923828e−9 | 8.463859558105469e−6 | 原门通过，未称canonical |
| −12% 旧final a33071… 历史回归 | 3.026798367500305e−9 | 1.1056661605834961e−5 | 继续按原门失败，原Sorrow/v314/Y重现 |

原3e−7m/1e−5门不变；每项全部54形态及Basis，活跃2 primitive全buffer、其余7 primitive实际引用点。每次set后明确核实际选中的operator id/SHA；所有模型/源/公开recipe/生产manifest哈希在运行前核对。三个预期结果均符合，脚本退出0表示“两当前参考通过＋历史失败重现”，不是三个NORMAL都通过。

验证合同：`assets-source/mouth-quantization-reference-v1/reference-manifest.json`，SHA `76cedf6a3113dfcd0b7236f4268ea6bfc0821fce92a72e8bf5b8eeafea3ff1dd`。生产包仍为已冻结 `assets-source/mouth-quantization-v1/manifest.json`，SHA `9d328ec2571cf4f67771773a08d1193dfc5e95cf3ac4cbb4544feac32da95456`，没有修改其文件或增加模型副本。

实际模块SHA `047e03373fb8792517fb92604232dc451748e89def701dd3bfbf6c978a903f73`；完整report、执行脚本和执行时reference-manifest在 `runtime/`。此项将源精度修复接入当前算子的**独立验证参考合同**，并不替换旧通用QA脚本硬编码历史端点；旧脚本仍会报它原来的负端点失败，应按其原范围保留。

源作者约束、55形态独立法线/保护区和原底重生成分别见 `evidence/mouth-quantization-v1`。本轮无浏览器/GPU、无新的视觉批准、首绘成本未改变。负新/正旧的流程分开，当前运行保存身份完全原样，因此没有用户文件迁移。
