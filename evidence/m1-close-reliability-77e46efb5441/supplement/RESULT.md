# 77 生命周期有界补测

原失败/原40文件manifest不改；本目录为追加证据。固定版仍 `77e46efb5441`，没有产品改动，没有重跑已通过四阶段。

- **background：环境未验证。** 新QA先等待真实 visible，唯一一次补测等待3秒仍 hidden，明确 `unverified-environment-initial-visible-not-established` 后退出。未继续执行假后台/返回流程，无合成事件，没有循环重试。
- **independent：13/13通过。** 新headless页面确认模拟实际推进，再验证pause500ms、900×700→1440×900 resize、三次换装与女/男peer创建移除、20秒连续smoke、有限root与0pageerror。此项不是后台恢复证明、不是长稳或目标设备性能测试。
- 所有浏览器/临时服务已关闭。后台真实恢复仍待能建立真实visible的环境复核，不能继承旧版通过。

实际执行脚本原样保存为 `qa-m1-lifecycle-fixed.executed.cjs`；其metadata原plan仍宽泛列全部case/旧focus文案，**independent未调用clearDriverFocus，也未做真实后台**。`scope-correction-receipt.json`纠正归属；现脚本已仅修正按mode生成的plan.cases/visibilityMethod，保存 `metadata-corrected` 与两行diff。没有为文案重跑或回写原报告。

复跑使用现脚本和新QA_M1_RUN_ROOT，已有同77身份环境变量不变：

```powershell
node scripts/run-fixed-check.cjs experiments/m1-motion-identity-integrated-v1/dist scripts/qa-m1-lifecycle-fixed.cjs --mode=background
node scripts/run-fixed-check.cjs experiments/m1-motion-identity-integrated-v1/dist scripts/qa-m1-lifecycle-fixed.cjs --mode=independent
```

两项必须串行；若background再次不具备可见前置条件，记录环境未验，勿合成事件替代。
