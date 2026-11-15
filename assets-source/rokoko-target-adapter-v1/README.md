# Rokoko样件的可移植离线转换

当前是固定30秒试验的来源适配器，不是自动云API、不承诺任意FBX/衣服/动作兼容。原参考脚本按原字节保留；在相对锁定依赖、显式输入输出路径和防覆盖基础上，现已增加固定输入合同与失败清理。数学、T姿参考首帧处理、最后补保持及男女姿态映射未变。

在工程新检出中先执行 `npm ci --prefix prototype`，将保留的私有输入放入本地目录，然后执行：

```powershell
node scripts/pose-reference/retarget-rokoko-pilot.mjs --source-fbx analysis/rokoko-pilot-archive-v1/vendor-output/5359146-frames0000-0719-1080p-end30.fbx --female-rig analysis/rokoko-pilot-archive-v1/reference/assets-source/video-target-adaptation-v1/female-normalized-rig.json --male-rig analysis/rokoko-pilot-archive-v1/reference/assets-source/video-target-adaptation-v1/male-normalized-rig.json --baseline experiments/m1-hand-release-integrated-v1/dist --output analysis/rokoko-portable-rebuild-new
```

baseline须按assets-source/hand-contact-release-v1的固定038恢复方式生成，或显式提供该固定目录的新路径。output必须不存在。需要的是归档FBX和两目标rig，不需要再次上传视频或依赖云服务重现同一个输出。所有参数可改为当前新检出/输入位置；不要运行original-adapter.mjs中的历史绝对路径。

`input-contract.json` 锁定原 FBX、女性/男性 rig 各自的字节长度和 SHA256、avatar/鞋身份，以及固定 `038341558517` 基底全部 65 个文件（包括 build-info、JS、角色、装备和动作清单）。拒绝错文件、男女互换、缺文件、不同构建、额外文件及基底符号链接；不能只改 build ID 冒充固定基底。路径可以搬迁，内容不能静默替换。若未来要接受另一动作/rig/构建，必须单独建立新适配候选，不属于本固定样件脚本的默认权限。

输入与基底校验、完整内存转换、三产物已录制 SHA 比对，均在复制基底前完成。仅在全部通过后写入独立临时目录，完成再改名为 output；复制/写入/改名异常会清掉本次临时目录，保留已有 output。Windows 短暂文件锁仅允许最终改名最多 1.5 秒的有限重试，不重算动作、不覆盖目录。

便携验证命令（output-root 必须是 ignored analysis 下的新目录）：

```powershell
node assets-source/rokoko-target-adapter-v1/verify-input-contract.mjs --output-root analysis/rokoko-contract-check-new
```

可用 `--archive`、`--baseline` 指定搬迁后的精确私有归档/固定基底。实际结果见 `input-contract-result.json`：错 FBX、互换男女 rig、缺输入、错基底、已有输出五类均按预期拒绝，前四类不产生输出，已有目录 sentinel 原样保留。正确输入在新目录实际重建，男女 motion 与 dance-imports 三产物均与私有归档逐字节相同；原输入、65 个基底文件及历史 original-adapter / rebuild-result / lineage 未变。首次验证曾在 Windows 最终改名处发生 EPERM，失败输出与临时目录均未残留；记录见 `input-contract-first-attempt.json`，未把该次当成功。当前结果是加入有限改名重试后的实际重建。此验证只证明输入边界与重建等价，不新增视觉、脚地或自然度验收。

根实际在新的analysis/rokoko-portable-rebuild-v1完成转换，两目标motion与dance-imports逐字节匹配已录制版本，见rebuild-result.json。首次实际运行的源Newton网格>4权重警告如实保留：Three加载器截断该预览网格的额外影响，转换使用骨姿和轨道，不把源预览皮肤称为原始DCC网格无损重现。

当前目标脚底/比例接触及完整自然度尚未验收。通用游戏JS没有为此新动作修改；采用既有normalized-vrm-motion.1和精确body/鞋身份。录制和性能对应原开发机，非普通PC。

**备份边界：** 当前完整126文件私有输入/候选/录像包已逐hash复制到analysis/rokoko-pilot-archive-v1（同一机器、Git忽略），不是异地备份。含真人的对照影片和抽帧仅在本地4174提供，不推公开仓库。源转换脚本/哈希/结果可入Git；缺少私有FBX输入的新检出不能声称独立重建此试验。五片与受限文件说明见evidence/rokoko-30s-advisor-v1/LOCAL-BACKUP.json。
