# 最终源码快照

三文件复制自独立构建检出 `experiments/face-render-compaction-build-422a/prototype/src`，源422a23911784c0b7448841eb97839973901b0be5、build0fb420e5b124。不是未采用的提前求球试验。

face-render-compaction.js在compact赋值前安装一次性computeBoundingSphere wrapper；首次由Three实际调用时，用canonical几何及当时骨姿计算，在finally恢复render geometry和原方法/属性归属。已有sphere不改；未用wrapper在dispose/setup失败清理。

前桥接版CPU记录为cpu-4（497几何），最终首次使用版本为cpu-object-sphere-lazy-1（533几何、9生命周期）。报告均位于 experiments/face-render-compaction-source/evidence/face-render-compaction-v1/。快照未被本次文案更正改写。
