# 房间中的角色移除与换座

修复前，角色离开房间后，设施面板还保留旧名字，再点入座会报错。现在面板从房间内实际存在的角色读取名册。移除当前人物后可以操作幸存者；同一轮输入里已经指向旧人的点击会返回目标失效，空房间会禁用角色操作。座位继续由正在使用它的角色占用。

在民房和出租屋各检查了 9 个阶段，包括行动中和加载中移除、移除最后一人、换组、恢复及失败回滚。实际按钮另在民房完成入座、争用拒绝、起身、接替。此处使用男女两份制服签名和两个固定房间。普通电脑、任意家具与更多人物组合待验证。[原速录像](controls/room-controls-1x.webm) · [民房结果](plant-home/report.json) · [出租屋结果](plant-rental/report.json)

## 复建和回退

游戏输入仍为 `989deed3 / d9140194fb84`，游戏清单 `1759505cc6ef16f93a16508ba795ac52c060e137306f0742d4950423d71f8406`。公司输入 `d57333ea66d2`，交付清单 `6359150e83c284125dc757ac6680cc326d58bf57df142dfc4af0d6b522c658f2`。从[原角色包复建方法](../m2-company-seat-clearance-v1/README.md)生成独立的 `pair` 目录，再在宿主源码 `752b2b39d8ffeb1b9c4c2028f09a243b97d34e51` 的检出根使用锁定依赖执行下列命令。示例的公司交付目录与本机一致，其他检出可以使用内容相同的转移包。

```powershell
$pair = 'F:/gamemake/output/m2-company-seat-clearance-fixed/pair'
$company = 'F:/gamemake-test/native-studio-round/official-pair/body-texture-f496/received-room'
$out = 'F:/gamemake/output/replay-facility-roster'
$pin = '9ddfb10321f5ee241ba380381757cbf5f2754d99449ac36232531723bd8d11ce'
New-Item -ItemType Directory -ErrorAction Stop -Path $out | Out-Null
node scripts/production/package-facility-room.mjs --game $pair --game-sha256 1759505cc6ef16f93a16508ba795ac52c060e137306f0742d4950423d71f8406 --room $company --out "$out/rooms"
node scripts/run-fixed-check.cjs "$out/rooms" scripts/qa-facility-roster.cjs $pin "$out/plant-home" plant-home
node scripts/run-fixed-check.cjs "$out/rooms" scripts/qa-facility-roster.cjs $pin "$out/plant-rental" plant-rental
```

两次使用相同版本合包得到完全一致的 597 个文件。相对旧版，仅宿主脚本与合包清单改变。回退可用 `3d855cec` 的宿主打包工具和相同游戏、公司输入重建 `1c86367d…eedf8`。[逐文件核验与证据哈希](verification.json)
