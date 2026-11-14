# 直播公司经营 · 角色动作验证

本工作区保留原演示作为对照，并建立可读源码的角色验证工程。原开发工程已确认因硬盘损坏遗失；`prototype/` 是重建的隔离样机。当前代表人物采用 pixiv 的二次元 VRM 样本，原装短裤与生成的重力布料裙用于动作检查，不是原游戏人物已经修复，也尚未通过用户最终观感验收。

## 打开样机

本轮修复固定构建标识 **6e6a4fc03f64**。先看[同条件前后录屏及完整动作链](http://127.0.0.1:4174/output/review/)，再打开[当前可操作候选](http://127.0.0.1:4180/)。实时路线为 Phaser＋Three.js＋VRM，Rigby2D未接入。修复和限制见 [当前说明](docs/CURRENT-REPAIR.md)、[资源与更新约定](docs/AVATAR-CONTRACT.md)。

重新启动固定版本可双击 `Start-fixed-demo.cmd`：它构建后在 `http://127.0.0.1:4173/` 预览，不使用开发热更新。开发调试仍用下面的 `Start-demo.cmd`。录像保存在本机 `output/`；远端保存代码、资源、复现脚本和精选证据，长录屏不进入Git。

本机可直接双击 `Start-demo.cmd`，或打开已启动的[静态候选版本](http://127.0.0.1:4180/)。服务关闭后需要重新启动；它不是线上部署。

手动启动需要 Node.js（本项目 Vite 7 要求 20.19+ 或 22.12+）和 Python。在 PowerShell 中运行：

```powershell
cd F:\gamemake
python scripts/fetch-avatar.py
python scripts/fetch-animations.py --output prototype/public/assets/motion/UAL1_Standard.glb
cd prototype
npm ci
npm run dev
```

浏览器打开 [本地样机](http://127.0.0.1:5173/)。首次 `npm ci` 需要下载依赖；后续直接在 `prototype/` 执行 `npm run dev`。素材获取脚本会核对固定文件哈希，已存在的合格素材不会重复下载。

构建检查：在 `prototype/` 运行 `npm run build`；运行 `npm run preview` 后访问 [构建预览](http://127.0.0.1:4173/)。源模型和使用条件见 [资产记录](docs/ASSETS.md)。

当前依赖锁定 Phaser 3.90.0、Three.js 0.187.0、three-vrm 3.5.5；Phaser 管理场景输入、路径与动作状态，Three.js/VRM 负责真实蒙皮显示。站走坐舞复用 Quaternius CC0 动作，重定向与足部修正在可读源码中。当前还未接回原经营流程。

为了复现录像入口，在根目录运行 `python scripts/build-review.py`（需要先按修复说明生成录像），再执行 `python -m http.server 4174 --bind 127.0.0.1`。测试脚本使用本机Chrome；视频构建标识保存在对应JSON中。

针对用户反馈的站姿与椅子穿模，启动服务后在根目录运行：

```powershell
node scripts/qa-motion.mjs
node scripts/qa-locomotion.cjs http://127.0.0.1:4180/
node scripts/qa-seat-transition.cjs http://127.0.0.1:4180/
node scripts/qa-posture.cjs http://127.0.0.1:4180/
```

最后一项使用本机 Chrome，录下两套外观的站立、走停、坐起、舞蹈及转身，输出 `output/playwright/posture/posture-transitions.webm`。视频是本地产物，不提交远端；数值检查不能替代观感验收。

## 打开原演示与坐标修补对照

另开 PowerShell：

```powershell
cd F:\gamemake
python scripts/build-comparison-lab.py
python -m http.server 8000 --bind 127.0.0.1
```

- [原始发布基线](http://127.0.0.1:8000/baseline/packs/present_motion_v1_1111_MT/)
- [修改前控制副本](http://127.0.0.1:8000/comparison-lab/before/)
- [修改后控制副本](http://127.0.0.1:8000/comparison-lab/after/)

这组前后对照只验证已确认的局部坐标问题。两边使用相同调试控制，不代表原游戏已完成全面动画改造。控制方法、证据和回归命令见 [审计](docs/audit.md)。

## 继续开发

先读 [项目交接](docs/HANDOFF.md)、[核查结论](docs/audit.md)、[验收记录](docs/qa.md)。完整运行录屏与截图放在 `output/playwright/`；验收结论以实际记录为准，代码构建成功不代表动作合格。

保留 Phaser 的经营和界面方向，先完成一个人物样板，再扩大生产。后续联网按各自经营、排行榜、交易、异步 PK 设计；当前原包仍是浏览器 local-sim，账号和权威服务器能力尚未完成。

长期角色目标包括可改发型、脸型、五官、身材、身高和胖瘦，以及大量服装换装后复用多种动作。当前单人物两服装只是第一道样板，捏人系统和通用服装适配尚未完成。下一关键验收是同一件衣服在不同高矮胖瘦人物上仍能完成行走、坐下和舞蹈。

`baseline/` 是固定提交 `92c1ee2b666288526e4ca974187f8b4fc5efb376` 的不可变发布对照；修改前后副本均可通过脚本重新生成。根 Git 保存实现和交接记录，使用 `git status`、`git log --oneline` 查看实际进度。
