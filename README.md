# 直播公司经营 · 角色基础工程

当前路线是 Phaser＋Three.js＋VRM。原开发工程永久遗失；`baseline/` 保留原静态发布包，`prototype/` 是可维护的新建工程，不是找回了原源码。M1所展示的男女动作链已获用户接受为下一阶段基础；新外观与最终画风仍待确认，普通电脑实测缺口保留。真实多人服务及完整经营系统未实现。

## 当前入口与状态

唯一能力状态见 [CAPABILITIES.md](docs/CAPABILITIES.md)，当前固定构建、服务及执行位置见 [CURRENT-FOUNDATION.md](docs/CURRENT-FOUNDATION.md)，阶段范围见 [FOUNDATION-MILESTONES.md](docs/FOUNDATION-MILESTONES.md)。历史报告不代表当前组合通过。

**当前主入口：[外观与动作工作台（4196）](http://127.0.0.1:4196/?workbench=appearance)**。顶部独立切换男女，右侧按外观／动作／检查分区；需要点击地面移动时使用顶部“房间移动”。男性短裤通过现有服装选项选择，与长裤共用人体和动作控制。精确构建由 `delivery/appearance-workbench.json` 指定，最新录像和限制查CURRENT。

[已获限定接受的M1基础（4195）](http://127.0.0.1:4195/)作为对照保留。4191–4194为历史服务，不作为最新入口。旧原片、固定包及失败记录不覆盖；裙装和30秒舞蹈已按用户决定封板，保留已知瑕疵。

## 新检出后运行

需要 Node.js 20.19+ 或22.12+（开发验证使用24.13.0）。可运行主体、独立服装与动作资源已经纳入Git，无需先下载旧角色。首次依赖安装需要网络。

双击 `Start-M1-demo.cmd`（另外两个fixed/foundation启动器共用同一流程），或执行：

```powershell
cd F:\gamemake\prototype
npm ci
npm run build -- --outDir ../output/local-demo/dist
npm run preview -- --outDir ../output/local-demo/dist --host 127.0.0.1 --port 4173 --strictPort
```

打开 [本地外观与动作工作台](http://127.0.0.1:4173/?workbench=appearance)，或直接打开 [女性房间](http://127.0.0.1:4173/)／[男性房间](http://127.0.0.1:4173/?body=male)。这是当前检出源码的本地固定构建，无开发热更新；不自动替换4196公开候选，也不自动继承其验收。输出写入独立目录，不改写当前对照的 `prototype/dist`。端口占用时启动器会明确失败，不杀其他服务；已运行页面的版本须核对页面候选编号。

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

保留 Phaser 的经营和界面方向，当前已有男女代表样板及有限外观制作闭环，具体验收范围见唯一能力清单；最终画风与代表组合确认前不批量生产。后续联网按各自经营、排行榜、交易、异步 PK 设计；当前原包仍是浏览器 local-sim，账号和权威服务器能力尚未完成。

长期角色目标包括可改发型、脸型、五官、身材、身高和胖瘦，以及大量服装换装后复用多种动作。当前原男女有限几何端点、各一件独立短发、颜色与配方保存已经接入，派生体按各自兼容范围管理；这不是完整捏人或任意服装自动适配。后续体型边界、组合生成与衣库扩量按阶段计划准入，不能由本README的长期目标自动展开。

`baseline/` 是固定提交 `92c1ee2b666288526e4ca974187f8b4fc5efb376` 的不可变发布对照；修改前后副本均可通过脚本重新生成。根 Git 保存实现和交接记录，使用 `git status`、`git log --oneline` 查看实际进度。
