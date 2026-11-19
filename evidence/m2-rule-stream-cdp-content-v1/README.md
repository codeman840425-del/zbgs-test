# 同一 CDP 请求的正文采样

普通生命周期观察器追加 `--cdp-content-record RECORD_ID` 可采集一个外置身体的响应正文。输入是独立固定普通包及其已知清单 SHA。观察器从清单核对记录、身体文件、来源及大小，以首次匹配该 URL 的 GET 为目标。在其 `Network.responseReceived` 事件发送一次 `Network.streamResourceContent`。游戏继续原来的读取和 SHA 校验。

```powershell
node scripts/run-fixed-check.cjs F:/gamemake-test/rule-blind-9c72d4fd/output/receiver-cft-replay/receiver-jaw-orchid/game scripts/qa-rule-stream-lifecycle.cjs 5ae993bf95c95fc807aeee391f21a3d19724c8a6161edb70e0296535d2a45bec evidence/m2-rule-stream-cdp-content-v1/orchid-01 --cdp-content-record receiver-jaw-orchid --browser-config scripts/production/fusion-cft145.json
```

原始事件按 CDP requestId 保留。`cdpContent` 单列命令回执的前缀，以及 `dataReceived.data` 送出的后缀。回执可能先于或晚于带数据事件到达。采样器按该请求的事件字节偏移放置后缀，在核验时要求前缀长度与所有前置无数据事件的解码字节之和相等，后缀无空洞，两段之和与受信文件长度完全相同，并比较正文总 SHA。报告另列两段各自实测的 SHA。正文目标数组限于该文件实际大小，并设 32 MiB 硬上限。报告不保存原始 base64 或模型正文。

角色归属沿用双向唯一的 URL、GET 和时间匹配，并要求页面默认读取器读满至 EOF，签名所指身体已挂入场景。页面对象没有 CDP 请求 ID，此处保留时间关联性质。重定向、缓存、命令失败、缺口、重复字节、错误摘要、缺少终态和归属不明都会保留拒绝原因。接收到完整正文且有 `loadingFailed` 时，分别记录正文结果和原取消终态。该诊断不补算线上传输量，不改变原严格验收结论。

从 F 盘根运行以下命令已有 24 项 CPU 测试通过。默认路径未发送采样命令；盘根作为报告目的地时在请求服务器前被拒绝。[CPU 回执](cpu.tap)

```powershell
node --test F:/gamemake/scripts/qa-rule-stream-content.test.cjs F:/gamemake/scripts/qa-rule-stream-lifecycle.test.cjs F:/gamemake/scripts/qa-cold-assets.test.cjs
```
