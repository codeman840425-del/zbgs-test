# 公司场景移交包

固定viewer构建为{{BUILD_ID}}，源码摘要为{{SOURCE_DIGEST}}。transfer-manifest.json记录完整逐文件SHA、保存依赖、实际GLB身份和可编辑生产源。data/save.json保存全部楼层，data/layout.json保留完整可编辑布局。viewer为固定运行文件，source保留与其输入身份一致的公司源码及独立制作入口。

## 打开固定预览

安装Node后在本目录执行以下命令，再用普通浏览器打开打印的HTTP地址。

```text
node serve.mjs
```

打印的链接带 `?delivery=1`，每次打开会核对交付清单并载入 `data/save.json` 的固定版本。可再加 `&object=实例ID` 直接查看该设施。去掉这些查询参数打开，可恢复浏览器上次主动保存的布置。预览通过 HTTP 加载资源。固定预览的浏览器验收、观看尺度和设备性能应沿对应交付证据判断。

## 脱离原项目继续编辑

```text
node edit.mjs validate data/save.json
node edit.mjs apply data/save.json OPS.json NEW_RESULT_DIRECTORY
```

OPS.json使用现有prepareCompanyChange操作。新目录包含完整layout.json与带依赖pin的save.json，可在预览里继续导入。该入口使用固定preview声明的完整catalog及templates，包括保存依赖的历史版本。原有source/scripts/company-platform/company.mjs、batch.mjs及其输入也保留，可在source目录执行。

## 批量生成不同外观的工位

在交付目录执行下面的命令，会生成四份具有独立公司身份的成品。每份包含可继续编辑的布局、带依赖版本的存档和验证报告。

```text
node source/scripts/company-platform/batch.mjs source/scripts/company-platform/batch-inputs/workstation-looks.json NEW_BATCH_DIRECTORY
```

输入中每项的 `stationLooks` 指定已有工位的实例 ID 和外观配方的 ID、版本。配方文件在 `source/prototype/src/company/workstation-looks.json`。换套装保留摆位和状态，额外安装的设备继续跟随原父级。单件调整可沿用前述 `edit.mjs apply`。要单独重试一项，在批量命令末尾加 `--only studio-set-1` 并使用对应项的 key。

## 把自己的 PNG 制成墙上挂画

在可编辑的交付包副本中工作。将 PNG 和 `print.json` 放在同一目录。配方中填写实际来源及允许的用途，并给新作品选择独立资源 ID。示例：

```json
{
  "id": "studio-reference-print",
  "version": 1,
  "displayName": "直播工位布置参考图",
  "image": "studio-reference.png",
  "license": "项目美术组提供，限本项目使用"
}
```

在 `source/prototype` 安装锁定依赖 `npm ci`。回到交付包根目录执行：

```text
node source/scripts/company-platform/import-wall-print.mjs art-input/print.json
node source/scripts/company-platform/build-library.mjs --check
```

生成的挂画沿用墙面装饰的 0.80 × 0.80 × 0.12 米安装规格。图片保持长宽比，余下空间由衬底填充。输入为单张 PNG，单边最多 4096 像素、文件最多 16 MiB。修改已登记版本的图片或配方时，请增加版本号。生产记录保存图片、配方、资源及其 SHA-256。

可以在布局的 `add-facility` 操作中引用 `{"id":"studio-reference-print","version":1}`。如果已有同规格挂画，也可以用原实例的 ID 执行 `replace-resource`。例如，对于本包的整套训练房，可将下面的操作存为 `print.ops.json`。使用其他公司时，请按其房间 ID、墙体位置和朝向调整。

```json
[{
  "type": "add-facility",
  "id": "concept-dance-training-rental/ground/dance-training/reference-print",
  "parentId": "concept-dance-training-rental/ground/dance-training",
  "resource": {"id":"studio-reference-print","version":1},
  "transform": {"position":[1.05,1.50,-1.90],"yaw":0}
}]
```

```text
node edit.mjs apply data/save.json print.ops.json NEW_PRINT_ROOM
node edit.mjs validate NEW_PRINT_ROOM/save.json
```

随后按“修改源与重建”生成新构建。用 `node serve.mjs 0 source/prototype/dist-company` 打开新查看器，通过“文件 → 加载文件”选取 `NEW_PRINT_ROOM/save.json`。原 `viewer` 可继续展示原版。要移交给下一位制作者，以新查看器、构建 ID 和整份 `NEW_PRINT_ROOM` 目录打包，训练房的净空约束会随包复核和传递：

```text
node source/scripts/company-platform/package-company.mjs source/prototype/dist-company BUILD_ID NEW_PRINT_ROOM NEW_DELIVERY --source source
```

其他无训练约束的布局可用 `NEW_PRINT_ROOM/save.json` 作为打包输入。

## 训练房配方

在 `source/prototype` 执行 `npm ci` 后，从交付包根目录运行：

```text
node source/scripts/company-platform/batch.mjs source/scripts/company-platform/batch-inputs/dance-training-rooms.json NEW_TRAINING_OUTPUT
```

每个输入的 `trainingClearance` 定义本房局部坐标下的活动区、入口矩形、净高和实际门洞 ID。校验会读取设施当前状态的实际网格。批处理只发布通过的房间，报告列出所检查的设施、网格和边界容差。以这类批次结果目录制作交付包，会将该公司的净空约束写入 `transfer-manifest.json`。`edit.mjs validate` 和 `edit.mjs apply` 都会复核该公司，后者在写出新布局和存档前完成复核。对浏览器里修改并导出的同一公司存档，可用同一条 validate 命令重新验收。

## 修改源与重建

```text
cd source/prototype
npm ci
node scripts/build-company-id.mjs
npx vite build --config vite.company.config.js
cd ../..
node serve.mjs 0 source/prototype/dist-company
```

source/assets-source保留模型参数，source/scripts/company-platform保留模型生产脚本、目录生成脚本和agent制作入口。npm ci后可从source目录运行对应模型脚本，再登记目录、生成新构建身份并重建。修改源会产生新候选，原viewer身份保留。

程序组件的可编辑配方位于source/prototype/src/company/resources.json。历史sourceFile标签保留来源语义，现有组件生成器直接消费该配方。使用此处列出的company专用命令重建，通用npm run build需要原角色工程文件。Node版本须满足锁定Vite依赖的engines声明。

当前民房示例的生产入口为source/scripts/company-platform/build-home-examples.mjs。有限功能规格和外观制作约定见source/docs/COMPANY-APPEARANCE-PRODUCTION-STANDARD.md。source/docs/COMPANY-SPACE-DESIGN-NOTES-2026-11-16.md记录后续产品思路，按当前工作包验收范围执行。

混合素材的两层公司输入保存在source/prototype/src/company/examples/c2-mixed-company.json；对应编辑操作在c2-mixed-company-edit.ops.json。source/scripts/company-platform/build-mixed-company.mjs可重新生成，随后用--check核对。生成器会写入自己的示例及证据输出；修改交付公司的副本请使用上述edit.mjs入口并选新输出目录，不覆盖原存档。批量生产可沿source/scripts/company-platform/batch.mjs使用明确的document或input配置。

node_modules未随包提供。npm ci需要锁定依赖可取得，干净离线安装未测试。固定源码摘要与包内运行字节已核对，源码重建字节一致和真实浏览器运行应有单独验证记录。角色资产、真实人物使用、跨层交通和经营业务不在本包验证范围。
