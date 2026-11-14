# 完整人体候选与新增服装：可重复制作

运行依赖仍使用 prototype/package-lock.json；没有更换引擎或升级运行时。

## 只打开已导出的画面

双击根目录 `Start-foundation-demo.cmd`，构建当前源码后在4191打开固定预览，不使用HMR。若4191已有本轮固定候选直接打开现有地址；脚本使用strictPort，不会悄悄增加另一个端口。当前主房间含M1A完整女性及独立裤裙；`?body=male`为真实男性，`?body=m1a-jaw-v1` / `?body=m1a-waisthip-v1`为独立风险派生，已接入足底/椅子适配但验收状态以CURRENT-FOUNDATION和M1-ROOM为准。`?legacy`保留旧角色；`foundation.html`只是独立导出资格对照页，不能代替房间验收。

新检出手动启动：

```powershell
cd prototype
npm ci
npm run build
npm run preview -- --port 4191 --strictPort
```

打开4191主房间或4191/foundation.html；后者 `?source=roundtrip` 查看从保存的Blender工程重新导出的文件。模型、服装、动作已纳入Git，不依赖本机analysis临时目录。许可证与来源见 ASSETS.md、FOUNDATION-ASSET-AUDIT.md 和 assets-source/foundation/source.json。

## 候选人体重建与再导出（实施者执行）

正式方向为可编辑完整二次元基模；本轮候选是旧β Base_Female导出。它的胸腹确有真实三角面。**导入导出不能恢复原.vroid参数，Body没有胖瘦/身高形态键。**

固定工具：Blender4.5.9LTS、VRM Addon4.10.5。工具下载到experiments/tools，校验官方Blender SHA256和已固定addon SHA256，不修改全局Blender设置。Python标准库即可安装。

```powershell
python scripts/fetch-foundation.py
python scripts/setup-foundation-tools.py
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python-exit-code 1 --python scripts/rebuild-foundation.py
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python-exit-code 1 --python scripts/rebuild-foundation.py -- --from-blend
python scripts/audit-foundation-body.py
```

第一次命令从保留原件**重新生成** `assets-source/foundation/base-female-editable.blend`，不要用于覆盖人工编辑后的源。`--from-blend`读取保存的可编辑工程再导出，保留源修改。两条路径均已实际执行；原件导入→导出与保存工程→导出的VRM SHA256相同：`027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`。这证明当前导出可重复，不代表任意修改后仍合格。

保存的工程含Face/Body网格、UV、83骨、顶点权重、56个面部形态键（加Basis），文件型图片全部打包；报告在assets-source/foundation/rebuild-report.json。没有原版捏人体型参数，没有自动脸型/体型编辑系统，没有新增发型资源。

面部运行接口复用VRM expressionManager：眨眼、左右眼、aa/ih/ou/ee/oh和基本表情；眼骨/视线配置保留。外貌形态参数以后单独定义，不能复用“happy”等表情值来储存脸型。小范围jaw派生已做真实几何、表情与静态视线检查；其范围见CAPABILITIES，不代表完整捏脸。

## 本次发现的坐标错误

旧角色为VRM1，候选为VRM0。`rotateVRM0`只旋转场景，原有重定向轨道没有转换到VRM0局部基；结果行走双手举过头、坐姿膝盖向后。`prototype/src/motion-source.js`依据three-vrm官方示例仅对metaVersion0转换四元数x/z及根位移x/z，VRM1路径不变。原地重定向修复后复核见本轮验收报告。此项是跨角色接口真实适配，不能把新人体的脚底/椅子接触也当成已修复。

## 早期旧角色新增服装（历史流程）

详细源参数、构建、绑定与装备规则在 GARMENT-PIPELINE.md。已接入一件新的及膝运动裤，独立GLB，不是短裤换色。服装加载器验证实际人体文件SHA、骨架映射与逆绑定矩阵；不匹配会拒绝。它只适配旧对照体型，**不能直接用于新Base_Female**。

游戏内没有为此新增人体动作算法。现有原短裤与人体继续保留；装备槽声明为bottoms-overlay。生产验收须观看固定版本完整动作录像。源参数/权重自动生成只证明这一结构的制作可复跑，不证明任意服装都无需美术判断。后续重建完整基模服装时由实施者完成拟合/权重处理，不交给用户手工修复。

## 阶段边界

本轮完成M1的资产候选与生产接口子步骤，尚未完成M1的“新完整基模+独立裤/裙+场景接触”总验收。现阶段保留M1A女性、M1B真实男性、M1C跑步/直播/附件/少量舞，M2受限外观参数、M3小规模组合后置，见FOUNDATION-MILESTONES.md。没有开发联网、完整捏脸或批量衣库。

## 当前完整候选的源流程入口

- 女性独立裤裙：`assets-source/m1/README.md`、`scripts/m1-assets/`。
- 男性主体/独立上衣裤鞋：`assets-source/m1b/README.md`、`scripts/m1b-assets/`，与女性共用运行控制而版型/接触配置独立。
- jaw与waisthip：`assets-source/m1-variants/README.md`、`scripts/m1-variants/`。先改保留的源，导出新主体身份，再生成专属装备；不改hash绕过兼容。
- 麦克风/眼镜：`assets-source/m1c-accessories/README.md`、`scripts/m1c-assets/`，源primitive参数和.blend均保存。
- 派生Jog/技术舞：`docs/M1C-SOURCE.md`、`scripts/qa-m1c-requirements.txt`、`qa-m1c-build-jog.py` / `qa-m1c-build-dance.py` / `qa-m1c-rebuild-check.py`。输入使用已跟踪UAL1文件；修改源配置后真实导出/回读的证据保留。

固定构建检查用 `node scripts/run-fixed-check.cjs <dist> <check.cjs> [args]`，只起单次临时loopback服务。代码生成/构建成功不自动给视觉通过。当前状态与操作顺序始终看CURRENT-FOUNDATION/CAPABILITIES，以上历史流程不是新阶段指令。

## 可重复性和实际制作成本边界

以下是已保留生产记录，不另设一份当前能力状态表。原件、源参数、导出身份与运行验收必须分别核对；“重新生成字节相同”不等于“新设计已适配所有动作”。

| 样件 | 自动化与可重复性事实 | 仍需实施者判断/适配的工作 |
|---|---|---|
| 男性主体及上衣/裤/鞋 | 两个独立Blender进程重开同源导出，VRM、三GLB及manifest字节一致；`assets-source/m1b/reproducibility.json` | 当前衣片来自原男性制服的独立拆分，不是新增原创版型。男性骨长、鞋底和座厚分别测量；原裤底−1.975mm、收步鞋−12.59mm的迁移失败确实发生过，不能省略这一轮接触适配。 |
| 女性jaw/waisthip派生 | 各自从原件修改，保存blend并重开导出两次；新主体SHA和专属装备绑定独立，八件装备离线检查留存 | 女体几何mask不能复制给男体；改脸后仍需检查闭眼/口型/眼球，改体型后仍需检查衣裤/椅面。女派生的实测座厚不是默认女体的照搬值。 |
| 麦克风/眼镜 | 原创参数和可编辑blend保留。曾发现Blender球体三角顺序导致字节不稳定；仅规范化不透明三角索引顺序后，三个独立导出字节一致，几何与有向三角集合未改 | 挂点、握持姿势、眼镜贴合按男女实际身体验证。当前精细握麦仍不合格；资源可重建不能抵消约9mm掌部穿柄。五个小偏移/指角候选均被拒绝，见M1C-GRIP-EXPERIMENT-ca72ada827d2。 |
| 派生Jog与7.2秒技术舞 | 从Git内固定UAL源和参数生成；独立目录重建字节一致，改抬臂参数10°后回读实际变化约9.92° | 官方Jog原速度过快，替代源筛选没有直接解决普通慢跑。当前是明确标注的派生动作与技术编排，不能按动捕/正式舞品质计价或验收；源修改后仍须目标身体、服装与完整进出场检查。 |
| 裙形修复 | 等价优化保持720姿势顶点/法线一致；两个形状实验未合入。后续离线Cloth首试也保留拒绝数据，未产生产品corrective | 同源低面褶裙的硬折尚未收敛。首试6.64秒运行退出只是一段失败计算时间，不是修复完成时间或单件生产工时；拓扑、初始碰撞与形状必须继续有界核查，不能无限调姿态。 |

本轮没有新增付费素材或服务。没有系统记录完整人时、返工率或批量成功率，不能提供“每件衣服几分钟”“任意体型自动适配”之类生产承诺。已测耗时只用于其具体导出/测试过程，不能把GPU帧耗时、脚本运行时间或浏览器测试时长混为制作工时。下一件素材沿用相同源→导出→回读→固定房间→完整动作流程，并单独记录人工决策、失败原因和通过范围。

## M1B最小本地数据合同复验

QA专用合同说明在 `schemas/README.md`，固定fixture在 `schemas/fixtures/avatar-record-catalog-v1.json`，纯校验器为 `scripts/avatar-record-contract.mjs`。这是与产品运行时分离的本地记录验证，不是游戏存档已上线。

```powershell
node scripts/qa-avatar-record-contract.mjs
node scripts/run-fixed-check.cjs experiments/m1-ca72ada827d2/dist scripts/qa-avatar-record.cjs ca72ada827d2
```

已有固定ca72实测：F裙/M裤及mic/glasses记录保存到localStorage，关闭页面后同origin新页加载兼容身体再恢复。QA命名空间UUID、appearanceRevision=2、最终body/fit的ID/hash、schema/manifest内容版本均保持；20个错误记录在修改角色前被拒绝，状态不变；纯校验28项通过。happy在保存前开启但不进入长期appearance，新页恢复仍为neutral。完整证据及实际男女记录在 `evidence/avatar-record-fixed-ca72ada827d2/`。

现有manifest没有通用styleId；本fixture显式保存版本化QA款式→原fit资源映射，不将男女不同衣片伪称同款自动适配。当前身体/容貌参数为空，最终外貌由固定VRM资源保存；尚无参数编辑器。UUID由QA合同层一次生成，运行时`room-primary`仍只是任务owner，不是已接入经营的永久主播ID。直接avatar接口恢复未同步女性页面的默认裤卡高亮，这已在证据说明；完整产品保存/恢复UI、浏览器进程重启、经营状态与跨版本迁移均未因此通过。
