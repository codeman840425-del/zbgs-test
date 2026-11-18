# 台灯交付的干净接收与工作副本

原交付目录 `company-workspace/deliveries/desk-lamps-v1` 曾用于独立重建。在该目录内执行 npm 安装、构建身份生成和 Vite 后，新增依赖 4,777 个文件、重建运行输出 487 个文件以及一份 `source/prototype/public/company-build-info.json`。清单声明的 1,653 项全部匹配原字节。额外的身份文件由 `build-company-id.mjs` 在计算源码摘要后产生，Vite 将它复制到重建的查看器。它与原 `viewer/company-build-info.json` 逐字节一致。

重新从固定源码 `a8370cbaa8d2d2fed3f3ad83665ddb4e537c6add` 发布的干净目录为 `company-workspace/deliveries/desk-lamps-v1-clean`。正式接收单位是整个干净目录，文件集合恰为 `transfer-manifest.json` 加 `files` 中列出的 1,653 项。两个目录的清单 SHA-256 均为 `db7b3caf37bf2668bc5a019db9e06fc1bfcc9e1442ef97972cbc4d0b6904c021`。旧位置继续保留，供已在该目录工作的接收方核查。

## 接手顺序

1. 核对干净目录与上述清单，保存这份原件。
2. 如只观看，进入干净目录运行 `node serve.mjs`，打开终端给出的本机地址。
3. 如需编辑，先将该目录完整复制到自选工作目录。在**工作副本根目录**运行 `npm ci --prefix source/prototype`，再运行 `node edit.mjs validate data/save.json`。布局编辑和批量制作也使用这里安装的依赖。
4. 如需重建，在工作副本的 `source/prototype` 中运行 `node scripts/build-company-id.mjs`，随后运行 `node node_modules/vite/bin/vite.js build --config vite.company.config.js`。此版构建号为 `5bfe97a233ec`。

此固定版本保留原说明和原字节。可用当前项目的 `scripts/company-platform/package-template/verify.mjs` 校验历史交付。后续新包在包根直接提供 `node verify.mjs`，交付前与独立重建后各复核一次原件。台灯净接收复验使用已有 npm 缓存，487 个重建运行文件与原查看器逐字节一致。[原目录复算](used-for-rebuild.json) · [净包核验](clean.json) · [独立重建](rebuild.json)
