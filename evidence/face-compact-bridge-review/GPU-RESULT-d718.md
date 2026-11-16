# 460 / d718 同姿门：像素差异待修，未准入

实际固定基线460b72813f68（6e4801f）与候选d7187e079edf（45aa833）已顺序完成原男女各6状态×正/45°，共24对固定姿态。浏览器/临时服务全部关闭。没有正常动作录像或性能测量，prototype另负责这些范围。

## 初始化因果

c371（ab74）单页doc-start诊断确认初始曾render9×2055源Face并分配9份2055×1×56 morph纹理，再分配compact。45aa仅延后scene.add，d718复核未出现canonical render/2055纹理分配，初始只出现compact [387,74,260,150,110,122,122,780,50]。两次日志保持原build标签。它修复了实际初始化遗留源纹理路径，不是整角色内存/耗时通过。

## 程序状态门通过

24对实际骨world矩阵、相机world/projection、灯光/阴影参数、simulationTime、表达权重、私有blink注册/系数/目标/保护部件、公开geometry state逐值相同。预先保存基线完整raw/normalized节点局部变换，候选暂停重放；未用不同idle时刻截图推因果。reset回各自初始化render geometry，candidate本身是compact引用。坏male VRM响应实际翻转一字节，原hash门拒绝保当前actor/geometry，撤销后retry成功。0pageerror、0HTTP错误。

首轮候选 `poses-d718` 因基线JSON将−0写为0、live结构化clone保留−0，shadow projection严格比较失败；原失败保留。r2两侧统一JSON数值表示，无数值误差容差，未改产品/图。既有脚本快照均保存。

## 像素门未过

比较实际1200×814 canvas PNG，不比较JPEG审查图：24对仅5对完全一致。女性最多33个变化通道、幅度1；男性眼区存在高幅差异（最大148/255），最大487变化像素，不能因比例小就假定噪声。`pixel-comparison.json`保留逐图数量/包围框；`review/*-diff-x8.png`为明确放大差异展示，不是原像素。

已逐张查看 `review/female-1..4.jpg`、`male-1..4.jpg` 全8张（覆盖24对），并查看原图和男眼局部放大。没有观察到大块缺件/口腔裂开/整头错位；但男眼线上缘厚度和端点局部确有差异，当前作为待修阻断，不称视觉等价。女性±1尚未有原460重复静帧噪声基线，亦不凭经验豁免。

## 待反证定位

EyeExtra删除零morph改变shader为一个假设，尚非已证原因。另一具体源码风险是SkinnedMesh.boundingSphere：Three按该mesh的所有position顶点计算它，原9Face全脸数组中心相同，compact每片可能不同；renderer据object.boundingSphere.center计算透明排序z。CPU既有门只比较geometry.bounds，未覆盖mesh级sphere。默认透明sort不按programId。已准备独立两页一次渲染列表/mesh sphere读取，待串行窗口；不改材质、排序或阈值。

观看入口 `index.html` 可逐张切换原/新大图。静态截图不是正常1×连续观看，更不是普通电脑性能结论。公开460保持不变。
