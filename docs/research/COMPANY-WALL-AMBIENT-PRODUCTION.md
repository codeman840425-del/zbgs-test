# 墙挂氛围灯的制作与验收

直播室可以配置贴墙灯带、星形霓虹、浅罩壁洗灯或开播徽记。把灯作为房间的设施保存，登记分支用 `ambient-led-and-neon`。安装原点在背面中心，+Z 朝向室内。四款共用 0.62 × 0.35 × 0.04 米的安装包络，可在同一安装位置互换。各款的实际尺寸、作者、许可与可编辑原件在[素材说明](../../assets-source/company-wall-ambient-v1/README.md)中。

民房的灯在直播桌左侧上方，出租屋的灯在桌右侧上方。出租屋楼层整体转了 90°。调节灯的开关、0 至 8 cd 光强和 0 至 359° 色相，可以在房间内看到发光面的颜色和桌面实际收到的光。灯具接入已有实时灯预算。预算已满时可以看见发光面，桌面的照明由当前获分配的灯承担。挂灯的布置不改变座位接触点或门口的可用空间。

## 在可写交付副本复产

在包根目录运行如下命令。输出目录用尚未使用的名称。浏览器临时服务会打印实际地址，在地址后加 `?delivery=ambient-home` 或 `?delivery=ambient-rental` 可打开对应房间。

```powershell
node verify.mjs
npm ci --prefix source/prototype
Push-Location source
node scripts/company-platform/build-wall-ambient.mjs --check
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/test-wall-ambient-rooms.mjs ../wall-room-check
Pop-Location
node serve.mjs 0
```

为现有直播室生产新款，可提交获得授权的 PNG 轮廓或具有独立贴墙件、导光件的 GLB。配方随源记录作者、许可和文件 SHA256。双峰声波例子带有可重新生成 PNG 的原始点列。制作方在可写副本的 `source` 目录运行以下命令，然后在房间实例中引用输出的资源 ID 和版本。其他房间继续引用各自保存的版本。

```powershell
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-wall-ambient-v1/examples/studio-wave-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-wall-ambient-v1/examples/studio-wave-v2.json
```
