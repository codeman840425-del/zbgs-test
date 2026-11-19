# 两名角色依次离场时的资源释放

[打开两版正常速度录像](index.html)。两个普通游戏包使用同一份男女制服、眼镜、服装和角色记录。Chrome 157、RTX 4090，窗口 1100 × 760。可从画面观察男角离场后女角的眼镜和动作；下面的计数另由 Three.js 对象事件取得。

| 固定构建 | 男角脸部 / 身体材质释放通知 | 全部角色离场后 |
| --- | --- | --- |
| 旧版 `60c87f62e8b0` | 2 / 4 | 50 个材质中 2 个重复，129 个纹理中 38 个重复 |
| 修订版 `85520f2e7462` | 1 / 1 | 52 个几何、50 个材质、129 个纹理各收到 1 次 |

旧版沿 VRM 场景逐个网格和材质槽调用释放，多个槽可以引用同一对象。修订版在单个角色内按对象身份释放，保留独立的骨架释放和跨角色位图租约。两次公开移除同一角色依次返回 true、false。男角离场时，女角的 125 个受观察对象均收到 0 次释放通知，7 片镜架及上衣、裤、鞋继续绘制，头骨姿态和动作时钟继续推进。[两版游戏回执与签名](comparison.json)

又使用两条真实 FaceContour 记录，分别先移除 A 和先移除 B，观察两具身体共用的法线贴图。第一人离场后，原 2048 × 2048 位图和 WebGL 纹理句柄仍可使用，留场者的冻结姿势画面逐像素一致；最后一人离场后位图尺寸归零，WebGL 句柄失效。两版各六张对照图的 RGB 像素完全一致。该用例将姿势固定，便于发现幸存角色的渲染变化。[旧版共享贴图回执](shared-before/report.json) · [修订回执](shared-after/report.json)

修订源码 `42063d8ad5009233d669bf4a733111ca2d67a189`。两份独立检出的 541 个构建文件逐一相同，原签双人包两次导出得到相同的 42 个文件。旧包与新包跨越多个游戏修订，本次包体差额不用于衡量释放算法的成本。物理显存、普通电脑帧耗时及 20 人表现尚未实测。[确切重建与失败重试](rebuild/README.md)

从角色工程运行下面的命令复测。输出目录须为工程内的新位置。

```powershell
$package = 'output/m2-role-disposal-v1/game-package'
$pin = '927c41b468a2c9c421f484a63d18d7bcdbca7b55fcb3b1cfc3762f9908dbd521'
node scripts/run-fixed-check.cjs $package scripts/qa-record-disposal.cjs $pin after output/m2-role-disposal-v1/replay-public
$dist = 'experiments/worktrees/role-disposal-42063d8a/prototype/dist'
node scripts/run-fixed-check.cjs $dist scripts/qa-body-normal-lifetime.cjs evidence/m2-native-lip-game-handoff-v1/records.json 85520f2e7462 shared output/m2-role-disposal-v1/replay-shared
```
