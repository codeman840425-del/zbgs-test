# 女性首编辑顺序短测

固定f7dd，开发机headless Chrome、1600×1000，无录制/截图窗口。直接嘴宽首编辑最大rAF321.5ms，随后眉编辑60.7ms；同一浏览器另开页先眉48.6ms、后嘴91.1ms。后测可能复用浏览器/驱动着色器缓存，不是随机或冷态对照，不可称“先眉可优化性能”。这里只证明新候选仍有首编辑长帧。

源码prepareRender当前每actor仅缓存首次预热，眉独立平移保原morph normals，后嘴才添加新morph normals的组合可能在真实draw另编译。正常渲染会选择正确shader，未观察几何错误；本短测不足以证明时延归因或收益，不为此重复改参数。保留首次几何编辑未通过/普通PC缺口。

脚本`scripts/qa-brow-mouth-first-edit.cjs`，原始事件与帧间隔见report.json。未改变源或固定dist。
