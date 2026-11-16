# C3 公司 provider 固定输入

源码 `891d9305c5b775093b0a8544556a6aef551f616a`，公司构建 `1c3a7243383f`，独立检出 `F:/gamemake-company-c3-fixed`。42项构建输入均与该提交 Git 原始字节一致，见 build.json。本候选仅固定公司侧接口，不是男女联调完成版。

角色基线沿总工回执 `23c1140a01d26b6f1c10ac4f8064f366add3ba17` / `785be36def90` 或其后已验证版本。只引入公司拥有的模块、资源、配置及工具，禁止用本分支旧 main.js、motion 或 foundation 模块覆盖 M2。总工拥有独立集成树和最终角色运行验证。

在 aff9/0e3 制作成果上新增：

- describeUsePoint(s)：全部楼层、纯数据身份/版本、世界与设施局部定义，观看独立。
- await session.retainUsePointContact(id)：精确座面/椅背几何副本与世界矩阵；handle.seat/back 为 Mesh，handle.transform 是使用点坐标系，handle.facilityTransform 是设施坐标系。handle.root 为单位矩阵离屏容器，不是座位原点。
- handle.release() / session.releaseUsePointContact(handle)：幂等引用释放；scene.dispose使句柄失效。只保两面几何、无贴图最小材质、纯元数据，不保旧显示对象或整层。
- 切观看不取消接触取得，也不释放活跃句柄。新视图加载不会被接触请求清理误伤；失败/过期事务结束释放闲置解析缓存。
- prepareChange/commit/restore 同时检查外部 seatLeases.forSeat 与接触资源持有保护；无关屏幕状态可改，忙碌设施移动/删除/替换/整恢复拒绝保旧。

通过：7组真实Three/GLB生命周期检查、root 2项观看/持有回归和2项缓存清理回归、14项既有场景异步事务回归。证据分别位于 company-c3-contact-resources-final-v2、company-c3-contact-review-v1/final-after、cache-final、company-c3-view-regression-v1。原失败保留，不用最初v1有限检查宣称最终通过。

同一固定构建已补实际浏览器验证：company-c3-preview-1c3-v1 的9项原有生产/观看/保存流程通过；company-c3-contact-browser-1c3-v1 验真实GLB双座接触几何跨楼层与大楼观看保持、忙碌修改拒绝、双座独立释放（各geometry dispose一次）、最后缓存归零。临时浏览器/服务均退出。该浏览器检查仍无人物；短功能采样不作性能验收。

正式角色接入：先沿原任务/lease预留 usePointId，再取得句柄；异步返回后核角色请求仍有效，失效则立即释放。坐稳维持占用/句柄，取消接近或失败归还预约及句柄；已经坐稳的角色起身并实际离位后释放。人物销毁先撤实体再释放。角色需要用 handle.transform 及自身适配求接触，不能把设施制作接近点当任意身体已适配目标。

角色/任务状态、跨层归属和占用不从此接口自动恢复；仍按C3同候选验男女、两工位/双座、争用取消失败、实际离位、转向、观看独立、重开恢复与补光。当前没有这组真实人物运行结论，也没有普通电脑性能结论。C2的正常录像与可编辑移交包保持aff9/0e3身份，不换标签。
