# 低位唱麦接入复验

用角色固定源码 `545dc941498673f008f85748134778fe831f3d35`、构建 `ddcf40a56d0e`、原签制服男女和新公司交付包运行了两房 CPU 实测。角色源码树为 `32ab2a6f6c623a1294b4d997132e630e7d7190ae`，游戏双人包 SHA-256 为 `3d3e2b3885003d0585c1b7eb6ea40c7490001a647f227c2dcff9377aa26060b5`，两份签名的汇总文件 SHA-256 为 `d38cd555d8b125c606ef28775b08fa96b2834c40c082e7ee06478dc4035f6989`。[原签名文件](../m2-uniform-lite-operator-v1/records.json)

公司交付 `vocal-fit-v1 / 156ab204dddf` 的清单 SHA-256 是 `64802112dd64938d88ef6e8115c90096a90f591833467db55bd837e4ca11eebc`。交付包自带的核验入口通过全部 2,267 项。两房仍是 `standing-vocal`，保留使用点、站位、朝向、进退点、参考口眼位置及 `singing-mic-pickup`。两房设施从 `floor-vocal-mic-boom@1` 换成 `floor-vocal-mic-disc-fit-lower@1`，模型 SHA-256 为 `c31e1b2eb9f6f2407974da44d3652ea817ce285fa1de4ebee7e3c55b4af3652a`。工作室另调整了相机实例的变换，出租屋只换麦架资源。游戏和两个公司包的 Three.js、esbuild 分别为 `0.187.0`、`0.28.2`。

| 房间 | 原公司包女体入位 | 低位麦女体，900 帧 | 低位麦男体，900 帧 |
| --- | --- | --- | --- |
| 工作室 | 32.05 cm，拒绝后退场 | 23.52–25.54 cm | 15.58–17.55 cm |
| 出租屋 | 32.53 cm，拒绝后退场 | 23.53–25.84 cm | 15.73–18.90 cm |

四组新包检查均用原签角色走到实际站位，读取登记唇环，并用真实蒙皮唇边、双眼骨和网头网格独立回算。入位射线先命中网头，四组连续站唱、占用冷开和离场释放均通过。最紧样本是出租屋女体，距离 26 cm 上限约 1.604 mm。实测按 CPU 的 1/60 秒时钟运行，画面、音频尚未验证。浏览器的四次首开和冷开结果见[游戏验收](../m2-station-lower-game-v1/README.md)。[首次 CPU 回执](pre-registration.json)

新包的直接祖先是 `vocal-use-v1.1`，清单为 `5c676cafa500ac5fc79d2461935fc323844e02fa0a1baa01c8025cd75d3e4012`。公司正式读取器验证了两房的继承，把更早的 `vocal-use-v1` 当直接祖先时返回 `vocal-origin-not-inherited`。登记前的合包命令使用新 profile 时返回 `Unknown company room profile`，使用旧 profile 选择新目录时返回 `Transfer manifest SHA-256 mismatch`。两次都退出 1，目的地均未生成。当时的兼容入口也拒绝新清单，错误为 `unsupported-room-contract`。

## 复跑和正式合包

```powershell
node evidence/m2-station-lower-intake-v1/replay.mjs output/m2-station-lower-intake-v1/cpu-repeat.json
```

`cpu-01.json` SHA-256 为 `4c57e5a1c43e5dd009298ab65d239c7c84591b1953f6be4627fe55bb480d1d4d`。回放脚本沿用锁定版本 CPU 夹具的源码加载、原签和几何测量。两份转移读取器及实际场景资产按交付清单核验。[复跑脚本](replay.mjs)

新的合包工具已按以下命令实际生成两份相同的包。该 profile 将新清单绑定到现有 `seat-standing-vocal-v1` 合同，核对直接祖先 `vocal-use-v1.1`，并保留历史 profile 的原清单与祖先。现有 `ddcf40a56d0e` 角色审核和双人签名可继续使用。

```powershell
$company = 'F:/gamemake-company-platform-c1/company-workspace/deliveries'
node scripts/production/package-facility-room.mjs --game output/m2-performer-anchor-game-v1/pair --game-sha256 3d3e2b3885003d0585c1b7eb6ea40c7490001a647f227c2dcff9377aa26060b5 --room "$company/vocal-fit-v1" --room-profile vocal-fit-v1 --reviewed-room "$company/vocal-use-v1.1" --out output/m2-station-lower-intake-v1/rooms
```
