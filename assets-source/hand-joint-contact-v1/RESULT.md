# 关节手部候选：有界几何与开发机成本改善，仍待观感验收

未合主。83/05成本失败分支保留；没有引入其alpha证明缓存。原44固定正常片保留，当前配置加载/三体几何固定版为08e4b038a9aa。

## 同08版本三体实际皮肤正/负对照

三体均由各自实际VRM重新生成手配置，URL/文件SHA与body SHA分别校验；使用各体独立前臂配置，未用原女性SHA冒充派生体。每体相同100个30Hz样本、相同坐入/坐稳/起身阶段、2790实际显示手/前臂三角×显示裙，dynamics ON。

| 实际body | 旧5轨相交帧/100 | 旧pair事件 | 新关节80轨相交帧/pair |
|---|---:|---:|---:|
| 原女性027bed… | 15 | 666 | 0 / 0 |
| jaw 3c11ca… | 15 | 673 | 0 / 0 |
| waist 107781… | 15 | 688 | 0 / 0 |

旧失败三者均从仿真t9.1s起身开始，前臂0、手指失败；new hand分支均实际启用，旧分支均关闭。pageerror0。旧gate返回非零是预期负对照，未覆盖/清掉失败。新gate仍是有限非共面边三角相交+采样alpha，不是CCD/闭体/GPU覆盖证明。男性/握麦/其他手姿未测。

输出：`output/playwright/hand-contact-08e4b038a9aa/hand-surface-actual-1794706398383/` 与 `hand-surface-legacy-1794706495619/`。

## 44版本源动作与成本证据（不伪称08已重测性能）

44同build authored270×2：30指节raw/normalized四元数差0，作者原腕位置差0。旧/新最终腕最大差30.969mm、肘38.722mm；joint距作者腕最大96.193mm，显示该包络更保守，不是姿态完全相同。

RTX4090开发机、Chrome157、1440×1080、room/authored、dynamics OFF、真实请求1×、串行单次无录制：

| 坐稳 | N | 平均帧ms | P95 | P99 | 最大 | >16.667ms | 子步均值 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 旧5轨 | 486 | 7.217 | 10.0 | 11.1 | 13.5 | 0 | 1.344 |
| joint80轨 | 359 | 9.794 | 11.9 | 13.1 | 16.6 | 0 | 1.802 |

新增约2.58ms/帧，不能宣称零成本。相比05的54.9ms/帧，不再持续6子步/帧和dt-clamp慢放。新坐入P95 6.4ms、起身10.1ms。所有无录制阶段sim/wall约1。只是开发机短测，普通PC/长时间/主线其它活动未过。

分项另一次测量坐稳子步均值1.249（均值帧7.255ms、P95 11.3），不要把此较少子步的均值当算法额外加速。按总量除实际子步：总fit4.21ms/步、rail/alpha2.499ms、关节变换0.0206ms、轨生成0.0056ms，约47,734候选三角/步。原每步1538实际皮肤点和全轮廓重建已取消；全actual skin仍由独立QA验证，非运行时代理自证。

输出：`output/playwright/hand-contact-44cd801ea417/{joint-source-pose-legacy,joint-source-pose-actual,unrecorded-perf-legacy-outfit1,unrecorded-perf-actual-outfit1,internal-profile-actual-outfit1}`。

## 实际正常1×片与工程观看边界

同room、dynamics ON、同body的旧/新两片：`output/playwright/hand-contact-44cd801ea417/joint-normal-video-room-dynamics-1794705995192/{legacy,actual}.webm`。整段站→坐入→坐稳→起身→站，未经逐帧推进或剪拼。

顺序FFmpeg全时段4fps总览及6fps人物裁切，工程查看未见明显新增大幅抬肩、夸张悬手或身体动作中断。约1.33–1.83s坐入、3.83–4.33s起身动作与旧版总体相似；掌部间距细节仍需近景/用户正常播放判断。裙硬折属于既有未解决问题。**抽帧不等于完整实时观看，更不等于用户观感验收。**

记录前置rAF携带setup前旧timestamp，第一条t为负，随后出现236.7/291.3ms初始化间隔，不能归成持续坐姿卡顿。t≥1s后旧/新sim/wall均约1；new录制rAF P95 12.2ms、最大18.2ms（两次坐稳），旧P95 6.2ms。保留原trace，未删启动异常；44没有05整段持续模拟慢于wall的问题。

## 安全移植与剩余

`portable/manifest.json`记录共享abdb三文件原bytes和LF正规化hash；`.patch`均以当前共享文件为基线生成，`git apply --check`已通过。**仅应用局部patch，不用`.candidate`整文件覆盖主工程。** 现recipe/greeting/派生前臂字段保留。

依次复制`joint-hand-workspace.mjs`到`prototype/src/`，按manifest将三个源profile复制为`prototype/public/assets/hand-joint-contact-v1/{female,jaw,waisthip}.json`，再应用三处局部patch。loader先验证原资源bytes SHA，再检查schema/body SHA，helper接收已验证实例profile；没有硬编码import单女json。24个schema/body负例通过。碰撞阈值/轮数/姿态/前臂80轨不变，未降低检测频率。

原44构建源码和安装receipt在`frozen-44cd/`，当前08安装只在独立worktree；shared runtime没有修改。Python3.13.11/NumPy2.4.2（`python -m pip install -r assets-source/hand-joint-contact-v1/requirements.txt`）；原女再生成profile SHA与原文件完全相同。

待root独立审查、合入abdb后的统一build实际回归/成本与1×影片；该统一版通过前不将本分支成功当当前主线能力。完整视觉认可、男性、握麦与直播层、任意指姿、跨实例和普通目标PC性能尚不能继承。
