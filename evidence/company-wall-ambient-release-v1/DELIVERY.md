# 直播墙挂氛围灯

[正式移交包](../../company-workspace/deliveries/wall-ambient-v1/README.md)固定源码为 `ebb45fbe99f4188a1f95c24e5352225cb8023082`，查看器构建为 `e5a77d978335`。正式清单 `66eade0eb3f5eacc1382777755b4d11ba77b39fe60f6f5a7035d3d569195e7c0` 的 1,902 个文件已通过校验。[12.68 秒原速录像](browser/video/wall-ambient-rooms-normal.webm) · [民房星形灯](browser/ambient-home-wall-ambient-star.png) · [出租屋开播徽记](browser/ambient-rental-wall-ambient-studio.png) · [构建与清单身份](identity.json)

三段贴装灯带、空心星形霓虹、浅罩壁洗灯和开播徽记共用 0.62 × 0.35 × 0.04 米墙挂包络。两份直播室分别实测四款换装、开关、光强、色相和关闭浏览器后的恢复。验收在桌面接光区比较开关、调光与换色画面，还验证了两盏实时灯的预算。预算抑制时，导光面仍然发亮，桌面像素保持一致。正式录像为 1500 × 950，25 fps，全部 317 帧已解码核对。[关灯桌面](browser/ambient-home-off-actual.png) · [暖色受光桌面](browser/ambient-home-warm-actual.png) · [正式浏览器报告](browser/report.json) · [录像核对](browser/video-review.json)

CPU 读回核对真实背面接触、四个导光网格和灯点，逐顶点比对保留 Kenney 原件的壁洗灯。两房的实际桌面受光接触点、开关、占用预算和无效输入拒绝均有回执。[几何报告](production/geometry.json) · [房间报告](production/rooms.json) · [运行报告](production/runtime.json)

## 独立接收与临时复包

接收方先验证[首次接收候选](../../output/wall-ambient/candidate/README.md)，在独立试制副本用现有 npm 缓存离线安装并重建。551 个查看器文件和两房的 8 个批次文件逐字节一致。随后用随包可编辑点列重生原创声波 PNG，经正式发布命令制作第五款 `wall-ambient-studio-wave@2` 并把它装进民房。出租屋的输入、布局和存档保持原字节，生产报告更新了素材目录哈希。坏素材哈希和色相 360° 均被拒绝，受保护的既有结果保留。[独立生产回执](receiver/production.json) · [查看器逐文件复核](receiver/viewer-bytes.json) · [坏输入保全](receiver/source-rejection.json)

[独立派生包](../../company-workspace/production-trials/wall-ambient-receiver-v1/published-ambient/README.md)构建为 `ced10deed852`，清单 1,907 个文件全部通过。实际浏览器先载入具名出租屋的徽记，再回到民房，调第五款为 280°、6.8 cd。关闭浏览器后去掉交付查询参数冷开，恢复了同一存档、导光颜色和实际光束。[派生浏览器报告](receiver/browser/report.json) · [具名出租屋](receiver/browser/00-named-rental.png) · [第五款冷开](receiver/browser/03-cold-violet.png)

正式包与首次接收候选的区别是打包工具增加了本机输出位置检查。接收方用新工具在 `output/wall-ambient/receiver/filed-published-ambient` [临时复包](../../output/wall-ambient/receiver/filed-published-ambient/README.md)，重新校验 1,907 个文件，与原派生包逐项比对后只有打包工具字节变化。路径检查拒绝了当前公司项目之外的目标，也验证了项目内试制区可进入输入校验、临时输出区可成功打包。原接收和补验的各个清单与有效路径分别列在身份文件。[新工具回执](receiver/package-tool.json) · [四份包身份](identity.json)

## 使用与复核

在正式包根目录运行。打开打印的临时地址可将查询参数改为 `?delivery=ambient-home` 或 `?delivery=ambient-rental`。

```powershell
node verify.mjs . 66eade0eb3f5eacc1382777755b4d11ba77b39fe60f6f5a7035d3d569195e7c0
node serve.mjs 0
```

在独立可写副本根目录执行，给每项检查选新结果目录。

```powershell
npm ci --prefix source/prototype
node source/scripts/company-platform/test-wall-ambient-assets.mjs ./my-wall-geometry
node source/scripts/company-platform/test-wall-ambient-runtime.mjs ./my-wall-runtime
node source/scripts/company-platform/test-wall-ambient-rooms.mjs ./my-wall-rooms
node source/scripts/company-platform/qa-wall-ambient-rooms.cjs . e5a77d978335 ./my-browser-check
Push-Location source
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-wall-ambient-v1/examples/studio-wave-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-wall-ambient-v1/examples/studio-wave-v2.json
Pop-Location
```

浏览器证据来自 Chromium 的 SwiftShader 软件渲染。角色、推流和目标电脑帧率另行验收。[制作、配方和原件许可](../../assets-source/company-wall-ambient-v1/README.md)

## ENV-008 外部独立复验

外测方核对了两房四款的 40 次实际受光观察、8 次冷恢复和原工位补光开关。独立发布的第五款经过派生包实载与关窗重开。 融合测试登记为独立复验通过。外部报告 SHA256 为 `9e7ac9e5b05ede276cdae5218e486db377c0126b20735f8d199524319707517e`。[融合测试原报告](../../../gamemake-test/native-studio-round/environment/wall-ambient-review/WALL-AMBIENT.md)
