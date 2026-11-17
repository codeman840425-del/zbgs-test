# 当前角色工程：恢复入口

2026-11-16，F:/gamemake，feat/m1-foundation-room。先读AGENTS和本页，再读当前包必要证据；不通读历史、不另建状态台账。CAPABILITIES是唯一能力事实，FOUNDATION-MILESTONES只安排阶段。

## 目标与公开版本

M2完整范围以research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt为准（SHA309ae27289e81689d26a08f2704e887a9a882befad860e534f0779445efedc23）。当前主包仍是4女+4男代表预设共同生产：旧v2仅六个源成功，两lean失败；六体头部请求也未充分达到。不能称八体完成或M2结束。M3未授权开工。

4196固定工作台：http://127.0.0.1:4196/?workbench=appearance 。source726fae4b24bb1625da9d12d22834fc88e4e2db8a / build14f73cbe1e26，目录experiments/m2-axial-head-fixed-v1/prototype/dist，指针delivery/appearance-workbench.json；f82回滚指针在delivery/history/appearance-workbench-f82.json。4174录像，4195保M1。新男lean仅头部诊断候选已入外观菜单，不是完整八体通过。

f82已独立重建376文件一致，公开编辑/移动/12影片烟测已验。腰部修订只适用原女、round-full-v2、soft-wide-v2；三体×房间/近腰六对完整1×在4174/evidence/m2-vest-layer-review-f82-v1/。原上衣形态、脸型及马尾椅背问题保留；数值/采样审查不替代连续人工观感。女裙和认可的30秒舞封存，不再修。

## 当前主包：连续轴向头部函数到完整源几何

已有失败保留，禁止在原方法上继续扫参数：
- 原整身/局部cage八请求失败；两批LP只拒固定材料点代理，不能证明正式101截面目标无解。
- m2-head-attachment-slim-v1原23guide实际命中，但其他面成为新极值；完整101最大半宽误差9.379861/2.638866mm。独审m2-head-attachment-silhouette-diagnosis-v1已定位，不归因z筛选。
- m2-head-surface-band-slim-v1扩为整个源101所穿600三角/363源顶点/343native，一次identity+两样仍失败：lean/round min tet det .005826535/.004797281，半宽3.776645/4.785467mm（lean缺3），fixed .390502/150.613651um。23.32秒/采样树RSS约1.017GB。独审m2-head-surface-band-root-cause-v1确认极值边现已受控、实际坏7/6全在exact风险8/10内；最坏并非极薄。不证明20步收敛或正式目标无解。没有导出/后验准入。

已先核官方实现与许可再实施：evidence/m2-axial-shape-method-review-v1/REVIEW.md、m2-axial-shape-formulation-review-v1/REVIEW.md。新表示只对应现有jaw/cheek/chin轴向目标：G=(Hx+s(y)x, Hy+y+d(y), Hz+z+h(y))，y为原head-local米制。它不是任意脸型/关节求解器，不更换游戏路线。新G有自己的实际J=s(1+d')，不能改标签声称旧tet通过。

函数系数前置已完成：scripts与assets-source/m2-axial-shape-function-v1。共同knots为源带全uniqueY+原101sourceY+frame/L/U四保护层，共347knots/346段。L=完整fixed-neck maxY=-.09536004066467285，U=完整fixed-eye minY=.04140663146972656。只用官方SciPy PCHIP，对s/dY/h有常量护段，显式外段identity。identity+lean/round各唯一构造一次；存储Float64系数的精确Fraction/Bernstein检查每项692区间，无需细分，s>0，q下界lean .39386243383、round .976210641755。原23/202函数残差≤2.222e-16m，原101标量残差0；平台系数精确常量，数值C0/C1误差约1e-16/1e-15。1.28秒/采样树RSS约108MB。root核23文件SHA/字节一致。

函数独审m2-axial-shape-function-audit-v1已无阻断：原c→精确有理局部求值→Lagrange→独立Bernstein逐项一致，7反例/预算拒绝过。result SHAcd953c45352fa3e79652a53f791125fc1e8e71f6134959f72e43d94c6afe507d。证明仅针对各段存储系数实多项式；接缝有舍入级差，严格全局C1/注入和浮点全域执行界未证，不能夸大。此时还不是完整模型或实际101网格通过。

完整源求值m2-axial-head-evaluation-v1现已完成并由独审确认无阻断：identity全源0；lean/round完整101误差.825000032/.941696881mm（无缺片），实际Jmin .486337477/.976210642，fixed全0，Float32误差.118263/.106781µm。501三角诊断无新增退化/非正参考法向点积，不等于无碰撞。3.147秒/采样树RSS143654912B，首监控启动缺psutil失败保留、实际求值仅一次。独审result SHA58321fc546b32fa56868ce9ab531e38465c7d343151e8c2e671c3e3517f1659b，root核30包文件一致。仅数值候选，非人物通过。以下为执行约定：直接读取已封PPoly系数，不重造曲线；identity+两原男头部请求各一次完整源求值，600s/3GiB/2threads，无扫参。函数独审通过的执行条件已满足，producer准备核pin后直接跑，不等用户或再问root。全部9911实际引用base顶点必须覆盖：Body accessor7为7855base且无morph，Face accessor21为2056base+54真实targets，总120935 unique endpoints；不能虚构9911×55。Body在55面部状态复用base。

完整源清单evidence/m2-axial-export-seam-review-v1/source-index-inventory.json SHA51f938f9c604e01020db9d95a7b987bd336741c5172ffa610059345cb35532b9，含全部primitive/material/隐藏源衣鞋及原属性/target身份。Body/Face mesh nodes67/68均scene根identity，共用原rest米制；无共享target冲突、无未引用buffer点。旧113713 tet records只覆盖Body7的633点，不能当新G全源覆盖。

evaluation将保存完整source/mapped/Float32 base+delta、新G实际J、原fixed-eye/neck/frame≤2um、完整101实际Face_SKIN切片≤2mm/无缺段及源三角退化/方向诊断。新records按positionAccessor/endpoint/targetPositionAccessor/references/sourceIndices/offset/count，不用单primitive假装覆盖全组；NPZ保mappedEndpointsM、float32BakeRoundTripM等。只应用四头部参数，原请求body参数仅溯源，非完整lean/stocky人物。此阶段不export或跑55strict；只有数值候选才接后验。

## 并行接缝与尚未完成项

m2-axial-head-readback-v1已完成prepare+13项合成QA，新spec pin后核对再执行。root已授权在独审/QA/pin齐后直接单次运行两例各55原strict，未将执行授权当作结果。其合同为：显式新schema/spec/曲线/独审身份，复用原contacts/segment_hits和55原strict baseline；拒旧SLIM身份、缺点、虚构Body targets及失败候选。真实strict已完成：lean55/55无新增，round三状态新增6pair失败且不导出；详见m2-axial-head-readback-v1及round-contact-diagnosis。round微米级交段并非可见穿透深度，不当作严重视觉判断。m2-axial-head-export-v1已仅导出identity和lean，复用原bake/normal_map，lean83f4907f3943940b90a8876ed79496b20476f0d38ecf31414fb8b94f3bacb8f9；属性/作者N与54NORMAL读回过。独立10混合审查有一个happy.65+blink1+oh.66新增口内pair，原门与已知缺陷保留，实际视觉仍待验。

导出接缝审查m2-axial-export-seam-review-v1已完成，只读报告及inventory。应复用已有bake/normal_map，处理旧generator、zip截短和就地缓存风险，不造第二套导出器。几何法线必须为新表面退化/方向检查计算；着色法线须保作者风格，不能简单面积平均覆盖（原N与面积N最大差84°/113°）。可按实际J逆转置传输原作者N，endpoint N再减base；需identity方向/实际光照与glTF morph语义验收。原54面部targets只有POSITION，无NORMAL，不能错误保留旧几何法线或宣称shader自动完成。

原HairBack审查m2-male-hair-attachment-source-audit-v1：250v/408tri，90索引边界含UV接缝；精确坐标诊断商图54几何rim/55原ID。完整rim距皮肤约.0085–3.408mm。只有几何边界，缺附着段/自由端及头皮对应标签；不能最近点挑子集冒充全部发根已验。后续由agent补标/验证，不交用户修模。

还须实际原全部表达/中间组合、眼白覆盖、闭眼/口型/笑、发根、VRM属性/法线/衣物及游戏正常速度验证。连续G下界不能代替输出直三角或表情混合。女性和其余预设均不能继承男两例通过。普通电脑无设备，用户允许保留实测缺口继续。

## 备份与协作

最新已核远端726fae4b24bb1625da9d12d22834fc88e4e2db8a，含真实strict/导出及独审、混合与round失败诊断、四装备实际适配和此前所有原始结果。回执assets-source/m2-axial-head-export-v1/remote-backup.json。runtime发布器和当前增强QA尚在进行，未包含在该备份。

当前接续：头部runtime和实际房间小包已交付（evidence/m2-axial-head-room-v1）。原/新十组真实manager边界、各34.7秒主片和42.05秒无暂停纯canvas补录：五元音/三blink、两裤走坐起、实际装备/forearm身份、非默认配色短裤关闭恢复、坏SHA保旧均技术通过；尖长颏形与已知oh口内pair、人工连续观感未过。455构建输入与源码一致，公开男女热切到新候选/链接烟测过。临时4197已关闭。能力范围与限制只查CAP及本包REVIEW，不能借此称八体完成。

下一主包已启动：asset_budget准备m2-axial-body-compose-v1，F(P)=G(P)+B(P)、JF=JG+JB-I，以同一不可变原源完整male-lean九身体+四头部参数一次数值验证，先spec核接缝后跑，不导出；fixed-neck最终位移与相对请求body基准的头部增量分开测。只读证据m2-eight-preset-composition-seam-v1确认两旧lean失败点均在旧face支持，八B分量原preflight已过；不重做B/不调用旧face_curve。另一独立任务face_target_feasibility在m2-face-subdivision-preflight-v1实测原男Face一级libigl细分的权重/UV/54morph/接缝可消费性，不跑G或导出；研究依据m2-shape-expression-next-seam-v1。两任务保原门与失败，禁止加密/扫参，root负责最终组合/运行。

当前代理已知requested配置：asset_budget=gpt-6.1-sol/high，装备已完成；face_target_feasibility=gpt-6-astra/high，export/混合独审收尾；http_transport_review=gpt-6.1-sol/high，既有房间候选注册。每次派工记录evidence/subagent-explicit-dispatch-2026-11-16.json；followup不改配置。真实provider与桌面hook拦截未独立暴露，不声称验证。

当前角色录像已结束，GPU/录屏/重导出窗口空闲。fixed-v1确切726fae4b已构建/验证，不能在该目录切新源码重建而破坏已发布固定版。公司副总工最新台面钟source18880ef/build2dd87df94b61、72.60秒录像已通知结束释放；仅公司侧交付声明，未核角色集成。公司dirty/untracked不动、不stage，不git add -A。

固定交付只能从exact commit独立检出构建，录像与构建同身份；不从并发dirty源码发布。保持动作控制器与既有失败记录；本包仅增加资源注册和工作台候选说明。阶段汇报不停止长目标；只在真实费用/授权/产品选择或无法自行解决阻碍时问用户。全部M2必需机制须有证据后交用户确认，再由用户决定M3。
