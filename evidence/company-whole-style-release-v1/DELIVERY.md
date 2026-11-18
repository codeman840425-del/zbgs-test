# 整屋风格批量生产交付

固定源码提交见 identity.json，查看器构建为 83d6a963ffa3。配方批处理在制作端运行。运行文件、本包制作脚本和批次输入分别由构建摘要、源码提交和批次报告标识。

暖木民房采用单工位和错缝木地板；冷色公司有两个布置不同的楼层，二层直播间使用棋盘砖、菱格墙面及另一套桌椅。浏览器验收在实际房间核验工位设施、墙地网格和纹理；冷色公司的局部关屏状态在退出浏览器后自动恢复。固定录像为 6.92 秒、25 fps、1600 × 1000、正常速度。软件渲染环境的这些结果仅覆盖场景制作、显示与恢复。真实性能和真实角色需分别验收。

独立包位于主目录下的 `company-workspace/deliveries/whole-company-styles-v1`。在包的 `source/prototype` 运行 `npm ci`。在 `source` 运行：

```text
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/whole-company-styles-v1.json ../generated
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/whole-company-styles-v1.json ../generated --only cool-studios
node scripts/company-platform/qa-whole-style-batch.cjs .. ../qa
```

包根目录运行 `node serve.mjs`，在打印的地址上使用 `?delivery=warm-home` 或 `?delivery=cool-studios`。每份公司的 input、layout、save 和 report 都已在独立目录重建并逐字节比对。共核过 1,621 个包清单文件；固定查看器与独立重建的 477 个文件全部一致。

第一次组合输入在二层休息室触发 incompatible-replacement，定位到 beta-rest/sofa.resource.footprint.halfSize[0]。原两层样例使用第二规格沙发，成套配方的组合沙发使用第一规格。新公司输入显式选用第一规格，单独重试冷色公司后通过，已发布的暖木公司保持原结果。基础两层样例保留原规格。

[固定验收](fixed/report.json) · [交付包验收](independent-browser.json) · [原速录像](fixed/video/whole-style-batch-normal.webm) · [独立复产核验](identity.json)
