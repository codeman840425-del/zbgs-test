# 四款落地唱麦与两间唱播房

正式包位于 `company-workspace/deliveries/vocal-mic-looks-v1`。固定源码为 `c24cfe399fe938c8750eef80ae534394affd8031`，查看器构建为 `30a86515c5da`。四款沿用同一站位，工作室默认安装圆盘短臂，出租屋默认安装黄铜广播架。[两房批次与生产命令](../../docs/research/COMPANY-VOCAL-MIC-LOOKS.md) · [四款实物对照](browser/four-microphone-comparison.png) · [31.72 秒原速录像](browser/video/vocal-mic-looks-normal.webm)

两间房分别通过三脚悬臂、圆盘、双梁悬篮、黄铜广播架的实际界面换款、保存、关闭浏览器和重新打开。房间参考口点到网头实物约 13.02 厘米。CPU 每页检查 260 个谱面样点，浏览器每页独立检查 121 点。早期黄铜款挡住镜头到眼位的视线，修正了侧支架形状后，两间房均通过原检查。[首次遮挡](cpu/first-camera-obstruction.json) · [固定几何](cpu/report.json) · [浏览器](browser/report.json) · [录像核验](browser/media-review.json)

接收方只改圆盘配方半径（0.20 米至 0.24 米）并分配新 ID，制成第五款，复产后把它装入出租屋，保留站位、进退点和工作室的八个具名文件。第五款验证覆盖独立打包、网格及房间冷读；界面录像展示固定四款。正式包和接收方派生包各核验 2,221 项。接收记录中的 `candidate-final` 是封存前的目录名，与正式目录的清单 SHA-256 相同。[接收报告](receiver/report.json) · [第五款配方](receiver/receiver-disc-wide.json) · [621 个查看器文件重建对照](cpu/fixed-rebuild.json) · [制作源完整性](cpu/source-integrity.json)

角色端回执给出的原站位实测口距为男性 22.2／22.5 厘米、女性 30.1／30.2 厘米，女性超过角色端采用的 26 厘米上限。四款共用固定拾音点，现有麦架没有运行时高度调节。独立试制保存的另一离线角度可使网头中心降低约 1.98 厘米，女性适配仍待真实角色复验。普通电脑性能与最终角色联调仍待验收。[历史角度实物测量](cpu/archived-height-options.json)

从项目主目录可复核封存包。

独立接收方另完成了空缓存联网安装、查看器逐字节重建、双房修改与失败重试。[空缓存复跑与验收](cold-install/README.md)

融合组从同一正式包另外改制广播款，将立柱从 114 毫米加宽到 134 毫米，实测柱盖也增宽 20 毫米。派生包 `ac04ccd94715a0368cee9fc63217595413eb6f241bb3ed3cdec0773e76e14953` 中的 2,224 项、重建查看器的 623 项均通过独立比对。新款在具名工作室中实际换入、换出并完全关闭后恢复，具名出租屋保留原档。该造型独立于本组的宽圆盘款。融合组回执 SHA-256 为 `ee9d0c6cd02c3ac6a13f03291d09e645a1ed99a2177d07d63643fd9aae41a28a`。[融合组独立回执](F:/gamemake-test/native-studio-round/independent/vocal-looks-ec8d/RECEIPT.md) · [实物画面与录像](F:/gamemake-test/native-studio-round/environment/vocal-mic-looks-browser/watch.html)

```powershell
$bundle = './company-workspace/deliveries/vocal-mic-looks-v1'
node "$bundle/verify.mjs" $bundle ec8dec4d4bebebafab4fb70b834945a32a9826d0e2d58c6cba3861a643e8574e
```
