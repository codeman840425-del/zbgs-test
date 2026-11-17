# 原生HairSet001单一样件

状态为原生制作、保存冷开、VRM1导出及CPU来源读回完成；尚未看造型、接游戏或验证动态。仅执行一个免费HairSet001，未改色、发束控制点、身体或表情参数，没有扫预设。

- 可编辑源 `generated/male-hairset001.vroid`，SHA `fd027844a3a18754af65e1188f9fc648be69c96362a82b280a5640cdda773e95`，5,019,329B。
- 原生VRM1 `generated/male-hairset001.vrm`，SHA `dab423674f42d3e6e79eb1b8aa1375e5b664e11bf130d093c14f78c5d3967238`，15,217,240B。
- 原编辑源c936b、原a18a VRM及进入时2b01快照保留原字节。原生另存的工作/进入checkpoint拥有各自实际SHA，不冒充原文件字节。

原作者来源固定mcjo79 Bridge0.15.0 / commit c7367a548626cbe69e26b533e48fc9ddaf85851e，实际VRoid2.16.0。本次依既有明确授权执行此前准备的模板，模板的prepared状态没有被误作新许可阻塞。请求/返回/stdout/stderr保在本包 `requests`、`records`。

## 原生闭环

进入时是已知male-before-skin-study快照，ready/clean。先保存独立checkpoint，再打开固定c936b男性源并另存工作副本。fresh目录确认ID `a051cb96c59e4dce033c3223d63829b7642efabf.transferablegroup`，资源 `pixiv/VRoid/HairSet/N00/001/TransferableGroupType.N00.Level0.HairSet.transferablegroup`，usable=true、price=0，然后只执行一次apply_preset(preserve_material=false)。所有非发组ID/resource保持原样。

保存候选后返回菜单、冷开候选。组、发束、已返回材质数据完全一致，再原生导出VRM1，delete_transparent=false，无减面/贴图缩减/发骨缩减，warnings=[]。最后恢复进入时原快照，ready=true、dirty=false，原源SHA均未改。导出结束已立即向root释放窗口；没有桌面输入、另启Studio或修改4196。

两次hair_materials只读调用仍有Main/Highlight纹理层不可编辑的两个嵌套error。完整调用 `ok=false` 保留，没有改成成功，也未begin_hair_edit消错。此任务只读取颜色/材质元数据，未使用纹理层；caller仅允许这一个已知层错误类型继续独立步骤，其余错误停止。没有原生重试。

## 真实导出结构

原91节点/两套79joint变为163节点/三套138joint，原79骨保留，新增59个hair skin joint、另13个非skin节点。共同骨父级、local TRS、world rest及IBM精确相同。原10个spring组外增加12组，具体参数/碰撞代理来源在CPU报告及spring语义对照中。

发束冷开记录为5个brush组，共38束。导出保留原HairBack cap 873引用点/1632面，另有 `Hair001 (merged)` 12868点/16600面。新网格实际有蒙皮权重与新增hair骨，权重/坐标有限；没有以刚性拉长旧短发替代。发长/顶点/骨数不是动态或性能验收。

`cpu-readback/result.json` 从原a18a重新解析。12个非发primitive取得完整几何+UV三角对应，NORMAL/POSITION/UV/WEIGHTS与有效骨名语义保持，引用的全部原morph delta保持（原生Face57targets，未借旧VRM0的54/55定义）。非发材质/纹理图经引用重编号还原相同；原表达morph、材质和纹理语义绑定相同，humanoid原骨名相同。JOINTS数值随骨表增长不冒称原数组相同。CPU没有运行expression manager、混合表情或碰撞。

源许可meta保持原限制字段，title/version为本次明确study身份；onlyAuthor/personalNonProfit/noRedistribution/modification prohibited未扩权。免费目录不代表商业/再分发许可已审。

## 建议接入接缝

最低成本先用这个完整原生VRM1做同房间原/新发型静态和走路观察，沿共用loader/motion；当前源Body仍为原a18a的原生遮罩，不能将其冒称7586完整皮肤基体。若接完整皮肤，可在非发Body对应证据上另做已证原生PNG派生，给新资源身份，保138骨；本包没有自动完成该步骤。

独立发型提取应以本源两个实际HAIR primitive为边界，保两个原材质图、作者NORMAL/UV/WEIGHTS、59新增骨及其祖先/rest/IBM、12新spring与实际collider依赖。不能只改sourceMaterial字符串或把138骨glTF送入旧rigid短发合同。可选择保完整138骨avatar承接原生spring，或另做准确raw-head-local的独立hair-skeleton合同；后者尚未制作，须由root按现hair loader接口决定。

原男性三衣在12非发面及原79骨等价证据上有可复用基础，但目标已变dab423...，须实际对新目标重算bindings并读回后生成新fit，不能更换SHA直接沿用7586验收。帽、眼镜、发色/肤色/虹膜/唇色、发束编辑和坐姿接触也未准入。

`native_cycle.py` 是此次单次真实流程源码，已有路径拒绝覆盖，不要直接重跑；新的试验要明确新身份、新路径及独占窗口。`readback.py` 只CPU读取，原结果存在时同样拒绝覆盖。未Git提交、未修改public/运行时/能力表或固定服务。
