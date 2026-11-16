# Git 保留包核验补充

原 `manifest.json` SHA `d76516a8aada756657c7b68e9e236ad99e0305b12e161d6a4f44eb88224bf610` 和原 `scripts/mouth-visible-v2/manifest.py` 未改。它们记录完整执行输出；旧 `manifest.py --verify` 仍是 **full-local** 核验，要求所有 raw/repeat/fresh 二进制存在。在精简 Git 检出上该命令应因缺重建输出失败，不能冒称通过。

新入口：

```powershell
python scripts/mouth-visible-v2/verify-retained.py
```

它先核原完整 manifest 固定 SHA，再从原清单按固定规则导出保留集，与新 `retained-manifest.json` 逐项比对，最后核全部保留文件、原依赖和新增校验文件的 bytes/SHA。

保留四份 canonical `generated/*/editable.blend`、四份 `avatar.vrm`、spec/recipe/生成脚本、原来源及依赖、mapping/normal-reference、所有 JSON 审计和 fresh 重做比较。只允许省略 generated 的 `addon-export.vrm` / `addon-repeat-export.vrm` / `repeat-export.vrm`，以及 fresh-check 子目录中的非 JSON 重建文件。未删除本地任何源或输出。缺 canonical/source/dependency 必须失败，不可通过更改身份 pin 或自动降低为“可重建”绕过。

新 retained 清单不改原执行哈希；额外固定本 README、当前局部 .gitignore、独立 verifier 及原完整 manifest。完整重建时按旧 README/脚本从 pinned 原底新输出执行，然后才可用旧 full-local 命令。正常源使用、安装或保留包备份不要求重复保存整套 fresh 二进制。

四包隔离 Git index 导出及保留核验回执见 `evidence/face-visible-retained-verification-v2/RESULT.md`。该演练无 Git 提交、无主 index 改动，不等于产品运行或视觉验收。
