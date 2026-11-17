# 完整角色记录移交包独立审查

固定源码为 `eb40ba45a3ecee4359f2ef77a53ef5c2d41d8b8c`，固定构建为 `7a03f033973d`。本轮核对角色记录生成、依赖声明、导出入口及共用文件复制分支。三个发现均已在工作树修正。

| 发现 | 修复与复验 |
| --- | --- |
| 合法记录导出后超过工作台 512 KiB 上限 | 使用归档原生女改脸记录，在合法 provenance 中加入制作注记。原版将 391108 字节紧凑 JSON 格式化为 541325 字节，导入端直接拒绝。现按原工作台格式序列化，并对最终字符串调用同一解析入口。391108 字节和 524288 字节两个样件都能逐字段读回。 |
| 读取清单声明早于固定构建元数据的完整校验 | 原版先使用 `build-info.json` 的 inputs 并导入模块，随后才查审定字节。现先校验文件大小和 SHA-256，再解析 JSON，读取声明的 532 个源文件并重算源码摘要。 |
| 编译产物登记了错误的单一来源 | 原版将 JS、CSS、build-info 的来源全部记为 `prototype/index.html`。现登记固定提交、构建 ID、产物路径及对应构建清单或生成脚本。 |

## 本次实际验证

- 审定表中的七个固定文件逐个通过长度与 SHA-256 校验。房间入口使用的 HTML、favicon、两份 JS、CSS 和构建身份文件都进入原生女记录包。另一个 JS 是独立 `foundation.html` 页面的入口。
- 原生女记录生成 28 行文件声明。移除实际加载的身体覆盖 PNG 声明后，导出拒绝并返回 `inventory-mismatch`。
- 现有七项资源收集用例在 7a03 固定目录运行通过，覆盖两份原生记录、长发与颜色、短裤布纹、五官样件、皮肤层、耳帽和替换上衣，包括删除、修改依赖和错误身份。
- 使用旧固定 801 目录执行旧男马甲短裤适配器。原来的两个生成文件均在清单中；28 项声明连同运行清单实际导出 29 个文件，回读清单一致。

执行 `node evidence/m2-record-package-review-v1/review.mjs` 及 `node scripts/runtime-package/record-resources.test.mjs experiments/m2-character-material-release-v1/prototype/dist`。复验环境为 Node.js v24.13.0，现有独立检出和已安装依赖。此报告覆盖 CPU 文件与解析路径，干净目录中的实际浏览器请求、播放和画面另由集成验收。

| 复验源码 | SHA-256 |
| --- | --- |
| record-inventory.mjs | `5cd46e73fec7ff067254eef7cb1fdfc1124a797a82549c3a4bbf5383c6feff2a` |
| record-resources.mjs | `ff6f1528b6dd5be55634d6cff8875652a2360d9fed3c532f6275c3311cd3d439` |
| files.mjs | `cb0d27160939ece7a3de80bb2ba6399f3dee2a9c1e44de6a490888a245220dae` |
