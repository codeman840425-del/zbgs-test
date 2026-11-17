# 原生脸/腰几何与完整皮肤输入独审

真实几何对照成立，未发现本次Body PNG恢复的非目标修改。此结论仅覆盖固定文件与原生回执；不等于新体factory、装备fit、表情/动作接触或视觉通过。未运行Studio/GPU、未改源或追加参数。

**基准身份必须分清。** 新baseline 1924a888与旧78912母源的全部accessor、节点、材质、图片、表达及除meta扩展精确相同，仅meta.name/version改变。baseline恢复皮肤后的6726a1d4与当前843ac也同样仅meta.name/version不同。原女性源本来已有ChinRoundness .60、ChinFullCheeked .30、WaistScaleMag .40；这不是未改参数的默认人体。新的face/waist分别重新打开同一原源，只改脸两值至.78/.48或腰一值至.58，保存并菜单重开回读；不是编辑器进程冷启动。原生.vroid三份SHA和相同几何导出设置（meta除外）在dependencies.json。

| 对照baseline | 真正被材质indices引用的位置变化 | 其它依赖 |
|---|---|---|
| face 89aa705c | Face_SKIN 737点，最大欧氏2.226mm；FaceMouth 976点，0.143mm；HairBack 38点，0.369mm | rest节点/skin/IBM/UV/JOINTS/WEIGHTS保持；脸与相关N及morph POSITION delta变化；Body_SKIN的N变化而位置不变。图片仅thumbnail21变化，材质/表达映射/spring不变。 |
| waist 22448d18 | Body_SKIN 1149点，2.856mm；Bottoms 764点，3.487mm；Tops 280点，4.064mm | N及三个IBM accessor改变；18个衣物辅助骨/末端节点变，非humanoid腰骨修改。12项衣物spring hitRadius由.0205547735变.0212292522。UV/JOINTS/WEIGHTS、表达/形态delta、材质/图片保持。 |

逐primitive结果保全未变消费者，未把共享accessor所有点算到每个材质。原报告13/5个position group只是共享数组变动，不能证明13/5材质各自实际顶点变化。Face确实改变base POSITION而非只改表情；其49个共享morph POSITION accessor有亚微米delta改变，既有表达绑定相同不能替代运行时组合表情验收。

**皮肤恢复是逐候选保形操作。** baseline→6726、face→cc0843、waist→cf1574均只追加同一原生donor Body PNG并改image11引用，原BIN前缀全等，全部accessor、节点、材质、表达、spring原样。每件source的Body整图RGB与donor逐像素相等，608383像素alpha变化；输出PNG精确等于已验843ac的5bf13646图。消费者只有Body的base/shade，UV/采样和脸/衣图未变。这个“不改geometry”只指每个候选各自unmask前后，不抵消上表face/waist相对baseline的真实改形。

最小后续优先face cc0843：使用它自己的完整VRM与.vroid参数来源，实际重核现三衣绑定/鞋底并生成新SHA的fit与coverage身份。Face的原三衣实际引用属性与rest/IBM相同，现资源有复用依据，但旧兼容SHA不能直接改名；已并行交制作agent核loader。Body完整图和原遮罩像素/UV可作为新coverage输入，仍须新manifest绑定及游戏换装验证。眉/虹膜或头发不能继承其它源准入；本face另影响HairBack、口内及皮肤N，后续表情近景与发/脸附件依赖需检查。

Waist暂不照搬face结论：Tops/Bottoms本体、衣物辅助骨、IBM与spring同时变，应取waist自己的嵌衣/绑定与动态值适配，旧独立衣物/sleeve fit不自动成立。Shoes实际位置/属性未变也不等于可跳过全skin映射/新身份核验。纹理遮罩精确不证明衣物无穿模。

独审发现生产readback两项过度断言：`allNonPositionAttributeAccessorsExact`对空集合求all；`allExpressionsAndExtensionsOtherThanMetaExact`只赋值exprExact而漏waist spring。已通知原包作者修说明，原资产不重做。独审记录的是实际读到的旧封包SHA（181+12文件全部匹配），不替修改后的封包重新背书。另本独审最初要求所有export settings相同误含meta而失败，已保脚本/失败说明，修成仅排除并单列meta。

重现：复制本包check.py/dependencies.py到evidence下新的同级空目录，依次运行两个脚本。脚本结果文件使用排他创建，拒覆盖；dependency核的是运行当时上游清单，新旧清单不可混称同次结果。完整输入SHA、实际变化、参数回执在result.json，扩展/原生源/封包身份在dependencies.json。
