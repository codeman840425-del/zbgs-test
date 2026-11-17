# 原生外观producer的下一样件准备

本包是一次只读接口准备，未制作新模型。16个有限Bridge查询中15个成功，1个发材质查询保留部分失败；模型始终为既有 `male-before-skin-study.vroid`，ready=true、dirty=false、currentFile不变。没有打开/切换、保存、参数修改、截图、导出、桌面输入或GPU操作。

已安装版本仍为VRoid2.16.0、mcjo79 Bridge0.15.0，作者源固定 `c7367a548626cbe69e26b533e48fc9ddaf85851e`。Python调用复用 `vroid-bridge-study-v1/call.py`，原完整请求、stdout/stderr和返回在 `requests/`、`read-only/`。原作者工具schema、参考文档及实际C#源码的URL/SHA在 `readback.json` 和 `official-source/sources.json`。工具为MIT，原LICENSE和third-party notices随源码快照保留；免费预设的价格不是额外分发授权，原VRM meta的内部许可边界仍须保留。[原作者固定源](https://github.com/mcjo79/vroid-mcp/tree/c7367a548626cbe69e26b533e48fc9ddaf85851e)

## 当前真实入口

|目的|此次实际读到|最小后续操作与边界|
|---|---|---|
|换原生发型|HairSet查询总匹配37个，限返4个均usable=true/price=0，001的ID为a051cb96c59e4dce033c3223d63829b7642efabf.transferablegroup|apply_preset调用原生LoadAndReplaceTransferableGroup；整发可能替换多个hair分组，之后必须重读全部组，并核非发组未动。未看图，不给001贴风格/审美通过标签。|
|发束形状|当前实际hair_groups为[]|工具能读现有procedural length/hairCount或brush strandIds/points，但当前源没有可调发束组。先套真实原生发型再查，不能凭工具名宣称能修改任意发束或正确新增动态绑定。|
|发色|一个Base材质，Color/ShadeColor/OutlineColor有实际RGBA，Main/Highlight的base键值为null|Color走SetMaterialColorCommand，base:key走SetBaseColorCommand，两者独立。base getter在源中主动返回null，冷开不能用null→null当保存验证，必须核导出material/image。|
|肤色|FaceSkin与BodySkin各7色键，当前Main/Shadow/Highlight等值两组相同|set_color可分别改原生组。若要脸身一致，须明确设置两组同目标并保原shadow/highlight/outline等未选键，核原生导出对RGB/alpha及面部图层的实际范围。|
|虹膜|Iris有左右OverlayColor，当前均棕色，另有material/shade/emission/outline|可选一侧或双侧，须保EyeWhite/EyeHighlight及眼骨位置参数。原生query存在不代表新source的游戏配色或保护已验。|
|唇色|当前无专用Lip组，Mouth有OverlayColor/材质颜色；目录读到26个Lip匹配，返回3个均免费可用|Mouth整体色不能冒充只涂外唇。可另开一次免费原生Lip overlay样件，fresh组/层查询后只改其实际色或层，核唇外范围和牙/口腔。未用Mouth染色假称保护通过。|

发材质查询的两张Main/Highlight纹理尚不可编辑，作者 `Hair.SafeLayers` 返回 `texture is not editable yet` 嵌套error。既有client正确将整次调用记录为失败，没有吞错误；颜色元数据作为部分只读观察保留。`begin_hair_edit` 确实执行原生命令并改变编辑状态，此次没有调用，也未为了让查询成功去开启纹理编辑。后续若需要画层，必须在独立写样件中显式记录这一步。[发材质实现](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/Hair.cs)

## 最低下一样件

建议先做 `next-hair-sample-template.json` 的一个免费整发001预设冷开/导出闭环，源为固定c936b男性原编辑源。这使用现有正常作者资产，未造自拟发束或新身体；001的实际观感须在下一窗口查看。模板不自动执行，路径占位符必须解析为全新唯一文件。

流程已列出具体工具与参数。取得原生窗口后，核ready/clean/已知当前文件→独立保存进入快照→开固定源并另存工作副本→fresh目录核同ID、usable、price0→记录原组→应用预设→重读组/发束/材质→另存→冷开核组与参数→VRM1无减面/不删透明导出→恢复进入快照。任何未知dirty状态、源/preset身份变化、非发组无解释变化或原生失败都保存现场后停止，不付费、不扫预设、不覆写源。

第一次小样只验证预设机制。`color-recipe-template.json` 另存肤色/双虹膜/外唇/发色的实际键与保源流程，不把多种改色混入第一次预设闭环。发材质Color可作为下一次可读回的单颜色机制；其最终颜色、原生图片乘色效果和视觉选择尚未指定。纹理绘制只在原材质颜色不能满足实际需要时另作样件。

新发型可能增删hair骨和spring，使整个VRM获得新SHA。即使Body或衣物几何看似不变，也须重新核原属性、使用骨/祖先rest/IBM、原有表情及衣服实际绑定，不能换成7586或843ac白名单。标准装备拆分、已证源PNG恢复方法和factory可复用入口，不能继承它们的验收结论。

## 已有脸体制作与外观的接缝

本项目已封女性原生局部脸/腰参数保存冷开记录，可继续用同一原生 `set_bone`/`set_blendshape`命令而保作者依赖。此次只在当前男性FaceShape/Chest实际读取参数，未再改脸体。形状参数、颜色、原生发型与表达预览职责不同，`face_preview`只预览，不持久化表达定义。原生颜色修改可能改变导出贴图/材质值，不能沿旧运行时palette的精确纹理SHA准入。[原生参数命令](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/VRoidApi.cs)

`next-hair-sample-template.json` 和 `color-recipe-template.json` 是可解析请求模板。当前值/ID仅对应已记录当前模型，换源或套preset后重新发现，禁止将当前material/group ID写死到所有男女。作者HairShape使用原生procedural/brush命令，骨数/碰撞半径变化仍需导出真实weights/IBM/spring和后续游戏动作检查。[发束实现](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/HairShape.cs)

当前只有只读观察和下一样件准备，未批准8新外观、原生写操作、游戏颜色、任意发型动态或最终视觉。
