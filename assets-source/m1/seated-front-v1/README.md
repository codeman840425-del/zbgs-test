# 单个可编辑坐姿前片候选——接触退化，未通过

唯一候选，不改产品。源裙、完整身体、原UV/索引、全部61个pin和真实腿/椅接触仍保留。当前唯一能力状态仍在 `docs/CAPABILITIES.md`。没有新的通用cloth或控制器。

## 实际输入与作者源

真实输入为固定 `175a487d5ea3`、female SHA `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`。当前源裙SHA `065305626976c59b370d082baa6fd1e2aed8c262490e04e39543345170eb8d8d`；原solver SHA `10a072d3ceecaeb798f5025c19387e7b7a65ee6ad1adf2f9fbb67507b6184e86`。

原c9/ad0 forearm捕获没有整裙、完整body或椅变换，不能拿其470万已相等字段冒充完整制作输入。本次仅补捕获一次：同房间、同代表椅、authored手目标，站立60帧→坐下/坐稳120帧→起身90帧，共270帧30Hz离线仿真。所有可见原SkinnedMesh，包括完整body、上衣、脸、发、鞋均保留；另存原裙、显示裙、逐帧hips/root矩阵、真实腿轴及实测半径、真实椅OBB。身份首尾均核验。完整输入在 `experiments/skirt-offline-corrective/front-input-175a487d5ea3`，完整三文件SHA见 `input/manifest.json`。

`input/*.gz` 是实际frame **1/77/140/193/270** 的自包含精选五姿势输入，含完整表面，不是只剩截图或统计；共1.43MB。压缩和解压双SHA见manifest。该源包可以在新检出恢复target并复算这五姿势；**不声称五帧包能重跑全部270帧**。完整270帧报告及原完整输入SHA独立保留。

`controls.json` 为15个可编辑xyz控制点（5×3 Bezier），坐稳frame140的实际hips-local米坐标。初值由197个真实显示前片点加权最小二乘拟合；不是手工猜人体尺寸。`make-skirt-front-target.py` 会复用已有控制点，不悄悄重拟合覆盖编辑。`target.json` 保存目标点、源参数坐标、零pin权重及源身份；两份OBJ保留742个render顶点、700面和原UV索引，分别是实际坐姿basis和前片target，能在建模工具中查看/编辑。规范再生成输入目前是controls JSON；不宣称任意编辑OBJ后会自动反推控制点。

候选低频表面改变原前片褶皱轮廓，属于明确的服装制作改动。15控制点fit残差RMS32.57mm、最大164.73mm是**目标与原坐姿点的拟合残差**，不等于最后显示点位移。接触后实际坐稳点位移P95 20.49mm、最大40.31mm；全段最大83.29mm发生第82帧、vertex720，必须在正常视频中留意是否过早拉片。

来源许可沿 `assets-source/m1/README.md` → `assets-source/foundation/source.json` 的旧beta Base_Female CC0链；本次未引入外来图片或新许可资产。仅适配上述女性与裙，未匹配男性/体型变体。

## 唯一候选的实现边界

`candidate-solver.js` 是独立可审源码，`candidate-skirt-guide.patch` 仅改变 `m1-skirt.js`：嵌入target；按现有bendDrape×前片权重，在原guide之后、首次接触之前混合作者目标。全部原8轮投影、腿半径、椅OBB、腰pin、拓扑、UV、材质与normal处理不变；站姿mix为0。无动作幅度/时长缩小、无隐藏或删除身体、无放大碰撞胶囊。

候选SHA `4ec063dd1aa0fccb960a075c9af3f0a56f63b3be8147c654b8b0d982c90eab62`，target SHA `7a93d5c3d4a8ab2359ab0d777e86f0c6c5f63d08a6160997a100530cd96f612d`。其他源与证据hash见本目录manifest。未合入主源码或装备清单。

## 已执行检查与失败

Node使用真实源GLB绑定/hips参考、实际捕获每帧hips/腿/椅回放。仅Node中用捕获的真实已测腿半径替代构造器重复采样；不修改更新数学。原solver对实际原显示裙最大误差 **2.384e-7m**，确认坐标/回放成立。270帧候选全部pin差0、站姿差0；7点/三角的腿包络及椅采样均无新增穿入。最大软边比3.63975→3.60830，**不意味着任一边≤1.25**。

随后全270帧真实body/top有限线段-三角检查，实际GLB alpha在交点UV进行最近像素筛选：原最大408对、候选502对；121帧出现新增pair，共7151个pair-frame事件。分类用真实源JOINTS/WEIGHTS，先核源与捕获索引完全相同：

- **6307**：`m1-uniform-top_1`，全部dominant pelvis/torso，非短袖；属于上衣腰躯干接触退化，当前geometry gate拒绝。
- **844**：身体手指。捕获来自原guide的最终手姿；换裙形后live hand-fit会重新求值，不能将此数当成新闭环手姿必然穿模。也不能不测就忽略。
- 腿/皮肤躯干没有新增pair；并不证明连续时间或所有面完全无穿插。

`triangle-report.json`保留最初raw结果；`triangle-alpha-report.json`是实际alpha筛选结果，计数相同。现有源腰cap/上衣层已有交叉未删除，报告比较新增pair而非假设原始为零。该检测不是CCD，不分类共面重叠，也不等同GPU双线性alpha覆盖。`crossing-regions.json`保留热点面和权重；分类脚本以退出码2明确拒绝direct接触退化。

已查看 `geometry-{77,140,191}.png` 实际网格投影，坐稳前缘较整齐但可能仍像硬前片。图片明确不含游戏材质/alpha/真实遮挡，不代替正常1×全片。正常闭环坐起（包含新裙→手fit）待负责人安排，必须带本失败状态，不宣传修复通过。控制点已冻结，不继续参数盲调。

## 可重建命令

从仓库根执行，已有Python numpy/Pillow、prototype锁定Node依赖。此流程不启动浏览器或重建产品。

```powershell
python scripts/m1-assets/pack-skirt-front-input.py restore experiments/skirt-front-portable-check
python scripts/m1-assets/make-skirt-front-target.py experiments/skirt-front-portable-check
$env:QA_SKIRT_OUTPUT='experiments/skirt-front-portable-check/results'
node scripts/m1-assets/qa-skirt-front-replay.mjs experiments/skirt-front-portable-check
python scripts/m1-assets/skirt-front-alpha.py
node scripts/m1-assets/qa-skirt-front-triangles.mjs experiments/skirt-front-portable-check
```

上述恢复/再生成/五姿势实际gate已运行，target字节一致，candidate SHA一致，结果在 `portable-readback.json`。它复现三帧新增pair，最大502对；不是“便携通过”盖过形状失败。五姿势报告不覆盖原完整270帧报告。

完整capture如果需要重采，只在获协调窗口后用 `run-fixed-check.cjs` 包装 `capture-skirt-front.cjs`，显式设置实际固定build/bodySHA。脚本默认拒绝覆盖已有capture。采集是制作输入，不是性能或正常速录像。完整回放只把上例路径改为对应完整capture，去掉QA_SKIRT_OUTPUT覆盖前先选独立报告目录，避免覆盖已归档证据。

## 后续真实闭环 17bdb176154c

已按原候选SHA安装到隔离检出，仅换m1-skirt源，原175保留。四条同参数room/close正常1×坐起及新手拟合270帧已执行：6307新增腰上衣事件不变，真实手指新增407（旧手姿离线844不可混用）；仍拒绝。83.286mm为同帧形状差，非单帧突跳。完整记录见`docs/M1-SKIRT-FRONT-CLOSED-LOOP-17bd.md`，可观看包`evidence/skirt-front-17bdb176154c/index.html`。本源控制点没有调整，未合入共享运行时。
