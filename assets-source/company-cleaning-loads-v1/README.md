# 可更换的清洁层板物

四款使用同一个底面中心挂点。安装包络宽 0.38 m、高 0.30 m、深 0.23 m，登记在 `contract.json`。纸箱宽度计入外翻盖片。落地柜架和车由房间另外选择，生产时可根据实际层板深度、层间距和门前净空选择摆向。

- 手提清洁篮有底、四边、双槽隔板、两根把手立柱和横握把。配方 `handleTopMetres` 可取 0.240 至 0.298 m。默认 0.270 m。
- 开口耗材箱与闭盖补货箱来自 Kenney Furniture Kit 2.0。原件、逐文件 SHA-256 与 CC0 许可保存在 `original/`。原作者页面见 [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)。两款以原米制尺寸居中，`sourceScale` 允许在 0.90 至 1.00 之间等比调整。开箱可从上方直达箱底，闭箱中央有盖板。
- 布巾分格补给盘由浅盘、隔板和两组折叠布巾组成。`foldPairs` 允许每格 1 至 4 叠。一叠包含下层和回折上层。清洁篮和布巾盘的源说明在 `original/PROJECT-SOURCE.txt`。

在制作工程根目录安装锁定的 prototype 依赖后，运行下列命令。试制输出使用新的空目标路径。生成器重新读取 GLB，测量四款实体的宽高深、九处底部承托、握把/分格/箱盖，再写入 collection.json。正式目录按资源 ID 与版本区分。

```powershell
node scripts/company-platform/build-cleaning-loads.mjs --write
node scripts/company-platform/build-cleaning-loads.mjs --check
node scripts/company-platform/build-cleaning-loads.mjs --output output/public-storage-cleaning-v1/production/own-test --parameters assets-source/company-cleaning-loads-v1/examples/caddy-tall-v2.json
```

接收方可在可编辑副本通过现有发布入口生成并登记第二版。示例保留 v1，将高把版的握把上沿提高到 0.295 m。房间继续使用其保存的明确版本。

```powershell
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-cleaning-loads-v1/examples/caddy-tall-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-cleaning-loads-v1/examples/caddy-tall-v2.json
```
