# 首次改脸：预留零 NORMAL morph 的有界 CPU 候选

**数学上可行，CPU 门通过；是否降低约91ms首次改脸长帧尚未测。** 候选将原男女可编辑 Face primitive 在首次渲染前准备成 POSITION+NORMAL morph 布局。原作者源/公开资源/recipe身份和保存合同不变，不叠加34e的shadow预备。新增初始上传/常驻内存及shader取样成本，不能把成本移到初始化就称优化。

隔离工作树 `F:/gamemake/experiments/m1-face-normal-reserve-candidate`，基底 `0137d7e94be80bff15ae391f54e3c31a259babeb`。当前未提交/未构建，主工作树产品文件未改。依赖使用指向已装锁版本node_modules的本机junction，不是重新安装或新依赖。所有CPU脚本在隔离树的scripts目录，实际执行快照随各报告保留。

## 本机依赖依据

- Three0.187.0 `src/renderers/webgl/WebGLPrograms.js:85–91,344–347,583`：有NORMAL morph决定stride2及morphNormals program标识；原POSITION-only是stride1。
- `WebGLMorphtargets.js:20–52`：按geometry WeakMap保存纹理，只有entry不存在或targetCount变化才重建，**不检查stride变化**。所以必须在首次render前补零，禁止在同一个已渲染geometry上事后加NORMAL；改脸仍使用新clone，新的纹理仍需分配/上传，不能保证全部stall消失。
- `morphnormal_vertex.glsl.js`：relative morph的base influence为1，对有限表达权重只加权零delta，原法线数学值不变。位置属性/形态、权重、骨、表达绑定完全未改。MToon3.5.5内嵌顶点shader也使用该chunk，再执行skinning/outline，故相同有限输入的法线与outline数学相同；没有GPU逐像素等价声明。
- three-vrm3.5.5 `VRMExpressionMorphTargetBind`只修改mesh的influences索引；未调用`combineMorphs`或重排targets。`_generateOutline`复用geometry并新增material group，因此当前outline不把morph纹理翻倍。

## 最小实现及身份边界

1. `prototype/src/face-normal-reservation.js`仅承认原女027bed…/原男62b44b…两个bodySHA，固定真实6个primitive的名称、2055×56/2056×54形态规格，拒绝已有NORMAL、混合材料或异常布局，先全验证再赋值。每actor共享一个全零Float32 vec3 buffer和target数组，不与另一actor共享可变状态。
2. `foundation-avatar.js`在完整文件SHA已核、GLTF/VRM解析后、root加入场景前执行。失败deepDispose后抛出；未知派生不预留。当前后续source POSITION/NORMAL/UV/index/morph/recipeSHA门均照常执行，没有伪造基模SHA。
3. `facial-geometry.js`仅为这些明确标记的original geometry使用共享normal cache key，避免因原本缺失的normal morph现存在而失去跨primitive的结果共享。其他geometry仍用旧key；形变/法线算法不改。reset仍回到各actor的原geometry，只是它已有零slots。

候选文件SHA：facial-geometry `c453e4d37e721f8479ea0acc5d2c0a35bf2354d687b6e11f183f9ae2876f2503`；foundation-avatar `03b2f577f1dae742c8c0b1b4ef1ee733112588814caa5fcc876d7496aa6859cf`；helper `d795099cce507626941d326df5765e6e985537c054ed18eff52bb42696322041`。源码快照/来源hash在本目录manifest。

## 实际 CPU 结果

- `equivalence/report.json`：男女各13种旧/新/混合四域、男jaw原+4%，共27例；完整现有attribute/index/POSITION morph/NORMAL结果和bounds与0137原实现一致，state相同，reset/dispose恢复原geometry。唯一允许的结构差异是原来没有NORMAL targets现在显式为零；这是可解释的数学等价，**不是GPU布局逐字相同**。
- `real-loader/report.json`：真实GLTFLoader+VRMLoaderPlugin解析原男女，均9个Face mesh/9个geometry，实际预留6个；女16、男15项真实expression-manager检查（包括happy .65 + blink .999 + aa .512），绑定字典、全部influences、原属性与所有POSITION shapes保持，新增NORMAL全+0。纹理解码仅stub为空THREE.Texture，未模拟shader，也未开浏览器。54/56个原shape的全部输出另由27例检查逐项比较。
- `identity/report.json`：男女各5项：未知body不变、原有非零NORMAL拒绝、篡改POSITION拒绝、篡改morph拒绝、错误recipeSHA拒绝；拒绝后未换入候选几何。10项通过，未放宽身份门。
- 准备脚本首个命令误把相对工作树目录重复拼接，文件尚未写入即FileNotFound；纠正工作目录后才执行上述门，没有产品失败被抹去或改阈值。

## 内存与时间成本（由真实布局及Three公式算得，非VRAM测量）

Three为每geometry、每target编码RGBA32F texture array，CPU backing与GPU基础存储理论各为 `width*height*16*targetCount`。宽为`min(vertexCount*stride,maxTextureSize)`，高为向上取整。原男女Face数据即使某primitive只引用少量点，仍是完整2055/2056点buffer，不能按口部索引数计算纹理费用。

| MAX_TEXTURE_SIZE | 女6几何增加（CPU backing / GPU各自） | 男6几何增加（各自） | 女/男若全9几何增加（各自） |
|---|---:|---:|---:|
| ≥8192（此模型不发生行填充） | 11,047,680 bytes / 10.54 MiB | 10,658,304 bytes / 10.16 MiB | 16,571,520 / 15,987,456 bytes |
| 4096（stride2跨行填充） | 32,992,512 bytes / 31.46 MiB | 31,809,024 bytes / 30.34 MiB | 49,488,768 / 47,713,536 bytes |
| 2048 | 11,010,048 bytes / 10.50 MiB | 10,616,832 bytes / 10.13 MiB | 16,515,072 / 15,925,248 bytes |

另有零NORMAL属性本身：每actor只共用24,660/24,672bytes，不是每target重复分配；但Three纹理仍按全部target复制编码。驱动对齐/额外副本、shader缓存和VRAM总量未知，表中不能当实测峰值。原9几何预算与只预留6几何已经分别列明。

每次`BufferGeometry.clone()`仍会复制新增NORMAL targets再被当前normal结果替换/共享，可能造成临时CPU分配：女每被clone几何1,380,960bytes、男1,332,288bytes，6几何最坏约7.90/7.62MiB/次，未在本轮追加优化。初始化增加纹理填充、上传及零normal shader分支；表达非零时会额外取normal texel，即使其值为0。原geometry及其缓存会保留到actor销毁；不能只报告24KB便称成本可忽略。

## 最小 GPU 后续对照（由root协调，未执行）

固定0137基底与本候选，不混34e shadow helper。用既有首改脸UI脚本，原男女各独立冷页面，先记录初始加载/首次稳定render，再做同一首个嘴−12%和已有后续改脸操作；追加同条件短稳定讲话/眨眼窗口。记录实际MAX_TEXTURE_SIZE、首改request/首帧/long frame、load-ready到可见首帧、稳定帧分布及renderer计数。不得只看首改收益而隐去首次加载或持续帧成本。

需要验证首次visible原脸正侧/正常讲话仍可见且新眉鼻眼/组合无normal布局异常；再做一次reset/原男女往返，核资源计数与原布局恢复范围，不扩大服装/舞蹈矩阵。当前CPU没有确定实际GPU收益，也没有普通机准入；4096纹理上限的额外成本须作为候选取舍。若首改没有足够收益或初始/持续代价恶化，保留失败，不继续叠加预热实验。
