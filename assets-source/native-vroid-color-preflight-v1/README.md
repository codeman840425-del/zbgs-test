# 原生男女配色制作预检

本包只读核对女性843ac和男性7586、Bridge0.15与froz已固定实现。`source-inventory.json`保存实际材质、图片、RGBA/RGB像素SHA、UV/索引、消费者和原授权meta。`result.json`区分已有证据、可调用未试和缺失。未调用Studio/MCP、未占GPU、未制作改色资产、未改变运行时准入。此为源制作方检查，尚无独立审查。

实际两体各有14个VRM表达，均无`materialColorBinds`。女性有2个HAIR材质、男性1个，眉毛独立材质。虹膜、眼白和高光各有独立图片。两体的FaceMouth是口腔消费者，未发现独立Lip材质。各材质`textureSlots`列全部已检纹理路由，`imageConsumers`仅列主贴图消费者。整图纯黑白计数不等于瞳孔保护遮罩。

Bridge的`vroid_set_color`使用原生颜色命令。已保存的男性实际查询包含FaceSkin/BodySkin和左右虹膜RGBA。发材质的`base:<id>`走原生BaseColor，其getter主动返回null，不能用两次null证明保存；发材质纹理查询的部分失败原样保留。froz的精确颜色binding与alias检查可辅助识别联动，现有Joy眉毛100→65样件只验证表达定义。两套插件实现固定版本及SHA可从inventory追溯。[Bridge固定源](https://github.com/mcjo79/vroid-mcp/tree/c7367a548626cbe69e26b533e48fc9ddaf85851e) [froz固定源](https://github.com/froz3ncore/VRoid-Character-MCP/tree/6469bd3a6d00fe5fac508d992f63b5a1a783d80e)

官方把面部Overlay、皮肤明暗Gradient Map和发材质颜色分开处理。面部/皮肤校准会烘入导出贴图，头发主色进入主贴图，高光与描边保留shader职责。原生Overlay保留纯黑白，实际瞳孔可能包含其他暗色，因此仍需区域和近景检查。此处描述官方机制，当前两源尚无一次改色导出差异实测。[官方颜色校准](https://vroid.pixiv.help/hc/en-us/articles/4405438979225-I-want-to-know-more-about-Color-Calibration)

发色更改前要读取实际共享材质，保主图、高光、normal、shade和outline关系。眉色独立选择，不能沿旧运行时自动与所有HAIR同染。现有max-channel灰度化会丢弃作者原RGB关系，缺少原生新源的证明。外唇应发现实际Lip图层，不能用口腔整体色替代。[官方发材质制作](https://vroid.pixiv.help/hc/en-us/articles/900005965706-How-to-edit-hair-color-and-texture-material)

843ac/7586均是原生完整VRM加原生卸衣Body PNG的离线派生，没有对应的单一合并`.vroid`。改肤色时，脸身与联动的鼻/眼睑需要相同校准，两个原生来源也要一致，再重建完整Body PNG。否则贴回旧PNG会恢复旧Body RGB。只改虹膜或发色时，也必须实测Body RGB/UV/材质/几何未变才可重用旧PNG。

建议最低下一样件为固定男性c936b源的双虹膜单色修改，计划在`result.json.nextMinimumSample`。使用fresh键和一次明确RGBA，保存冷开、无减面导出，核虹膜变化及眼白/高光/瞳孔保护，再由root做共用加载和近景。色值尚未指定，本包没有执行该计划。肤色、发眉色与外唇各自机制以后逐次验证，不混入第一样件。

两份实际VRM仍为onlyAuthor/personalNonProfit、不可再分发、modification prohibited，未改meta。pixiv预设不是CC0。官方一般素材许可、特殊条款与对外生成/输出工具的单独许可须分别核查，不能用插件MIT许可推导角色素材授权。本包维持内部技术源边界。[官方Guidelines](https://vroid.com/en/studio/guidelines)

重读入口为`python -B assets-source/native-vroid-color-preflight-v1/audit.py`，使用现有NumPy/Pillow与已pin的GLB reader。该脚本以排他创建写清单，已存在时拒绝。重演须在独立检出中先把已有清单移入该检出的archive，再执行同入口，原正式目录不删除或覆盖。它读取当前脚本声明的实际源引用，现有`source-inventory.json`中的SHA代表本次读取时身份。
