# 食品带货直播间的制作与验收

这组输入制作两间可继续编辑的食品直播间。出租屋占 4.5 × 4 米，使用商品网格背景和框柱仓储架。工作室占 6 × 6 米，使用条带背景和交叉背架。桌面相机面对柜台上的本期商品，其余三件在可单独换款的层板上。经营系统可读取这些物件的实例与资源身份。[两份制作输入](../../scripts/company-platform/batch-inputs/product-showcase-rooms.json)

## 素材和布置

四款样件是立装袋、纸盒、金属罐和蜂蜜瓶。它们来自 Kenney Food Kit 2.0，交付包保留原模型、原色卡和 CC0 许可。生产器保持各款之间的相对尺度、原始网格与 UV，将源文件引用的 PNG 嵌进游戏 GLB。统一挂装包络为 0.18 × 0.24 × 0.18 米，底面中心为原点，+Y 向上，+Z 朝展示方向。每件货样保存自身身份、父展台及层板 ID。新增包装可提供另一份 GLB、图片、可编辑制稿源和版本化配方。[作者素材页](https://kenney.nl/assets/food-kit) · [模型生产说明](../../assets-source/company-showcase-product-v1/README.md)

柜台和三层货架沿用既有实体承载面。主货品在柜顶 1.20 米处，三份备货层板的标称高度分别为 0.45、1.05 和 1.80 米。出租屋内蜂蜜瓶底部较低，台面中心的位置使相机看向瓶身下部的视线碰到柜台前缘。将瓶子沿柜台局部 +Z 向前移动 8 厘米后，整个挂装包络仍在台面之内，五条取样线都能抵达商品。

## 给制作 agent 的入口

批次项的 `productShowcases` 是房间布置规则数组，同一公司可以包含多间带货房。每项给出自己的真实房间、连通门口、主播站位、通道宽度、拍摄构图范围及 `members` 所指的八个实例。实例可自行命名，换布局时更新引用。相机和柜台的局部方向、实际挂位与支持面高度均参与检查。站位、入口通道和实物视线的检查结果写入房间生成报告。[双房规则](../../scripts/company-platform/showcase-inputs/showcase-checks.json)

在可写副本的 `source` 目录运行下列命令。用新目录作为批量输出；如只重试其中一房，可追加 `--only showcase-rental`。修改单件原稿后，使用 `publish-room-appearance.mjs --publish` 登记新配方，原款及原存档继续指向其已固定版本。

```powershell
npm ci --prefix prototype --no-audit --no-fund
node scripts/company-platform/build-showcase-products.mjs --check
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/product-showcase-rooms.json ../showcase-results
node scripts/company-platform/test-showcase-room.mjs
```

规则随布局和游戏存档传递。在独立包根目录使用 `node edit.mjs validate SAVE` 或 `node edit.mjs apply SAVE OPS NEW_RESULT_DIRECTORY` 可复核当前摆放。正式打包也会复核，失败回执给出有问题的物件、挂位、区域或遮挡。五条实体采样线用于检验当前静态商品构图；动态角色遮挡、货品拿取、销售和真实摄像另有游戏或角色机制负责。
