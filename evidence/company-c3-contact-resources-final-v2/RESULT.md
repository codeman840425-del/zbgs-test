# 公司 C3 接触资源候选

实际公司 provider 已提供离屏逻辑数据与异步 retain/release 接触句柄。只复制真实 seat/back 几何、最小无贴图材质及世界矩阵，不保整个楼层、GLB 缓存或旧显示对象闭包。观看与角色取得接触资源可并行；活跃句柄保护设施变换/资源，角色占用仍由原 seat-lease 负责。

本次检查为实际 Three 和真实 GLB 的 CPU 检查，没有角色、GPU或浏览器联调结论。7组接触生命周期检查见 report.json；root 两项观看/资源保护复现见 ../company-c3-contact-review-v1/final-after/，两项清理顺序回归见同目录 cache-final/；14项既有视图事务回归见 ../company-c3-view-regression-v1/report.json。

原失败保留：review-v1/before、cache-before；independent-v1/run-03 记录 stale contact 加载后残留 GLB。旧 contact-resources-v1 是最初有限检查，未覆盖后来查出的缺陷，不作为最终通过证据。

复跑均使用新的输出目录：

```powershell
node prototype/scripts/qa-contact-resources.mjs NEW_OUTPUT_DIR
node evidence/company-c3-contact-review-v1/reproduce.mjs NEW_OUTPUT_DIR
node evidence/company-c3-contact-review-v1/cache-regression.mjs NEW_OUTPUT_DIR
node scripts/company-platform/qa-c2-view-independent.mjs NEW_OUTPUT_DIR
```

集成角色必须以 usePointId 保持原任务/租约身份，并在取消、失败、销毁或实际离位时释放句柄；观看切层不释放。实际男女接触、争用/取消、角色受光与保存有效状态尚待总工固定候选验证。C2 的 aff9/0e3 录像与交付包保持原身份。
