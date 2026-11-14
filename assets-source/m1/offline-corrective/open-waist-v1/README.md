# 独立开腰孔源 v1

原 `prototype/public/assets/m1/m1-uniform-skirt.glb` 未改。当前 `.glb` 仅移除已确认穿过身体的腰孔封口20面（原face0–19）；不是删身体、删上衣或缩小动作。许可与素材身份继承 M1 原裙，见 `docs/FOUNDATION-ASSET-AUDIT.md`。

复建：仓库根运行 `python scripts/m1-assets/open-skirt-waist.py`。依赖现有 Python/numpy；源SHA固定，输出重复SHA `a5de096be20211ea9a875434893fff6c9d37b25b58cacc27c9bd8d7b8c772d66`。`edit.json`保存中心/环/原面/原渲染索引，`topology.json`是去掉孤立中心的cloth候选拓扑，`verification.json`实际回读新GLB验证所有幸存POSITION/NORMAL/UV/JOINTS/WEIGHTS及skin/nodes/material完全保留。

此GLB可导入Blender编辑，仍保留真实骨架与绑定；尚未另存/验收`.blend`，也没接入产品。680面、682渲染顶点、380焊接点、80边界边，0非流形边。相对原裙新增20条边界恰为腰孔。

`python scripts/m1-assets/open-top-hem.py` 同样只移除上衣内部20面封口（`top-edit.json`给出实际原面和中心索引）；上衣侧面、衣缘厚度、领带、全部幸存UV/权重保持，原上衣未变。新上衣GLB SHA `7f266ff135096f16a6db067cceddee0cd610a886833218b1cb6531dd43721c89`，上衣主体2046面/1405渲染点，领带保持原primitive。两件服装源可单独导入编辑。

`prepare-skirt-layer-rest.py` 读取固定0df同刻真实显示形状，做一次离线body→skirt→top层次拟合，输出 `standing-rest-candidate.json/.obj`。该OBJ只是可编辑离线静态初形，不是加权运行资源。`layer-fit-config.json`保存1mm body候选余量、3mm top候选余量、20mm下摆内搭余量：当原裙顶点低于上衣边缘而三角仍跨过衣缘时，取真实上衣沿20mm高度带的最小半径，避免仅检查顶点而漏掉三角。拟合只发生在源初形，不增加runtime约束，不改身体/上衣侧面。最大顶点移动13.493mm，没有矛盾bounds。

运行 `python scripts/m1-assets/qa-layer-rest-triangles.py`：双cap开孔前的70对侧面交叉，在最终候选变为body0/top0/self0、未决共面0。方法为AABB broadphase后实际三角相交线检查，**还不是独立Blender BVH/最小间隙/视觉初形通过，也没有启动cloth**。阶段性失败配置和形状保留在 `rejected-*` 中。第一次上衣未开孔的静态拟合53处矛盾，后续开孔但无内搭余量56对残留；它们不是可用源。

候选最窄radial层间空间仅约4.12mm，初形无交叉不代表有足够cloth碰撞厚度。不得直接沿用此前3mm/2mm碰撞距离；下一窗口先独立核最小真实间隙，再选择一致的薄衣尺度或拒绝。开孔通过不代表坐姿硬折、步行、跑步或舞蹈通过。保留完整身体和实际可见内层，不把层次规则等同删除上衣。
