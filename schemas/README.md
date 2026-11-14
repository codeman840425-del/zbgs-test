# 本地角色记录合同样例（QA 专用）

这不是游戏存档功能。当前房间没有生产级永久主播 ID、外观参数编辑、经营存档迁移或账号同步。本样例在测试层建立一次 UUID，保存最终资源身份并恢复到已经加载的兼容角色；不修改运行时 controller 的 `room-primary` / `room-peer-*` 任务 owner。

`scripts/avatar-record-contract.mjs` 是无依赖纯记录校验器（替代 JSON Schema）。它严格限制字段、版本、合法装备组合和资源身份，不接受未知字段或自动回退。`fixtures/avatar-record-catalog-v1.json` 是可版本管理的 QA 款式映射：保留每件原始 fit ID 和 SHA，不伪称男女不同衣片已经是同款式自动适配。现有 manifest 没有 styleId，映射仅由这份明确标注的 fixture 提供。

记录分层：

- `identity.actorId`：QA 命名空间一次生成的 UUID，换装/重开不变；不是已上线的业务 ID 注册表。
- `appearanceRevision`：测试合同显式递增的正整数；生产系统尚不自动管理该版本。
- `body`：最终已烘焙 VRM ID、SHA 内容版本、实际 profile 的规范化 JSON SHA；当前无身体编辑参数，所以 `parameters` 严格为空。
- `appearance`：`baked-resource` 与空参数，仅表示最终身体资源内自带容貌。不能保存 blink、happy、口型、视线或当前动作冒充长期外观。
- `equipment`：真实可见衣片对应的 QA styleId、原始 fitResourceId、SHA 内容版本、兼容身体 SHA；麦克风/眼镜保存资源身份及开关。
- `provenance`：合同 schema 在根 `schemaVersion`；此处保存 QA catalogVersion、真实装备和附件 manifest schema 与完整文件 SHA。没有给原 manifest 虚构数值版本，SHA 就是精确内容版本。

浏览器检查先校验已加载身体、profile、manifest 和资源字节；恢复校验整个记录后才调用现有角色接口。错误资源 ID/hash、版本、跨身体装备或非法表情字段必须被拒绝，且角色显示状态不变。测试器对同一个临时 origin 使用同一个 browser context，保存 localStorage 后关闭页面，再开新页并恢复；不等于重启浏览器磁盘持久化、完整游戏存档、服务器存档或跨版本迁移已经完成。

重复执行：

```powershell
node scripts/qa-avatar-record-contract.mjs
node scripts/run-fixed-check.cjs experiments/m1-<BUILD>/dist scripts/qa-avatar-record.cjs <BUILD>
```

先取得团队浏览器窗口再执行第二条。输出进入独立 `output/playwright/m1/<BUILD>/avatar-record-<timestamp>/`，包括实际 F/M 原记录、重开读取值、应用后值、所有资源回执、拒绝结果和截图。

固定 fixture 更新使用 `node scripts/build-avatar-record-fixture.mjs`，必须审阅资源/适配身份 diff；不要为了让旧记录通过而原地更换 hash。它只读取现存身体、服装、附件 manifest 和 profile，并验证文件字节。构建版本在实际浏览器报告额外固定；此合同未验证未来算法/profile 迁移兼容。
