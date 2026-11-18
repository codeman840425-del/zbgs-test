# 桌面台灯固定交付

固定源码为 `a8370cbaa8d2d2fed3f3ad83665ddb4e537c6add`，正式构建为 `5bfe97a233ec`。民房和双工位工作室共用同一批量输入。圆罩和方柱台灯适配自 Kenney CC0 原件，鹅颈和条形灯按项目配方生成。四款共享桌面安装、开关、强度及灯头俯仰。美术来源、配方修改与重复导出的入口在 `assets-source/company-desk-lamp-v1/README.md`。

## 复验

从独立交付包的 `source` 目录运行以下 PowerShell 命令，将本次试验写入新的输出目录。

```powershell
Push-Location prototype
npm ci
node scripts/build-company-id.mjs
node node_modules/vite/bin/vite.js build --config vite.company.config.js
Pop-Location
New-Item -ItemType Directory -Force output | Out-Null
node scripts/company-platform/build-desk-lamp-collection.mjs --check
node scripts/company-platform/test-desk-lamp-assets.mjs output/lamp-geometry
node scripts/company-platform/test-desk-lamp-runtime.mjs
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/desk-lamp-rooms.json output/lamp-rooms
node scripts/company-platform/qa-desk-lamps.cjs prototype/dist-company 5bfe97a233ec output/lamp-rooms output/lamp-browser --record
```

## 验收结果

独立重建的 487 个运行文件与固定版本和交付查看器逐字节一致，交付清单 1653 项全部核对。两个输入的布局、存档及批量输出均可独立复产。固定浏览器通过 7 组功能检查和 1 组录像检查，独立浏览器通过同样 7 组功能检查。报告记录桌面同视角的开关差异、调光、灯头俯仰后的实际光斑移动、四款保存重开、工位旋转及两盏实时灯的预算切换。

[同镜头关灯](fixed/01-desktop-off.png) · [同镜头开灯](fixed/02-desktop-on.png) · [正常速度录像](fixed/video/desk-lamps-normal.webm) · [固定结果](fixed/report.json) · [独立结果](independent/report.json) · [构建及文件校验](identity.json)

浏览器使用 Chromium SwiftShader。普通电脑实机性能与真实角色受光仍待验证。独立交付目录位于主项目的 `company-workspace/deliveries/desk-lamps-v1`。另有本机人类验收预览，使用带既有私有素材的构建 `639b91d46099`。
