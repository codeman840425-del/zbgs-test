# 原源 Joy + blink 重复闭眼位移诊断

只读复算确认原男女存在同一叠加机制。女性实际问题由既有 `evidence/m2-eye-combined-844e273263a7` 原/眼宽端点同骨、同相机图支持；本轮未将其列为眼宽+1%新增失败。未改源、recipe、runtime，未开浏览器/GPU。男性只做原源机制复算，不声称男性实图已验。

## 当前映射和实际运行

原女性 VRM0 Joy/ Blink/ A 分别绑定Face index3 `ALL_Joy`、13 `EYE_Close`、37 `MTH_A`，权重100、非binary；男性对应4、11、28。没有material alpha动画。当前 three-vrm-core 的VRM0导入将joy映射happy、a映射aa（module.js:1026/1032），导入时未设置overrideBlink，保持构造默认none（:50、:922）。ExpressionManager先清零再应用各表达（:422），morph bind用 `+=bindWeight*expressionWeight`（:616），不是互斥选择或总和归一。

`prototype/src/live-presentation.js:136` 每帧独立设 happy=.65、口型正弦权重、周期blink。当前目标公式确为 `P=Basis+.65*ALL_Joy+.998971*EYE_Close+.511979*MTH_A`。从844报告读取的4组女性actual influences与这一公式精确一致，未以UI标签推测实际值。源码与输入哈希保存在report及manifest。

Joy不是只动嘴角：女FaceEyeline的254点同时受Joy/Close影响，其中226点同向，向量cos中位.984；女FaceEyelash150点全部双重影响，136点同向，cos中位.979。男分别222点/182同向/.990与150点/140同向/.996。White也共同闭合。原表情针对Basis分别雕刻，直接相加不包含相互闭合补偿。因此高blink时，Joy追加原闭眼方向位移，会超出单独闭眼姿态并改变线/皮肤层关系；不能把.65+.999当作严格同一闭眼标量，但真实向量和层关系证明了重复驱动。

## 精确权重下的层关系

对原Eyeline/Eyelash每三角固定10个内部重心点，原texture alpha>=.5才保留，按同侧原X跨度中间60%形成固定中央域。用源坐标沿-Z正交射线查原不透明Face_SKIN前向三角，点在该皮肤后超过1 µm记为遮挡。没有将透明根按最近皮肤点硬配对。表中是稀疏表面点数，不是图像像素、面积或实际camera重渲染。

| 原源/中央层 | 单blink峰值后皮点 | happy+blink峰值后皮点 | 叠加最大后皮深度 |
| --- | ---: | ---: | ---: |
| 女eyeline | 54/706 | 669/706 | 8.534 mm |
| 女eyelash | 3/308 | 234/308 | 8.753 mm |
| 男eyeline | 79/672 | 574/672 | 6.445 mm |
| 男eyelash | 38/245 | 121/245 | 3.948 mm |

女eyeline中央有交点样本的有符号深度中位数由单blink的皮前0.530 mm变为混合后的皮后3.618 mm；lash由皮前2.172 mm变为皮后2.265 mm。这与实际中央线消失、外角残留一致，支持“混合形变把线层带入皮肤后”，而非新端点法线导致的独有现象。未排除原材质/outline/灯光对最终像素的次级影响。

aa在男女EyeWhite/Eyeline/Eyelash原delta均精确0；混合峰值去掉aa后，此固定采样所有层统计相同。半blink时也有部分后皮点，但实际图仍能看到连续线；这进一步说明采样遮挡计数不能单独代替视觉结论。

全部关键层位移数量、原target名、6个最大组合位移源顶点及各表达向量见 `report.json`；每个固定采样点在各情形的位置、皮肤三角号和有符号深度见 `samples.json.gz`。无皮肤射线交点明确为null，不伪造零间隙。

## 唯一最小控制兼容建议

对这两个已识别源家族，自动眨眼期间使用 `happyEffective=happyRequested*(1-blink)`，保留blink原曲线、口型和所选happy状态；眨眼结束连续恢复happy。这样眼区从Joy到独立Close交叉淡入，避免同时完整相加。它不需要新几何、修改已冻结VRM或新增参数；也不能无条件推广到其他人物的表情映射。

只在已观测峰值做一次解析反事实，没有扫权重：happyEffective=.00066885、blink=.998971、aa=.511979。后皮点女eyeline56/706、lash3/308；男84/672、38/245，接近原单blink的54/3和79/38。不是清除原blink全部穿透，也不构成已实施修复。代价是每3.6秒的0.18秒眨眼窗口内，全脸Joy（包括笑嘴/眉）短暂淡出；口型仍继续。此最薄控制须先男女正常速度实际观看，检查表情脉动是否可接受。不要通过永久关掉blink、改源或按坏点抬睫毛解决本轮问题。若全脸淡出观感不合适，需另行明确授权局部表情层拆分；本轮不扩系统。

## 复算与边界

执行 `python evidence/eye-expression-overlap-study-v1/diagnose.py`。使用现有Python/NumPy/Pillow及冻结alpha采样类，只有新evidence内写结果。原源SHA在入口核对；女性actual influences在脚本内断言。输出固定7个因果情形（neutral/happy/blink/半混合/峰混合/去aa/唯一解析建议），非阈值矩阵。source front射线没有原camera透视、skinning后的视角、MToon排序/outline或真实注视；男性尚无本次组合实图。最小下一步由root在现有live控制实现并实际回读，原眼端点身份保持。
