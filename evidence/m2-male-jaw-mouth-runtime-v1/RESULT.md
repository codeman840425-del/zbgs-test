# 男性下颌嘴宽唯一端点接入

实现已冻结，未构建/发布/执行GPU。原male-jaw基体 SHA `25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153`；新配方 e953cb663484bbf999064110e21b86c43e73db20cb7de2a49a1138a03a2c51d1。源 manifest `2f21ca0ef33db35892b7fee150ff030eb1f15cd6ba8c34da7527ce93cbc0cccd` 已由来源作者冻结；installer 核该包登记、真实parent/final bytes，复制原recipe与recipe-manifest，不重写源。安装manifest84c0a5f6f24c1b6870ebfe75ac96d34348913c2a77d075d4d1d8539a43ea2857。

配置放 facial-geometry-profiles.js，按实际 SHA lookup。原男女保留mouth连续±.04和已核眉鼻眼端点；新jaw只mouthSupportedValues=[0,.04]，mouthRange=[0,.04]仅边界。brow/nose/eyeAvailable分别false，不从mouth available继承。0与+4使用同原底、同normal函数，仅按源选择既有Float64中间累计，未复制controller或normal算法。新jaw prepare还核原normal、54 POSITION delta hash与496法线邻域。UI是离散select，原男女数框不变；v4文件按实际支持值拒2%和负值。reset恢复原geometry引用。

## 实际CPU结果

- final-cpu/report.json：12项，真实jaw2056点/9primitive/54表达及源final VRM；POSITION max1.863nm、全shape绝对POSITION7.451nm、basis NORMAL4.098e-7、全shape绝对NORMAL8.598e-6，沿原3e-7m /1e-5门。保护点、法线邻域外、两actor、零恢复、pending reset/dispose、坏base/position/normal/morph/expectedRecipe/manifest pin/资源字节、v4文件恢复都通过。
- original-byte-equivalence/report.json：原F/M各±4%、0，眼鼻眉全关/全开，共12组合；实际POSITION/NORMAL及全部morph缓冲与HEAD旧模块逐字节一致。旧模块原字节已保存，非只比较误差阈值。
- legacy-original-bases/runtime-check.json：旧三域源对照与错误/生命周期检查通过。该复用脚本仅修改输出路径，原冻结证据未覆写。
- original-bases/runtime-check.json：原F/M共24四域组合及错误路径通过（此时runtime为同配置拆表前实现；与最终功能等价，不能当最终module SHA）。最终额外有上面的旧新逐字节检查。

测试fixture使用真实GLB属性/实际模块和设备getter；颜色、controller、File/HTTP、prepareRender为可控CPU替身。没有GPU视觉通过结论。source相邻法线与原静态作者法线有显著差异（源报告Basis46.136°/所有表达166.473°），必须实际带纹理/表情近看。

复跑：`node scripts/install-male-jaw-mouth-workbench.mjs --verify`；`node scripts/m2-male-jaw-mouth-runtime-check.mjs --out NEW_DIR`。旧新字节比较原执行以当时HEAD旧模块为基准，已保存原字节；当前复跑入口 `node scripts/m2-male-jaw-mouth-original-check.mjs --out NEW_DIR` 默认读该冻结baseline，也可显式--baseline指定文件，不再读取未来HEAD。

## 用户路径待验

新候选（尚未build）`/?workbench=appearance&body=m2-male-jaw-v1`：原位/+4下拉、其他三域禁用；保存/文件导出读取应保此实际身份，不能读成原male。final-cpu/male-jaw-mouth04.recipe.json为可用单配方fixture。原F/M切回应恢复数框及各已准入端点。

并入根指定UI小修：“重置位置与动作”保留main原onclick（1899），工作台在加载后bind（2195）新增后置listener只调用既有camera，恢复当前inspect/room及按钮，不重复reset；提示速度回默认。相机/动作/位置实际交互由QA验证。异body错误改人类素材版本用语，不显示SHA。眼部084/live/公开指针均未改。
