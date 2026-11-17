# 原八请求的身体与轴向头部合成接缝

本次只读源、原回执和GLB索引/骨骼数据，未调用任何形变函数、求解器、Blender或导出。完整输入SHA及逐请求原参数保存在 result.json。原八请求与v1逐项数值相同，没有删除两lean或用head-only角色替代完整预设。

## 可复用的身体证据

身体九参数为 waistWidth/Depth、hipWidth/Depth、chestWidth/Depth、shoulderMass、upperArmRadius、thighRadius。`scripts/m2-representative-head-cage-v1/body.py::body_displacement` 已把v2 field中脸部代码之前的身体分量完整提取，保留 only_limbs、hip/waist/chest归一混合、原support及hand_limit。其SHA为 `72b8ea974ee7184bfcedab970b8cdd4971a13dac8f2ee71f92051657db74e88a`。

既有 `assets-source/m2-representative-head-cage-v1/generated/preflight.json`（SHA `da45d4f1fb6d3e5222de827de659ba53bb5be6c212f7783bad16927b0c98eab9`）在随后head cage失败前，男女均已通过 exact-v2-body-factor-and-distal 门。它对全部原POSITION组及真实原morph端点核身体分量与从v2 AST提取的参考逐值误差0，所选distal手指/脚点位移0，原1e-5m差分J门通过。

| 原预设 | 身体分量已有min Jdet | v2完整资源结果 | 已有脸半宽意图投影损失 mm |
| --- | ---: | --- | ---: |
| female-round-full | .785833093 | source-passed | 24.9523 |
| female-long-slender | .697000074 | FAILED | 未产正式report |
| female-square-athletic | .741971009 | source-passed | 16.1298 |
| female-soft-wide | .877854544 | source-passed | 27.1639 |
| male-wide-muscular | .652180977 | source-passed | 24.4413 |
| male-long-lean | .656010135 | FAILED | 未产正式report |
| male-round-stocky | .844431743 | source-passed | 31.0580 |
| male-angular-athletic | .744553854 | source-passed | 8.6685 |

这支持复用同一身体分量和原九参数。它没有证明连续空间全域可逆、身体各部位达到独立毫米目标，或八套body-only衣物/接触通过。六个既有v2资源确实包含真实身体改变及对应衣物；68a房间报告只记六项technical-checks-passed-visual-pending。脸投影与腰部衣层缺陷仍保留。

v2共同源入口为 `assets-source/m2-representative-batch-v2/spec.json`，SHA `2b7136daad4626a768b8781328f5aebe628f61b4ba6fd0870624544378f5b669`。原男女body分别固定027bed和62b44b完整SHA，见result.json。`scripts/m2-representative-batch-v2/deform.py` SHA为 `9eaede97e6d4c6cb5d95259f4a009a80ecd1980f387f7ddd325dc5486cc2e8d2`。

## 两lean失败的位置与阶段

两者都在 `output_plan → rewrite(avatar, full_avatar=True) → Mapper.group` 的base数组门失败，尚未完成avatar输出，也未进入该预设独立装备的rewrite。错误没有morph endpoint前缀，donorVertex均为false。

- 女点为原Body POSITION accessor7/index702，实际只被Body_SKIN primitive引用，坐标 `[-.009419470094,1.343897938728,-.019435839728]` m，head-local Y=-.043663501740。旧整体field Jdet=.102261581625，低于原.12门。它在旧脸support的下边过渡内，并非独立衣物donor失败。
- 男点为原Face accessor21/index913，实际Face_SKIN引用，坐标 `[.046507518739,1.523567080498,-.033555056900]` m，head-local Y=-.021832823753。旧整体field Jdet=-1.609811717579。

可从源码直接区分身体责任。身体trunk在 `chestY+.20` 及以上为0，only_limbs继承的upper在 `neckY-.01` 及以上为0。因此身体分量的统一源Y支持上界为两者最大值，女1.305352082253m、男1.446336379051m。两个失败点连同±1e-5m差分邻域都严格高于该界，身体B及其差分列在此为0。故这两点的失败来自旧脸贡献，女性错误里的“Body”指accessor/材质，不能据此把它归因躯干体积机制。本结论没有重新求值，也不进一步猜测旧脸各子项的独立数值贡献。

## 建议的一个最小共同装配

沿现有 `Head.evaluate` 已使用的“原源身体分量加原源头部分量”接缝，候选定义为 `F(P)=G(P)+B(P)`。B是上述原v2身体位移，G是带显式identity外段的新头部坐标映射；两者都以同一未修改原P为输入。保持原raw骨骼/IBM/H、米制rest空间。不能在已导出v2人物上再跑G，也不能在当前83f头部人物上调用完整Mapper.field，后者仍包含失败的旧脸场。把四脸参数设零也不能绕过旧face_curve投影，必须复用已提取的B。

新实际导数应为 `JF=JG+DB=JG+JB-I`，作者N只用最终实际JF逆转置传递一次。不能把两分量行列式直接相乘。当前原男共同B源支持上界1.446336379051m，已封G下界为1.450039863586m，源Y间有3.703485mm间隔。这说明当前男接缝有明确局部支持依据，仍不替代实际全源/所有端点的合成门。女性没有本方法系数与完整保护域合同，不能借用男H/L/U。

还不能从head-only fixed-neck=0推定加入B后仍为0。原完整neck集合的sourceY为1.432581663132..1.450039863586m，部分低于B支持上界，手脚零位移门没有覆盖这个问题。本次没有求这些neck点的B，需在共同装配前置明确核其2µm门和颈部邻接连续性；若冲突应保失败，不能把JG的identity替代最终JF或暗删neck点。

原表达按每个真实原 `P+D` 构造 `F(P+D)-F(P)`，不能对已烘焙delta再次变形或只传base J。完整source inventory、共享引用、真实NORMAL端点与Float32规则继续沿新导出接缝。当前male原源是7855 Body base加2056×55 Face端点；女源有自己的实际target数量，不能套男55记录。

衣物仍从各自原GLB开始。固定nearest原Body_SKIN三角/bary绑定沿v2原Source.bind，只取B的skin位移作donor，保其原版型offset。头部/衣领部分应用同一G，候选衣物公式为 `G(Pc)+bary(B(sourceSkinTriangle))`，导数为 `JG(Pc)+J_bodyTransfer-I`。嵌入原VRM的衣物索引和对应独立件须用同样规则，衣物源索引与皮肤规则若重合却要求不同结果应拒绝。不能先套完整F再加一次donor；也不能把原v2含旧脸的donor_delta带入新包。这个共同装配尚未实施，其输出三角/衣层间隙仍需真实检查。

最低闭环是原八参数清单保持不变，先以现有male-lean头部系数检查上述共同装配接口，然后让同一生产入口逐原请求保成功或明确失败。这个接口检查不会关闭另外七项。当前只有male lean获得数值/原55strict与实际导出接缝；round的原55strict失败保留，其他六项没有本方法的独立系数和后验。不能把male-lean头部房间成功登记为全身瘦长或八体完成。

最终组合须重新核原>.12实际JF、固定眼/neck/frame、实际101、全表达strict及已知混合表达，全部属性与Float32回读。新体积会改变腕/前臂/坐姿服装边界，因此新body实际forearm/hand及必要coverage依赖必须重测。当前head-only装备中的pants/shorts identity及新forearm SHA不能继承到有B的新身体。沿既有原身体鞋底测量记录处理地面，不用runtime offset抵消源几何。所有新body、衣物和fit获得真实新SHA后再由root接入统一房间检查。

本报告没有改变原参数、旧FAILED、原素材、runtime或当前4196，也没有提出逐体控制器或再启封存cage。
