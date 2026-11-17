# 独立游戏角色包复验

Windows、Node.js v24.13.0。已将独立检出 HEAD 与审定表中的 `d09c7b0300838d2632fb63674a7a9a9d4d92bb78` 对照。以固定 `65814ccb92c2` 构建重新生成清单，与 `experiments/m2-game-record-package-v1/runtime-package.json` 一致。四份记录顺序一致，全部 51 项文件均通过长度和 SHA-256 校验。

| 修正项 | 实测结果 |
| --- | --- |
| 固定 CLI 审定来源 | 省略 `--reviewed` 时使用仓库审定表。逐字节相同的外部副本生成相同的清单。将外部副本中的 sourceCommit 改为另一份 40 位值会触发 `unsupported-build`，目标路径保持空缺。 |
| 清单写入中途失败 | 使用异步字节迭代器先输出内容，再注入 `ENOSPC` 异常。写入期间最终路径尚未出现，失败后临时目录无残件。随后向同一目标并发重试，仅一个写入者成功，另一个收到 `output-conflict`。再次尝试替换目标同样被拒，已有文件内容逐字保持一致。 |

共用写入器在目标文件所在目录创建私有临时文件，写完并关闭后用硬链接原子创建最终路径。目标文件系统需要支持硬链接。底层文件系统错误直接传回调用方。旧版 7a03 与 801 审定身份已通过 Git 差异核对。

执行 `node evidence/m2-game-record-package-review-v1/review.mjs`。另执行 `node --test scripts/runtime-package/game-record-inventory.test.mjs`，五项全部通过，覆盖直接与传递依赖、源码身份、记录替换和缺失资源时的失败清理。浏览器运行证据由集成验证记录。
