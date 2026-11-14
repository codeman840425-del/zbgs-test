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
