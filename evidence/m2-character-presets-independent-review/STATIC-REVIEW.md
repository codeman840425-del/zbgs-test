# A一次选样：独立静态回读与可辨性检查

本报告仅核公开0fb420e5b124/source026ab20上的既有原男女，每体baseline、A（嘴−12%+眼裂宽5%）、B（嘴+12%+眉高及各侧外移3mm+鼻尖2mm）。没有新资源、幅度扫描、B发型适配或新增算子。

实际离线执行qa-m2-preset-plan.mjs：读取固定检出的真实合同/profile和8个recipe文件，6组合沿既有端点及SHA准入。再执行qa-m2-preset-artifacts.py，独立核prototype实际UI下载的6份v5：同体base、palette、发型及颜色、装备完全相同，只存在已申报四域差异；每域hash与真实文件一致。36份图对应的时钟、骨world矩阵、相机、灯光、中性全表达权重同体逐值相同；实际geometry状态等于下载配方，颜色没有被拿来制造本体差异。

6次无localStorage新context真实文件选择读取来自prototype的实际capture脚本及日志，本报告复核记录/执行逻辑，没有冒称另开浏览器重复执行。原男女原始皮肤贴图不同，颜色控制比较在同体baseline/A/B内成立。

已实际查看独立static/内12张三列图（覆盖全部36张），并另看原尺寸male-b房间图：
- A：正面近景嘴收窄可辨；眼裂横向拓宽在并排细看时可见但较弱。侧面大部分轮廓不变。
- B：近景嘴较宽、眉位更高/更外侧更易察觉；鼻尖前移主要从侧面看，仍很细微。未在这些中性静图看到新增裂面、明显眉片悬空或缺件。
- 相同短发下，局部差异仍在，但整体头颌/脸外轮廓相同。不能称年龄、圆脸/长脸库或六名新主播。
- 真实房间镜头的脸部像素很少，本次局部候选难以稳定辨成不同人物。这是保留的实际不足，不因近景有差别就推定游戏尺度可辨。没有据此重新选样或新增算子。

初稿static-2中room为45°FOV，独立读源码发现实际main是36°。已仅补6图room-36并核同pose；最终本报告采用该组，不采用45°作为真实游戏镜头。static-1装备异步兄弟顺序造成按下标回放的QA失败保留，static-2唯一名称双射之后严格元数据门通过，没有改变产品或放宽数值。

正常1×表情/注视/受影响动作仍另行进行，本静态报告不提前判断动态表达兼容，不替用户宣布画风通过。原片和后续工程抽帧也须与连续人工观感区分。

实际读入链经核查为appearance-workbench真实filechooser→readAppearanceRecipeFile→applyAppearanceRecipe→当前controller.actor的facialGeometry.set、appearance.set与setOutfit；这些使用同一foundation-avatar/equipment实例及渲染几何，非UI标记替代。36图还对应actual geometry state与真实渲染结果。当前验证入口都是?workbench=appearance，文件控件依赖该入口初始化。源码中的window.__debug.export/importAppearanceRecipe并无workbench条件；共用apply只依赖record/controller，不读取DOM或localStorage。因此角色能力并非仅UI状态。无workbench入口自动读文件及正式业务消费本轮未实测/未实现，不为此新建场景。v5是特定基模/资源身份下的造型配方，不是永久人物身份、主播库或联网存储。
