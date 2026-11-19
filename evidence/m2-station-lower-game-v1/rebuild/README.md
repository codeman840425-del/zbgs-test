# 原签男女角色与低位唱麦双房

普通合包入口在两个新目录各生成 674 个文件、85,239,912 字节。逐路径核对两次输出，文件内容完全相同。组合清单 SHA-256 为 `c1ae6690963ad6291fb60b5d6380f47b06c5373f788c63a2c29330772b462f26`。工作室和出租屋共用这个包。角色游戏来自固定源码 `545dc941`、构建 `ddcf40a56d0e`，归档游戏的全部 37 个文件逐字节保留。[两次构建及原签比对](comparison.json)

公司查看器 `156ab204dddf` 源自 `ca1b3349`。入口核对低位房间传输清单、其列出的文件及公司源码构建身份；继承读取器独立核对上一版传输清单、每个房间保存和使用点审查记录。工作室和出租屋均保留各自使用点的地面位置、进退点、容量、阻挡范围和嘴眼参考。唯一改变的使用点字段是麦架资源，从 `floor-vocal-mic-boom@1` 换成 `floor-vocal-mic-disc-fit-lower@1`。新机架资源卡规定 −4° 俯仰和 44 mm 前移，模型 SHA-256 为 `c31e1b2eb9f6f2407974da44d3652ea817ce285fa1de4ebee7e3c55b4af3652a`。

两版实物的拾音网头均有 1,571 个位置顶点。各自从 GLB 的 POSITION 数据和节点变换复算，网头瞄准中心在机架局部坐标降低 40.209 mm、向前移动 60.819 mm。测试通过编译后的宿主实际装载了新旧两房，解析出的网头中心与上述结果相符。角色在使用过程中的动态距离和视觉表现由游戏运行回执记录。

## 复包

从角色工程根目录运行 PowerShell。已有主包在 `output/m2-station-lower-game-v1/rooms`，重复包在同级 `repeat`。下列命令写入新的 `replay` 并按清单检查。

```powershell
$company = 'F:/gamemake-company-platform-c1'
$released = "$company/company-workspace/deliveries"
$env:NODE_PATH = "$company/prototype/node_modules"
$game = 'output/m2-performer-anchor-game-v1/pair'
$pin = '3d3e2b3885003d0585c1b7eb6ea40c7490001a647f227c2dcff9377aa26060b5'
$out = 'output/m2-station-lower-game-v1/replay'
node scripts/production/package-facility-room.mjs --game $game --game-sha256 $pin --room "$released/vocal-fit-v1" --reviewed-room "$released/vocal-use-v1.1" --room-profile vocal-fit-v1 --out $out
if ($LASTEXITCODE -ne 0) { throw '双房合包失败' }
if ((Get-FileHash "$out/facility-package.json").Hash.ToLowerInvariant() -ne 'c1ae6690963ad6291fb60b5d6380f47b06c5373f788c63a2c29330772b462f26') { throw '组合清单不符' }
```

入口页面为 `facility-room.html?records=/records/manifest.json&room=singing-studio` 或 `room=singing-rental`。此处所用公司输入与依赖均只读。角色主包的正常访问方式沿用既有游戏静态宿主。

## 回归

沿用上一段的变量配置运行。两组测试实跑 10 项，覆盖旧座椅、原高度声房、新低位房、使用点网头和组合门。另以实际普通 CLI 运行五次拒绝并在同一未创建的目的地重试；包括同一角色构建、完全相同的两份角色记录、仅更改游戏包清单的情况。[实际失败与重试](cli-refusals.json)

```powershell
$env:FACILITY_GAME_PACKAGE = (Resolve-Path $game).Path
$env:FACILITY_GAME_SHA256 = $pin
$env:FACILITY_COMPANY_TRANSFER = "$released/desktop-plants-v1.1"
$env:FACILITY_VOCAL_TRANSFER = "$released/vocal-use-v1.1"
$env:FACILITY_LOWER_VOCAL_TRANSFER = "$released/vocal-fit-v1"
node --test scripts/production/package-facility-room.test.mjs scripts/runtime-package/company-room-compatibility.test.mjs
```
