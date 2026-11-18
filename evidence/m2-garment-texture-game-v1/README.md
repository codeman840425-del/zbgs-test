# 男女制服上衣的选装、交付与回读

[打开同镜头 1 倍速回放](index.html)。左侧使用原 2048² 底图，右侧使用 1024² 派生。人物、裤鞋、衣物几何和领带贴图相同。四段录像分别完成房间内走、坐、起、再走及记录恢复。预览端和独立游戏包共用固定源码 `80fb16b7`，两份干净检出的 520 个构建文件相同。

生产端对两个原始完整造型执行同一批创建，再分别提交指定身体、服装角色、装备编号及摘要的编辑请求。两个角色均从修订 1 升至 2。装备加载失败的独立场景只给女性轻量上衣返回一次 503，旧套装、已启用遮罩和原配方保持一致。[创建输入](create-near.batch.json) · [原记录](records-near.json) · [编辑后记录](records-far.json) · [换装对照及失败回滚](room/report.json)

| 独立游戏首次加载 | 原上衣文件字节 | 轻量上衣文件字节 |
|---|---:|---:|
| 男性精简制服体 | 2,762,796 | 743,232 |
| 女性基础体 | 2,696,548 | 765,288 |

两件合计少下载 3,950,824 B。Chrome 禁用缓存与 Service Worker 后，首次进入和关闭重开均实读响应、核对体积和摘要；每名角色只请求自己记录选中的上衣一次。两具身体的单件纹理预算仍超限。此处的服装传输量、整包磁盘体积及 RGBA 纹理预算分别计量，普通电脑帧耗时和显存仍待实机测量。[原上衣冷载](cold-near/report.json) · [轻量上衣冷载](cold-far/report.json) · [整包交付与预算](receiver/README.md)

男女站、坐及两个镜头的配对帧均使用相同骨骼矩阵、时钟与镜头。恢复原上衣时四个房间镜头的衣面区域逐像素相同；近景三组各有 2–3 像素产生 1/255 的单通道差，严格逐像素恢复保留未通过。女性腹部小青点在原版与轻量版均可见。对照只覆盖这两具身体、这两件上衣与现有房间光照。源端和编辑态继续保留原图。诊断先后两次在像素断言中止，此后收集完整八组与失败回滚再报告像素差；断言口径未放宽。

## 重新执行

在工程根目录创建新的工程内输出目录。用 `python -B scripts/character-worktree.py create 新名称 80fb16b7 --runtime-only` 建立固定运行检出，在该检出的 `prototype` 安装锁定依赖并构建。用 `python -B scripts/production/garment_basecolor_runtime.py --check` 复算生产资源和精确蒙皮适配，再按下列顺序调用现有生产脚本。浏览器测量与录屏逐个运行。

1. `python -B scripts/production/garment_texture_requests.py create --out 新目录/create.json` 生成双角色批次。用 `node scripts/character-production-cli.cjs --dist 固定构建目录 --request 新目录/create.json --out 新目录/records-near.json` 取得签名记录。
2. `python -B scripts/production/garment_texture_requests.py edit --near 新目录/records-near.json --out 新目录/edits` 生成两份精确更新请求。分别交给相同生产 CLI，输出 `male-far.json` 和 `female-far.json`。用同一 Python 脚本的 `merge --near … --male … --female … --out 新目录/records-far.json` 验证并合并返回记录。
3. 按[接收说明](receiver/README.md)用每组记录制作可独立运行的游戏包。用 `node scripts/run-fixed-check.cjs 对应游戏包目录 scripts/qa-garment-cold-package.cjs 5859bd00da8b 选中记录数组 另一组记录数组 新证据目录` 核对实际网络请求、可见装备和关闭重开。
4. `node scripts/run-fixed-check.cjs 固定构建目录 scripts/qa-garment-basecolor-room.cjs 5859bd00da8b 新画面对照目录` 保存近远和恢复帧。对每条单人记录运行 `node scripts/run-fixed-check.cjs 固定构建目录 scripts/qa-production-record-room.cjs 单人记录.json 新录屏目录`，保存完整房间动作链。
