# 当前固定版的本地记录回读

构建：`1a0d06fc8ffe`。复用现有 v2 QA 合同与浏览器脚本，没有新增产品存档或更换公开候选。

男女各一次：生成稳定 QA 身份，换装并装备麦克风/眼镜，写入 localStorage，关闭该页面，再打开同源页面，校验记录并加载。女性裙装、男性露膝短裤的装备 ID、身体 SHA、服装 fit、握姿配置与附件状态恢复一致；临时 happy 表情不作为长期容貌保存，重开后 neutral。两例通过，26 个坏身份/版本/握姿/表情混用及旧版记录用例全部拒绝且状态不变；pageerror 为零。

`catalog.json` 由实际固定 dist 和匹配 sourceDigest 的源码重新生成，未覆盖旧目录或旧 fixture。浏览器再次核对运行和服务的构建，以及实际主人体资源 SHA。原始结果与截图在 `avatar-record-v2-1794720041046/`。

独立只读复核确认两具身体各11项资源 receipt 与固定 dist 字节、SHA一致，记录/恢复状态及构建身份一致。眼镜记录仅保存附件身份与 enabled；镜腿配置及加载实现由完整 `presentationBuild` 隐式固定，不是另行保存、比对镜腿适配字段，也不是跨版本适配恢复。

这是 QA 接口回读，不是用户存档界面、业务身份系统、跨版本自动迁移或完整用户操作链。恢复直接调用既有接口，未同步页面的初始服装提示：男性截图的模型/装备状态是短裤，底部仍显示初始“独立长裤”。该已知限制不能算用户界面保存恢复通过。未覆盖男短裤可选材质 recipe、派生人体、动作自然度、性能或新的裙装源实验。

复跑（需保留当前固定 dist 和相匹配源码；脚本新建带时间戳目录）：

```powershell
node scripts/build-avatar-record-fixture-v2.mjs experiments/m1-accessory-ui-2/dist --out=evidence/avatar-record-current-1a0d06fc8ffe/catalog.json
$env:QA_RECORD_CATALOG='F:/gamemake/evidence/avatar-record-current-1a0d06fc8ffe/catalog.json'
$env:QA_M1_RUN_ROOT='F:/gamemake/evidence/avatar-record-current-1a0d06fc8ffe'
node scripts/qa-avatar-record-v2.cjs http://127.0.0.1:4191 1a0d06fc8ffe
```
