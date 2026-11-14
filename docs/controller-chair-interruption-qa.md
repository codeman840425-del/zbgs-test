# 座椅局部坐标、动作中断及场景生命周期复核

日期：2026-11-14。负责人：prototype 子代理。产品源修改范围为 `prototype/src/main.js` 和辅助说明 `prototype/index.html`；未改 motion/assets/cloth。最终由主代理格式化、整合。

## 候选与结论边界

本报告录屏使用独立静态候选 **5b07687d3584**，页面与 `__debug.buildInfo` 均显示该值；源码摘要 `5b07687d3584034c1599cdb47607861d0fb6b4d01d6f00e208bc9e88baddcbf8`。主代理随后格式化后构建的 **3458651cdc31** 是最终整合候选，本报告不把旧 id 冒充新 id。

已验证：椅子原位、平移+45°、平移−90°坐起流程；实体顶点对椅片局部盒采样；排队/取消/重复命令语义；暂停与 resize；三次场景重入清理。视觉尚未通过：接近180°急换向时短暂交叉站姿；动态头发在常规走路/坐起时摆幅较大。实际操作系统后台恢复未测成功，不能用合成 visibility 事件替代该结论。

## 接口及实现

- `__debug.setChairTransform({x,z,yaw})`：椅子组中心的世界坐标与 Y 轴弧度。仅测试入口；坐下、起身、对齐或前往座位时拒绝移动椅子。未占用椅子变换后刷新真实矩阵、导航占位及布料碰撞；既有行走路径重新规划，不传送人物。
- `snapshot().chair`：`position`、`yaw`、`seatedAnchor`、`approach`、`exit`。人物正向、椅子正向均为局部 +Z。`seatedAnchor = chair.localToWorld(0,0,seatBack)`；`approach/exit = chair.localToWorld(0,0,seatBack + seatApproach)`。根一直停在 approach，坐起由 motion 的局部髋位移完成，不另外移动世界根。
- 最后接近座位的路径容差改为0.5mm，正常减速走完，不在末帧强制吸附。三组实测横向误差0.198/0.437/0.372mm，朝向与椅子完全一致。
- 椅子对象名称 `RepresentativeChair`，两个实体子片名 `chairSeat/chairBack`。
- `__debug.chairColliders()` 返回 `{name,mesh,localBox,matrixWorld,inverseMatrixWorld,refresh,projectOut}` 数组。`projectOut(worldPoint,margin)` 原地修改 THREE.Vector3 并返回是否推出；投影到真实椅片局部最近面。没有把45°椅子扩大的世界 AABB 当作布料实体。导航先世界 AABB 粗查，再椅子局部盒细查。
- `__debug.buildInfo` 与 `snapshot().buildInfo` 为来源摘要，静态页显示候选短 id；Vite开发页明确显示“开发预览”，避免HMR旧摘要被误当固定构建。
- 骨骼辅助接触点：heel/toe时用 `supportAnchor/supportActual`；否则明确为踝目标/实际位置。均为地面投影，不能据其颜色证明网格无穿模。

## 动作状态规则与实际回归

| 操作 | 实现/结果 |
| --- | --- |
| 行走改目的地 | 更新路径，保留动作相位，不重新播放walk；代表路径最终到新目的地，采样0导航碰撞 |
| 停止 | 清目标、路径、待执行请求和座位对齐；世界根立即停止；motion自行收脚，根位移0 |
| 舞蹈→行走 | 先请求idle，排队目的地直到danceMix≤0.001；前0.4秒root严格不动，随后走到目标 |
| 坐下中途→行走 | 请求stand并保留唯一最新目的地；继承当前sitProgress；35.755%中断后首个1/120秒进度34.594%，没有跳到100%或重放全程；起身后执行新路 |
| 重复同动作 | sit/turn/dance均不重置modeTime/actionTime。坐起按钮自身显式切换sit/stand；debug.action('sit')保持幂等 |
| 停止排队舞蹈行走 | idle命令取消pending，2秒后仍原地idle，无隐藏路径继续执行 |
| UI按钮 | 暂停时正/侧/背按钮切换后target仍null，不穿透成为地面点击 |
| 暂停/resize | simulationTime、phase、根位姿不变；恢复首帧不补暂停时间 |
| 低帧耗时 | 所有动作、VRM与布料使用同一≤1/120秒子步；实测最大dt=0.0083333333秒 |

场景重入前实测 `game.events.command` 监听数1→2→3，确认存在真实泄漏。已在Scene SHUTDOWN解绑具名command/space/visibility/resize监听，dispose对应OrbitControls。修后连续3次restart：command、space、pointerup均保持1；纹理32、几何82保持不变。这是当前单次浏览器、三次重入的结果，不声称长时内存泄漏彻底排除。

显式reset过去传送根后保留spring/cloth历史，现流程为 `motion.reset → motion.update(0) → avatar.update(0) → world矩阵 → avatar.resetSecondary()`，只用于显式重置。正常走路不清历史。新录屏未见重置后从旧位置拉飞的瞬间；常规转身/坐起头发大摆仍单列限制。

## 椅子实体采样

使用 `scripts/seat-contact-probe.mjs`，把每个可见蒙皮网格实际变形顶点转换到椅片局部坐标，检测真实BoxGeometry局部盒。包含身体、原上衣、短裤、附加裙，不隐藏衣服。

三组各35个样本，12Hz覆盖坐下、坐稳、起身；原位、平移45°、平移−90°的所有可见顶点对椅面/椅背入盒数量均为 **0**。这是离散顶点检查，**不是三角面相交、连续扫掠或任意椅型/体型的通过证明**。三角面与衣服相交由主代理另外检测。

数据：`output/playwright/controller/chair-contact-report.json`。脚本：`scripts/chair-local-contact-check.generated.js`。

## 视觉记录与复核

- `output/playwright/controller/chair-local-front-side.webm`：1440×1400，25fps，66.6秒。约3.2–11.5s原位正面、11.6–19.8s原位侧面、20.0–27.4s平移45°正面、27.6–35.2s平移45°侧面，其后暂停画面。全部坐下/起身时鞋在画面内。接近椅子途中，跟随侧视相机会短暂被真实家具遮挡；未删除家具掩盖问题。
- `output/playwright/controller/interruption-front-side.webm`：1440×1400，25fps，32.28秒。约3–15秒正面、15.2–27.4秒侧面。基础动作模式（保留原衣片覆盖）、关附加动态。展示改目的/急停、dance→walk等待、坐下35%中断起身再走。约3.8–4.4s急换向可见短暂交叉腿线，**该视觉项未通过**。
- 静帧 `seated-0..3.png`，过程帧表 `chair-overview-1..8.jpg` / `interrupt-overview-1..4.jpg`。独立复核按完整时间区间5fps帧表检查，不能表述为已逐25fps复核自有两条整片。
- 另独立复核QA `output/playwright/stop-final/three-speed-stop.webm` 的2.00–12.40秒全部261帧，25fps连续帧表保存 `stop-allframes-1..8.jpg`。三速停止均可见依次抬鞋收脚，旧版“双脚贴地一起滑拢”未再复现；不以脚锁误差为0代替该视觉结论。普通源步态仍偏大步/弯膝，艺术自然度由用户判断；这段短片不能代表完整三周期所有方向通过。

## 生命周期边界

Playwright同一个BrowserContext创建第二tab并bringToFront后，第一tab的 `document.hidden` 仍false。CDP freeze也未形成可验证的真实后台条件，因此真实桌面/移动浏览器后台恢复 **未测**。

已做合成 `document.hidden=true + visibilitychange` 的处理器回归：300ms期间simulationTime完全不变；恢复首帧0dt，不补积压；所有子步仍≤1/120秒。这仅证明应用处理器行为。暂停400ms的时间差0，恢复约150ms时间差0.1657s；暂停resize根/相位/时间严格不变。

## 重跑

先启动目标候选，然后在仓库根执行：

```powershell
npx --yes --package @playwright/cli playwright-cli --session controller goto http://127.0.0.1:5173/
npx --yes --package @playwright/cli playwright-cli --session controller run-code --filename scripts/controller-check.generated.js
npx --yes --package @playwright/cli playwright-cli --session controller run-code --filename scripts/scene-lifecycle-check.generated.js
npx --yes --package @playwright/cli playwright-cli --session controller run-code --filename scripts/chair-local-contact-check.generated.js
```

前两项脚本包含状态/幂等/监听数断言，第三项输出真实可见网格接触计数供审查。脚本保持当前tab URL，方便对静态候选重跑。录像脚本分别为 `controller-record.generated.js` 和 `controller-interrupt-record.generated.js`，配合CLI `video-start/video-stop`。首次新session若未打开浏览器，用CLI `open` 初始化。

报告/原始结果位于 `output/playwright/controller/`。最初数值报告是在开发页执行并明确development=true；最终两条录屏在固定静态候选执行，不能混淆构建归属。构建成功，仍有现有大chunk警告。

## 下一阶段优先项

1. 急换向支撑脚与根yaw的协调：当前站脚世界锁保留时根持续旋转，可短暂出现交叉站姿。需要同场景前/侧再验证turn-in-place或支撑释放过渡，不能用零路径碰撞替代。
2. 实际桌面与移动端后台/恢复，长时间多次进入退出资源检查。
3. 常规头发摆幅、近景动态与裙褶自然度继续审美迭代；当前裙无通用自碰撞/任意体型适配承诺。
4. 真实网络账号、权威存档、结算与排行仍属后续里程碑；此样板不具备真实多人服务。
