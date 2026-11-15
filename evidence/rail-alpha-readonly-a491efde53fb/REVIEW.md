# railClearance 独立只读审查

原a491：OPAQUE/无alpha或cutoff0在visible直接true，但对所有候选区间仍保持5个depth样本；当前裙是MASK .5，因此旧visible每个样本均进行准备后三角bary、UV插值、floor/clamp与alpha查询。

实际原裙源065305626976c59b370d082baa6fd1e2aed8c262490e04e39543345170eb8d8d：742顶点、700三角、1024×512像素全部alpha255。嵌入PNG aab5f12a4bfa423f3e6672ec5ba9f541bb4ec714c897fe145518679c6dd28d63。700/700理想UV矩形均不透明、UV有限且在0..1。当前a491采集实际显示MeshBasicMaterial的alphaTest=.5、transparent=false；源复制只改side，材质配方不改alpha。未重新浏览器导出像素，仅源原bytes完整扫描，当前默认材质范围成立。

## 新83三段审查

1. 全图认证在既有Canvas snapshot创建时一次执行，alpha.pixels是当时独立getImageData缓冲。之后不逐三角SAT或每步大区间证明。不透明比例为100%不等于100%运行查询可绕过，病态几何仍回退。
2. prepareAlphaTriangle每次skin更新重建opaqueAlphaSafe。denom>0，dot00/dot11<=1e12，有限inverse<=1e24，所有points/UV绝对值<=1e6；hit另限<=1e6。由此edge分量<=1e6，delta<=2e6，dot02/dot12<=6e12，bary量级<=约2.4e49，UV<=约4.8e55；实际Canvas维度乘法仍远低于浮点溢出。floor/clamp必到已全扫过的有效像素。NaN/Inf/退化/极端值或mixed alpha均保留原式。允许回退不会减少碰撞频率/范围。
3. rail startDepth/depthDelta移到固定rail查询外，start/end/outward在函数内没有写入；深度乘加顺序不变。5样本、strict depth(-.008,.3)、强修正/diagnostic顺序保留。不能改成端点：深度[-.1,.05,.2,.35,.5]旧5样本可得.208修正，两端均拒绝则0。

当前默认实际输入未见代码阻断。边界是alpha snapshot/UV/几何缓存身份需持续真实；不要将fullyOpaque证书复用到后续变更像素、cutoff或新的texture对象。原材料alphaCache已是每controller闭包，不共享实例结果。本次没有修改运行代码。

## 成本判断

当前a491坐稳motion P95约10.6ms/帧、平均2.010真实子步，不能将全部归alpha。每次visible可省两次dot及bary、UV/index查询，但hit构造、投影区间、5个depth门与轨查询继续执行。新增700三角的有限guard每子步也有成本。确切净收益必须实际同条件83成本决定。

历史05为不同手轮廓算法且已拒绝：prepared/proven231700/231700，复杂每步区间证明约.573ms/步，整体平均仅约2.5%变化且P95约58ms；不能作为本次通过，也不要复活其重证明系统。本次全图一次证明更小，仍需真实姿态等价/当前成本。

当前同意的最小等价：原F/jaw/waist各270姿态、精确bodySHA，旧a491与83各实际120Hz步进，比较全humanoid raw/normalized、全部显示裙位置/法线、语义抽样128真实皮肤点、handContacts非计时字段；dynOFF仅排春骨初始化噪声，非新接触/自然度通过。严格相同后才83坐稳dynON30秒。
