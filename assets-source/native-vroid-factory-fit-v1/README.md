# 新843ac基体：自身三装备与原遮罩输入

状态：**CPU实际绑定/几何读回通过；覆盖、游戏、视觉准入未通过**。没有调用编辑器/GPU，没有重导三件GLB，没有更改原78912清单或公共runtime。

基体SHA `843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef`。`equipment.json`为其独立新manifest身份，引用现有`../native-vroid-equipment-v1/`的原top/shorts/shoes文件，资源bytes/SHA保持。三个新entry ID以`native-unmasked-843ac-`开头；原始装备ID/SHA与目标avatar分别记录在`equipment-readback.json`。没有仅复制旧bindings并修改compatibleSHA：脚本实际读取新avatar每skin的IBM、唯一raw节点/父关系/rest以及三个GLB的真实joint顺序，重建各130条bindings并与GLB/新源双向核验。

实际三件装备的indices、POSITION/NORMAL/UV/JOINTS/WEIGHTS全等，新avatar对应内嵌primitive与原GLB的实际引用顶点rest误差0。新源已保全原130joint体系，所以本包没有附骨、改权、拟合或额外骨架。MToon/图片仍引用原GLB字节，不将本CPU结果当材质运行已验，也不覆盖原1nm实验误差/真实Three归一化证据。

鞋底 `sourceFloorY=-8.449510756143027e-7 m`，约-0.000845mm，来自鞋材质实际712三角、600引用顶点的rest蒙皮最低值。两个最低顶点6988/7070和5个关联鞋三角已保存。虽然本次整个共享9158行accessor的最小Y恰好相同，量测没有依赖它；这不是站姿压缩、脚滑或动画接触验收。`foundation-avatar.js`现逻辑只应减去该sourceFloorY一次。

`profile-candidate.json`是离线数据建议，尚未注册：提供新id/SHA、原三装备id、真实鞋底和shorts默认组合。当前`foundationProfile()`仍强制生成pants index0，root须显式接入该defaultOutfit，不把短裤伪称pants。本包相对URL按assets-source包布局解析，不能当已存在public地址。没有复制旧性别的seat/手/前臂/眼补偿/palette/附件fit常量。

## 原SkinMask不能精确变成现有整三角索引覆盖

新Body与原遮罩来源Body的真实indices/UV/几何/绑定完全对应。原Body索引accessor132、Uint32/5125、10022三角，decoded index bytes SHA `a7c83a9c5907979343f93e9fa95bc77a5aa72f2392e99a9f2703eeabc025fee6`。原native PNG位于78912源image11，SHA `dc375769e28d015bc70c3cef6be1dec3794b5b2430a9bf173d60584105f68a8c`，2048²、LINEAR/REPEAT、无mipmap、MASK cutoff.5、UV accessor129。

7点/三角的70154个样本中11118低于cutoff；1514三角七点全隐藏，8350七点全可见，**158三角同时有严格低于和高于.5的样本，无样本恰等阈值**。例如三角730 `[416,415,417]`上vertex417的alpha0，vertex416的alpha1。保整个三角会露出本应隐藏处，删整个三角会删掉本应可见处。`body-coverage.js:147–160`只按face集合整片保留/删除三索引，因此在不改拓扑/表示的前提下不存在精确复现该边界的二元face-ID集合。

七点全同类不保证整个三角同类，不能将1514直接认证为安全coverage，也不能将“任何点隐藏就整片删”改成宽松规则。本包没有生成coverage descriptor，没有阈值调整、细分或新纹理mask运行时。`body-mask-assessment.json`保具体见证与原输入引用；`original-mask-samples.npz`保原tri IDs/全量alpha/空间位置，供后续严格定位。当前基体可露真实皮肤，不等于穿原衣服已无穿插。

## 重建与恢复

在固定输入齐全的新独立检出、当前输出文件尚不存在时：

```powershell
python assets-source/native-vroid-factory-fit-v1/build.py
node assets-source/native-vroid-factory-fit-v1/check-contract.mjs
```

Python复用现有NumPy/Pillow和项目已封读回模块；没有安装。Node只运行既有outfitSelection/resolveEquipmentSet纯函数，并验证新清单拒旧avatarSHA，不加载人物或游戏。脚本拒覆输出，原三件资源和原manifest不变；恢复旧基体时继续使用原78912清单。

root后续决定精确覆盖表示或明确接受的视觉方案，再做新identity的factory加载/基础模式/穿衣/动作/恢复。长期附骨层仍待实现，此包仅当前原生三装备。
