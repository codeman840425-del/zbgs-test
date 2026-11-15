# 269a73423c97 集成与证据恢复核查

2026-11-14，独立只读源码/dist审查；浏览器验收由 QA 执行，本文件不代替其结果。

`experiments/m1-joint-integrated-1/dist/build-info.json` 标记 `269a73423c97822c634b9376f1f0b1e21e91fae41210556c40046a73b884a67e`。共享 motion、foundation-avatar、foundation-profiles 三文件实际 raw SHA 与 portable candidate 精确一致；helper SHA 与冻结 pin 一致；新 dist 三份手 profile 字节 SHA、各自 bodySHA 全匹配。具体回执 `integration-source-check-269a73423c97.json`。

共享 main、live-presentation、material-recipes、cloth-material、equipment、m1-equipment 六文件与 abdb 独立审查时 SHA 完全一致。故 greetingReady、recipe API/清理链和当前经营演示控制未被旧隔离目录覆盖；三份当前专属前臂 profile 仍在配置中。没有引入被否决的 05 alpha 证明缓存。此为源码保留证据，不代表新手修正后的所有组合运行通过。

269 仍需以自身构建身份核查三体 actual/legacy 接触、greetingReady/卸麦、材质恢复及成本/正常片。44/08 仅是历史算法与配置证据。

## 解决 ignored output 的证据恢复缺口

历史 `RESULT.md` 与旧 receipt 原样保留。它引用的必要数据现归档至本目录 `evidence/`，`evidence/index.json` 是原路径→仓库路径映射，每条含原始字节 SHA/大小和归档字节 SHA/大小。

- 44 两份完整未经转码 WebM；两份完整录制 trace、report 与启动异常/attempt记录。
- 44 源动作 actual/legacy 各 270 帧完整 JSON（没有删减字段），及原对比结果。
- 44 初次 actual skin 原始结果；两次无录制成本与一次分项成本的完整原始 trace/summary。
- 08 三体 actual/legacy 共六份完整逐样本 JSON 与两份总报告。负例仍保留失败结果，不改为通过。

共 25 文件，原始 124,877,614 字节；归档 49,281,566 字节。JSON 为 gzip level1 无损压缩，视频逐字节复制。所有文件已读回验证原始 SHA 与压缩 SHA；没有复制输出目录中的大批截图/解码帧，原片可重新抽帧。原 output 文件均未改。

新检出无需 `output/` 即可验证：

```powershell
python assets-source/hand-joint-contact-v1/scripts/archive-evidence.py --verify
```

读取任意 JSON：Python `gzip.open(path, 'rt', encoding='utf-8')` 后 `json.load()`。如旧分析脚本要求原路径，按 index.sourcePath 在**新的临时恢复目录**建立同名相对路径，将 gzip 解压写入，视频按原样复制；不要覆盖现有历史输出。需要运行新浏览器回归时，应使用新固定构建和新输出目录，不将恢复的数据误作新执行。

`archive-evidence.py` 的默认模式只从显式白名单生成归档；已有 index 时只验证，不重新覆盖。压缩、解压校验合计约 1.8 秒，本次在 QA 确认非性能/录制窗口后执行。

源包/新增归档在本次审查时仍待 root 统一 Git stage/提交；“已复制到非忽略路径”不等于已经远程备份。
