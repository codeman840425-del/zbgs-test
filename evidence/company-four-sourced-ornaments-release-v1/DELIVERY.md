# 外部桌面摆件四款交付

固定源码 f799ea19，独立包 `company-workspace/deliveries/four-sourced-ornaments-v1`，查看器 111b231f8fb2。人类预览另含原先的本地参考画与整屋样板，构建 ca05ad341bc9。书组、盆栽、收音机和开口纸盒分别来自 Kenney Furniture Kit 2.0 的四个 CC0 模型，复用同一个配方生产器。源 ZIP、配方与版本随包。纸盒用于静态陈列。

在交付包的 source/prototype 安装锁定依赖后，从 source 运行：

```text
node scripts/company-platform/test-four-sourced-ornaments.mjs ../my-verification
node scripts/company-platform/qa-sourced-ornaments.cjs ../viewer 111b231f8fb2 ../data/save.json ../browser --resources tabletop-books-kenney,tabletop-plant-kenney,tabletop-radio-kenney,tabletop-open-box-kenney --record
```

第一条命令要求一个新目录；它复产两个休息室、逐字节再导出四个 GLB，并在两家公司逐项检查全部 24 次有向替换、位置、承载、越界拒绝与保存恢复。纸盒中央能探到内底，两侧射线能命中展开的盖片。第二条命令在原位换款、逐个关闭及重开浏览器，录下四款正常速度切换。查看器在两处独立重建后，479 个文件逐字节一致。浏览器验证使用 Chromium 软件渲染。

[验证身份](identity.json) · [几何及两套布局](geometry-and-swaps.json) · [固定构建浏览器](fixed/report.json) · [交付包浏览器](independent/report.json) · [原速录像，10.52 秒](fixed/video/sourced-ornaments-normal.webm)
