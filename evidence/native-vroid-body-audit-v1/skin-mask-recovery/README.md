# 一次原生Tops卸装副本试验：只准备，未执行

源 `.vroid` SHA `311a1bd0c9137a0c5783f9ff818b686ce61f132cd0f88eb63caf408a8a73b4de`，源VRM `78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3`。12个请求在 `assets-source/native-vroid-body-audit-v1/skin-mask-recovery/requests/`。准备脚本不含MCP/网络/编辑器入口，已实际运行，仅生成JSON。

精确Tops `0651673b88702f454523c48963fd21a01d976554.transferablegroup`，BodySkin `2ec0292d87dbddafdb02f024808f653196f02f26.transferablegroup`；Bottoms `6eff397…`、Shoes `34976b3…`、InnerTop `03e242f…`、InnerBottom `d85b621…`及其它组均保留。完整历史数组和请求SHA在 `prepared.json`。它来源于实际女性冷开枚举，不是当前正在打开模型的推测。

执行窗口由root另给；**不要批量自动运行这12份请求**。同一现存2.16 Bridge实例，调用既有`assets-source/vroid-bridge-study-v1/call.py REQUEST RESPONSE`，每次成功再检查后执行下一项；证据输出用本目录新 `run/`，不得覆旧文件。不得使用cache_build、截图或新实例。

1. root先确认当前工作已另存；01 status核ready/当前路径。02主菜单只在该确认后调用，不能根据历史男性保存记录丢弃当前其它工作。男性历史 `.vroid` 实际SHA `c936b24182e8bb9951f94fd0aec91db1995eb73938ff496a0614fccadd3e0e6a`，只证明磁盘文件存在，不证明当前无未保存变更。
2. 03打开固定女性原源，04新枚举。运行 `python assets-source/native-vroid-body-audit-v1/skin-mask-recovery/check_groups.py before RESPONSE`，必须与原冷开全部groups精确相同；源文件SHA仍不变。若不符停止，不推断/替换ID。
3. 05保存全新`generated/female-before-tops-removal.vroid`。所有目标文件事先不存在；06仅原生移除精确Tops，回包removed必须仅该ID且ok=true。07枚举，使用`check_groups.py after RESPONSE`，必须只有该组消失，其余id/type/resource不变。
4. 08另存全新`female-tops-removed.vroid`，不覆盖05或原源。09导出全新VRM1，`delete_transparent:false`、各减面0、material_mode0、texture_mode0、hair_bones0。若工具回warnings，先核实际选项，不当全部生效。此导出配置与原默认配置的实际值也需核对，防止把纹理分辨率变化归因卸装。
5. 10回菜单、11打开08结果、12枚举，`check_groups.py reopened RESPONSE`确认唯一组差异保存成功。记录所有源/输出SHA、meta和原源未变。保持新source身份内部诊断，不注册factory/public。

数值读回范围：沿原audit GLB读取器，按Body材质唯一primitive和实际indices识别引用顶点，比较有向三角/UV/作者N/JOINTS实际骨ID+WEIGHTS、IBM、node rest矩阵和humanoid语义。不拿共用POSITION全9158行差异判断Body改变；导出重排时需精确属性/拓扑可唯一映射，不能最近点补偿。列新增/丢失/改变的raw骨及父关系，特别Tops辅助骨；原130 joints不作恒定前提。Body几何不变而skin joint表缩短仍须报告；旧独立装备不得只改兼容SHA。保裤鞋实际primitive和绑定/材质对照。

沿真实新texture/UV/sampler重读Body三角的同一7bary样本，对比原1514全低于cutoff三角/胸部空间witness和腹髋膝下；保存alpha前后分布、剩余低alpha位置。若UV/拓扑不能精确对应，报告无法直接逐样本比较，不伪造零差。皮肤RGB应来自原生导出/原BodySkin，而不是脚本补色；有原生layer导出时可进一步验证实际肤色来源。InnerTop/Bottom仍在，不能把所有残留alpha都标成裤装mask，不能要求整张atlas全不透明。

本轮停止条件：源SHA变化、非Tops组变化、Body实际几何/绑定意外损坏、MCP任一嵌套错误/超时、目标路径已存在、不能唯一识别Body/骨映射。保持失败，先给因果记录；不自动追加卸装/填色/恢复权重。mask仅部分恢复或辅助骨消失也是真实结果，不为求全通过追加本轮操作。
