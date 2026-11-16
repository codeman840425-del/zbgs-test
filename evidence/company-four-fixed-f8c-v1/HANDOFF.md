# 四款外观数量包交付与总工能力增量

固定源码 `7eb52ce9888be8f735057466987ba54de7529747`；构建 `f8ccf0274ac4`。

此前把公司侧描述为准备完成不准确：用户追问时多数分支不足四款。原始缺口保留在 ../company-four-coverage-audit-v1/。本包补齐已确认的可替换外观分支，不宣称整个公司平台或角色 M2 完成。

## 实际覆盖

14 个模型分支各四款，共56件兼容外观；其中54件本轮新制GLB、2件既有兼容沙发。另有4套组合工位，合计60个实测样件。19个分类标签映射到15组结果，不重复计数。

|分支|四款实际身份|
|---|---|
|桌子|desk-trestle、desk-pedestal、desk-cabinet、desk-frame|
|单人座椅|chair-cantilever、chair-pedestal、chair-ladder、chair-crossbeam|
|双人沙发|lounge-sofa、timber-sofa、sofa-modular、sofa-arch|
|屏幕|monitor-aurora、monitor-ribbon、monitor-pillar、monitor-slate|
|补光系统|fill-light-orbit、fill-light-wing、fill-light-column、fill-light-panel|
|键盘|keyboard-compact、keyboard-split、keyboard-retro、keyboard-console|
|桌面麦克风|desk-microphone-ball、desk-microphone-ribbon、desk-microphone-broadcast、desk-microphone-capsule|
|绿植|plant-palm、plant-bonsai、plant-cactus、plant-broadleaf|
|挂画|wall-art-triptych、wall-art-sunburst、wall-art-relief、wall-art-woven|
|地板模块|floor-panel-grid、floor-panel-plank、floor-panel-tile、floor-panel-herringbone|
|墙面模块|wall-panel-slat、wall-panel-brick、wall-panel-panel、wall-panel-ribbed|
|开放门框|door-frame-plain、door-frame-stepped、door-frame-inset、door-frame-crown|
|窗饰模块|window-panel-cross、window-panel-lattice、window-panel-slat、window-panel-round|
|地毯|rug-border、rug-inset、rug-stripe、rug-medallion|
|组合直播工位|station-look-1、station-look-2、station-look-3、station-look-4|

## 证据与验收边界

- 可观看对照：../company-four-preview-f8c-v1/index.html；实际报告：同目录 report.json。root逐行看完15组截图，并单独检查修复后的椅子与灯面。
- 60项实际运行：导入网格、不同几何、替换前后导航和使用点不变、适用设备开关、保存导入及每分支关闭浏览器进程重开；损坏字节拒绝并保留原场景与存档。
- 60份批量结果：../company-four-batch-f8c-v1/report.json，含重复执行与失败重试保原。
- 152份构建输入与Git字节相符：build.json。完整包337文件校验、独立npm安装及构建后119份运行文件逐字节一致：package-check.json。
- 可编辑几何源在assets-source/company-{static,seat,device,architecture}-collection，README包含修改、导出、检查命令；包保留源及精确资源版本。
- 旧910第一次截图为空白，v2出现WebGL context loss；没有认定原因，更不能归咎开发机性能。最终f8c使用Chromium SwiftShader软件渲染，带非空帧缓冲检查；不是GPU性能或普通机达标证据。
- 旧910软件预览发现椅架穿座面、灯壳挡发光面；修复及前后记录在company-seat-collection-v1和company-device-collection-v1，旧失败保留。地毯inset边缘有轻微显示接缝，技术样件已记录，不影响替换/保存。
- 门框仅开放框体；窗板仅墙面显示模块。真实角色接近、坐起、接触及争用恢复仍由总工C3实际联调。这里不以设施元数据通过冒充人物使用通过。

## 复现命令

在独立固定源码 F:/gamemake-company-four-final-fixed/prototype：

```powershell
npm ci --ignore-scripts --no-audit --no-fund
node scripts/build-company-id.mjs
npx vite build --config vite.company.config.js
```

在 F:/gamemake-company-four-final-fixed；输出目录须为新目录：

```powershell
node scripts/company-platform/qa-four-preview.cjs prototype/dist-company f8ccf0274ac4 evidence/four-preview-repeat --software
node scripts/company-platform/build-appearance-batch.mjs evidence/four-batch-repeat
node scripts/company-platform/serve-company.cjs prototype/dist-company f8ccf0274ac4
```

解压 company-platform-f8ccf0274ac4.zip 后按包内README使用；node edit.mjs validate data/save.json 已独立通过。

## 交总工合入的能力增量

将本包生产与预览证据并入既有CAPABILITIES对应条目；保持“生产与预览通过/角色接入未验/用户观感待验”分开，不由副总工改共享CAP/CURRENT。复用现有describeUsePoint(s)、retainUsePointContact与总工角色链；本包没有第二角色控制器、时钟或占用状态机。不要求总工中断当前M2。
