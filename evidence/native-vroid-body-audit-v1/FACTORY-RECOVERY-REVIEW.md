# 原生皮肤恢复与工厂最小接缝

2026-11-17，仅 CPU/源码研究及请求准备。未调用编辑器、生成新 VRM、修改原源或运行时。旧 body audit 的 manifest 和失败不变。

## 已证事实与仍待验证的原因

女78912a7…/男a18a2d1…的 Body 都有10022个实际引用三角；胸部存在实际 alpha=0 的皮肤样本。Body材质为MASK/.5，LINEAR采样共11118/70154样本低于cutoff。`delete_transparent=false`保存了几何，**没有恢复皮肤可见性**。原像素alpha、mesh.visible和程序索引遮罩是三个不同机制。灰色不透明材质只证明几何存在，不能当作皮肤完成。实际数值见本目录原 `focus-readback.json`；并非证明整身封闭或所有像素均已查完。

官方稳定版的Skin Masks属于各件服装，黑色遮皮肤、白色保留；预设服装会自动应用自己的遮罩，Body编辑页的原皮肤仍保持完整。因此应在原生项目移除责任衣物/调整原生遮罩后再导出，不能在导出PNG上填肤色或强改alpha。当前胸部形状与此机制一致，但**尚未读取当前项目的具体mask层，因果仍须副本卸上衣验证**。[官方稳定版 Skin Masks](https://vroid.pixiv.help/hc/en-us/articles/4405516267033-How-to-use-Skin-Masks)

## 已有作者实现能做什么

固定mcjo79 `c7367a548626cbe69e26b533e48fc9ddaf85851e`：`Presets.Remove`枚举active leaf groups，以精确ID或类型后缀选中，逐项调用原生`RemoveTransferableGroupAndChildren`，返回`{ok:true,removed:[ids]}`。`vroid_remove_item`只需`group`；本次必须传实际ID，不传`Tops`广删。`vroid_save(path)`、回菜单、`vroid_open(path)`和原生VRM导出均为现有接口。它没有专用SkinMask开关或通用layer visibility setter；`Textures.Layers`只枚举实际可编辑raster，不能由其存在推断mask一定可写。[Remove源码](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/Presets.cs)、[纹理源码](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/Textures.cs)、[工具schema](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/mcp_server/vroid_mcp.py)

固定froz3ncore `6469bd3a6d00fe5fac508d992f63b5a1a783d80e`：`set_texture_layer_state`支持原生raster可见性/opacity，核expected_model、region、精确layer和metadata摘要，要求当前matching texture editor canvas，调用`CreateModifyVisibilityCommand`，不改PNG。当前本机单表达后端已跑通，不等于SkinMask层已跑通；若mask不在枚举raster中，此接口不能冒认可用。作者`clean_native_clothing.py`确有原生移除指定衣物、保留其它类别/参数、另存、冷开核验流程；借用该流程，不借其角色资产或默认删衣列表。[layer-state源码](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/vroid_mcp/texture_layer_state.py)、[native命令](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/agent/textures.js)、[作者保存/重开流程](https://github.com/froz3ncore/VRoid-Character-MCP/blob/6469bd3a6d00fe5fac508d992f63b5a1a783d80e/pipeline/cosmetics-textures-v04/tools/clean_native_clothing.py)

这些是第三方MIT实现，非pixiv官方API保证；代码许可不替代原生素材/角色许可。沿既有内部技术样件权限，不新增资产许可结论。

## 唯一下一小试验

先用已运行Bridge在女性源副本**只移除一个精确Tops组**，保Bottoms/Shoes/InnerTop/InnerBottom及所有其它组，保存新.vroid，原生VRM1导出并冷开。具体12份请求与逐步停止条件在 `skin-mask-recovery/README.md`，状态为prepared-not-executed。不启动第二实例，不占当前GPU/编辑器窗口。

真实历史枚举还包含InnerTop和InnerBottom。因此只脱上衣可能只恢复一部分皮肤；残留胸部mask不能自动归因裤装，也不能自动追加脱内衣。先报告mask变化的空间/UV分布，以及原Body实际使用顶点和绑定是否保持。上衣辅助骨可能随移除消失，原130 joint和旧装备IBM不能预设仍有效。此试验若证明原生皮肤能恢复但骨架变化，则下一接缝是保辅助骨/原生mask层切换与重建装备绑定；不是篡改compatibleSHA。

## 工厂最少数据/代码接缝（建议，未实施）

| 当前精确位置 | 最小处理 |
|---|---|
| `prototype/src/foundation-profiles.js`末尾`foundationProfile()`固定index0为pants | 增加可选`defaultOutfit:{role:'shorts',label:...,equipmentRoles:['top','shorts','shoes'],bottomRole:'shorts'}`，旧profile缺字段仍原pants。显式默认后不能又按ids.shorts生成重复role；从同一份实际outfit列表校验。`outfit-selection.js:3–22`已有shorts/角色校验可复用，不把短裤挂名pants。 |
| 同profile的既有`id/url/sha256/manifestUrl/ids/sourceFloorY` | 新源必须新身份与自身top/shorts/shoes绑定。新鞋底实测；seat/contact/eye/palette等不继承旧男女默认准入。最初只允许original外观和已实证组合。 |
| `foundation-avatar.js:87–115`加载身份；`m1-equipment.js:34–52`收集源部件 | 新增一个`baseSkinEvidence:{url,sha256}`引用当前avatarSHA的恢复读回，包含仍生效native mask、验证覆盖区域、局限及基础模式可用性；未知/仍有应暴露区域mask时拒绝“完整基础模式”。本次Tops副本不是自动获得该资格。若未来选择完全无内嵌衣物源，再加明确`embeddedClothing:'none'`策略绕过**仅**sourceClothes非空检查，Body仍必须存在；当前保裤鞋副本暂不需要此字段。 |
| `m1-equipment.js:70,152,165–175` | debug/basic只留鞋；隐藏sourceClothes、恢复Body索引仍不会恢复PNG alpha。不能据coverage关闭宣称完整皮肤。把上述新source evidence准入放在该模式开放前。 |
| `body-coverage.js:79–119` | 保现有descriptor合同；按新Body实际tri生成每件装备自己的coverage，经`bodyCoverage`或`additionalBodyCoverage:[{role,descriptor}]`绑定。已有avatarSHA/itemSHA/material/indexSHA/faceIDs三元组严格核验足够，不新增第二套alpha运行时遮罩框架。没有需要的索引mask就不配置；不能复制旧索引或用全opaque替代。 |

必须拒绝：新源冒用78912旧绑定、仅更换装备compatibleSHA、Body整accessor变化就判皮肤变形（它共享衣物顶点）、把导出器重排节点编号当骨架变化、把Body atlas所有透明像素一律视为缺陷、未核mask便开放基础模式、未核新几何/贴图便宣称换覆盖装备无缺体。每件覆盖装备仍需实际穿着和恢复验证；皮肤恢复不证明无穿模。

当前运行时的完整源码SHA将另存本子包`runtime-source-pins.json`；行号是此刻读码定位，不锁并发集成。此报告不更新能力清单为通过。
