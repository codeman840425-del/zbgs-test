# mouth-visible-v2 归档建议

未删除本地文件，未修改已冻结嘴源 manifest/recipe。`plan.json` 枚举每个保留/可重建文件的实际 bytes/SHA，`suggested.gitignore` 给确切排除规则。

- 建议保留136,815,557 bytes（另加原完整manifest自身）：四份canonical editable约59.87MB、四份final约74.01MB，加recipe/spec/脚本/映射/normal-reference及全部JSON证据。
- 可不重复版本化556,222,910 bytes：generated addon/repeat VRM、fresh重做二进制。fresh的build/normal报告与rebuild-comparison仍保留，实际重复结果哈希没有丢弃。
- 无单文件>90,000,000 bytes；最大约19.27MB。

保留原完整manifest作为执行凭据。它的旧 `--verify` 仍要求完整本地包，不能在精简检出上冒充通过；采用建议后应另写明确只核retained的验证，或先按脚本重建缺失输出。新眉鼻眼v2包已采用 files/reconstructibleFiles 两部分和 `--verify`/`--verify-full` 的明确区分。
