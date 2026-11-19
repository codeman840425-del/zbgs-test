# 唱播房的两档麦架

同一支落地麦在空闲时可选择标准位或低位。档位由房间配方明确给出。宿主可根据当前人物的实测身高与姿态选档；男女这两组记录只用于验证当前房间。麦架没有自动按性别选档的逻辑。

## 改档与保存

在 `singingRooms[].heightProfiles` 中，`standard` 和 `low` 各自指定一个带版本的麦架资源，以及站位局部坐标中的 `mouth` 和 `eye`。当前麦架实例上的 `resource` 决定有效档位。当前 `performer` 的口眼须与该档一致。两档共同使用原底座、朝向、容量、接近点和退出点。

```js
await session.apply([{type: 'set-vocal-height', id: micInstanceId, profile: 'low'}])
const point = session.scene.describeUsePoint(micInstanceId + '#vocal')
```

在现有场景入口读回 `point.resource`、`point.heightProfile`、`point.performerReferences` 和实体接触节点。设置 `profile: 'standard'` 可切回。宿主将实际预约、占用和退出状态接到 `isUsePointBusy`。资源预载失败、预载期间开始占用或版本冲突都会取消本次更改。恢复时校验两档资源依赖，再由游戏核对人物及任务。

## 批量制作与移交

工作室和出租屋复用 [同一份配方](../../scripts/company-platform/batch-inputs/vocal-height-rooms.json)。在安装了锁定依赖的制作副本中运行下列命令。第一条生成两份正常布局，并分别检查两个档位的实体麦网、完整谱面、镜头和入口。第二条沿实际改档操作产生两个低位存档，检查加载失败、忙碌拒绝和恢复。`REVIEWED_PACKAGE` 与 `REVIEWED_SHA` 指先前经过角色组联测的固定麦架包及其清单摘要。

```text
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/vocal-height-rooms.json output/heights-standard
node scripts/company-platform/test-vocal-height-profiles.mjs output/heights-standard REVIEWED_PACKAGE REVIEWED_SHA output/heights-low
```

发行包可将同一布局的两个档位分别放在 `singing-studio` 与 `singing-studio-low`、`singing-rental` 与 `singing-rental-low`。每个需要宿主接收的快照在打包时使用 `--adapt-vocal-height 输出房键 REVIEWED_PACKAGE REVIEWED_SHA 原房键`。在接收包内运行 `node check-vocal-origin.mjs 输出房键 本包清单SHA REVIEWED_PACKAGE REVIEWED_SHA 原房键 --height-profiles`，可核对原槽的身份、安装变换、接近和退出点，并读取此快照的模型与参考点。普通换皮及旧的继承检查继续执行原有规格。

下例从已完成上述两条命令的独立制作副本运行。`$reviewed` 指向已核验的原包，`$reviewedPin` 取其发布回执中的 SHA-256。`$output` 指向本项目内新的候选包目录。

```powershell
$build = (Get-Content prototype/dist-company/company-build-info.json -Raw | ConvertFrom-Json).shortId
$roomArgs = @('--source', '.', '--adapt-vocal-height', '@default', $reviewed, $reviewedPin, 'singing-studio')
foreach ($room in @('singing-studio', 'singing-rental')) {
    $roomArgs += @('--room', $room, "output/heights-standard/$room", '--adapt-vocal-height', $room, $reviewed, $reviewedPin, $room)
    $roomArgs += @('--room', "$room-low", "output/heights-low/$room-low.json", '--adapt-vocal-height', "$room-low", $reviewed, $reviewedPin, $room)
}
node scripts/company-platform/package-company.mjs prototype/dist-company $build output/heights-standard/singing-studio $output @roomArgs
```

关闭和重开后，使用同一固定包的公开游戏接缝重新验证角色接近、站唱、交接、释放以及相机实际画面。历史角色采样的重放可发现几何缺陷。新组合的实际活动、人物自身遮挡与人眼观感仍分别记录。
