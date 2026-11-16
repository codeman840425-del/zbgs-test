# 屏幕与补光四款结构样件

parameters.json 是批量制作的主输入，contracts/ 保存明确功能合同；各 designId 子目录下 parameters.json 是逐项展开记录。修改主输入和 build-device-collection.mjs 中对应构造后重新导出，不以编辑展开记录冒充改源。

运行 `node scripts/company-platform/build-device-collection.mjs`，随后 `node scripts/company-platform/build-device-collection.mjs --check` 核对磁盘产物，再运行 `node scripts/company-platform/build-library.mjs`。--check 不写产物。GLB几何、源、侧录、显示节点映射和光源位置须保持一致。

四款补光保留既定光源、方向、状态与占地，并提供实际灯头及支架。实际角色受光仍需角色联调，模型发光不等于角色照明通过。
