# 5d / aa6f 构建差异定位

结论：不是三域准入重构、几何改变、CRLF或混编。首次发“源码冻结”之后，本代理又修改了 `appearance-workbench.js` 的 `sync()` 一行：由已建好的固定两选项，改为 `mouthSample.replaceChildren(...geometry.mouthSupportedValues.map(...))` 动态生成下拉选项。这个写入发生在5d构建完成之后。冻结后继续修改是执行纪律错误；后续冻结消息之后不再追加产品改动。

## 精确证据

- final-cpu原工作台快照SHA `a014c1e114a7f24e7b108dedda95ae3206902136cf7edf4ad228a4017d319365`；当前/提交ed9b631版本SHA `db55baede07ed9f72475f39952aa840d7d95b9065c7e47d366e37e95522193ca`。原新文件与完整单行diff已保存。
- 用当前输入仅以旧工作台字节替换读取，严格按现build-id的文件名+NUL+内容+NUL顺序重算，完全得到 `5d3311c32e1973aad3a9d6018e44cef735d8adb8beda0177cea8afc7a315ec76`。
- 全当前输入得到 `aa6fc6159e2d0861fd6c791c63b9d81ed60443d4f759d93c721f2ad328e31272`。见digest-check.json。
- `final-cpu/facial-geometry.js`、`appearance-recipe.js`与当前产品字节完全相同，排除root最初怀疑的三域逻辑改动。
- 隔离目录 experiments/reproduce-5d-source/prototype：复制全部build-info输入，仅替换旧workbench，用相同锁定node_modules（只读junction）执行原 `npm run build -- --outDir ../dist`，预构建ID为5d。新隔离dist的97文件与原v18/dist逐字节一致，missing/extra/changed均空。见rebuild-byte-check.json（两套完整SHA清单）。没有写入正式源码、两份固定dist或源码pin。
- 新旧bundle字符串长度相差190，5d无 `mouthSupportedValues.map`，aa含该新增生成逻辑。minifier局部变量重命名造成较大的文本diff，不代表其他功能变化。

文件时刻（本机本地时间，辅助证据，不作为唯一身份依据）：快照11:41:28.442；5d build-info11:42:34.960；5d bundle11:42:38.849；晚改工作台11:42:45.129。见file-times.json。

## 恢复/复验边界

5d的QA仍绑定5d，不能改标aa。旧输入可由ed9b631独立检出 + 本包old-appearance-workbench.js覆盖该单文件恢复，然后原npm build；此操作只能在新隔离检出进行。只读重算入口：`python evidence/workbench-build-drift-5d-aa-v1/verify-source-digests.py <ed9b631-checkout>/prototype`。

aa受影响范围是工作台sync时下拉选项重建：原男↔jaw切换应显示正确数框/两态；jaw选项仍原位/+4、应用后当前值不丢、文件恢复后选中正确，其他三域禁用保持。不会改变嘴宽求值、normal、原男女数值范围、资源身份、动作、文件恢复事务或reset的语义。建议补这些实际UI项，不将5d全功能QA直接换标，也不重跑无关舞/裙。
