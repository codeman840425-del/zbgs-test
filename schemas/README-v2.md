# QA avatar record v2：独立握持适配身份

本扩展仍是本地数据合同验收，不是游戏存档、经营主播ID系统或新产品UI。历史v1校验器、fixture与ca72证据保持不变。

版本入口：`scripts/avatar-record-contract-v2.mjs`，新fixture为 `fixtures/avatar-record-catalog-v2.json`。v2复用v1的身体/服装/身份/长期容貌边界，但新增麦克风 `attachmentFit`：实际握姿id、完整文件SHA、源文件声明的fitVersion、compatibleAvatarSha256、compatibleAccessorySha256及method。启用麦克风时，它必须与实际 `livePresentation.getState().fit.gripProfile` 完全一致；关闭麦克风时为null，不能假装未加载的fit已经验证运行。

provenance新增独立握姿manifest的schema与文件SHA，并固定实际候选的presentation sourceDigest。眼镜没有独立版本化fit文件，因此保守地固定整个presentation构建，避免以相同GLB身份冒充跨算法版本完全一致。此设计优先明确拒绝，不是已实现的自动迁移机制。

显式schema分支：

- v2：完整验证body、fit、附件及presentation版本后才能应用。
- v1且麦克风启用：先验证原v1合同是否合法，再抛出 `migration-required:v1-mic-attachment-fit`。不静默套用新握姿。
- v1且麦克风关闭：纯校验仍明确返回v1身份，不升版；新浏览器adapter只应用v2，旧记录保留只读/迁移边界。
- 未知schema、握姿缺失/错版本、另一身体握姿、附件不兼容、manifest或presentation不匹配：明确拒绝。

从固定候选建立新fixture，不改v1：

```powershell
node scripts/build-avatar-record-fixture-v2.mjs experiments/turn-candidate-7/dist
node scripts/qa-avatar-record-contract-v2.mjs --out=evidence/avatar-record-contract-v2-node-38ea4eda48aa.json
```

生成器要求 `--source-root`（默认prototype）的完整inputs摘要与该固定dist相同，避免将新runtime profile混入旧构建；旧0df与当前source不匹配会明确拒绝。当前v2已从固定 `38ea4eda48aa` 成功重新生成，完整source摘要匹配。v1保持原样；不能仅替换manifest哈希。

装备按实际manifest重建：资源ID、slot、字节长度/hash、兼容body、真实GLB/raw骨名与body/garment两侧inverse bind矩阵均校验；profile.outfits决定可恢复组合。男性短裤的原始styleId与fitId显式存入record，fitResourceId仍是实际加载ID。profile hash现在对实际 `foundationProfile()`返回值计算（包含派生outfits），并在浏览器与avatar.config核对。`scripts/qa-catalog-bindings.mjs`已验证8件实际装备及16个错绑定/错身体拒绝项，见 `evidence/avatar-record-v2-bind-check.json`。这只是离线绑定证据，不是房间穿着通过。

实际grip fitVersion是文件中的 `source-grip-v1`，没有由QA伪造版本；握姿另核对实际mic资源身份。固定38ea的41项Node检查通过，含F裤/裙、M长裤/短裤的精确组合与显式fitId篡改拒绝，见 `evidence/avatar-record-contract-v2-node-38ea4eda48aa.json`。这不继承旧长裤的短裤视觉验收。

固定浏览器检查入口（取得独占窗口后执行）：

```powershell
node scripts/run-fixed-check.cjs experiments/turn-candidate-7/dist scripts/qa-avatar-record-v2.cjs 38ea4eda48aa
```

它检查F裙/M短裤实际身体和装备、麦克风/眼镜与握姿身份，localStorage保存后关闭页面，同origin新页加载兼容身体并应用，比较实际状态。26个拒绝案例包含旧v1需迁移，且失败不得修改现有显示状态。准备好脚本不等于浏览器验收已通过；最终结果只以对应固定输出报告为证。

本次实际固定浏览器已通过2个新页恢复场景及26个拒绝案例，0页面错误。证据 `evidence/avatar-record-v2-fixed-38ea4eda48aa/summary.json` 与 `pins.json`；完整输出 `output/playwright/m1/38ea4eda48aa/avatar-record-v2-1794692862447`。这只验收本地QA数据合同，既不是游戏完整存档，也不是短裤动作质量通过；同一候选的转向数值另有失败，见 `docs/TURN-CONTACT-REGRESSION.md`。
