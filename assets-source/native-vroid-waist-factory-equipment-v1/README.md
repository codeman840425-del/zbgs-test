# Waist 派生女性三衣源接缝

本包消费 `female-geometry-waist-unmasked.vrm`（SHA `cf1574b2…fa1ed5`），沿 Face 三衣 exact-extraction 流程拆出 top、shorts、shoes。Waist 源的 18 个辅助骨、3 组 IBM 和 spring 参数差异均从该源重读，未继承 Face fit 或矩阵。

三件 GLB 保留原 130 骨顺序、IBM、POSITION/NORMAL/UV/JOINTS/WEIGHTS、MToon 图和原 primitive。Face 与 Waist wrapper 共用 `scripts/native-vroid-equipment-extract.py`，Face 旧三件输出已做 byte-identical 回归。`build.py --check` 可重复核对。`verify.mjs` 已用 Three 0.187、VRM 3.5.5 和 MToon 插件完成 rest、walk fixture step10、sit-rise fixture step60 CPU 读回。既有 normalize 舍入差异保留，top/shorts 的 rest 误差约18.740nm/6.900nm，shoes 为0，48权重分量最大差约2.98e-8。

当前 MToon loader 已存在。此包的限制是 Waist 新 fit、coverage、接触和视觉未验，不再把过时的“缺少 MToon plugin”写成当前阻断。

该包只提供 Waist 源的独立装备输入，不代表 coverage、动作接触、视觉或 runtime 通过。Face、baseline、旧 mask、改袖 Top、HairSet001 和颜色不在范围。没有 Studio、GPU、public、UI 或 Git 修改。
