# 房间踢脚线与梳妆椅接触交付

固定源码为 `459f71a3`，构建为 `64518e160ea1`。本机封存目录是 `company-workspace/deliveries/baseboards-v1.1`。同目录的 `verify.mjs` 可核 1784 个文件。完整清单摘要、接收方输入和录像摘要见 [identity.json](identity.json)。

## 观看

在净包根目录运行 `node serve.mjs 0`，用输出的本机地址观看默认民房。将地址的 `delivery=1` 改为 `delivery=baseboard-rental` 可进入第二种布局。选中房间后在“装修”里切换“踢脚线”，观察门框两侧收口、窗下连续段及转角。另有 `vanity-display` 和 `vanity-alternate` 两个已显式更新梳妆椅的入口。

## 复产与验收

在工作副本内的 `source/prototype` 执行 `npm ci`。然后在 `source` 执行以下命令。目录参数按自己的试制位置选择。

```sh
node scripts/company-platform/build-baseboards.mjs --check
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/baseboard-rooms.json ../trial-rooms
node scripts/company-platform/qa-baseboard-rooms.cjs ../viewer 64518e160ea1 ../trial-rooms ../trial-preview --record
node scripts/company-platform/qa-vanity-seat-contact-rooms.cjs .. 64518e160ea1 ../trial-vanity
```

四款截面和纹理实物在两种布局中替换，民房连续切换四款并逐款保存、关闭和重开，出租屋单房换款后复核相邻房间与导航。独立接收方在安装锁定依赖后重建了全部 519 个运行文件和两个房间的 8 个批次文件。接收方再从配方制作第五款，仅变更民房，最终包内的 GLB、嵌入纹理和重开的真实画面均通过核对。[固定浏览器](fixed/browser.json) · [交付包浏览器](receiver/browser.json) · [接收方生产](receiver/fifth-production.json) · [新款重开画面](receiver/fifth-reopened.png)

第一次录像在浏览器关闭后调用保存 API 失败。修正后重跑完整流程，保存了 8.68 秒、25 fps 的正常速度录像。接收方所用的初始封存包与最终包逐文件核对，修改仅涉及录像归档脚本，游戏运行文件、房间、生成器和素材字节一致。[首次失败](recording-failure.json) · [正常速度录像](fixed/normal-speed.webm)

梳妆椅的两个样例共三把椅子，实际网格座面高度均为 0.470 m，已验证存档、重开及侧面进出点。[梳妆椅报告](vanity/final-browser.json)

浏览器采用软件渲染。普通电脑性能和真实男女角色的就坐动作仍待对应验收。
