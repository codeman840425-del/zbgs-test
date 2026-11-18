# 直播工位参考图入库盲测

交付构建 76854ce901e1。输入图为 art-input/studio-reference.png，1280 × 720，1,063,587 字节。只读取本包的素材、说明和源码。第一次停止点是新位图制作，未产出含新画面的 GLB、可加载房间、截图或可交接的新版本。

## 从包根重现

```powershell
node edit.mjs validate data/save.json
Push-Location source/prototype
npm ci --no-audit --no-fund
Pop-Location
node edit.mjs validate data/save.json
python consumer-trial/reproduce.py
```

第一次验证报 ERR_MODULE_NOT_FOUND，window-cover-data.js 无法导入 three。安装锁定依赖后，原存档 concept-dance-training-rental revision 2 验证成功。包根 README 把 npm ci 写在训练与重建章节，但普通存档验证也有此依赖。本次使用 Node v24.13.0，Python 3.13.11，Pillow 12.1.0 和 fonttools 4.64.0。

脚本在独立输入目录复制历史配方及配套字体与许可证，保留所有原条目，附加了一条假设的 image 图形输入，指向本包新图。它正常解码和计量输入 PNG，并实际执行以下随包生产命令，记录原始 stderr 和退出码至 report.json。

```powershell
python source/assets-source/company-information-v1/generate-content.py --input consumer-trial/input/parameters.json --output-dir consumer-trial/output
```

退出码 1，最后一行为 `ValueError: unsupported graphic for studio-reference: 'image'`。磁盘上没有生成任何 PNG。墙挂信息面合同第 17 行明确仅支持 bars 和 signal，JavaScript 制作入口也在 build-information.mjs 第 28 行检查这两种图形。

另一入口 build-concept-acoustic-panel.mjs 第 9 至 13 行固定了一张旧六边形吸音板原图、模型和侧录路径。第 52 至 59 行固定旧 ID@1，按该身份改写目录。其命令行只区分 --check。collection.json 是生成输出。仅新增配方或传入新图路径无法指定独立源图和身份，覆盖旧资产会破坏历史资源。随包 build-library.mjs 能登记已经做好的 GLB，但没有把该 PNG 做成新 GLB 的步骤。

复查 transfer-manifest.json 中全部 1,554 项文件的大小和 SHA-256，差异 0。最小缺口是一条随包可运行的制作入口，能从新本地 PNG 和独立 ID/版本按明确适配规则导出挂画或可换信息面资源，并给出登记与构建命令。其后才能实测替换、房间加载、保存、恢复和独立交付。
