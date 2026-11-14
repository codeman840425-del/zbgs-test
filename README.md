# 直播公司经营 · 角色基础工程

当前路线是 Phaser＋Three.js＋VRM。原开发工程永久遗失；`baseline/` 保留原静态发布包，`prototype/` 是可维护的新建工程，不是找回了原源码。当前男女人物均为技术候选，最终画风与动作观感尚未获用户验收，真实多人服务及经营系统不属于本次M1修复。

## 当前入口与状态

唯一能力状态见 [CAPABILITIES.md](docs/CAPABILITIES.md)，当前固定构建、服务及执行位置见 [CURRENT-FOUNDATION.md](docs/CURRENT-FOUNDATION.md)，阶段范围见 [FOUNDATION-MILESTONES.md](docs/FOUNDATION-MILESTONES.md)。历史报告不代表当前组合通过。

本机已开放 [男性动作候选](http://127.0.0.1:4192/?body=male)。点击“独立露膝短裤”可体验已接入的短裤；它与长裤使用同一人体和动作控制。该入口当前为修复候选，男性跑步转弯与裙装仍有未通过项，最新限制查CURRENT。原4180/4191保留对照，不覆盖旧文件。

## 新检出后运行

需要 Node.js 20.19+ 或22.12+（开发验证使用24.13.0）。可运行主体、独立服装与动作资源已经纳入Git，无需先下载旧角色。首次依赖安装需要网络。

双击 `Start-M1-demo.cmd`（另外两个fixed/foundation启动器共用同一流程），或执行：

```powershell
cd F:\gamemake\prototype
npm ci
npm run build -- --outDir ../output/local-demo/dist
npm run preview -- --outDir ../output/local-demo/dist --host 127.0.0.1 --port 4173 --strictPort
```

打开 [女性](http://127.0.0.1:4173/) 或 [男性](http://127.0.0.1:4173/?body=male)。这是本地固定构建，无开发热更新。输出写入独立目录，不改写当前对照的 `prototype/dist`。端口占用时启动器会明确失败，不杀其他服务；已运行页面的版本须核对页面候选编号。

日常开发：在 `prototype/` 执行 `npm run dev`，使用5173。调试页面有暂停、慢速、视角、基础人体和修正层开关。固定验收不要使用开发页面。

## 源资产与验证

依赖锁定 Phaser3.90.0、Three0.187.0、three-vrm3.5.5；Rigby2D不参与当前播放。Phaser负责输入、路径与行为任务，Three/VRM负责蒙皮和动画求值，原始动作和程序修正分层验证。

可编辑人体、衣物及来源许可在 `assets-source/`；生产入口见 [FOUNDATION-WORKFLOW.md](docs/FOUNDATION-WORKFLOW.md)。男性露膝短裤专用流程在 [shorts/README](assets-source/m1b/shorts/README.md)，包括源blend、裁片/权重、真实重开导出、装备绑定及独立验收。源动作、手持附件和几何派生均保留各自参数及脚本，不要求用户手工修模。

固定浏览器检查使用仓库脚本，并显式核对构建ID与实际主体SHA：

```powershell
node scripts/run-fixed-check.cjs <固定dist目录> <检查脚本> <所需参数>
```

该工具只为一次检查启动临时服务，结束自动关闭。正常速度录像与程序检查分开记录；历史素材或另一性别通过不能替代当前组合。普通电脑实机尚未具备，高配开发机与模拟测试均不算目标设备通过。

完整开发证据通常在忽略的 `output/`；精选原片、关键图、数据压缩包与SHA清单在 `evidence/` 随Git备份。当前短裤、招手及转向的具体版本和限制从能力清单进入。需要播放证据时执行 `python scripts/serve-review.py`，访问4174；它支持视频Range请求。

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
