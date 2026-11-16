# 单椅与双人沙发结构样件

六份 designId.json 是可编辑制作参数。使用固定chair@1或lounge-sofa@1合同，分别构造四款新单椅、两款新沙发；加原软包与开放木框沙发形成四款兼容双人外观。

运行 `node scripts/company-platform/build-seat-collection.mjs` 导出，`node scripts/company-platform/build-seat-collection.mjs --check` 比较既有字节，再运行 `node scripts/company-platform/build-library.mjs` 登记。源文件以LF保存，参数摘要对应实际字节。contact射线和几何回读仅为静态检查，不冒充人物接近/坐起通过。
