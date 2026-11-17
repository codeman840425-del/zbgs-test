本包固定了正常 2.8m 墙体、完整墙体观看、房间镜头自动剖切、挂墙物随墙隐藏/恢复、两层混合住宅和完整存档恢复。

固定源码提交：0c14c44ce650fae7f4d1cdcbb594e250d86f7500
固定构建：b205fe1e4de0
可重复验证：
  cd F:/gamemake-company-mixed-walls-fixed-v2
  npm ci --prefix prototype
  node prototype/scripts/build-company-id.mjs
  cd prototype
  npx vite build --config vite.company.config.js
  node scripts/company-platform/qa-mixed-company.cjs prototype/dist-company b205fe1e4de0 prototype/src/company/examples/c2-mixed-company.json prototype/src/company/examples/c2-mixed-company-edit.ops.json output/playwright/company-mixed-walls-fixed-v2 --software

正常速度录像：F:/gamemake-company-mixed-walls-fixed-v2/output/playwright/company-mixed-walls-recording-v2/mixed-company-normal1x.webm
录像为 1×、1440×1000、25fps、39.96s；使用 SwiftShader 软件渲染，不作为 GPU 或普通电脑性能验收。
本包不包含真实角色移动、坐起或占用验收；这些仍由总工角色链和最终联调负责。
