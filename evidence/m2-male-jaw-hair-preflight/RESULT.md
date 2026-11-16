# B：既有男性短发 → male-jaw，只读准备

2026-11-16。依据 `docs/research/M2-CHARACTER-WORK-ORDER-2026-11-16.txt` B。**证据支持复用现有短发几何作为后续独立 fit 候选，不等于适配、产品准入或观感已经完成。** A 结果先行；本次未制作新资产、未导出、未运行 Blender/GPU、未改产品或 CAP。

## 实际输入与几何结论

|输入|路径 / SHA256|
|---|---|
|原男|`prototype/public/assets/foundation/base-male-roundtrip.vrm` / `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`|
|男 jaw|`assets-source/m2-male-face-v1/generated/avatar.vrm` / `25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153`|
|既有短发|`assets-source/m2-male-hairstyle-v1/male-sidepart.glb` / `fb5fd49352b7bab0e6d2c0ec3f6e565f0004062e4a8975f1afcd93fb24dd48fd`|

`check.py` 实际解码两 VRM 与短发 GLB；结果在 `geometry-report.json`。所有节点、skin joints/逆绑定、材质及图片字节一致；非 Face primitive（含 Body、原发、服装）全部属性与索引一致。Head=node6、Neck=node5，未发现耳骨。没有改变骨架/头颈挂点的证据。

Face_SKIN 仅98个引用顶点改变，原坐标范围 X[-.071340,.072358]、Y[1.496182,1.564141]、Z[-.125825,-.041060]米，局限下颌。以下点在 Basis 和全部54个绝对表达形态中前后精确一致：Y≥1.565的506点；后部Z≥0的108点；`abs(x-.00050883)≥.075 && 1.54≤Y≤1.68`的220个耳侧包络点。耳侧是明确几何包络，**不是完整解剖耳根标注**，不能据此声称每个耳根点均已语义验收。

Y=1.60/1.65/1.70米的 Face_SKIN 截面线段坐标前后完全相同，总线长分别 .374056669/.291840583/.223630076米；这是头部横截面的可复算代理，**不是校准人体头围测量**。头顶/后脑/这些截面无变化支持原头皮贴合边界复用。

短发250点/408三角，原出处为100% Head 权重的 HAIR primitive，成品刚性 Head-local。实际 GLB 还原世界坐标与旧 build-report 的差仅浮点导出量化（精确值见 JSON）。268个受 jaw 改动影响的 Face 三角与短发仅4对 AABB 候选：Face36/Hair131、134；Face172/Hair297、300。复用原严格非共面相交算法逐对检查，原男及 jaw 均为 false。其他三角未变；故此 bind-pose 严格指标无新增交叉。原档案 Face75对、Body0对并未被消除；本检查不覆盖透明度、共面接触、连续碰撞、动态表达贴合或观感。

**建议几何复用：** 保留同一 `styleId=male-sidepart-v1` 和真实原 GLB SHA；使用相同 `J_Bip_C_Head` / raw-head-bind-local / identity TRS。新建独立 jaw fit，记录复用依据和限制。无需重造短发或 jaw，不应把原短发 GLB 的原作者 `extras.avatarSha256` 偷换成 jaw。

## 最小 fit 数据与当前真实合同缺口

新 fit 至少应独立保存：fitId/version、目标 jaw SHA、原身体及原 fit 来源、同款 styleId、原 GLB SHA、Head/Neck/逆绑定证据、identity attachment、精确原 HAIR 隐藏规则（mesh0/primitive5/`M00_000_HairBack_00_HAIR`）、rigid无物理、重导出入口及本报告 hash。原男 fit 和准入保持。

当前 `hairstyle-catalog.js` 只允许原男62b44；`character-appearance.js:105` 校验 manifest schema/id、head/headLocal、compatibleBodies、GLB SHA，但**不读取 fit.json，不验证 fitId/version**。`appearance-recipe.js:20,65,94` 保存/回读身体身份与 `hairAssetSha256`；复用同 GLB 时它无法表示独立 fit 版本。仅往 compatibleBodies 加 jaw 或在未消费 JSON 写 fitId，不能完成 B 的错误 fit 版本拒绝。

最小接入建议：catalog 按身体选唯一 fit 声明（保同 styleId；不可出现对同身体重叠的重复条目），manifest 引用明确 fitId/version/fitSHA，加载时验证目标身体、assetSHA及 attachment 合同。state/capture/read 携带并验证所选 fit 身份，新 jaw replacement 保存缺失或错误 fit 应拒绝并保原。原男既有 v5 与 original/none 的旧存档保持合法；可采用有明确兼容规则的可选 v5 扩展，不必先升全局 schema，但字段、解析和错误检查必须真实生效。若 root 将“版本”仅定义为现有 GLB 版本，应明示独立 fit 版本不持久化的不足，不能宣称该门通过。

cache/promise 当前为 actor-local、按 styleId；不同身体实例不共享，因此不需改动作实现。一个 actor 的 fit 必须固定；若允许运行期更换 fit revision，cache key 也需包含 fit 身份或显式失效。继续沿现有取消/rollback/材质恢复行为。

## 可复用生产入口与后续最小步骤（尚未执行）

- `assets-source/m2-male-hairstyle-v1/editable.blend` 保留完整可编辑短发；`parameters.json`、`build-report.json`、`provenance.json` 为原制作链。jaw 可编辑源 `assets-source/m2-male-face-v1/generated/editable.blend` 只作贴合参考，不重制。
- `scripts/m2-male-hairstyle-v1/build.py` 为确定性构建：原男实际 HAIR→Head-local，固定冠部变形。当前输入/输出硬编码到旧包，**不可原样运行覆盖旧源**。后续新包装器显式输出新 fit 目录、固定输入 SHA；复用原 GLB 时无需改变几何/身份。
- `export-editable.py` 选 `Hair_candidate`，导出前 world matrix 置 identity；不得再次套 Head 逆绑定或 VRM0旋转。它也写旧目录，后续只允许参数化新输出。既有 `editable-export.glb` 与确定性 GLB 不同 SHA，已有检查是三角角点≤1µm等价，不能谎称字节相同。
- `check.py` / `check-head-space.py` 可复用校验算法，但其旧硬编码 writer 不应运行到原包；本次只抽取后者 `segment_hits` 函数，不执行其写入代码。

A 完成后，B 最小闭环是：新 fit/来源记录→独立重导出与确定性复做核验→真实 fit 身份合同→固定候选 actual options 与 v5干净回读→无发/短发/无发、发色、正侧后、头动/表情/走跑/坐起、原男回归、双实例及错误身体/版本拒绝。当前这些 B 产品门均未执行。若需人物专属走坐逻辑则按工单停止；无需新增身体、发型或动作路线。

复算：从项目根运行 `python evidence/m2-male-jaw-hair-preflight/check.py`（Python+NumPy，读取既有 GLB parser；仅写本证据 JSON）。`manifest.json` 固定本次输入、脚本与报告实际字节。
