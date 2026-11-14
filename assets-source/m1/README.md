# M1：完整 Base_Female 的独立装备

固定源：`prototype/public/assets/foundation/base-female-roundtrip.vrm`，SHA256 `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`。该文件来自已保存的可编辑 Blender 重建工程；不是恢复原 `.vroid`。来源与许可链继承 `assets-source/foundation/source.json`、`docs/FOUNDATION-ASSET-AUDIT.md`，每个GLB和装备清单均保存该链。它属于旧 beta Base_Female CC0 线索链，不混入当前非CC0样本或旧代表人物的运动裤。

## 真实结构与产物

Body primitive 0是7732三角的完整皮肤；1上衣2066面，2领结214面，3裙700面，4鞋540面，5后发394面。脸是独立mesh。结构统计及实际权重在 `build-report.json`。

| 装备ID | 制作方式 | 顶点/三角 | 多骨混权点 |
|---|---|---:|---:|
| m1-uniform-top | 源上衣和领结原拓扑/贴图/权重拆出 | 1640 / 2280 | 1256 |
| m1-uniform-skirt | 源制服裙原拓扑/贴图/权重拆出 | 742 / 700 | 727 |
| m1-uniform-shoes | 源鞋原拓扑/贴图/权重拆出 | 570 / 540 | 414 |
| m1-training-pants | 完整下半身皮肤的真实拓扑裁片，6mm外扩、裤口内折厚度，新制合体及膝裤 | 830 / 1544 | 782 |

原完整皮肤不删面、不改可见性；只有被独立同几何装备替换的源上衣/裙/鞋副本隐藏。身体可单独以中性不透明材质检查。两套组合为同上衣/鞋 + 裤，或同上衣/鞋 + 裙。没有扩充其他衣库。旧 `athletic-bermuda-v1` 的身份限制未修改，不能套到这具身体。

## 可重复生产与可编辑文件

从仓库根运行：

```powershell
python scripts/m1-assets/build.py
& 'experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --python scripts/m1-assets/save-editable.py
```

`build.py`需要已有numpy，先校验源SHA，再生成独立GLB及manifest。`spec.json`保存裤长、外扩、裤口及材质参数；源内衣服保留原UV和纹理，独立GLB只带所需骨/祖先与原inverse-bind。重建前后5个输出文件字节哈希相同，记录在 `reproducibility.json`。

已实际用Blender 4.5.9生成四份独立 `.blend`，网格、UV、骨架修改器、顶点组和嵌入图像均可编辑；统计见 `editable-report.json`。这些是可编辑检查点。规范的可重复生产输入目前是spec + Python生成器，尚未声称任意人工修改blend后都能无损重导出并自动更新兼容清单。

## 接口与回归

`createM1Equipment({vrm,avatarSha256})`先预载全部装备，返回 `setOutfit(0|1)`、`setDebugBody(bool)`、`update(dt,colliders)`、`getInfo()`、`getAssetProfile()`、`dispose()`。角色仍由现有控制器移动/播放动作。

原基础装备引用同一组raw骨；新基模SHA和每根inverse-bind继续由通用equipment.js校验。裙修正后 `profile.skirt` 指向实际显示Mesh，`profile.sourceSkirt`保存原SkinnedMesh的权重证据。显示裙沿用原742顶点/700三角/UV，按位置焊接为381个约束点后再写回同一拓扑，未替换成遮挡板。

```powershell
node scripts/m1-assets/qa-equipment.cjs 'http://127.0.0.1:5173/foundation.html?source=roundtrip'
node scripts/m1-assets/qa-skirt.cjs 'http://127.0.0.1:5173/foundation.html?source=roundtrip'
```

实际30次裤/裙/基础模式切换检查：身体geometry/index/material/visible不变；鞋始终可见；全部原蒙皮装备绑定实际raw骨；错误身份拒绝；dispose恢复源衣片且额外装备组0。报告在 `output/playwright/m1-equipment/contract.json`。`*.generated.js`仅开发期截图诊断，可能被HMR清除注入状态，不是固定构建验收脚本。

## 裙坐姿：已确认失败及当前修正边界

源裙纯重定向坐姿前片落在大腿下。不是遗漏推进源物理：对源Skirt spring组额外推进1/120秒×360次，仍有同样失败。源spring参数为stiffness0.5、drag0.05、hitRadius0.02、gravity0及两个碰撞组。失败截图：`output/m1-skirt-seated-source-springs.png`。

`m1-skirt.js`用新身体实际带权大腿点测出左右约0.08682m包络半径，按当前髋/大腿角度连续抬起前片，再投影腿与椅OBB碰撞，同时约束三角中心、边中点。上腰保持绑定参考。它是这套裙的姿态约束修正，**没有惯性布料、自碰撞或通用体型适配**，不使用旧人物尺寸。实际调用顺序为动作→VRM→世界矩阵→equipment.update。

同姿势修后截图 `output/m1-skirt-corrective-side.png`，前片已在腿上；坐姿侧摆仍偏硬，手与裙接触仍需房间整合复核。不能仅靠该静帧宣称完整坐起或椅接触通过。连续自检录像/数值在 `output/playwright/m1-skirt-selfcheck/`，该资格页没有椅子，因此正式房间的椅接触、完整动作及正常速度观感由整合验收记录决定。


## 后续尖角回归修复（候选源码，尚待固定构建整体录制）

旧裙约束按三角/边逐次把完整碰撞修正直接加到共享粒子，缺少拓扑边长代价。同一高连接度顶点会反复被推，能放大腿部异常位移。失败源码保留为 `failures/m1-skirt-before-spike.js`，SHA256 `a2bb6b943339a6c825a208509f5ceab85a08b018923dee9eba00854ae6ca4618`。

m1-skirt现在每轮以同一状态计算、累计平均碰撞修正（Jacobi），再按真实源拓扑限制边伸长；不把三角顺序当成额外推力。保留原腿/椅碰撞，实际迭代8轮，并报告maxEdgeStretch。1.25倍是约束目标，有限轮次后的实际残差不等于严格硬上限，不能声称所有边都低于1.25。

同一路线120Hz连续480帧：

| 条件 | 最大边倍率（源边>5mm） | 最大局部顶点单帧变化 |
|---|---:|---:|
| 固定旧候选，raw关足IK/骨盆，旧裙算法 | 3.443 | 21.1mm |
| raw关足IK/骨盆，新裙算法 | 2.367 | 17.3mm |
| 旧错误足标定full + 旧裙算法 | 24.396 | 441.0mm |
| audit修正鞋顶点分类后的full + 新裙算法 | 2.386 | 22.0mm |

最后两行同时包含足标定修复，不能把整个改善归功于裙算法。raw层对照才隔离裙本身。旧足标定把另一脚鞋顶点混入同脚测量的根因及修复由audit独立交接。截图/全量轨迹在 `output/playwright/m1-skirt-spike/{before,after-stable-gait}/`。更新后的最差边长帧未出现旧大尖角，但正式完整动作画面仍以固定构建最终录制为准。

真实裙面与手部交叉的独立检查入口为 `scripts/m1-assets/qa-skirt-hands.cjs`：完整840个120Hz时刻，raw前臂/手掌中心线及4条12mm/16mm平行边缘线与实际显示三角求交，按真实UV纹理alphaMASK排除透明面。它不是完整皮肤体积CCD。主代理过渡抬手修正后，坐稳1.5–4秒无中心/边缘交叉，但当时起身4–5.5秒仍86个中心线相交时刻（其中39个前臂中心相交）；4.5秒截图仍能看见前臂末端进裙。已将骨点/交点反馈主代理，不通过挖裙洞或隐藏身体规避。最新结果见 `output/playwright/m1-skirt-hands/report.json`，后续手修复重跑会更新该报告。


## 坐起手部接触候选（M1A）

后续手修正限定在motion.fitSeatHands与foundation-avatar的必要profile。旧MiddleDistal接触目标虽然IK可以到达，整个掌段/前臂仍能穿过前腰；从侧垂手到腿面的直线插值不等于可行的手部路径。因此保留源手朝向及腿面接触目标，对掌/前臂采样使用真实显示裙面、原纹理alphaMASK和有界5轮IK/表面投影。

更新时序为：本子步腿/臀normalized已求解→profile复制到raw→世界矩阵→同帧裙几何→手部IK→正常VRM收尾。裙求解自身未改；手已采样的这一帧不再重复跑同一无惯性裙pass。射线用方向投影格筛选实际三角，基础/裤装不查询不可见裙。idle使用角色局部避让偏移缓存，装备/基模UUID及上臂局部姿势改变会失效；隐藏裙清除缓存，走起时旧偏移平滑退出而不锁手姿态。

最后实测输出 `output/playwright/m1-skirt-hands/surface-contact-final/`：840个120Hz时刻，掌/前臂中心线相交0，仍有49帧半径边缘线接触：坐入0.400–0.625秒左前臂28帧，结束idle6.108–6.275秒右手21帧。6.25秒正/侧截图为750-front.png / 750.png，正常镜头未见大块截断；这不是完整皮肤体积CCD，不能据中心线0宣传零穿模。候选可评审，边缘接触余量未全通过。

开发机无头Chrome的函数CPU计时：active坐起/坐稳median5.9ms、p956.7ms、max9.9ms/模拟子步（包括同帧裙求值）；idle缓存median0.1ms、p950.2ms，姿势失效时可达7.1ms。这是局部CPU时间，普通目标设备整体帧耗时仍要固定构建测量，不能等同性能达标。

qa-skirt-hands.cjs现在用现有Vector3构造器和脚本内Moller–Trumbore求交，不再从/node_modules动态导入Three。已实际在4191静态dist跑通；旧固定构建的失败报告另存fixed-dist-portability，不能与新候选混作通过证据。QA_LABEL可选报告子目录。定向初始化修复仅把构造器root.updateWorldMatrix(true,true)换成root.updateMatrixWorld(true)，以正确刷新SkinnedMesh bindMatrixInverse；audit的四种初始根变换回归已独立通过。
