# 完整人体候选与新增服装：可重复制作

运行依赖仍使用 prototype/package-lock.json；没有更换引擎或升级运行时。

## 只打开已导出的画面

双击根目录 `Start-foundation-demo.cmd`，构建后打开 `http://127.0.0.1:4192/`。这个入口不使用HMR、不覆盖上轮 prototype/dist。房间中“新增及膝裤”是旧角色的独立衣物试验；“查看完整人体候选”进入独立资格检查页。候选人体尚无房间足底/椅子适配。

新检出手动启动：

```powershell
cd prototype
npm ci
npm run build
npm run preview
```

打开4173主房间或4173/foundation.html；后者 `?source=roundtrip` 查看从保存的Blender工程重新导出的文件。模型、服装、动作已纳入Git，不依赖本机analysis临时目录。许可证与来源见 ASSETS.md、FOUNDATION-ASSET-AUDIT.md 和 assets-source/foundation/source.json。

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

面部运行接口复用VRM expressionManager：眨眼、左右眼、aa/ih/ou/ee/oh和基本表情；眼骨/视线配置保留。外貌形态参数以后单独定义，不能复用“happy”等表情值来储存脸型。脸型改动后的表情适配尚未实现/验证。

## 本次发现的坐标错误

旧角色为VRM1，候选为VRM0。`rotateVRM0`只旋转场景，原有重定向轨道没有转换到VRM0局部基；结果行走双手举过头、坐姿膝盖向后。`prototype/src/motion-source.js`依据three-vrm官方示例仅对metaVersion0转换四元数x/z及根位移x/z，VRM1路径不变。原地重定向修复后复核见本轮验收报告。此项是跨角色接口真实适配，不能把新人体的脚底/椅子接触也当成已修复。

## 新增服装

详细源参数、构建、绑定与装备规则在 GARMENT-PIPELINE.md。已接入一件新的及膝运动裤，独立GLB，不是短裤换色。服装加载器验证实际人体文件SHA、骨架映射与逆绑定矩阵；不匹配会拒绝。它只适配旧对照体型，**不能直接用于新Base_Female**。

游戏内没有为此新增人体动作算法。现有原短裤与人体继续保留；装备槽声明为bottoms-overlay。生产验收须观看固定版本完整动作录像。源参数/权重自动生成只证明这一结构的制作可复跑，不证明任意服装都无需美术判断。后续重建完整基模服装时由实施者完成拟合/权重处理，不交给用户手工修复。

## 阶段边界

本轮完成M1的资产候选与生产接口子步骤，尚未完成M1的“新完整基模+独立裤/裙+场景接触”总验收。M2另一种性别、M3少量体型、M4年龄/脸发型/随机组合按顺序开放，见FOUNDATION-MILESTONES.md。没有开发联网、完整捏脸或批量衣库。
