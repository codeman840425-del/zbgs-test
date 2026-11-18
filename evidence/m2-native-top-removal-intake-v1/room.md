# 云岚私有固定包房间回读

开发机使用 Chromium `145.0.7632.6` 在两个独立进程中冷开 `102344d95ee2` 固定包。两次都从 `/record-consumer.html?production=1` 载入原签名记录 revision 1，角色、外观和装备回读一致，场景分别推进了 109 帧。浏览器与临时服务已关闭。完整源码提交、运行 digest、记录、本体、装备及贴图 SHA-256 见 [room.json](room.json)。

首次启动经共享角色的 `setDebugBody` 在同一实例、世界矩阵和相机下执行穿衣 → 基础模式 → 穿回。上衣和下装容器先隐藏再显示，鞋一直可见。两份可见 Body MToon 材质（本体与轮廓）的 `map` 和 `shadeMultiplyTexture` 均为 2048 × 2048。每张贴图穿衣时有 988,155 个全透明、32,532 个半透明像素，基础模式两项均为零，穿回后恢复原贴图引用和计数。第二次冷开恢复同样的穿衣状态。基础模式只同步采样实际贴图，没有渲染或存图。

每次均观察到 7 个资源的浏览器 HTTP 200。6 个 SHA-256 直接来自浏览器响应体。`body.vrm` 的响应体被调试器逐出，两次都以同一临时服务 URL 独立 GET，HTTP 状态和 16,015,956 字节长度与浏览器响应相符。该 SHA-256 来自独立 GET，浏览器回执保留实际 HTTP 状态。

## 使用有权访问的原件重跑

使用已获内部研究授权的私有快照，保留其 `source-inventory.json`、`yun.record.json` 和完整 `fixed-dist/`。工程 `prototype/node_modules` 需已有项目锁定的 Playwright。`$snapshot` 指向该快照，`$chromium` 指向可由 Playwright 本地启动的 Chromium 可执行文件。使用尚未存在的运行名。

```powershell
node scripts/run-fixed-check.cjs "$snapshot/fixed-dist" scripts/qa-native-donor-room.cjs $snapshot yun-102344-recheck $chromium
```

结果、临时目录和两张着装截图写入主检出 `output/native-donor-room/yun-102344-recheck/`。输入快照只读。版本化证据只保留摘要与摘要所依据的报告哈希。工程内私有报告留在 `output/native-donor-room/yun-102344-r05/report.json`。

原 VRM 元数据含 `onlyAuthor`、`personalNonProfit`、须署名、禁止再分发及禁止修改。装备标记为 `internal-study-only`。技术结论限于这份私有固定包的运行接口、装备容器可见标志和贴图恢复。普通电脑性能、动作、接触、独立单槽脱衣及正式发行另需证据。参见 [云岚原接收条款核对](../m2-body-intake-v1/yun-receiver-followup.md)。
