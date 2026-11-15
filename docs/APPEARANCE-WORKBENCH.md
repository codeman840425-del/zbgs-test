# 外观与动作工作台（受限样件）

当前固定入口由 `delivery/appearance-workbench.json` 指定，本机端口4196，入口 `/?workbench=appearance`。旧M1接受基础4195保留。能力状态只见CAPABILITIES；不能把此工作台称为完整捏人或正式主播存档系统。

## 观看与操作

- 顶部女性/男性为独立基模选择按钮；组内“当前样件”只列原版及已制作的下颌/腰胯几何样件。它们不是不同身份的主播。切换在同一页面异步完成，保持视角、配色、暂停、播放倍率；原动作结束。坐姿更换身体回到椅前站位，需重新入座检查接触。
- 外观页：发型、发色、肤色、瞳色、唇色与服装。原女性可选无发、齐颈侧后短发，原男性可选无发、偏侧蓬松短发；派生体暂只原发。不兼容发型/版型明确提示回退，不把旧身体适配传给新身体。
- 动作页：基础移动、速度与路径、坐起，直播讲话/表情/麦克风/眼镜，舞蹈。原男女可播放封存30秒原舞和唯一一次优化版；派生身体不在其精确适配范围。动作轨道未再修改。
- 检查页：基础身体/服装、修正分层、骨骼接触点、动态、双实例和现有完整链。暂停/停止与脸/半身/全身、正/侧/背及房间镜头常驻，不必切页找它们。
- 外观恢复只还原发型/配色，不改变几何样件、服装或镜头。发色默认同步眉色；瞳色只染虹膜，保留黑瞳孔、高光、眼白；唇色只染外唇，不染牙齿和口腔。

当前候选为两件刚性head挂接短发，不等于长发动态已完成。发型、脸型及肤色仍待用户观感确认，耳侧贴合和冻结裙/舞瑕疵保留。色彩不是几何编辑。基础人体模式默认无发，回到穿衣模式恢复已选发型。外观页的“面部几何”目前仅原男女嘴宽−4%～+4%，修改Basis及全部口型表情，单项复位还原原几何。眉部位置对照仅原位与“上移1mm、两侧各外移1mm”一个组合样件，不能当连续范围通过；眼鼻等未提供假控件。

“保存当前外观/恢复已保存外观”使用此浏览器的本机草稿，按当前基模分开；保存发型/色彩/嘴宽/眉样件/装备及版本，关页重开或切回该基模自动恢复已保存结果。不保存动作/镜头，也不是主播账号或云存档。版本不符明确拒绝，加载中收到新请求时保留新意图。首次几何编辑仍有约315–328ms长帧（开发机无录制），普通电脑未测。

## 生产与重新构建

1. `node scripts/install-hairstyle-workbench.mjs --verify`：核男女源GLB/清单和精确身体SHA；不加参数则按冻结源安装，已有不同文件拒绝覆盖。新增发型通过catalog及适配清单准入，不修改人物行走控制器。
2. `node scripts/install-facial-palette-workbench.mjs --verify`：校验五具已适配身体与男女各自虹膜/外唇遮罩。源处理见 `scripts/appearance-color-v1/build-masks.py`，来源/UV/mask边界在 `assets-source/appearance-color-v1/README.md`。
3. 发型可编辑源与生成参数分别在 `assets-source/m2-hairstyle-v1`、`assets-source/m2-male-hairstyle-v1`，脚本在同名scripts目录；按各自README重新生成/导出，不能拿新输出冒充旧SHA。
4. `node scripts/install-frozen-dance-workbench.mjs --verify`：核四个封存目标文件，不重新生成/优化动作。原真人视频和供应商FBX不作为公开商用素材包。
5. `node scripts/install-face-parameters-workbench.mjs --verify` 核两体嘴宽recipe；可编辑源与全部形态处理在`assets-source/face-parameters-v1`、`scripts/face-parameters-v1`。无发源检查在`evidence/workbench-face-source-audit-v1`。
6. `node scripts/install-face-brow-workbench.mjs --verify` 核单端点源→runtime recipe；源、从原底重复生成及全部表达核查见`assets-source/face-brow-parameters-v1/README.md`，独立CPU命令`node scripts/face-brow-parameters-v1/runtime-check.mjs`。
7. 在prototype目录执行 `npm ci`、`npm run build -- --outDir ../experiments/<新固定目录>/dist`。构建标识由全源码/资源自动计算；不得覆盖历史固定目录。核对build-info与交付指针后，根目录运行 `python scripts/serve-appearance-workbench.py`。

`character-appearance.js`、`facial-palette.js`与房间共用人物实例，材质/颜色缓存归属各自实例；换色不在每帧创建贴图。Texture Source独立，恢复原材质引用和透明通道；最新请求优先、失败保留、销毁在定向运行检查中验证。热切换在离屏完成资源和姿势准备后才替换可见人物。

## 证据边界

初版b44与8b的证据分别保留原构建身份。b44的深肤偏橙/男性举手裁切已在8b改善；它们不能证明之后新增眼唇、男性发型和页内切换通过。

当前固定版本、最新录像与回归报告见CURRENT-FOUNDATION。CPU注入、实际浏览器、全时段抽帧、用户自然度验收分开记录。RTX4090开发机/无头浏览器不代表普通电脑实测；目标设备缺口按用户决定保留。
