# 从空缓存接收和重建唱播双房

封存清单 `ec8dec4d4bebebafab4fb70b834945a32a9826d0e2d58c6cba3861a643e8574e`。接收方在 Windows x64 上用 Node 24.13.0、npm 11.6.2 和空的新缓存安装了 35 个包。21 个包从 npm 官方源下载，14 个从原锁指定镜像的 CDN 下载。构建 `30a86515c5da` 的 621 个运行文件逐一与固定清单相符。接收前后，2,221 个原包文件完整。[接收回执](report.json) · [重建逐文件摘要](viewer-file-hashes.json) · [查看器核对](runtime-match.json)

接收方用包内编辑命令将工作室圆盘款换成广播款，用新进程打开修改后的存档。出租屋的八个具名文件与原件完全一致。指定广播款的不存在版本 999 会返回 `missing-resource-version`；改正版本后可直接重试，产出与首次有效编辑逐字节一致。[房间对照](rooms-comparison.json) · [失败与重试](edit-retry.json)

## 接收方复跑

先验证收到的包，保留原件，在新的完整工作副本中执行下列命令。缓存路径应尚不存在。首次获取依赖使用网络，锁文件保持原样。本次验证使用同一台 Windows 主机上的隔离目录及空 npm 配置。Linux、macOS 和完全断网的首次安装仍待验证。关于冻结安装和锁定来源见 [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/) 和 [package-lock.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/)。

```powershell
npm ci --prefix source/prototype --cache ./npm-first-install --no-audit --no-fund
Push-Location source/prototype
node scripts/build-company-id.mjs
node node_modules/vite/bin/vite.js build --config vite.company.config.js
Pop-Location
node edit.mjs validate data/rooms/singing-studio/save.json
```

查看器核对命令为 `node verify.mjs 原包目录 清单SHA256 --viewer 重建的dist-company目录`。工具版本为 `d001140b`。对于此前封存的唱麦包，直接使用下方单文件核对工具，旧包自带的验证命令仍可核对整个原包。工具会分别指出改动、缺失和多出的文件，并拒绝将原包查看器本身用作重建对照。[取得独立核对脚本](../../../scripts/company-platform/package-template/verify.mjs) · [差异识别实测](verifier-regression.json)

此次验证的是安装、制作与重建。固定版本的画面和冷启动实录见[原速录像](../browser/video/vocal-mic-looks-normal.webm)。
