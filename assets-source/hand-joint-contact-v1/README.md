# 关节驱动手部接触：44原女性样片与08三体配置检查

当前完整结论见 [RESULT.md](RESULT.md)。08e4b038a9aa已通过同版原女/jaw/waist各100样本新检测0交叉；旧5轨负对照三者均15帧失败。当前helper SHA为`4404e6eb0b0ab2b3c89e90b8f511d83940bbfeff25d1629252683b44e5b555d9`，通过foundation配置URL/文件SHA加载、接收已验证profile对象，没有静态单女import。`portable/manifest.json`保存三个profile各自SHA与abdb三文件局部patch身份。08的隔离main/live/equipment仍是早期基线，**只证明局部接触，不是完整abdb集成通过**。

以下为44版本的方案与首轮实测历史，其静态单女helper及旧receipt保存在`frozen-44cd/`；原片、固定dist均保留，不用新helper冒充旧44重建。

不在主工程启用；原83/05失败构建不改。替换的是独立源工作区中的手检测helper，求解器保持83原字节。生成器来自同项目精确body/skin/inverseBind流程，未引入第三方素材。

## 实际几何范围

- 精确原女性body SHA `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`，仅这一body opt-in。每手掌+15指节，32个每关节原始glTF局部包络。
- 全部2212个选中手部源三角按最大平均语义权重分配给关节，包含全部顶点。配置保留面/点索引、混权点、其他关节权重最大值、inverseBind、坐标与单位。某边界点在分配关节上的权重为0，说明单骨包络只是可测代理，不能理论宣称所有混权皮肤都在内。
- 真实局部点PCA轴与椭圆截面，轴向端点来自实际皮肤极值，包括末节超Distal骨原点的指尖。每个源顶点都被本组有限凸椭圆柱包住，故同源bind三角内部也在内；**该证明不延伸到动态多骨加权蒙皮**。
- 每次复用现有raw同步后变换32个关节包络，不再采1538个皮肤点。每包络5条有限纵轨（中心及截面两组支撑方向正负），80轨/手，保留3D厚度；不是压到单个最深平面。
- 端面几何有真实长度和椭圆形，但运行只采五个端点/纵轨，并非连续椭圆端帽求交或完整实体碰撞。不得将80轨等同完美包络。
- 当前helper `handSurfaceMetrics.representation`准确为`joint-local-measured-finite-cylinder-five-rails`；继承83的外层`handClearanceBasis`文案仍是其手轮廓预测说明，不可据此称当前代理为真实皮肤结果，最终skin门槛另测。

## 已测

- `dist-hand-joint-1` build44cd801ea417，shader warning以外pageerror0。
- 原女100个30Hz坐入/坐稳/起身样本：最终实际2790手/前臂三角×实际显示裙，0交叉帧；旧5轨同路线15帧/666pair。有限边三角+采样alpha检查，不是CCD/闭体/GPU证明。
- 同build authored270×2（handSkin legacy/actual）：30指骨raw及normalized四元数差0，作者原腕位置差0。没有篡改源手指/腕动作。
- 最终修正并不等同：相较旧5轨腕最大变化30.969mm、肘38.722mm；距作者腕最大96.193mm。比精确轮廓方案更保守，需正常播放看手/肘过量抬起。几何0交叉不自动通过视觉。
- 性能和正常片待窗口，男性/派生/直播握麦/任意手势未测。不可继承通过。

## 重建与身份

`python assets-source/hand-joint-contact-v1/scripts/build-joint-hand-profile.py`

生成`female.profile.json`（实际SHA `09688e79fadaca6f58530da7a4cb52c4ad0b3d9b42de4233c6b0a5f682454453`），运行复制为`joint-hand-profile.json`。helper实际SHA `fe0733cec1193c99530b7c75aaf6cbe2c60107fc27bc64e3f44e2e211f164c3e`。

`install-isolated.py`只允许确切05 raw motion输入并安装到`experiments/hand-contact-worktree-1/prototype/src`，保留receipt。它不会修改main。`motion.same-solver.js`保存83精确原字节，安装时校验，求解/alpha/阈值/迭代未变。Vite：在该独立prototype目录执行 `npm.cmd run build -- --outDir ../dist-hand-joint-1`，已存在固定目录不要覆盖。

测试复用`assets-source/hand-contact-v1/scripts/qa-hand-surface-gate.cjs`；本包`scripts/qa-joint-source-pose.cjs`与`compare-source-pose.cjs`记录并核指姿/腕源通道。所有浏览器检查经`run-fixed-check.cjs`临时服务、精确build/body身份gate。
