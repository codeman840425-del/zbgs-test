# 有限复用入口：现有男性jaw + 嘴宽+4%

可进入下一次有界生产证明：复用已存在 `m2-male-jaw-v1` 可编辑源，新增一个嘴宽+4%端点及其真实派生基底配方。当前仅完成只读数据核查，未生成新素材、配方或运行资源，未执行Blender/GPU。没有推广到女jaw、waist或其他三域。

## 实核身份与几何

| 输入 | 实际SHA-256 |
| --- | --- |
| 原男性VRM | 62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff |
| 已有男性jaw VRM | 25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153 |
| jaw generated/editable.blend | 78a08da05ef949e57e7f585fb8a831aa3e00ac1f0cd686a2a15c1a4a69e12242 |
| 原男嘴宽recipe（仅比较依据） | a9acdcd5866786b031c4e3ec16fde91f77d97fbda08636f061dc742499c6ed6e |

源路径分别见report.dependencies，jaw在 `assets-source/m2-male-face-v1/generated/`。其原父blend/spec/source-delta与独立重生成资料均已存在，不需再做一个jaw。原嘴配方来自 `assets-source/face-parameters-v1/male-mouth-width.recipe.json`。

实际Face2056点。jaw有98个导出Basis变化点（>10 nm），嘴配方480个非零系数点，位置交集0；系数非零不代表所有点Basis均横移，原嘴端点实际约410点变化。jaw源delta与嘴源mapping原坐标数组逐点相同；源嘴域及32口环jaw位移精确0。源delta使用>1 pm计数为99点，与导出>10 nm的98口径不同，原记录和精度均保留，未据此改源。

54个相对表达：jaw对原最大7.45 nm，嘴域内全部精确0。原/派生target名、VRM expression映射、nodes相同；各primitive index、UV、权重一致，Body全部attributes实核相同。说明原 mouth 的材质/口缝/全shape仿射生产机制可复用，不代表配方身份可复用。

**法线域确有交集**：jaw变化三角邻域169点、嘴496点，共28点。这28点在jaw导出中authored normal也实际不同。不能因为位置域不交就复用原嘴normal、原normal引用或原basePosition hash。原配方baseAvatarSHA不符，当前产品拒绝jaw正确；相同拓扑不构成绕过身份门的理由。

以原固定系数做纯数组运算，jaw位移与+4%嘴操作顺序差为0；此仅说明已记录固定场可交换。jaw改变了口周外的图边长度，可能影响8 mm范围边界的候选顶点，仍须在jaw实际源上重新做geodesic和缝匹配，不能复制原weights后改SHA。

## 最小制作路径

1. 新独立spec固定上述jaw blend/VRM作为**本次parent**，保留原父与jaw变换链；限定一个 `mouthWidth=+.04`。不回写旧嘴/旧jaw包。先核所有输入身份再建立输出目录。
2. 复用 `scripts/face-parameters-v1/build.py` 的材质域、32对真实位置口缝、8 mm源polygon边图衰减、固定中心及所有绝对shape仿射。需要抽出/复制到独立小入口并把输入明确指向jaw，不能直接执行现脚本（它硬编码原男女×两端点）。重新算source→export映射与重复缝候选，比较新旧系数但不强求相同。
3. 在jaw源的55个key（Basis+54）上施加同一固定仿射；保Body/骨/UV/weights/其他材质及来源。生成一个editable.blend，重开两次导出。新endpoint VRM自然获得自己的SHA，不能预填25ac8a或原嘴endpoint SHA。
4. 从同一固定jaw源另起fresh重生成、再次重复导出。四份规范VRM需一致；blend容器是否一致另报。若要复核更上游，可调用已有male-jaw重建脚本得到25ac8a，但无需重做其几何设计。
5. 基于真实jaw **未应用嘴宽** 的VRM生成新recipe：baseAvatar=25ac8a、真实Face basePosition/normal与每primitive index/UV/position/morph身份、新source映射/weights/center，另记endpoint SHA。保原recipe文件及原identity rejection。不能仅替换base SHA，因为Face position/normal与原确实不同。
6. 复用audit逐Basis/54shape比较预期仿射、嘴缝、保护、三角翻面/退化/边比，以及新jaw基准上的完整Face邻域法线。native VRM仍可能POSITION-only morph，必须如实记raw/final语义；运行时用现有绝对shape法线重算算法，在**jaw本身的原法线**上保护域外，而非原男性法线。
7. 复用runtime-check的实际buffer→Three CPU适配与重复应用/reset/双实例/错误身份/故障回滚门，限定jaw与这一个+4%样本，再在现有工作台/共用loader做有限原jaw↔jaw+mouth回读：中性、五口型、Joy、blink讲话、重置、第二人物不变。无需新编辑器或批量姿态矩阵；不重开裙/舞。

## 当前脚本可复用与必须适配

`face-parameters-v1/build.py` 的算法和source保护检查可复用；入口BASE/spec、四样件循环与输出命名必须独立限定。`audit.py` 的几何/形态比较可复用，但目前固定读原male/female、96/104和rebuild目录，不可不加修改直接证明新样本。`m2-male-face-v1/glb.py`可原样只读复用。`runtime-check.mjs` 的隔离、identity和失败测试机制可用，但输入fixture与expected pins须按新真实产物建立。现有 `facial-geometry.js` 的每实例克隆、确定性复位、全Face法线计算可用，尚未修改。

注意当前runtime `ADMITTED_BASES` 只收原男女，且mouth recipe validator硬要求range[-.04,.04]。**只做+4%样件不能据此宣布jaw支持整段±4%滑块。** 下一步可先用导出端点和独立CPU读回完成固定证明；如进入现有参数模块，需显式支持“原态/固定+4%”准入与精确新SHA，保其他值拒绝。不能为通过旧schema伪称负向范围已验；是否增加负向验证是后续范围决定，本建议不扩。

## 成本与缺证

复用现有工具/许可，无费用或新下载。固定工作量为2次source生成、4次规范导出、每次55个绝对shape检查、一个新recipe/endpoint及一次有限CPU+浏览器回读；2线程Blender无渲染。尚未实测该组合墙钟耗时，不报伪造秒数。需GPU的仅最后既有浏览器实际观看，另协调窗口。

目前缺：jaw实际源上重算权重/映射；真实组合editable/export/fresh；新身份配方；法线28点交集上的组合全部形态门；有限endpoint准入/隔离及可观看证据。现读到的旧jaw/mouth README各自历史状态不能代替这些组合证据。现有装备/外观/表达适配也不自动继承新导出endpoint身份；若实际运行仍以jaw作为底层人物并动态应用嘴宽，则保jaw身份、独立记录recipe/version状态，而不是把几何已变后的状态伪装成原配方基底。

复算：`python evidence/m2-jaw-mouth-reuse-audit-v1/check.py`。完整交集ID、实际属性/morph检查及输入/源码hash在report.json。本轮只有新evidence写入。
