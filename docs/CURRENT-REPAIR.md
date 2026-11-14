# 当前修复候选与复现方法

更新：2026-11-14。当前修复分支 `fix/avatar-garment-locomotion`。修复前可运行快照 `b8fea87` 已推送到 `origin/recovery/anime-3d-sample`；不改上游 main 或线上 Pages。最终观感验收尚不能由数值结果替代。

本轮交付固定构建 **6e6a4fc03f64**。先看 [最终验收、性能数据与限制](ACCEPTANCE-2026-11-14.md)。当前样机4180，对照入口4174/output/review；重新启动用 `Start-fixed-demo.cmd`（4173）。全新检出产品源码31ebe6e构建成功，输出逐字节一致。精选证据在 `evidence/6e6a4fc03f64/`，长录像在本机output，不能混淆备份范围。

## 真实路线

- `prototype/package.json` 锁定 Phaser 3.90.0、Three.js 0.187.0、@pixiv/three-vrm 3.5.5，另有 Vite/Playwright 锁文件。
- `main.js` 的 Phaser Scene 管理输入、路径、状态与时间。`assets.js` 通过 GLTFLoader/VRMLoaderPlugin 加载 `.vrm`，`motion-source.js` 读取 Quaternius `.glb` 动作并重定向。`motion.js` 先求 normalized 骨骼，随后 `avatar.update()` 调 VRM 更新 raw 骨骼/约束/动态，再更新世界矩阵、裙体、Three.js 渲染。
- 是实时三维蒙皮，不是序列帧或二维拼片。Rigby2D 不在依赖及运行调用链中；`scripts/rigby-mcp-client.mjs` 只是未接入本样机的早期工具脚本。
- 源素材不可变：pixiv VRM 与 Quaternius CC0 GLB；运行裙体及碰撞代理由可读源码生成。没有原 `.blend`/`.vroid` 文件，不能称作完整原始美术工程已恢复。

## 分层调试

原 Body_1 的胸腹皮肤缺面，经独立三视图和中心躯干射线确认（见 `garment-audit.md`）。基础模式因此保留原上衣与短裤蒙皮几何，用纯色材质看动作；不是完整裸模或新制贴身练功服。全部必需覆盖保持可见。

页面提供暂停、1×/0.25×、单步、正/侧/背视角、normalized 骨骼和脚接触辅助。调试接口：

```js
__debug.setBodyMode('base' /* or dressed */)
__debug.setCorrections('raw' /* or ik, pelvis, full */)
__debug.setDynamics(false)
__debug.view('front' /* or side, back, free */)
__debug.setPlaybackRate(.25)
__debug.setPaused(true)
__debug.advance(1/60) // 精确模拟秒，不再次乘慢放倍率
```

原始重定向模式跳过程序髋/腿修正，仅用于归因，不宣称其已满足地面与家具接触。关闭附加动态时裙体呈参考形状，完整穿衣验收必须开启动态。切换模式可在相同时刻对照，不推进动作时间。

## 已复现与修改

1. **蓝色部分身份**：新增 `GravitySkirt` 裙体，原 VRM 只有白上衣/黑短裤/鞋等，没有蓝外套。用户五张图中最后两张文件相同。没有截图动作时间元数据，不能声称恢复了用户的精确那一帧；已复现同类缺陷。
2. **白色腰部斜片**：备份候选冻结同一姿势，仅将 Tops 主材质染红，白片同步变红。证据 `output/playwright/garment-diagnosis/front.png` 与 `identity-colors.png`；这是上衣穿出裙体。不是新增裙体缺面或透明排序。
3. **短裤显示事实纠正**：MToon 材质为 `[base, outline]` 数组，旧单材质名字判断没有匹配短裤，因此此前“已隐藏短裤”的陈述错误。现删除这段无效隐藏，明确保留原短裤，不删身体或衣片掩盖问题。
4. **裙体穿插**：旧碰撞代理只有粗略人体胶囊，没有实际上衣/短裤表面。新增 `garment-collider.js`，每帧从实际变形衣片构建横截面凸包，服装间留 8 mm 间隙；同时约束裙体面片中心与边中点，补上“顶点在外但面片切入”的缺口。是本样板的近似代理，不是通用自碰撞系统。
5. **站姿**：原待机是前后错脚低髋姿势，程序收脚却保留低骨盆/原极向，造成外翻。现在协同调整直立髋高、脚位和膝极向。另修复每帧恢复bind pose与Three AnimationMixer省略不变轨道写入的冲突，保存并恢复上一帧原始动画输出后再施加IK。
6. **起身穿椅**：旧坐姿root与站姿脚位共用椅面范围。现在站立接近点位于椅前，坐起过程中脚保持椅前，骨盆向后落座；寻路阻挡由实际椅面边界生成，不再使用偏后的旧常量。
7. **边缘**：同姿势 A/B 关闭描边即消除虚线；将主面改 FrontSide 会暴露原模型开放结构，未采用。保留原双面与MToon，改为屏幕空间细描边，避免0.8毫米世界描边在房间镜头下变为亚像素断线；轻微区分上衣冷白与皮肤暖色，未模糊画面。证据 `output/playwright/material-diagnosis/`。
8. **换脚顿挫**：左脚释放时单帧额外修正41.995mm，同时rAF约6.1ms、phase连续，raw无同样跳变。确认是IK释放跳回源脚轨的姿态不连续。现在保留释放修正并跨0.16周期平滑衰减，最大额外修正步差4.272mm；官方root位移标定步距为1.287770m。实际鞋底最低点范围−1.59～+0.34mm，连续支撑网格顶点仍有最大2.96mm/帧移动，不声称零滑步。详见 `gait-fix.md`。
9. **停止与中断**：停止从双脚贴地插值改为交替短抬脚收拢；坐下途中请求移动保留当前坐姿进度，先起身再走；舞蹈请求移动先退出舞蹈。场景重入的重复监听已修正。
10. **急换向**：旧版在有平移时仍以3.2rad/s旋转根，世界支撑锁与身体朝向冲突。同条件180°返向，实际踝单1/120秒最大跳动125.45mm。现在>0.65rad换向先等待收步完成，再以0.8rad/s交替原地转步，最后继续路径；最大踝步差25.88mm，未硬清脚锁。连续回放未再见旧交叉站姿，180°转身约4秒。数值是整个踝运动，不是前述“额外IK修正”的同一指标。详见 `controller-chair-interruption-qa.md`。

## 可复跑检查

启动目标服务后：

```powershell
node scripts/qa-motion.mjs
node scripts/qa-locomotion.cjs http://127.0.0.1:4180/
node scripts/qa-seat-transition.cjs http://127.0.0.1:4180/
node scripts/qa-garment-contact.cjs http://127.0.0.1:4180/ after
node scripts/qa-outfit-video.cjs http://127.0.0.1:4180/ after
```

`qa-garment-contact` 用实际变形三角面相交检查，独立于服装碰撞代理。当前95个站/走/坐/起采样：快照候选83个存在交叉，面片补正后0个；不是连续时间全三角碰撞保证。`qa-seat-transition` 对两服装坐下/坐稳/起身/站定30Hz取样，当前椅面/椅背顶点穿入0；不等于所有家具或所有姿态均合格。

静态对照候选位于 `experiments/before-garment-fix`，本机服务4181；该目录被忽略，可从 `b8fea87` 重建。测试录像、逐帧报告在 `output/playwright/`，本地视频不进入Git。录屏前先固定静态构建，避免HMR中断。完整衣装视频按同一镜头/路线/速度对照，基础动作原地/路径与四档修正由 `qa-gait-*` 专项记录。

## 仍未完成的能力

当前只验证这个角色和现有两套外观。蓝裙仍无自碰撞；通用体型/衣库适配、完整人体资源、捏脸换发型、真实多人服务器、原经营流程接回均未完成。发丝与手臂接触、所有舞蹈幅度/其他家具路径需独立验收。真实联网方向是各自公司经营、榜单/交易/异步PK。
