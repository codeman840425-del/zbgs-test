# B 工作树独立源码审查

结论：本次所读四文件没有发现阻止冻结的实质问题；这不是固定构建或实际浏览器通过。最终提交仍需与 `source-review.json` 中四文件 SHA 对照。未改产品、未启动浏览器/GPU。

检查对象：`experiments/m2-male-jaw-hair-runtime-v1/prototype/src/` 下 `hair-fit-contract.js`、`hairstyle-catalog.js`、`character-appearance.js`、`appearance-recipe.js`，及同树 CPU-3 实际执行脚本和 39 项报告。

## 合同与实现

- 按 style + 实际 body SHA 选择唯一 entry。原男与 jaw 复用同 GLB，但原男为 legacy manifest 身份，jaw 为独立 fit ID/version/SHA；不是扩兼容白名单就隐式准入。
- manifest、fit JSON、GLB 均取实际 bytes 核 SHA；fit 再核源/目标身体、款式、材质、坐标系、刚性挂点及有限 TRS。原男女 manifest 与男性 GLB 对公开 0fb 输入逐字相同，结果记录于 JSON。
- v6 必须有 hairFit；original/none 精确 null，替代款必须匹配完整字段。v1–v5 携带 hairFit 拒绝，缺字段仅允许历史 implicit 条目；旧 schema jaw-sidepart 拒绝。旧 v5 四域上限/样件规则没有被降为 v1–v4 规则。
- 预期 fit/asset 在 revision 与配色提交前验证，命中本实例发型缓存仍执行此门。首次加载 replacement 的配色延后到资源/fit 成功；较新颜色优先，独立 style generation 保留既有分域意图。`getState` 返回实际 replacement 身份副本，回退带原实际身份。
- 独立 GLTF 解析和原 MToon 材质克隆；保留规范 Outline，拒绝混有非 HAIR 的隐藏范围。pending 取消后可缓存但隐藏；dispose 后晚完成释放而不挂载。当前精确固定资产无需新平台。

## CPU 证据范围

四产品实际 SHA 与 CPU-3 记录全部相等。39 项覆盖同 GLB 不同 fit、坏 ID/version/SHA/额外或缺字段、缓存后拒绝、manifest/fit/asset 损坏重试、旧版本准入、并发颜色、reset/dispose、双实例和文件事务。

该测试使用真实产品模块和固定 GLB 数组/MToon，但替换了解析图片步骤；avatar 是最小头/发夹具，配方几何与服装是事务夹具。所谓 v1–v5 通过，是中性几何的合规降版本记录，并非历史所有四域配置的完整角色重测。没有 GPU 视觉或源身体贴合证明。CPU-2 的 MeshBasic Outline 假设失败保持旧记录。

## 固定后最小实际门

QA：jaw 原发/无发→明确 sidepart fit→卸下恢复、同姿正侧后与原男同款；实际 v6 下载、干净 context 同体读回；错误 fit/body 与伪旧 v5 保原；既有原 F/M 真实 v5 文件回读；双实例发型/颜色隔离。prototype 随后串行录共用正常动作链。无需重跑旧四域矩阵、A 选样或新增源。

源包记录的原 Face 75 个静态相交对并非 alpha-aware，不能据本报告称接触为零或已经视觉接受。最终要看耳侧、发际、后脑和运动中的实际贴合。
