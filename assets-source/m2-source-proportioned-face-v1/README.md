# 来源比例·收窄脸型试样

**状态：experimental-preview-only。** 一个明确新身份的内部造型审查样件，保留原男性 `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff` 和原粗拓扑。不是完成旧 lean，也不是原八体通过；没有 public 注册或修改4196。

真正预览资源：

- `generated/male-source-proportioned-narrow-preview-v1/male-source-proportioned-narrow-preview-v1.vrm`
- SHA256 `5120bd32b3491864d216f5a93810829f8f128f974a79824b3c911f62fa0810e5`
- 原源对照：`prototype/public/assets/foundation/base-male-roundtrip.vrm`，不要把新资源交旧 profile/SHA 准入。

该设计的数值由 root 选择，并非用户指定或永久人体/风格标准。源颏层取 Face_SKIN 最低 Y；下颌层取既有 head cage −.025 m 环，面颊层取原 cheek 中心 +.005 m。它们是工程层位，不是解剖真值。颏横向尺度 .96，下颌/面颊 .92；源 fixed neck 最大 Y 和 fixed eye 最小 Y 及外侧 frame 平台为1。使用官方 SciPy PCHIP，dY/h 恒为0，不用旧 jaw+cheek 相加公式，不拉长/前推下巴。

`spec.json` SHA `daa6dcd1d7eb7f0652bdbd50b1f27562bec1e977c0491f1bb0719d33f2ad33c5`。全部层、输入 SHA 和身份写入配方。旧 spec/曲线引用只用于源完整性及保护范围溯源，不继承旧目标或候选准入。

本次只有 identity 和该一个设计各一次构造、求值、导出。全部120935实际 base/morph端点（7855 Body +2056 Face×55）保存原/新/J/Float32数组，额外只读回原8 frame。没有新细分、参数搜索或真实55 strict接触运行。

| 读回项 | 实测 |
|---|---:|
| 新候选最小实际 det J | .92 |
| 保护 eye/neck/frame 最大误差 | 0 |
| 全端点 Y/Z | 精确保持原值 |
| mouth材质最低Y到skin最低Y距离 | 原/新均32.455086708 mm，比值1 |
| 新精确退化/非正参考面法向点积 | 0/0（不是自交证明） |
| Float32 base+delta 最大误差 | 14.612 nm |
| 新101诊断最大残差 | .237814 mm，无缺片；不是旧101门 |
| identity 作者 N 差 / NORMAL delta | 0/0 |
| 导出完整消费者 / morph消费者端点 | 15 /486 |

原二进制prefix、skin/IBM、UV、贴图字节、材质、骨架和表达 JSON 保留。每个真实 P+D 用同一 G 求值，作者 N 复用 J 逆转置传输，再存54个 NORMAL delta；没有把几何面积法线代替作者 N。存储曲线的实多项式证书复用已有精确 Bernstein 实现；这不等于浮点全域执行证明。

导出仅复用 `adapter.assemble / bake_bytes / readback` 独立函数。旧 `strict_gate` 和旧 run 准入未被改写或伪造通过；本包是 root 明确授权的先看目标视觉阶段，使用新 preview schema，失败项不改旧标签。

整个唯一生成/导出监控2.237秒，采样峰199360512 bytes，2线程环境；`run-receipt.json` 记录费用。CPU诊断另用现有全局 Python/Pillow，2.992秒。运行venv没有Pillow的只读依赖检查已发现，未安装工具；CPU渲染使用已装Pillow12.1.0/NumPy2.4.2。

`diagnostic-preview/source-candidate-three-view.png` 以及六张单图为原/新同镜头正、3/4、侧面纹理CPU诊断，非游戏MToon/光照/描边，**不作为合格美术画面或视觉验收**。实际VRM交 root 用共用 Three/VRM 与游戏光照检查，输出结构不要求复制控制器。

待验：真实近景观感、表情混合/known-oh、闭眼和眼白覆盖、动作、发根/衣物fit、保存恢复及游戏准入。此文件不对这些项目给通过。显著角色差异后续由多部位、身形、发型等组合承担，不能再全靠夸大下巴。

生成命令（只可在新目标目录或恢复副本上运行，本封包拒覆盖）：

```powershell
experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe -B scripts/m2-source-proportioned-face-v1/build.py --prepare
python -B scripts/m2-source-proportioned-face-v1/freeze.py
python -B scripts/m2-source-proportioned-face-v1/run.py
python -B scripts/m2-source-proportioned-face-v1/preview.py
```

prepare只记录源；freeze保存已审输入SHA；run执行一次identity及新候选；preview只读导出资源。本次freeze.py在执行后补成可重建入口，与当次同等内联封定命令的文件集合/格式一致，未改原execution-spec或重跑数值。没有复位旧文件、角色替换、runtime配置或部署操作。首次结果与失败均应保留，不直接重跑覆盖。
