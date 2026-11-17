# 当前角色工程：恢复入口

2026-11-16，F:/gamemake，feat/m1-foundation-room。先读AGENTS和本页，再读当前包必要证据；不通读历史、不另建状态台账。CAPABILITIES是唯一能力事实，FOUNDATION-MILESTONES只安排阶段。

## 目标与公开版本

M2完整范围以research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt为准（SHA309ae27289e81689d26a08f2704e887a9a882befad860e534f0779445efedc23）。当前主包仍是4女+4男代表预设共同生产：旧v2仅六个源成功，两lean失败；六体头部请求也未充分达到。不能称八体完成或M2结束。M3未授权开工。

4196固定工作台：http://127.0.0.1:4196/?workbench=appearance 。source71081be29b5fee7dc5e6d6fbcc17b9b4c65d4b9d / buildf82a7fc6de61，目录experiments/m2-vest-layer-fixed-v1/prototype/dist，指针delivery/appearance-workbench.json；旧ed2指针在delivery/history。4174历史录像，4195保M1。新头部数值试验均未进入4196。

f82已独立重建376文件一致，公开编辑/移动/12影片烟测已验。腰部修订只适用原女、round-full-v2、soft-wide-v2；三体×房间/近腰六对完整1×在4174/evidence/m2-vest-layer-review-f82-v1/。原上衣形态、脸型及马尾椅背问题保留；数值/采样审查不替代连续人工观感。女裙和认可的30秒舞封存，不再修。

## 当前主包：连续轴向头部函数到完整源几何

已有失败保留，禁止在原方法上继续扫参数：
- 原整身/局部cage八请求失败；两批LP只拒固定材料点代理，不能证明正式101截面目标无解。
- m2-head-attachment-slim-v1原23guide实际命中，但其他面成为新极值；完整101最大半宽误差9.379861/2.638866mm。独审m2-head-attachment-silhouette-diagnosis-v1已定位，不归因z筛选。
- m2-head-surface-band-slim-v1扩为整个源101所穿600三角/363源顶点/343native，一次identity+两样仍失败：lean/round min tet det .005826535/.004797281，半宽3.776645/4.785467mm（lean缺3），fixed .390502/150.613651um。23.32秒/采样树RSS约1.017GB。独审m2-head-surface-band-root-cause-v1确认极值边现已受控、实际坏7/6全在exact风险8/10内；最坏并非极薄。不证明20步收敛或正式目标无解。没有导出/后验准入。

已先核官方实现与许可再实施：evidence/m2-axial-shape-method-review-v1/REVIEW.md、m2-axial-shape-formulation-review-v1/REVIEW.md。新表示只对应现有jaw/cheek/chin轴向目标：G=(Hx+s(y)x, Hy+y+d(y), Hz+z+h(y))，y为原head-local米制。它不是任意脸型/关节求解器，不更换游戏路线。新G有自己的实际J=s(1+d')，不能改标签声称旧tet通过。

函数系数前置已完成：scripts与assets-source/m2-axial-shape-function-v1。共同knots为源带全uniqueY+原101sourceY+frame/L/U四保护层，共347knots/346段。L=完整fixed-neck maxY=-.09536004066467285，U=完整fixed-eye minY=.04140663146972656。只用官方SciPy PCHIP，对s/dY/h有常量护段，显式外段identity。identity+lean/round各唯一构造一次；存储Float64系数的精确Fraction/Bernstein检查每项692区间，无需细分，s>0，q下界lean .39386243383、round .976210641755。原23/202函数残差≤2.222e-16m，原101标量残差0；平台系数精确常量，数值C0/C1误差约1e-16/1e-15。1.28秒/采样树RSS约108MB。root核23文件SHA/字节一致。

函数独审m2-axial-shape-function-audit-v1已无阻断：原c→精确有理局部求值→Lagrange→独立Bernstein逐项一致，7反例/预算拒绝过。result SHAcd953c45352fa3e79652a53f791125fc1e8e71f6134959f72e43d94c6afe507d。证明仅针对各段存储系数实多项式；接缝有舍入级差，严格全局C1/注入和浮点全域执行界未证，不能夸大。此时还不是完整模型或实际101网格通过。

当前已授权执行中的下一项：m2-axial-head-evaluation-v1。直接读取已封PPoly系数，不重造曲线；identity+两原男头部请求各一次完整源求值，600s/3GiB/2threads，无扫参。函数独审通过的执行条件已满足，producer准备核pin后直接跑，不等用户或再问root。全部9911实际引用base顶点必须覆盖：Body accessor7为7855base且无morph，Face accessor21为2056base+54真实targets，总120935 unique endpoints；不能虚构9911×55。Body在55面部状态复用base。

完整源清单evidence/m2-axial-export-seam-review-v1/source-index-inventory.json SHA51f938f9c604e01020db9d95a7b987bd336741c5172ffa610059345cb35532b9，含全部primitive/material/隐藏源衣鞋及原属性/target身份。Body/Face mesh nodes67/68均scene根identity，共用原rest米制；无共享target冲突、无未引用buffer点。旧113713 tet records只覆盖Body7的633点，不能当新G全源覆盖。

evaluation将保存完整source/mapped/Float32 base+delta、新G实际J、原fixed-eye/neck/frame≤2um、完整101实际Face_SKIN切片≤2mm/无缺段及源三角退化/方向诊断。新records按positionAccessor/endpoint/targetPositionAccessor/references/sourceIndices/offset/count，不用单primitive假装覆盖全组；NPZ保mappedEndpointsM、float32BakeRoundTripM等。只应用四头部参数，原请求body参数仅溯源，非完整lean/stocky人物。此阶段不export或跑55strict；只有数值候选才接后验。

## 并行接缝与尚未完成项

m2-axial-head-readback-v1正在prepare+合成QA：显式新schema/spec/曲线/独审身份，复用原contacts/segment_hits和55原strict baseline；拒旧SLIM身份、缺点、虚构Body targets及失败候选。未获数值候选时不实际求交。

导出接缝审查m2-axial-export-seam-review-v1已完成，只读报告及inventory。应复用已有bake/normal_map，处理旧generator、zip截短和就地缓存风险，不造第二套导出器。几何法线必须为新表面退化/方向检查计算；着色法线须保作者风格，不能简单面积平均覆盖（原N与面积N最大差84°/113°）。可按实际J逆转置传输原作者N，endpoint N再减base；需identity方向/实际光照与glTF morph语义验收。原54面部targets只有POSITION，无NORMAL，不能错误保留旧几何法线或宣称shader自动完成。

原HairBack审查m2-male-hair-attachment-source-audit-v1：250v/408tri，90索引边界含UV接缝；精确坐标诊断商图54几何rim/55原ID。完整rim距皮肤约.0085–3.408mm。只有几何边界，缺附着段/自由端及头皮对应标签；不能最近点挑子集冒充全部发根已验。后续由agent补标/验证，不交用户修模。

还须实际原全部表达/中间组合、眼白覆盖、闭眼/口型/笑、发根、VRM属性/法线/衣物及游戏正常速度验证。连续G下界不能代替输出直三角或表情混合。女性和其余预设均不能继承男两例通过。普通电脑无设备，用户允许保留实测缺口继续。

## 备份与协作

最新已核远端c7ffecd243a9f68bb54de02944ef6887a95f72c6，含band唯一失败和独审及此前f82/诊断/研究；回执assets-source/m2-head-surface-band-slim-v1/remote-backup.json。新轴向研究/函数/独审与evaluation/readback尚待下一备份，不冒认远端覆盖。

当前代理已知requested配置：asset_budget=gpt-6.1-sol/high，完整源evaluation；face_target_feasibility=gpt-6-astra/high，独立evaluation审查；http_transport_review=gpt-6.1-sol/high，新G后验准备。每次派工记录evidence/subagent-explicit-dispatch-2026-11-16.json；followup不改配置。真实provider与桌面hook拦截未独立暴露，不声称验证。

角色侧本包CPU，GPU/录屏/重导出窗口当前空闲。公司副总工最新台面钟source18880ef/build2dd87df94b61、72.60秒录像已通知结束释放；仅公司侧交付声明，未核角色集成。公司dirty/untracked不动、不stage，不git add -A。

固定交付只能从exact commit独立检出构建，录像与构建同身份；不从并发dirty源码发布。保持prototype/src原字节和失败记录。阶段汇报不停止长目标；只在真实费用/授权/产品选择或无法自行解决阻碍时问用户。全部M2必需机制须有证据后交用户确认，再由用户决定M3。
