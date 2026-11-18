# 直播桌的鼠标与鼠标垫

房间配方通过一个桌面实例安装鼠标和垫。运营场景可以按外观、工位和房间批量选材。屏幕、键盘、鼠标和补光仍有各自的实例身份。鼠标不向宿主发送玩家输入。

## 制作规格

四款设计共用 280 × 220 mm 的桌面使用区域，离桌高度上限为 65 mm。不同款的真实垫形、鼠标壳和轨迹球可在此空间内改变。早期分支清单中的 20 mm 为待验证值，普通立体轨迹球无法在这个高度内保持真实比例。尺度参考包含 134 × 100 × 48 mm 的成品轨迹球。项目参数记录各自实际设计尺寸。[厂商尺寸资料](https://www.logitech.com/content/dam/logitech/en/business/pdf/ergo-m575-for-business-data-sheet-w11.pdf)

办公款复用项目内已有的 Kenney Furniture Kit 中的 `computerMouse.glb`，原包、许可证、成员文件摘要与适配参数随生产源移交。其他造型在参数中分别描述鼠标壳、按键和球体。四款都有实际垫面。坐标原点为桌面，单位为米，Y 轴向上。可选 USB 连接使用既有视觉接口。[Kenney 原包](https://kenney.nl/assets/furniture-kit)

把鼠标实例挂在桌子上，将局部 Y 设为父桌的 `surface.topY`。桌面预留区随朝向转动。键盘底座、显示器底脚等设备须给鼠标留出完整区域；悬在上方且有足够净高的屏幕可跨过该区。连接鼠标自身的线缆可进入其接头。应用失败时仍可导出原有效布局。

## 给接收方的命令

完整包根目录可用 `node verify.mjs` 验清单。把包复制到工作目录，在工作副本的 `source/prototype` 按锁文件执行 `npm ci`，随后在 `source` 执行以下命令。默认配方位于 `assets-source/company-mouse-pad-v1/parameters.json`。

```sh
node scripts/company-platform/build-mouse-pads.mjs --check
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/test-mouse-pad-installation.mjs
node scripts/company-platform/test-mouse-pad-offline.mjs ../viewer ../trial-offline
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/mouse-pad-rooms.json ../rooms
node scripts/company-platform/qa-mouse-pad-rooms.cjs .. BUILD_ID ../review --record
```

另产外观时，复制源参数、修改形体或垫面轮廓、指定独立资源 ID 和版本，再运行 `node scripts/company-platform/publish-room-appearance.mjs --publish 配方相对路径`。该入口固定参数快照并登记模型，以同一配方执行 `--check` 可复验。把批次中一份房间的鼠标引用改为新版本，即可用同一批次命令复产。随后在 `source/prototype` 依次执行 `node scripts/build-company-id.mjs` 和 `node node_modules/vite/bin/vite.js build --config vite.company.config.js`，生成可载入新款的预览。

## 两份房间输入

民房采用双屏。右屏与鼠标的视觉端点相隔 249 mm，沿同一条直线连接。出租屋采用独立的轨迹球工位，桌子平移和转向时鼠标随桌移动。样例中的家具、房间和视觉端点均提供独立可编辑配置。预览入口在设备分类“鼠标与鼠标垫”，房间添加面板允许选择左侧、右侧或桌面中央。
