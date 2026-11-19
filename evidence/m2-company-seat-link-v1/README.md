# 两间正式公司房间的座位交接

[同房实际画面与四段正常速度录像](index.html)。同一份游戏包读取公司存档、渲染原工位椅和两份已签名男女记录。固定角色源码 `fee5544e`，构建 `be0e52c243ec`；公司交付 `d57333ea66d2`，清单 SHA-256 为 `6359150e83c284125dc757ac6680cc326d58bf57df142dfc4af0d6b522c658f2`。

### 从缺陷到游戏入口

原角色包 `4959572f6d5e` 将角色加入自己的场景，每帧更新待机。它加载了坐下动作，但消费入口没有给实例提供 `requestBehavior`，调用失败。新接口在原角色实例上绑定行为，继续使用 Phaser 的单一时间源及原有动作、转身和座位预约。宿主将同一 Three 场景交给环境原生制作工厂，角色按家具使用点取得原座面与椅背网格。普通接近沿避障路线行走，经过拐角时使用与角色工作台相同的曲率控制；椅前再精确对齐。[角色控制器](../../prototype/src/facility-behavior.js) · [公司接入](../../scripts/production/facility-room-host.mjs)

### 实际验收

- 单工位民房由女角色先入座，出租屋由男角色先入座。每个房间内，第二人争同一把椅子时收到 `seat-unavailable`。坐稳后保留占用，通过页面保存按钮保存状态。两座位的实际网格上表面高度均为 0.470 米。
- 完全关闭浏览器上下文，另开同房间，读取保存内容，原角色重新取得原座位。起身并离开后释放；另一人接近途中取消，立刻可重试，随后坐稳并起身。程序检查使用真实请求结果、逐角色位置、实际骨盆及租约历史。[Chrome 157 全流程](gameplay/report.json)
- 侧面录像另用正式页面按钮确认入座和拒绝反馈。记录到一个动作缺陷：第一人按座位配置站在出口，下一人接近点离此处仅 5 厘米。约 16–19.5 秒两人明显重叠。这一版本的双人错身观感未通过。[侧面录像](controls/room-controls-1x.webm) · [失败证据](controls/visual-review.json)
- CPU 回归另含家具阻挡、错误保存组回滚、取消后迟到的资源、独立身份、旧实例销毁和重建。绕桌用例在两个中间折点间有 87 帧连续转弯，最低速度 0.85 m/s。[五项回归](cpu-tests.tap)
- 仅包括这两份角色和两间房的单人工位椅。现场从站立阵容恢复已保存座姿，坐下／起身过渡中保存会返回明确限制。人物间动态避让、多层移动及普通电脑表现待验证。人物在全景较小，家具可能遮住坐姿细节；画风和动作自然度留给人类评审。

### 重新组合

用包含本轮运行审查登记的主工程执行，所有输出都在项目内。角色游戏从两个独立检出重新生成，输入和输出逐文件核对。[固定重建](rebuild.json)

```powershell
$game = 'experiments/worktrees/company-seat-fee5544e'
$out = 'output/replay-company-seat'
$records = 'evidence/m2-uniform-lite-operator-v1/records.json'
$inventory = 'evidence/m2-company-seat-link-v1/inventory.json'
$company = 'F:/gamemake-test/native-studio-round/official-pair/body-texture-f496/received-room'
New-Item -ItemType Directory -ErrorAction Stop -Path $out | Out-Null
node scripts/runtime-package/game-record-cli.mjs export --source-root $game --dist "$game/prototype/dist" --records $records --inventory $inventory --out "$out/pair"
node scripts/production/package-facility-room.mjs --game "$out/pair" --game-sha256 3cba17b8df616540b404c8739dcf82c40bb580e49fceb37a6209fb73d2b36d43 --room $company --out "$out/rooms"
node scripts/run-fixed-check.cjs "$out/rooms" scripts/qa-game-facility-room.cjs be0e52c243ec $records "$out/check"
```

公司输入目录可以替换为同一份经 SHA 校验的移交包。独立组合包中实际入口为 `facility-room.html?records=/records/manifest.json&room=plant-home`，出租屋使用 `room=plant-rental`。通过 HTTP 提供组合包根目录即可；已有 4196 与 60800 人工工作台各自单独管理。
