# 原生 Hair `base:<colorId>` 针对性诊断样件

上一样件只调用了 `Color/ShadeColor/OutlineColor`，源码核对显示这些键走 `SetMaterialColorCommand`。固定的 `Hair.cs` 还明确列出 `base:<colorId>`，该键走独立的 `SetBaseColorCommand`，并注明它是预设发色叠加。因此本包只做一次主发色 `base:388a671cd6920c61af4172818a056aad61d81f91`，目标仍为 `#3a241e`。

Bridge 保存、冷开和 VRM1 导出均成功，输入模型和编辑状态恢复。CPU 读回显示 139 个 accessor 完全一致，全部21张PNG编码字节完全一致，非缩略图扩展字段一致，冷开后的 base getter 仍为 `null`。导出没有任何HAIR图像或材质差异，样件标记为 `failed-base-color-not-represented`。这说明当前可见的 `SetBaseColorCommand` 调用也没有在此源的导出结果中形成可消费发色。没有继续尝试高光base键、纹理编辑或其它色值。

原始发色失败包与本次不同命令的证据都保留。当前项目不开放发色准入，HairSet001不会继承。下一步如要继续，应先取得原生可编辑Hair texture层的明确状态/官方导出路径，再另开新样件，不在这两个失败包上扫参。

源 `c936b…e0e6a`、进入文件 `2b01…2493ed` 未改。VRoid授权meta未改，仍是内部技术候选。没有runtime/public/catalog/GPU/Git修改。
