# 原生独立衣装首次显示失败与初始化因果证据

本包固定 `eae6c66414cf741bec09629e2143915601bcb3d1` / build `d0f9ab216e05`，通过自管临时loopback服务读取固定dist，原78912 VRM与三件独立GLB均逐SHA和Git blob核对。没有改变4196、模型、纹理、绑定、法线或描边宽度。当前结果保留为首帧视觉失败，不给旧版本改成功标签。

## 实际采集及查看

`run-1/report.json`保存8组同姿态配对，每组原内嵌/独立之间无motion step，包括站立与3个固定walk时刻的正、侧面。实际查看4张站立图、12张walk图（以未改变图像内容的两张缩略对照表阅读）、最终屏图及完整录像的32个2fps代表帧。站立首次独立显示存在领口/下摆和小腿到足部的大面积黑色区域。后续walk图和最终屏图恢复，不能以末帧正常推定初次切入正常。

真实world POSITION差最大 `3.1671899069053817e-8 m`。人体和头发可见性保持原值，三件材质均为MToon且surface/outline都存在。正常速度原地行走由现有createMotion的显式treadmill输入驱动，原/独立各5.5025秒、4个phase周期。对应实际wall/applied时间差仅约4e-14秒，最大真实frame delta分别36.3/30.4ms，未触及50ms上限。无导航路径验证。整段Playwright视频还含加载和暂停时的瞬时诊断步进，只有report.clips里的两段声称正常速行走，不能称整视频为纯实时动作片。相机相同，部分正/侧帧最低鞋边接近裁切边缘，不作完整鞋底接触验收。

## 根因证据

`material-normal-diagnosis.json`是原VRM与三GLB经实际官方loader和adapter的CPU读回，纹理解码为1px夹具。POSITION/NORMAL/UV/JOINTS相同，skinWeight存在先前已知Float32归一化舍入差。矩阵相同，双描边groups相同，蒙皮法线夹角max0，transformed normal长度差≤3.3e-16。该探针在一次真实非零material更新后才比uniform，所得一致结果不能证明首次load时已经初始化。

`causal-outline-v1/`在同姿态只令独立outline material不可见。黑色区域仍在，未支持“只是描边膨胀”的假设。每draw所见boneTexture/map/shade/normal/matcap sampler绑定均对应预期纹理，原/独立surface共用同一实际WebGLProgram，outline亦相同。原/独立三张baseColor贴图的Canvas RGBA SHA和透明像素数一致，Top有1,255,176个全透明像素，Bottom有692,292个，因此源衣物模板的透明裁切关系确实需要保留。

`causal-initial-update-v1/`进一步实际读取GPU标量uniform，保留所有描边。原内嵌六个材质的alphaTest属性、JS uniform和GPU值均为0.5。刚加载的独立六个材质属性是0.5，JS uniform和GPU值却为0。仅对独立surface+outline的六个唯一MToon实例调用官方`material.update(0)`后，JS/GPU值都变为0.5，opacity仍为1、map UV矩阵仍为identity，相机/几何/描边宽度不变，黑色模板区域消失。三张因果图已实际查看。

已安装官方MToonMaterial的constructor先建立uniform，loader随后赋alphaTest；官方`update`会进入`_updateUVAnimation`，把alphaTest属性传到uniform。原VRM有vrm.update负责初始化其材质，独立资源不在原VRM materials数组。旧adapter只更新visible项，所以暂停换装首次visible前没有等价初始化。v4夹具先在embedded模式校准，隐藏独立衣物，恰好显露这个生命周期缺口。后续motion step调用adapter.update后才恢复，与实际图和GPU值一致。

最小生产修复应在新资源准备完成、可见提交前，对全部新唯一MToon材质调用一次官方update(0)，不推进动画，后续帧仍只更新visible项。不能用每次render改alphaTest、关描边或改透明纹理作为替代。共享修复CPU20项已通过，新的固定版实际首帧回归尚待root审查/构建，本包不冒充该新版本。

## 保留的夹具失败和边界

v1真实暴露GLTFLoader原节点名与运行名的精确别名缺口，修复eae6c664，旧失败保持。v2是夹具把facade方法updateMaterials误调用到raw adapter，实际接口为update(dt)。v3首RAF timestamp早于performance.now初始化点，触发正式负dt拒绝，同时临时server漏CSS MIME，canvas只有150px高；原失败未录回调具体值，不能恢复造值。

v4先CPU验证首RAF为自身epoch、后续timestamp严格增加、暂停后新epoch、真实material合法step和负值拒绝，以及同server真实CSS Content-Type，再由独立读审后采集。其实际首回调比初始化performance.now早37.8/33.7ms，按首回调建epoch处理为dt0，未用负值clamp掩盖。样式已实际加载，viewport1440×1000，canvas1040×814。

没有完整factory、外观配方、全部动作或新装备组合准入。原Body贴图的透明覆盖仍保留，不能把卸衣后透明区域解释成没有几何，也不能借此宣称完整肤色身体已验。所有Chrome和自管HTTP已关闭，GPU窗口已释放。
