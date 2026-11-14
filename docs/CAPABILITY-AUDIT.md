# 角色能力只读证据快照

日期：2026-11-14。此文是给唯一能力清单 `docs/CAPABILITIES.md` 提供的审计证据，不维护第二套完成状态或阶段分配。范围为当前 `prototype` 源码与实际二进制文件；没有启动浏览器，没有修改产品，没有将素材存在等同于视觉通过。

机器可读结果：`evidence/capability-audit-20261114.json`，包括全部 43 个动作的名称、真实时间输入时长、通道数、目标节点数、插值、根平移首尾差、实际默认映射和相关源码 SHA-256。

## 动作包确有内容，但只接入六段

实际读取 `prototype/public/assets/motion/UAL1_Standard.glb`：7,618,436 bytes；SHA-256 `69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997`。文件为 Quaternius Standard 的无根位移 GLB，43 段，不是宣传完整库的全部动作。每段均有 195 个 glTF 通道：65 个节点分别含 translation / rotation / scale；这不意味着运行时保留所有通道。

`prototype/src/motion-source.js` 的 `loadRetargetedMotions()` 默认只转换下列六段：

| 语义 | 文件内名称 | 时长（秒） |
| --- | --- | --- |
| idle | Idle_Loop | 2.500000 |
| walk | Walk_Loop | 1.333333 |
| dance | Dance_Loop | 1.000000 |
| sitEnter | Sitting_Enter | 1.300000 |
| sitExit | Sitting_Exit | 1.033333 |
| sitIdle | Sitting_Idle_Loop | 1.666667 |

以下请求对应的素材**实际存在，尚未接入**：

| 文件内名称 | 时长（秒） | 接入证据/缺口 |
| --- | --- | --- |
| Jog_Fwd_Loop | 0.933333 | 不在默认映射与动作状态机中；没有对应步距/支撑/切换验收 |
| Sprint_Loop | 0.666667 | 同上；较快走路不会自动切换到 Sprint |
| Idle_Talking_Loop | 2.933333 | 不在默认映射；无说话行为与面部同步 |
| Sitting_Talking_Loop | 2.933333 | 不在默认映射；无坐姿说话状态和手部空间验收 |
| Walk_Formal_Loop | 1.333333 | 函数 `walkClip` 参数可选择，且已有原生步距校准；主页面和 preview 都用默认值，没有产品切换入口 |

仅有一段名称为 `Dance_Loop` 的舞蹈，不是多风格舞库。其余可研究的动作包括 Interact（2 s）、PickUp_Table（0.833333 s）、Idle_Torch_Loop（1.266667 s）、Fixing_Kneeling（5.2 s）、Push_Loop（2.666667 s）等。没有发现命名为 Wave/Clap/Greet 的独立片段。说话和 Interact 等可能含手势，但本审计未播放，不能据名称把它们认证为合格挥手、直播手势或持麦动作。

`motion.js:setAction()` 只接受 idle / walk / sit / stand / dance / turn。转身来自 `turn-policy.js` 加脚部约束，不是已接入的库内转身片段。`main.js:setSpeed()` 的界面范围为 0.4～1.4 m/s；它控制移动速度，仍以真实位移推动同一 walk 相位，不代表跑步行为已实现。

## 输入与根位移的真实边界

- 人物：`assets.js` / `foundation-avatar.js` 使用 GLTFLoader + VRMLoaderPlugin，实际加载当前锁定 VRM0 女性和 `?legacy` 下 VRM1 对照。没有通用用户上传/导入入口。
- 动作：实际入口是固定 UAL GLB 和固定 `rigMap`。只保留映射骨的 quaternion 与 hips position，丢弃其他平移、scale 和未映射 root 通道。GLTFLoader 存在不等于任意 glTF 骨架都适配；未发现运行时 FBX、BVH、VRMA 或通用 Mixamo 导入路径。
- 装备：固定 GLB + equipment JSON，已有目标人体哈希、原骨映射和 inverse bind 检查。Blender `.blend` + VRM addon 是编辑/再导出的离线流程，不是浏览器直接读取 blend。
- 根位移：路径状态机负责人物世界位置和 yaw；`motion.js` 用 `step / stride` 推进相位。运行资源为 no-root；重定向额外仅对语义 walk 的 hips 轨道去掉首尾线性水平漂移。不能据此宣称任意跳跃/翻滚/跑步 clip 的 root motion 已被完整处理。
- 官方 RM 对照只为 Walk_Loop 与 Walk_Formal_Loop 校准了原生 1.3 m / 周期，乘目标/源髋高比例。Jog/Sprint 尚无生产步距定标。改 `walkClip` 参数能找到一段素材，不等于它成为已验动作。

静态推算当前女性每个映射片段会保留 53 条轨道（52 个骨旋转 + hips 位置）。计算已考虑安装版 three-vrm 对 VRM0 拇指名字的转换；直接用原 VRM0 的 ThumbProximal/Intermediate 名称比对，会误算为少两条。此数值是源码/结构推算，不是本次浏览器运行测量。

## 脸、视线、挂点与麦克风

`foundation-avatar.js:updateFace()` 已有每 3.6 秒一次、窗口 0.18 秒的自动 blink；房间只暴露 neutral / happy / aa，happy 与 aa 设置为 0.65。`foundation.html` 预览下拉还可手动选 blink / aa / ih / happy。女性源脸具备更多表情和五元音，不代表全部已接为行为；没有音频/音素驱动、语音口型轨道生成、说话身体与嘴形同步或长期脸型参数系统。UAL 本身是骨骼轨道，没有脸部 morph weights 通道。

未发现应用设置 `vrm.lookAt.target`、角色视线目标或独立 gaze 控制器。`camera.lookAt()` 是摄影机朝向；眼骨或 VRM look-at 数据存在，不等于角色已看向目标。

未发现挂点注册表、道具挂接管理器或手持麦克风逻辑。当前 hand/head 骨访问用于动作及接触，并没有完成通用 socket API。

`main.js` 的 `micStand` 与 CapsuleGeometry `mic` 是放在 world 固定位置的房间道具。没有手持挂接、手到麦克风 IK、拿取/放下状态或相应碰撞验收；Phaser 配置还明确 `audio: { noAudio: true }`。不能把房间里有麦克风写成直播互动、音频输入或持麦演出已完成。

## 清单、版本与恢复已有到哪一步

已有：`scripts/fetch-animations.py` 核对官方 ZIP 与运行 GLB SHA，恢复 CC0 许可文件；`scripts/calibrate-root-motion.py` 对固定 ZIP/RM GLB 复算两个 walk 片段；`prototype/scripts/build-id.mjs` 将所有运行资产与源码纳入构建摘要；服装已有独立 manifest。

缺少：按动作保存语义、来源 clip、动作版本、root 策略、适配范围、接触与验收证据的正式 manifest，以及动作清单自动生成/校验命令。当前六段映射和步距值写在代码里；fetch 脚本末尾的“43 clips”是固定提示，不是运行时目录扫描。本 JSON 是一次实际解析快照，不冒充已建立清单生产流程。

盘点时确认的恢复缺口已做有界补齐：`scripts/fetch-animations.py` 新增显式 `--archive-output <path>`，保存核过固定 SHA 的官方 ZIP；参数指定的 ZIP 已存在且哈希正确时，可离线复用并恢复缺失 GLB。默认不传参数仍只保留 no-root GLB，已有文件哈希不符会拒绝覆盖。ZIP/RM 与 no-root GLB 仍是不同输入，不能混用。

```powershell
python scripts/fetch-animations.py --archive-output analysis/assets/UAL-Standard.zip
python scripts/calibrate-root-motion.py --source analysis/assets/UAL-Standard.zip
```

已实际执行现有归档离线恢复、重新通过官方免费下载流保存 ZIP、默认已有 GLB 快径、错误 ZIP 拒绝覆盖，以及对新保存 ZIP 的 RM 复算。紧凑结果见 `evidence/animation-recovery-20261114.json`：两个 Walk 片段仍为 1.333333373 秒 / 1.299999952 米。测试大文件只放 ignored `output/`，运行 GLB 未替换，没有接入 Jog/Sprint，也没有新增动作质量通过结论。原能力 JSON 保留盘点时的事实与源码哈希，通过 follow-up 字段指向此次恢复修补，不重写历史证据。

本快照不评价尚未播放素材的动作质量，不替代当前固定候选的 M1A 验收，不新增阶段要求；后续优先级由 `docs/CAPABILITIES.md` 和负责人统一维护。
