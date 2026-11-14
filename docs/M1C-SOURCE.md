# M1C 动作源核验（2026-11-14）

状态：离线源核验、普通 Jog 派生候选、两文件舞蹈导入候选及重建检查完成。没有修改运行时、打开浏览器、提交 Git，也没有把源动作计算通过当作新男女体型通过。本文数值默认米、秒、源动画 1×。前半部分保留原源筛选证据，最终候选与剩余限制见后文。

## 可重复输入和方法

```powershell
python scripts/fetch-animations.py --output analysis/assets/UAL1_Standard.glb --archive-output analysis/assets/UAL-Standard.zip
python scripts/qa-m1c-source.py
node scripts/qa-m1c-three-crosscheck.mjs
node scripts/qa-m1c-rest-ratio.mjs
```

本次 fetch 实际复用本地官方 ZIP，验证哈希后离线完成。作者 Quaternius，CC0 1.0；源地址、下载条件与原始许可见 [ASSETS.md](ASSETS.md)。完整证据目录为 `output/playwright/m1c-source/`，核心文件 `source-analysis.json`、`three-crosscheck.json`、`normalized-rest-ratio.json`。

| 输入 | SHA-256 |
|---|---|
| UAL Standard 官方 ZIP | `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724` |
| `Unreal-Godot/UAL1_Standard.glb` | `69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997` |
| `Unreal-Godot/UAL1_Standard_RM.glb` | `be684571ed655a1b892c2c07e6e2aeca053b606c442d34004adaf1d944090d01` |

Python 直接读取 glTF TRS、LINEAR/STEP 插值、四元数最短球面插值与全部祖先矩阵，以至少 240 Hz 计算实际蒙皮。左右脚各 105 个真实 indexed 顶点，按同侧 foot/ball 权重 >=0.5 筛选，未按 X 坐标猜左右。接地是鞋面最低 Y 与地面 0 的几何距离估计；源文件没有作者接触事件、接触力或碰撞定义。

独立 Three.js `GLTFLoader + AnimationMixer + SkinnedMesh.getVertexPosition` 检查四段动作、各五个相位：最大骨点误差 `6.37e-7 m`、最大鞋底高度误差 `3.37e-7 m`。为离线运行只在内存去掉纹理/材质引用；几何、权重、骨架、动作未改。此检查证明计算一致，不代表视觉自然。

## 骨架和当前体型比例

no-root/RM 版本骨架和静止节点完全相同。世界 +Y 向上，左右髋线确定源人物前方 +Z、左侧 +X。`root` 本地 -90°X，父 `Armature` 为 identity；root 自身旋转不会再旋转它的 position。大腿、小腿、上臂、前臂的子骨方向以本地 +Y 为主，不应按 pelvis 的本地 pitch 推断人物前方。

当前 three-vrm 3.5.5 的真实 normalized hips 独立确认以下比例，与 Python 静止世界坐标完全一致；VRM0 的 scene 旋转不改变高度。不可把旧角色比例复用于新体型。

| 体型 | 静止髋高 | target/source 比例 | Jog 官方目标步距/周期 | Jog 目标原速 |
|---|---:|---:|---:|---:|
| Quaternius 源 | 0.916700006 | 1 | 5.000000 | 5.357143 |
| female，SHA `027bed60…bcd5b95` | 0.909732401 | 0.992399254 | 4.961996 | 5.316425 |
| male，SHA `62b44b03…b35ff` | 1.008255959 | 1.099875589 | 5.499378 | 5.892191 |

完整目标 SHA、源路径与方法保存在 JSON。现有重定向使用 rest-world 转换，并对 VRM0 四元数 x/z 与位移 x/z 做专门转换；本任务没有更改该实现。

## Walk 与 Jog 的真实位移、足速和腾空

| 源动作 | 周期 | 官方 RM +Z 位移 | 官方原速 |
|---|---:|---:|---:|
| Walk_Loop | 1.333333373 | 1.299999952 | 0.974999935 |
| Jog_Fwd_Loop | 0.933333337 | 5.000000000 | 5.357142834 |

Jog 有 29 个原始时间样本；Walk 有 41 个。该 Jog 不能只按名称认定普通慢跑。当前 female/male 在 2.5–3 m/s 且保留官方步距时分别需约 0.47–0.56× / 0.42–0.51× 动画速率；原步频 128.57 步/分会降至约 60–73 / 55–65 步/分。**这是普通跑候选的明显风险，尚未视觉合格。** 不可把官方 5m 悄悄改成较短步距，再称来源已保证脚底无滑动。

为核查 RM 是否与足轨吻合，计算每一帧最低材料点在相邻两帧的真实位移，取最长近地窗口中央 50%，排除落地和蹬离边沿；同时保留 10/15/20/30 mm 阈值敏感性。不是每帧换最低点后把两个不同顶点直接相减。

| 源动作 | no-root 中央接地材料后退中位速度，左/右 | 推算周期距离 | 叠加官方 RM 后中央材料水平残速 |
|---|---|---|---|
| Walk | 约 0.9806 / 0.9797 | 约 1.3075 / 1.3062 | 约 0.0061 / 0.0056 |
| Jog，10–30mm范围 | 5.81–5.85 / 5.86–5.87 | 5.42–5.48 | 约 0.47–0.57 |

Jog 的实际接地后退速度比官方平均 RM 大约 9%；近地完整区间中位推算约 5.52–5.60m/周期。即使用中央区间拟合常速，仍有约 0.12–0.22m/s 中位水平残差。这说明不能只选一条 RM 数字就宣称源无滑步；足滚动、局部侧向运动及原动画误差都参与残差。拟合值也不是新的作者步距，不能自动替换官方数据。现阶段将其保留为快速跑候选，普通跑继续找更合适的现成源。

Jog 实际鞋面最低点范围约 -13.1mm 到 +302mm；髋垂向幅度 244.3mm。30mm阈值下：左近地相位 `.008889–.195556`、右 `.511111–.697778`，各约 .1742s；两段双足离地约 .2945/.2904s。10mm 阈值下接地约 .129/.133s，腾空约 .332/.340s。20mm 下落地附近出现 .0083s 的小分裂窗口，因此不能把该阈值的所有事件当成新一步。Walk 所有阈值均无双脚腾空；源鞋底滚动最低约 -26.6mm，也不是完美接地源。

跑步必须允许真实双脚腾空，不能套用 walk 支撑占空比或始终锁住至少一只脚。世界平移仍应只有路径或 root motion 一方负责。

## Walk→Jog 相位不能只用一个相关峰

足部前后曲线归一化相关的最佳 offset 是 `.858333`，映射 `jogPhase=(walkPhase+offset)%1`，RMS 从 `.8832` 降至 `.2523`。但对应腿部旋转仍有约 30–34° RMS 差，手肘约 56°，不能据此声称平滑切换。

按同侧真实落地事件对齐，10–30mm 阈值给出的候选偏移约 `+.06–.08` 周期，与前后曲线相关峰不同。原因包括支撑占空比与跑步腾空，不存在一个恒定 offset 同时对齐整段姿势和落脚。应以同侧接触事件和当前支撑状态决定过渡、允许合法释放和腾空，再对原速/慢放完整周期验证；这些仅为后续实现建议，尚未进入 runtime。Jog 左手首尾骨点存在约 4.15mm 源循环缝，其余所查髋/手/足首尾为零。

## Talking 通道边界

`Idle_Talking_Loop` 与 `Sitting_Talking_Loop` 均 2.933333397s、root 无净位移，各 195 条通道（65个节点的 translation/rotation/scale）。多数位移和全部 scale 是常量；非髋位移变化多为数值噪声。不能仅保留“有变化”的通道，静态手指/手腕非 identity 旋转仍定义基础姿势；也不能将源骨长度位移拷贝到目标骨而破坏比例。

- 站立 Talking：42 条非恒定通道，24 条手指旋转变化。髋 XYZ 幅度约 5.20/5.70/1.33mm；左手位移约 140mm、右手约 45mm；腿部旋转也在变（小腿最大约 4.06°/5.71°），用来补偿髋运动，足原点却只变化约 .018/.009mm。保留髋、删除腿会破坏这种协调。与 Idle 的首帧双手相差约 .412/.455m，必须有进入/退出混合，不能直接跳。
- 坐姿 Talking：39 条非恒定通道，26 条手指旋转变化。髋和左腿基本静止，右大腿/小腿/脚仍分别变化约 8.30°/12.06°/8.84°，右膝位置范围最大约 42.5mm，而右脚原点仅 .003mm。坐姿 Talking 与 Sitting_Idle 首帧腿部一致，但双手相差 .311/.388m。足原点不动不代表腿没有动作。

建议直播第一版明确使用 spine/chest/neck/head/shoulder/arm/hand/finger 的上身层，底层保留已校准的髋与腿；若保留源髋或坐姿右膝姿势，则要把对应腿脚通道成组保留并重新验证椅/衣接触。当前坐姿扶手 IK 不能每帧和 Talking 同时争夺手臂；需明确接触意图与退出过渡。动作无 facial weights 与语音，不能当作已完成嘴型/语音同步。

## 替代普通跑筛选进度

官方 [KayKit Character Animations](https://kaylousberg.itch.io/kaykit-character-animations) Free 1.1 已通过无需付款的官方下载流程取得；仅使用官方包，未购买 Source、未用第三方镜像。ZIP `65882f31f905ad2e953819648a59287cdeab8f623908d5ef701971d3758be20f`，14,858,957 bytes；内含作者 Kay Lousberg 的 CC0 声明，保存于 `output/playwright/m1c-source/kaykit/LICENSE.txt`。

```powershell
python scripts/qa-m1c-fetch-kaykit.py
python scripts/qa-m1c-kaykit-source.py
```

Rig_Medium_MovementBasic 有 Running_A/B 和 Walking_A/B/C，世界前 +Z、根无位移，跑周期 .8s/150步每分。源 mannequin 髋高仅 .40566m、上腿根反而高于髋（风格化比例），当前髋比例女2.24258/男2.48545。因此不能直接把源 3.42m/s 说成目标 3.42m/s。按同一髋缩放规则 Running_A 中央接地拟合目标女约7.66m/s/男8.49m/s、髋上下女.230m/男.254m；Running_B 更大。无作者 RM 可作速度真值。**暂未找到优于原源、能直接用于 2–3m/s 的候选，不按 clip 名字宣布合格。** 非等比例体型的真正目标足轨仍需独立重定向验证，当前只是源侧筛选。详细窗口、阈值、骨架/资源 SHA 在 `kaykit/analysis.json`。

未测：普通 Jog 实机视觉、走跑/起停/转角、男女目标实际鞋接地、服装、帧耗时；无浏览器验收。任何后续合格结论必须绑定新固定构建与完整视频。

UAL2 官方 Standard 也已通过免费流程取得并查原始许可：ZIP 18,735,003 bytes，SHA `4008ea208a604773a2b2177d965f0f5d3195498b5bf838c3f5785d68e95f2a68`，43 段动作，无普通 Jog/Run 和 Dance0；不得把 130+ 全库宣传当免费内容。`python scripts/qa-m1c-fetch-kaykit.py --ual2` 可恢复固定免费包。许可及清单在 `output/playwright/m1c-source/ual2/`。最后只另查官方 GDQuest Mannequiny（CC-BY4.0，官方仓库 `gdquest-demos/godot-3d-mannequin` 固定 `d48a4fdb49a3930f38cdbeb854cf5be3ae4b6b2a`），原 `run` .6333s、近地鞋面后退中位约6.47–6.61m/s，且 GLB 静止姿非标准 Tpose；没有选入产品。其 SHA `8005cc2ab9221ad605be2d1cbb89eea894583e72bd5f50a5fbe40243a64f0493`，官方 README/许可保留在 `analysis/assets/mannequiny/`。停止进一步泛搜后按负责人授权制作有限派生样件。

## 可复建的普通 Jog 派生候选

此为**新制下肢改编**，不是原样 mocap，也不是把 Walk 快放。它保留 UAL1 的骨架、静止姿、骨名和骨长，因此可复用原 rigMap、rest-world 转换和各体型 ratio。参考原 Jog 的连续上身节奏；原循环左手小缝通过分布式四元数端差修正闭合。新下肢在源导出阶段处理短步幅、连续足轨、前掌至趾尖滚动、腿 IK、较小的髋起伏，不要求运行控制器按片名塞补偿。

产品候选目录 `prototype/public/assets/motion/m1c/`：

- `jog-ordinary-derived-v1.glb`，965,540 bytes，SHA `6ec251d7611f22c6bf918d3401fcf438a8f2bc7b72f2826047dea8beef15c9e5`，clip `Jog_Ordinary_Derived_v1`。
- 同名 `.config.json` 是可编辑源参数；`.profile.json` 携带周期、步距、支撑/腾空相位与来源。源动画来自**已在 Git 跟踪**的 `prototype/public/assets/motion/UAL1_Standard.glb`，不再依赖 analysis 的临时副本。

周期仍 .933333337s，新源步距 **2.4m**，1×源速度2.57142856m/s；当前女/男按实际比例得到 **2.55188378/2.82825150m/s**。左支撑 `[0,.34]`、右 `[.5,.84]`，两段腾空各 .149333s。源髋高范围 .759893–.820428m；真实鞋底最高约 .232m，源最低约 -.217mm。身体仍明显前倾、屈膝：这属于待正常速观感判断的候选，不写“自然跑已通过”。

导出 GLB 后再次独立采样真实 source skin，240Hz：支撑材料点水平累计路程左 **1.288mm**、右 **1.220mm** 每段；中位残速 .00424/.00376m/s、最大约 .01222m/s；踝单帧最大13.60mm，踝首尾闭合，目标腿长不可达量0。使用每帧实际接触材料点的同索引前后位移，未以踝残差冒充滑移，也未因阈值改变剔除支撑样本。前掌点87转趾尖点48是**源几何 QA 索引**，不能当作目标模型顶点编号。Three.js 九相位独立读回，骨点/鞋底误差均<.17微米。证据在 `output/playwright/m1c-source/derived/`；`source-derived-poses.png` 为同源实际蒙皮正侧关键帧，`height-contact-comparison.png` 为高度轨迹。

新片不能复用旧 Jog 的 `+.06–.08` 经验 offset。Walk 同侧落地约 .95–.97→新 Jog 0，落地候选 offset约 +.03–.05；支撑中点则左 .17、右 .67。前后形状相关最优偏移约 -.09722，仍不是接触真值。实施时按当前支撑脚和已存在世界锚点进入/退出，而不是把单个 offset 套所有状态。纯跑释放双脚腾空，并保留路径唯一平移所有权。

## 两文件舞蹈导入候选

`dance-imports.json` 列出两个真实独立文件；都用 UAL1 原始 rest 骨架和骨名，`rootPolicy=local-displacement`。hips 的局部移重/跳跃不能一概删掉，root group 不负责世界导航。预留源空间半径 `.9m × target/sourceHipRatio`；目标服装/头发空间仍须实测。持物前必须收起，编排期间不能同时按路径移动。

| 文件 | 播放方式 | 性质/范围 |
|---|---|---|
| `dance-source-reference.glb` | `Dance_Loop`，1s，loop | 原样 Quaternius 参考，仅重新打包。SHA `b864ec5f440929133787791884e645a0bc73c323d107c9a9ef9937b4f1ca9744`。 |
| `dance-technical-v1.glb` | `Dance_Technical_7s_Once_v1`，7.2s，once→idle | 本项目原创技术编排，UAL1 idle姿态/骨架参考；不是专业舞蹈或动捕。SHA `2d785287de3c0187c76ed90ae6e0b76fed3008cb1a7a2ac75065720d3885304e`。 |

原样 Dance 只有上臂最大34–37°、屈肘71–88°、侧弯约±6°、骨盆转体范围约37°；双脚没有腾空、没有实际交叉步。新编排单独覆盖过肩抬臂屈肘/侧弯、右脚从前方交叉与回步、局部转体、一次约8cm小跳落地和回到生成的初始站姿。运行时仍需从生成站姿混合退出到其自身 idle，不能只把动作停在末帧。

源检测发现的两个失败曾真实发生：跨步期间膝极向换半球，导致两采样帧之间踝偏6cm；修为连续解剖极向后保留真正交叉。跨步落地原腿长超出23mm，修为明确的35mm髋下沉配合移重。失败数据 `dance-technical/failed-reach-source-qa.json` 留存，未使用“腿永不交叉”约束。

导出后另测到实际侧弯−9.49°/+9.39°、上臂抬高约149–150°、屈肘最大108°/116°；早先仅转最上胸椎只能得到约±2.5°颈髋侧弯，已修为腰/胸协调，不能将配置角度当作实际覆盖。完整覆盖数据由 `scripts/qa-m1c-dance-inventory.py` 读最终导出文件生成。

最终源240Hz真实鞋面：最低约 -.0215mm，接触段整体材料路程左 .180mm/右 .170mm（整段7.2秒），接触材料最大水平速度分别 .000418/.000396m/s；踝最大单帧4.62mm，腿不可达量0；世界 X 上左减右脚跨度最低 **-.101m**，是实际交叉而非仅旋转坐标系造成的负跨度。小跳鞋底最高约8cm，交叉步另抬13cm。Three.js 11个相位独立蒙皮/骨点误差<.11微米。正侧源网格关键帧已查看，当前效果更像技术动作编排；不能写成美术舞蹈通过。源身体自碰撞、目标男女服装、正常/慢放整段、入场退场交互仍待运行验收。

UAL2 OverhandThrow/NinjaJump 等只作能力调查，保持原名，未改名为舞蹈。已从 public 移到 `analysis/assets/ual2-probes/`，不随产品候选发布。它们的原跳跃约 .54m、预备姿还会穿地，不满足小跳即用条件；负的骨盆相对脚跨度也不能单独证明真实交叉。调查与提取脚本保留，便于复查来源而不是把素材存在标成能力完成。

## 固定环境、重建和改稿回读

实际环境：Python **3.13.11**；numpy **2.4.2**、scipy **1.18.1**、matplotlib **3.11.1**、beautifulsoup4 **4.14.3**。固定清单 `scripts/qa-m1c-requirements.txt`。Three 交叉检查使用工程锁文件安装的 Three / three-vrm，不另拉浮动版本。

```powershell
python -m pip install -r scripts/qa-m1c-requirements.txt
python scripts/qa-m1c-build-jog.py
python scripts/qa-m1c-build-dance.py
python scripts/qa-m1c-rebuild-check.py
node scripts/qa-m1c-three-crosscheck.mjs output/playwright/m1c-source/derived prototype/public/assets/motion/m1c/jog-ordinary-derived-v1.glb
node scripts/qa-m1c-three-crosscheck.mjs output/playwright/m1c-source/dance-technical prototype/public/assets/motion/m1c/dance-technical-v1.glb
python scripts/qa-m1c-plot-jog.py
python scripts/qa-m1c-plot-dance.py
```

已实跑独立输出目录重建，两段派生 GLB 与 public 候选**字节 SHA 一致**。还实际把编排配置 `upperArmRaiseDeg` 从136改为126，重新导出到 evidence 后回读：1.3秒左上臂世界角148.796→138.877°，差9.9196°（包含相同侧弯），脚位变化0；配置和资源 SHA 均不同。原候选没被改稿覆盖。完整配置/输出哈希、Python版本与读回结果在 `output/playwright/m1c-source/rebuild/report.json`。这是源修改→导出→回读闭环，尚不能替代游戏里的导入/选片/播放验证。
