# Waist公共factory CPU独审

本次实际消费 `native-female-waist-v1` 注册、源cf1574与 `/assets/native-waist-factory-v1/`，未发现所测范围新增阻断。复用Face的有限测试结构，更换全部候选输入并重新运行；不是继承Face结论。未重做源差分/生成、未改runtime/source/public、无GPU/Studio。

8件固定资源（含staging-manifest）实际逐文件读回；profile的avatar、三衣ID/SHA、源衣compatibleAvatar、全部130bindings描述与原Waist装备manifest一致。URL按实际manifest基址解析，全部可达本地对应文件且字节相符；覆盖manifest为46a868dd，stage receipt为b53a8cdb。profile runtimeFloor与已封本Waist官方loader读回一致，未重测也不冒用Face地板。当前scope只有自有三衣和原发，未继承改袖、附件、旧接触/几何fit或混用三角coverage。

实际共享body-texture-coverage通过3组：prepare不改显示，Top激活原生mask，shorts+shoes恢复完整base/shade；保颜色因子；未知衣物不废掉合法prepared，注入material.update异常恢复旧覆盖状态。坏PNG/错body/错entry拒绝，清理后可重试。Face manifest即使PNG内容与Waist相同，也因身体/manifest身份不符而拒绝，不改当前Waist显示。两个Waist实例持有各自私有纹理，销毁A不动B，bitmap关闭计数正确。

实际character-appearance、query/candidate、recipe与direct palette通过4组：原色默认配方apply/capture一致；全部已有非原色发/肤/眼/唇通过set/prepare/recipe/query拒绝且不推进状态或I/O；合法原色prepared保留，reset有效。眉brown拒绝、旧843ac身体SHA配方拒绝。未知来源沿历史fallback的行为不由此算普遍适配；当前Waist是显式原色only策略。

覆盖测试是实际PNG字节身份＋原Body MToon参数构建的CPU纹理/bitmap夹具，未做WebGL解码/阴影。配方测试加载真实staged GLB，用空纹理解码及outfit提交夹具；这证明数据准入与状态事务，不证明衣物动态适配或浏览器正常显示。双实例结论限于所测CPU材料所有权，不是实际双角色房间验收。root另做固定构建游戏运行、表达、运动接触和恢复。

复现（使用新的输出目录/文件，保已有结果）：

```powershell
node evidence/native-waist-factory-independent-v1/admission-check.mjs <new-admission-directory>
node evidence/native-waist-factory-independent-v1/coverage-check.mjs <new-coverage-directory>
node evidence/native-waist-factory-independent-v1/stage-check.mjs <new-stage-result.json>
```

脚本复用来源SHA在test-reuse.json；本次结果在admission-v1、coverage-v1、stage-result.json。最终源码与资源pins见closure.json，封包后不重新覆盖旧证据。
