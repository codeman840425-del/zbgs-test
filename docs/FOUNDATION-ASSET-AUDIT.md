# 角色基模与生成流程资格审计

核查日期：2026-11-14。范围：普通电脑浏览器优先；二次元主播的脸、五官、发型、身高胖瘦、服装和动作复用。本文是候选证据与工程判断，不是已经通过的画风验收，也不是对第三方条款的个别法律授权。

## 当前决定与边界

负责人已决定先验证 **旧 β Base_Female → Blender 可编辑重建源 → 再导出运行**。这可以避开现有 `avatar.vrm` 胸腹缺面，并保留动漫脸、权重和表情作为起点。它**不是原 `.vroid` 恢复**，没有现成身材参数或通用服装适配系统。尚未批准批量生产。

本次下载和数值检查发生在 `analysis/foundation-asset-research/`，没有替换产品角色。当前角色缺面证据见 `docs/garment-audit.md`。

## 旧 β Base_Female：已取得什么

文件来自 [OpenGameArt 的 VRoid Studio CC0 models 页面](https://opengameart.org/content/vroid-studio-cc0-models)。这是第三方整理者的导出，不能写成 pixiv 原始发布文件。

| 项目 | 实际核查结果 |
|---|---|
| 下载 | https://opengameart.org/sites/default/files/base_female.zip |
| 本地 | `analysis/foundation-asset-research/base_female.zip`，13,149,860 字节 |
| ZIP SHA256 | `bf2717cff70b40a278df56e137dbb699c6499551096fa4c005e9aeca1de68eb3` |
| 内容 | 只有 `Base_Female.vrm`；没有 `.vroid` / `.blend` |
| 格式 | VRM 0.x，两个 mesh：`Face.baked`、`Body.baked`；已有 skin / humanoid 骨骼 |
| 皮肤 | `Body.baked` primitives 0–3，材质 `F00_001_01_Body_00_SKIN`，7,732 个三角面 |
| 面部 | 56 个 morph targets，15 个 VRM 表情组：Neutral、A/I/U/E/O、Blink/L/R、Angry/Fun/Joy/Sorrow/Surprised/Extra |
| 身材 | Body 没有 morph targets；不能把现有口型当成胖瘦/身高参数 |
| 文件声明 | VRM meta 的 `licenseName=CC0`，使用人 Everyone，commercial Allow |

导出者在页面解释：这些 base 由 VRoid Studio 0.14.0 导出，未启用优化；旧 AvatarSample D–G 与当前同名字母样本无关。页面 HTML 已存 `oga-vroid-page.html`。该声明提供来源线索，**尚未与 pixiv 原始 beta 导出逐顶点比对**，嵌入 CC0 字段本身也不是独立版权证明。

几何检查：在 x = −0.08 / 0 / +0.08、y = 0.85 至 1.30 每隔 0.05，沿 Z 射线，30 条射线全部有两个不同深度交点；覆盖了原角色缺面的胸腹区域。y = 0.75 / 0.80 的中间射线无交点，是两腿之间的正常空隙。这支持“中央躯干真实存在”，**没有证明全身封闭流形、无接缝或所有极限姿势合格**。复算：从仓库根运行 `python analysis/foundation-asset-research/audit-base-female.py`，结果在 `base-female-surface/geometry.json`。

下一资格验证应保留此 VRM 原件，导入 Blender 后保存独立 `.blend`，核对网格/权重/UV/表情，再导出 VRM/GLB。中性不透明练功服显示完整身体；脸部另用原材质查看。全身动作、口型、再导出一致性目前尚未由本审计执行。

## VRoid 许可：必须区分三个来源

1. **当前 Studio 的一般内容**：[官方 Guidelines](https://vroid.com/en/studio/guidelines) 将当前基础 mesh、服装 mesh、预设定义为 pixiv 内容，不是 CC0；一般商业利用和外部编辑可行，但第 3 项对可生成或导出组合/变形角色的应用另设限制，个人自用工具例外。原文关键短语为 “generate or output”。所以不能根据网上说法假定“没有导出按钮的游戏捏人必然允许”；游戏内随机拼装也不能自行认定豁免。
2. **当前样本 A–Z**：[样本专门条件](https://vroid.pixiv.help/hc/en-us/articles/4402394424089-VRoidPreset-A-Z) 明确非 CC0，并单独禁止将样本数据用于角色创建服务。这与一般商用展示许可是不同条件。
3. **明确指定的旧 β 样本**：[旧 New model](https://vroid.pixiv.help/hc/en-us/articles/900000088126-New-model) 和 [β AvatarSample_1](https://vroid.pixiv.help/hc/en-us/articles/360012381793) 官方专门页面确实声明 CC0，后者关键原文 “The CC license* for this model is CC0.”。不能将当前样本的非 CC0 推广到所有历史文件；也不能把旧 CC0 推广到后来加入的稳定版网格、服装和第三方素材。

**工程判断（不是官方单独答复）：** 对身份可核对的旧 CC0 文件，保存历史来源和许可，用 Blender 编辑其既有几何，且不加入当前 VRoid 预设，是比把当前 Studio 内容用于公开角色生成器更明确的资产路径。[CC0 正文](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en) 的权利放弃及后备许可不等于软件使用条款、商标、第三方内容也全部无约束。未找到官方页面明确说“任一旧 beta 模型在任意后续 Studio 工作流都不受生成应用条款影响”，因此不作此承诺。

官方 beta 编辑器仍可取得：[旧版本页](https://vroid.com/en/studio/releases) 列出 [0.14.0 Windows ZIP](https://download.vroid.com/dist/VRoidStudio-v0.14.0-win.zip)；[官方停服公告](https://vroid.com/en/news/6PP2aLe6PwGWJ3rLE4JJSM) 说明 2024-10-31 停止支持，仅保留 0.14.0 下载。本审计未安装它、未声称已取得官方 `.vroid`，也未确认其内部操作可无人值守。没有核实到官方稳定 CLI/脚本接口，不能把 GUI 自动点击写成已稳定生产 API。

## 其他候选与具体可取得文件

| 候选 | 文件、许可与自动化证据 | 与本项目的差距 / 决策地位 |
|---|---|---|
| MPFB / MakeHuman | 官方仓库含 `src/mpfb/data/3dobjs/base.obj`、targets、rig/weights、Python；核心资产 CC0，代码 GPLv3。官方 FAQ 明确允许用其资产做自己的角色生成器。可在 Blender 保存 `.blend`、参数 JSON/MHM、导出游戏 mesh。 | 参数化体型与衣服重适配流程最完整的备选，但默认偏写实，不自动等于二次元合格。未在本机运行；不能当正式画风决定。 |
| MB-Lab | `data/humanoid_library.blend` 17,680,712 字节；anime morph 数据；`data/expressions_comb/anime_expressions/phoneme_*.json` 等现成口型/表情。Python 可控制随机/参数/导出。 | 官方许可文档明确数据库及生成模型 AGPL3，不是 CC0；需要相应分发安排。仓库已归档，README 标 1.8.1 最终版、Blender 4.0、BVH 导入问题。不是本轮首选。 |
| CharMorph | 可递归获取代码和独立角色数据库；代码 GPL，角色各自许可。官方文档列 Vitruvian CC0、MB-Lab AGPL、其他 CC-BY。 | 继任工具不自动清除原 MB-Lab 资产许可；当前没有已验证即用的二次元完整样板。 |
| Amarillo Blender-chan Free | 作者页给 CC0、23 MB `.blend`、56 kB `rig_tools_3.73.26.zip`；脸有 shape keys，身体用 Auto-Rig Pro，免费文件可下载。 | 作者明确免费版删减，去衣并非完整版本；几何节点毛发重且着色依赖 Blender compositor。未下载，不能替换为完整练功服基模。 |
| Generic Anime Face / Barely_Banquo | 作者 OGA 页，CC0，`animefaceshare.blend` 1.1 MB，有表情 shape keys，眼球有 rig/shrinkwrap。 | 只有头；作者指出后脑 morph 抖动。可作自建脸参考，不是现成完整人物。 |
| Quaternius Universal Base Characters | 官方 CC0，6 种比例、20 发型、humanoid rig，支持 UAL。 | 官方明确 rigged `.blend` 属于 Source 层；免费 Standard 只含部分模型的 OBJ/FBX/glTF。不能看到页首 Blend 就声称免费可取全部源。脸/口型 shape keys 本次未核实。 |
| Blender Studio Rain | 官方 v1 页面给 CC-BY 和 Blender rig；存在可编辑文件/面部 rig 的公开工作流。 | 风格不是目标二次元生成器，体型随机化要新做；当前主下载页请求返回 402，本次未取得文件，不作为已通过下载候选。 |

以上参考：[MPFB 许可](https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md)、[允许自建生成器](https://static.makehumancommunity.org/mpfb/faq/build_other_chargen.html)、[MB-Lab 许可](https://mb-lab-docs.readthedocs.io/en/latest/license.html)、[MB-Lab 仓库](https://github.com/animate1978/MB-Lab)、[CharMorph 分项许可](https://charmorph-docs.readthedocs.io/en/main/Introduction.html)、[Blender-chan 作者](https://amarilloarts.itch.io/blender-chan)、[Anime Face 作者](https://opengameart.org/content/generic-anime-face)、[Quaternius 官方](https://quaternius.com/packs/universalbasecharacters.html)、[Rain 官方 v1](https://studio.blender.org/characters/rain/v1/)。

## MPFB 可编辑流程的证据及可用边界

已保存官方仓库树，核查 commit `9de0707fdc88438d7c53a1a2ac7937d9221e2431`。具体源码 `src/mpfb/services/humanservice.py` / 文档 `docs/services/humanservice.md` 提供创建人体、目标形变、骨架、衣物、JSON/MHM 保存恢复及 refit；随机生成部分有 seed、范围配置、批量操作。`base.obj` 不是被衣服裁掉的某个成品角色，但是否完成目标二次元样板仍需实际导出验收。

官方推荐 [Blender extension MPFB](https://extensions.blender.org/add-ons/mpfb/)；[下载说明](https://static.makehumancommunity.org/mpfb/downloads.html) 指出资产包另外获取。[visemes01.zip](https://files2.makehumancommunity.org/functional/visemes01.zip) 是约 0.2 MB 的 Microsoft 风格口型 targets；[口型文档](https://static.makehumancommunity.org/mpfb/docs/lipsync.html) 描述相关包与 shape-key 驱动，非已经实现浏览器中文语音同步。第三方衣服包应逐项查看许可。

自动化应直接调用锁定版本的 Blender Python / MPFB service，保存参数与结果；不需要先建立 MCP。[官方 MCP FAQ](https://static.makehumancommunity.org/mpfb/faq/ai_use_mcp.html) 明确 MPFB 本身不带 MCP，外部桥接可调用脚本。不能以某个 MCP 仓库存在替代生产流程验证。

## 进入下一阶段的门槛

1. Base_Female 原文件哈希、许可证链、导入后的 `.blend` 和导出文件一同留档；对比脸、UV、权重、56 个面部 morph 与实际口型。
2. 不透明练功服下确认胸腹、臀盆、肩腋、胯腿连续；走路、坐下、侧弯、抬腿检查完整动作，不能只看 T-pose。
3. 再制作一个小范围身材参数实验：同衣同动作的短/高与瘦/较胖版本，验证骨架随体型调整、衣服跟随及表情不坏。原 VRM 没有这些参数，必须计入制作工作。
4. 通过上述门槛后再判断是继续自建 Blender 动漫母体，还是借用 MPFB 的变形/衣服适配方法。不能把写实 MPFB 成功自动作为动漫画风通过。

本次状态：来源/许可调查与旧 beta 躯干数值检查完成；Blender 重建、实机完整预览、服装泛化和角色生成应用最终许可判断未完成。本次没有付费、注册、联系第三方或修改产品源。
