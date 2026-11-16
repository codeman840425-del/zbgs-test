# 公司房间首包复现

当前范围复用原角色系统、房间素材及男女原裤装，座高为 0.47m。room-a 和 room-b 仅改变单椅的位置与朝向。组合设施、保存、多楼层仍待实现，普通电脑性能尚未测量。

固定集成源码为 `c4b799d131dcb372ab3a740bff81e817a95ec626`，对应构建 ID 为 `86ada889128e`。源码、构建、运行和人类验收的最终事实由根 agent 核验后写入 `delivery.json`。本说明提供复现入口，实际通过状态以原始报告为准。

## 固定源码构建

从确切 SHA 创建独立检出，再在该检出内构建。以下 PowerShell 命令从本仓库根目录开始，目标路径必须尚不存在。

```powershell
git worktree add --detach F:/gamemake-company-fixed-86ada c4b799d131dcb372ab3a740bff81e817a95ec626
Set-Location F:/gamemake-company-fixed-86ada/prototype
npm ci
npm run build
Get-Content dist/build-info.json
Set-Location ..
```

核对 `dist/build-info.json` 的 `shortId`、完整 `sourceDigest` 和输入清单。固定交付使用独立检出的构建及对应证据，当前开发树的本地构建需要另行联调。

原参考源码为 `af47b6a7ff37d542bfb1b55247a923d7f98cf4a9`，旧固定构建为 `4fdc1b3e1667`。旧 dist 路径为 `F:/gamemake/experiments/m2-socks-fixed-v1/prototype/dist`，运行前保留并核对其 `build-info.json`。

## CPU 结构审查

```powershell
node scripts/company-platform/review-room.mjs
```

该脚本当前无命令行参数，在所在仓库生成 `evidence/company-platform-layout-review-v1`。它读取原提交的房间构造，与新房间的真实 Three.js 几何、材质、目标和基本错误拒绝逐项比较。它使用 Canvas 绘制命令替身，范围及限制见产出的 `report.json`。重新运行会写同一审查目录，需先保留已有审查证据。

## 浏览器观看

```powershell
node scripts/company-platform/serve.cjs F:/gamemake-company-fixed-86ada/prototype/dist 86ada889128e
```

服务在 `127.0.0.1` 随机空闲端口启动，控制台返回实际 URL。分别追加以下查询参数，查看男女及两种布局。

```text
?body=female&companyLayout=room-a
?body=male&companyLayout=room-a
?body=female&companyLayout=room-b
?body=male&companyLayout=room-b
```

Ctrl-C 结束服务。启动时服务器核对构建 ID，运行验收进一步核对源码摘要和实际主角色文件哈希。

## 运行与录像

从具备最新验收驱动及 `prototype/node_modules/playwright` 的工作树运行。验收驱动可独立于固定产品源码更新，最终输出的 `executed-qa.cjs` 保存实际执行版本。固定集成 SHA 中的驱动与后续追加换人、环境记录检查的驱动需分别核实。

```powershell
node scripts/company-platform/qa-room.cjs F:/gamemake-company-fixed-86ada/prototype/dist 86ada889128e F:/gamemake-company-platform-layout-v1/evidence/company-runtime-86ada-repeat-01 F:/gamemake/experiments/m2-socks-fixed-v1/prototype/dist
```

输出目录须全新。普通功能检查按双方回执协调共享；正式性能采样、比较流畅性的录像与重型导出保留必要独占短窗口，并记录负载。只关闭自己创建的服务。每例产出 `room.png`、`seated.png`、`exit.png`、`normal1x.webm` 和 `report.json`。四例为 room-a-female、room-a-male、room-b-female、room-b-male。总报告记录校准、生命周期、换人链接、环境及错误。原始视频为正常模拟速度 1×，生命周期的暂停确定性测试另行记录。

失败目录保持原样，修复后使用新目录。先核对总报告 `status=passed`、空错误数组、四例完整性、构建与男女资源身份，再进入打包。技术检查、离散抽帧和静态截图仍需结合完整原视频的人类观感验收。

## 观看包

Python 3.11 及以上，使用现有环境中的 Pillow 和 imageio_ffmpeg。打包仅进行 CPU 解码与图片生成。

```powershell
python scripts/company-platform/package-review.py --run F:/gamemake-company-platform-layout-v1/evidence/company-runtime-86ada-v1 --out F:/gamemake-company-platform-layout-v1/evidence/company-review-86ada-v1 --source-commit c4b799d131dcb372ab3a740bff81e817a95ec626
```

`--run`、`--out` 接受绝对路径或相对当前工作目录的路径。`--source-commit` 必须提供完整 40 位 SHA，并且在脚本所在仓库可读。脚本从该提交的实际输入文件重新计算构建摘要，核对总报告、四例报告、换人链接、主角色哈希及 1× 记录。未通过或身份不符时拒绝打包。

`--out` 必须为新目录且位于原运行目录之外。输出保存自包含原始文件副本、中文 `index.html`、`summary.json`、`hashes.json` 和抽帧页。页面链接均相对观看包，可复制整个目录后打开。哈希清单覆盖原始副本、页面、索引及抽帧图片，`hashes.json` 自身不列入自身摘要。

视频通过 imageio_ffmpeg 完整解码计数，记录解码帧数和时长。抽帧采用 `fps=2:start_time=0:round=down,scale=720:-2`，每页固定两列六行，末页空格保留。索引记录样本数、每页首末时间、最后样本与解码结束的距离。标签为输出采样时间网格，原始帧的时间戳未逐帧导出。2fps 抽样在相邻样本之间存在间隔，连续人工验收状态保留为 pending。

打包异常会保留新输出目录及 `failure.json`，使用新目录重试。根 agent 最终核对实际视频、抽帧边界、所有链接和哈希，并在 `delivery.json` 填写确切源码、构建与证据路径。
