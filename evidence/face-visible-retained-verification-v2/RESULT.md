# 四个可见五官源包的 Git 保留核验

实际通过：221 个必要文件经独立 `GIT_INDEX_FILE` 的 `git add → write-tree → checkout-index` 导出到 `analysis/face-visible-retained-v2-checkout`，未带入90个可重建raw/repeat/fresh输出；在该隔离目录执行嘴/眉/鼻/眼四个保留校验，全部exit 0。不是普通文件复制，也不是把未提交候选冒称现有HEAD发布包。

隔离tree：`59eb310e7ffb732690f3ae961c7677224ecd3e62`。没有创建commit；主index前后SHA相同。实际Git命令、源HEAD、导出路径清单、依赖和核验stdout见 `receipt.json`。

嘴包新增 `scripts/mouth-visible-v2/verify-retained.py`、`assets-source/mouth-visible-v2/retained-manifest.json` 与 `RETAINED-README.md`。原完整manifest固定SHA仍为 `d76516a8aada756657c7b68e9e236ad99e0305b12e161d6a4f44eb88224bf610`，原manifest脚本未改。新校验从原冻结清单推导允许省略的固定集合，核69个原保留文件、15项原依赖及4项新增/完整清单引用；缺必要editable/final/脚本或依赖不能降级为“可重建”。

旧嘴 `manifest.py --verify` 在精简隔离目录**预期exit 1 / FileNotFoundError**：它仍是完整full-local验证，并未篡改既有哈希/降低标准。在保留包上应使用新入口；需要旧全量验证时先恢复/重建其完整输出。

```powershell
python scripts/mouth-visible-v2/verify-retained.py
python scripts/face-brow-visible-v2/manifest.py --verify
python scripts/face-nose-visible-v2/manifest.py --verify
python scripts/face-eye-visible-v2/manifest.py --verify
```

隔离副本的两项拒绝检查：暂移canonical editable、仅改recipe一字节，均实际被拒；随后恢复原字节并重新通过。见 `negative-receipt.json`。没有删除或修改主工作区原源、旧manifest或已有recipe。此回执仅证明保留包可恢复核验，不是生成器重新制作、运行时或视觉验收。
