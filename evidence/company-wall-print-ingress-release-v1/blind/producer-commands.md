# 直播工位布置参考图 · 独立制作记录

基础交付 3857f3c3f1f9，制成的新查看器为 d9dd539b0161。按随包示例把新挂画安装在原公司的一层歌舞训练室，保留公司和房间身份、现有设施及训练净空约束。可编辑房间在 room/layout.json，带依赖的存档在 room/save.json，版本为 revision 3。可单独移交的完整目录是 delivery。

挂画身份为 studio-reference-print@1，实例为 concept-dance-training-rental/ground/dance-training/reference-print。局部位置 [1.05,1.5,-1.9]，yaw 0。素材来源是委托方随包交给本次本地制作使用的 art-input/studio-reference.png。原图的 1280 × 720 像素画面在方框内按比例显示，确认左侧工位、右侧沙发及中部空地均可见。GLB SHA-256 为 bd2e878a0d34a882a88e00d2118c5f55a292eb4528d12b3cd1bc08e0efc645c2。配方 art-input/print.json 和安装操作 art-input/print.ops.json 为本次新建输入。

## 重做命令

从附带原图的干净 v2 包根目录执行。先放入上列两个制作输入，输出目录须未被使用。本机 npm 缓存内有锁定依赖，使用离线安装。

```powershell
Push-Location source/prototype
npm ci --offline --no-audit --no-fund
Pop-Location
New-Item -ItemType Directory consumer-result
node source/scripts/company-platform/import-wall-print.mjs art-input/print.json
node source/scripts/company-platform/build-library.mjs --check
node edit.mjs apply data/save.json art-input/print.ops.json consumer-result/room
node edit.mjs validate consumer-result/room/save.json
node source/prototype/scripts/build-company-id.mjs
Push-Location source/prototype
npx --offline vite build --config vite.company.config.js
Pop-Location
node source/scripts/company-platform/package-company.mjs source/prototype/dist-company d9dd539b0161 consumer-result/room consumer-result/delivery --source source
node source/scripts/company-platform/qa-wall-print-ingress.cjs source/prototype/dist-company d9dd539b0161 consumer-result/room/save.json art-input/studio-reference.png studio-reference-print consumer-result/qa --record
```

## 接收端验证

从新包 consumer-result/delivery 出发。复跑制作入口输出 unchanged，返回同一个 GLB SHA-256。原图、配方和生成器均在这个新包里。

```powershell
Push-Location source/prototype
npm ci --offline --no-audit --no-fund
Pop-Location
node edit.mjs validate data/save.json
node source/scripts/company-platform/import-wall-print.mjs source/assets-source/company-wall-prints-v1/studio-reference-print/v1/recipe.json
node serve.mjs
```

serve.mjs 为手动查看命令。本次运行的是上面 QA 使用的临时 HTTP 服务。qa/report.json 记录首次实际导入、换成旧三联画、原位换回、保存并关闭 Chromium、重新打开自动恢复三个检查组。四张 PNG 和 video/wall-print-normal.webm 位于 qa 下。浏览器使用 SwiftShader，录像为 1 倍速。hashes.json 记录独立交付 1,564 个清单文件全数核对通过，原包 viewer、data 和 465 个既有源目录公共资产文件大小或哈希复核通过。原包历史构建及存档保留，可直接恢复查看。
