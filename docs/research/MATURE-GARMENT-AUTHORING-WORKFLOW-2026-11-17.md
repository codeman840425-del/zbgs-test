# 成熟服装跨体型制作流程核查

2026-11-17。本轮只读官方文档、原作者范例及源码，并复用已有生产研究。continuous-garment-fit试验已中断，其scripts及assets-source目录均未创建，求值与导出均为零。已封衣物归因包保持原样。本轮唯一产物为本文，工具安装、角色生成和运行时代码更改均为零。

## 选型结论

成熟流程把**衣服版型制作、适配关系、蒙皮修正和动作检查**分别作为制作工作。VRoid提供骨缩放粗适配及已有形态/骨调整，MPFB依赖作者做好的helper、服装网格及MHCLO，Blender提供绑定和修形工具。现有官方证据支持复用这些生产步骤，仍需由agent承担衣片选择、语义分区、源形和权重检查。任意人体、任意衣物自动获得合理轮廓的能力仍缺证。

建议下一项先复现MPFB原作者完整人物导出范例，核实服装确实加载、适配和导出，再决定当前VRM所需的语义衣片/版型接入。当前共享连续场试验保持停止，工具API可调用不能替代一遍原作者生产闭环。

## 版本、输入和许可

| 工具 | 本轮实际核到的身份 | 输入及使用边界 |
|---|---|---|
| VRoid Studio dress-up | 功能在v2.0.0于2024-11-28正式发布。本次官网Windows下载链接指向v2.16.0，未获取或安装该EXE | 导入VRM/.vroid/XAvatar作为基模，服装输入为XWear。VRoid编辑页中的Outfit模板、服装参数与dress-up属于不同制作阶段 |
| XWear Packager | 官方VPM索引最高列0.3.4，包SHA256为`8afba437bbc4d269340b11786edc3d6f69cfd73374ff2b796d67ab97fecf4242`，仅读取索引 | 官方安装指南列Unity2022.3.22f1与VRChat SDK Avatars3.7.1以上。转换需准备已有服装GameObject/骨架/材质 |
| Blender | 项目已有4.5.9，记录build `8bf95cbd38d1`、EXE SHA `42c096b04d79bd0ff234429f67178881047c1c370d25ad3aef2766f3eeac4024`。本轮核v4.5.9官方modifier源及4.5手册 | 源网格、rest形、衣片、绑定目标/笼、顶点组和Armature由作者提供。此前cage失败记录继续保留 |
| MPFB | 官方发行页列2.0.18，2026-10-10发布。代码核读固定`9de0707fdc88438d7c53a1a2ac7937d9221e2431` | 原生MakeHuman/MPFB基模及helper、已制作衣物、原MHCLO适配关系。当前VRM的直接兼容尚待独立接入 |

上表版本来自当前官方入口和项目既有工具pin。VRoid安装版本、自动化入口和本机MPFB安装可用性仍未实测。[VRoid正式发布说明](https://vroid.com/en/news/26gn98sTuPJQ53LxDQRyFg)、[当前Studio下载页](https://vroid.com/en/studio)、[官方XWear索引](https://download.vroid.com/dist/VRoidVpm/vpm.json)、[XWear安装要求](https://vroid.pixiv.help/hc/en-us/articles/38903414455449-How-to-install-the-XWear-Packager)、[MPFB发行页](https://static.makehumancommunity.org/mpfb/releases/release_2018.html)

VRoid预设网格和服装由pixiv保留权利，官方指南允许无特别条款的内容用于商业作品，并对可生成/输出模型的应用列有单独条款及自用例外。每个第三方服装仍需核其自身授权。XWear Packager适用pixiv软件条款，开源代码再分发许可尚无依据。Blender所核三个modifier源均标GPL-2.0-or-later。MPFB代码GPLv3，所声明bundled图形资产CC0，作者说明脚本调用所得输出归用户处理，第三方asset包仍逐项核许可。[VRoid内容及应用指南](https://vroid.com/en/studio/guidelines)、[XWear软件条款](https://vroid.notion.site/XWear-Packager-Software-Terms-of-Use-1298d0cd82ea807f9562fc54e918cf22?pvs=25)、[固定MPFB许可](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/LICENSE.md)

## VRoid实际制作链

先在VRoid编辑页选Outfit模板、制作纹理及衣物轮廓。官方允许组合多模板形成所需外形。现有服装可以单件或整套导成XWear，再在dress-up中给另一基模穿着。Face/Hair/Body类自定义项及Body类贴图的导出限制需分别处理，身体涂色袜不能据此自动变成独立服装。[模板制作入口](https://vroid.com/en/studio)、[VRoid服装转XWear](https://vroid.pixiv.help/hc/en-us/articles/38729525846809-How-to-convert-costumes-and-accessories-made-in-VRoid-Studio-to-XWear)

XWear服装自动适配基于Humanoid骨缩放，hips映射是启用条件。用户可选保持衣形、按胸背宽贴体或保持原尺寸。官方完整顺序是导入基模及衣服、粗自动适配、处理遮挡、调整已有blend shapes与服装骨，再检查动画。其中形态修正需要资产本身已有相应blend shape，骨操纵需要作者检查结果。[XWear定义](https://vroid.pixiv.help/hc/en-us/articles/39513229598233-What-is-XWear)、[官方穿衣流程](https://vroid.pixiv.help/hc/en-us/articles/38722733769241-Getting-Started-with-the-Dress-up-Feature-for-those-who-want-to-dress-up-their-characters)

遮挡处理支持删除与恢复网格，XRoid保存可逆的服装修改。对当前男腋下白袖与深背心自交，还需要衣片形状和姿态适配的证据，隐藏Body无法解决两块可见衣面的次序。对女腹前裤层，只有确实处于外衣内部的区域才适合制作遮挡数据，先记录原层间关系与卸装恢复。此处是结合本项目归因的判断。

VRChat服装需先在Unity中准备数据，通过Packager设置为costume、核警告、填写授权信息并导XWear。它消费已制作的服装与骨架。dress-up最终导出为整个人物VRM1.0，原VRM0节点、材质分组、skin及索引身份是否保留需回读。预览SpringBone和Unity PhysBone可能有差异，动作检查还要回到目标游戏。[服装转换步骤](https://vroid.pixiv.help/hc/en-us/articles/38730429718041-How-do-I-make-a-VRChat-costume-or-accessory-compatible-with-the-dress-up-feature-XWear-conversion)、[VRM导出范围](https://vroid.pixiv.help/hc/en-us/articles/38726063278233-How-do-I-export-a-model-as-VRM)、[动画预览说明](https://vroid.pixiv.help/hc/en-us/articles/38722733769241-Getting-Started-with-the-Dress-up-Feature-for-those-who-want-to-dress-up-their-characters)

## Blender作者工具承担的步骤

| 工具 | 官方实际作用 | 作者仍要制作/决定的内容 | 当前两问题的对应位置 |
|---|---|---|---|
| Surface Deform | 将已绑目标表面的变化传给衣网格，保存绑定权重与沿新表面法向恢复的normal_dist | rest衣形、合适的目标或代理面、衣片影响组、接缝关系。目标须满足流形边/有效面等要求，偏离目标过远会失真 | 男腋下先确定袖根与躯干的合理目标域。女上衣先有合理下摆外形，再传体型变化 |
| Corrective Smooth | 根据rest参考进行delta-mush式修正，通常放在Armature之后减少关节附近畸变，可用顶点组及边界保护 | 合理rest形、影响权重和modifier顺序。原手册明确有体积损失风险 | 可研究腋部折皱修正，衣面层次和版型意图仍需另验 |
| Mesh Deform | 用作者制作的闭合笼绑定网格，支持顶点组/Dynamic | 合理分区笼及控制目标。大幅变化仍可有伪影，绑定有时间/内存成本 | 可控制胸身、袖根及下摆，但整圈笼/错误控制域仍会将局部意图传播到远处 |

上述是官方工具的职责，自动版型设计、任意衣物无交、正确骨权重和实时布料效果仍需制作证据。Surface Deform手册的原例是把布料代理模拟传给较详细网格，Corrective Smooth原例对比Armature及追加修正的关节形态。[Surface Deform手册](https://docs.blender.org/manual/en/latest/modeling/modifiers/deform/surface_deform.html)、[Corrective Smooth手册](https://docs.blender.org/manual/en/4.5/modeling/modifiers/deform/corrective_smooth.html)、[Mesh Deform手册](https://docs.blender.org/manual/en/3.6/modeling/modifiers/deform/mesh_deform.html)

源码实读确认Surface Deform的`bindVert`保存normal_dist、`deformVert`按当下法向恢复，Corrective Smooth的`calc_deltas`缓存rest与平滑形之差并在求值时恢复局部细节，Mesh Deform消费bind influence/cage变化。它们复用作者资产及绑定信息。原材料接缝、UV、作者着色法线、骨权重及表达导出需要生产端继续核验。[v4.5.9 Surface Deform](https://github.com/blender/blender/blob/v4.5.9/source/blender/modifiers/intern/MOD_surfacedeform.cc)、[v4.5.9 Corrective Smooth](https://github.com/blender/blender/blob/v4.5.9/source/blender/modifiers/intern/MOD_correctivesmooth.cc)、[v4.5.9 Mesh Deform](https://github.com/blender/blender/blob/v4.5.9/source/blender/modifiers/intern/MOD_meshdeform.cc)

姿态后的修正还需解决游戏消费。glTF动画支持对象、骨变换及shape key值，其他物理等属性会被忽略。单次静态Apply无法自动保留任意姿态下的Corrective Smooth行为，形态/蒙皮/可导出的修正形或其他目标端机制需要明示接入。[官方glTF动画范围](https://docs.blender.org/manual/it/4.5/addons/import_export/scene_gltf2.html)

## MPFB原作者衣物实例

官方“Creating clothes”从helper-tights提取网格，作者删除多余部分形成基础shirt，制作材质和纹理，填UUID/作者/许可，再执行check、store in library，随后在其他人物上加载。这份范例把衣物建模列为明确工作。当前文档允许全三角或全四边面，要求每个点被面引用并属于一个制作分组。这里的制作分组需要与多骨蒙皮权重分别管理。[官方基础上衣范例](https://static.makehumancommunity.org/mpfb/docs/assets/creating_clothes.html)

MakeHuman原作者旧指南专门讨论错误匹配导致的畸变，要求选合适helper、限定相同分组的候选人体点，并提示helper轮廓与衣缝可能不一致。衣服远离目标及匹配到皮肤凹隙时，仍需作者调整来源域。它支持“先制作衣片关系，再运行适配”的流程判断。旧文档的全quad/单材质要求属于历史版本，当前MPFB限制以上一段及本次固定源码为准。[作者对错误适配与分组的说明](https://static.makehumancommunity.org/assets/creatingassets/makeclothes/clothes.html)

MPFB保存`.mhclo`适配数据、`.obj`网格及`.mhmat`材质。形体改变后使用refit assets或auto refit更新资产。骨架应在穿衣前准备，服装权重传递和可选作者权重修正另有流程。当前实现使用三源点、权重及分轴缩放offset，详细源码审查由并行只读任务负责。它依赖原生基模/helpers身份，当前原男女VRM尚缺这层对应。[当前MakeClothes流程](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/docs/ui/create_assets/makeclothes.md)、[形体改变后的refit](https://static.makehumancommunity.org/mpfb/faq/clothes_do_not_fit.html)、[资产蒙皮制作](https://static.makehumancommunity.org/mpfb/docs/rigging_mesh_assets.html)

## 当前缺陷应在哪一步处理

| 当前证据 | 制作链中需要处理的工作 | 仍需实测的边界 |
|---|---|---|
| 壮硕男同Top白袖/navy在共同idle新增自交，邻点donor跨手臂/躯干 | 先核原版袖根/躯干衣片及代理对应，再核肩腋姿态的权重与修正形。可复用作者分组、Surface Deform或已有资产形态 | 分组/绑定后是否仍自交、修正是否压坏袖口、是否能导出并适用于正常动作 |
| 女上衣下摆/上腰宽比从1.422变1.605，裤层仍有前出 | 先明确源上衣剪影和余量，制作体型适配版型或修正形，另定义外衣/裤腰关系及可逆遮挡 | 自动缩放或表面绑定是否保所需下摆，坐起时各层顺序是否稳定 |

这两项推论基于`evidence/m2-preset-garment-cause-v1/REVIEW.md`，相应source、tri/vertex和既有实际截图均已pin。下一步制作必须保存原样与修正数据，agent承担专业操作，用户继续负责方向与正常预览。

## 建议先由agent执行一遍原作者闭环

下一实施任务可固定MPFB上述commit，依官方要求准备隔离Blender配置及`makehuman_system_assets`，先运行原作者`script_samples/10_complete_character_export_fbx.py`。它实际创建原生人物、GAMEENGINE皮肤、game_engine rig，加载眼/牙/发和`female_casualsuit01.mhclo`，创建独立export copy并导FBX。已有成熟服务负责拟合与权重，第一遍保留原范例设置。[固定原作者完整范例](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/script_samples/10_complete_character_export_fbx.py)

这次复现应保存原生`.blend`、实际载入资产/许可/SHA、MHCLO与材质引用、原版全身/袖根/下摆视图，以及FBX回读中的服装对象、骨权重和材质。脚本对部分缺失资产仅打印skip，因此必须核实casualsuit确实存在。该范例关闭动画烘焙，着色节点转换也由作者注明best-effort。缺衣物、导出缺材质或回读对象错误时保留失败，不能仅凭脚本退出0认定闭环完成。

原版完整范例成功后，才另立有界任务用同一原生服装做一次内置体型变化与refit，实看袖根/下摆及一次手臂姿态。制作新衣物时再照官方basic-shirt流程建立helper、版型和MHCLO，并记录agent做过的选择。当前VRM接入、八体兼容及游戏动作验收继续独立承担。

本轮未执行上述范例。官方Blender手册直连有402/403读取限制，已用官方索引内容及固定v4.5.9原源码交叉核读，未采用论坛经验替代结论。既有`GARMENT-AUTHORING-FEASIBILITY-2026-11-15.md`及`REPRESENTATIVE-SHAPE-PIPELINE-OPTIONS-2026-11-16.md`继续作为历史研究，本次补充的是实际作者流程与人工工作边界。
