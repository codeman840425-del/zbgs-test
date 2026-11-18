# 公司场景移交包

固定viewer构建为{{BUILD_ID}}，源码摘要为{{SOURCE_DIGEST}}。transfer-manifest.json记录完整逐文件SHA、保存依赖、实际GLB身份和可编辑生产源。data/save.json保存全部楼层，data/layout.json保留完整可编辑布局。viewer为固定运行文件，source保留与其输入身份一致的公司源码及独立制作入口。

## 打开固定预览

安装Node后在本目录执行以下命令，再用普通浏览器打开打印的HTTP地址。

```text
node serve.mjs
```

打印的链接带 `?delivery=1`，每次打开会核对交付清单并载入 `data/save.json` 的固定版本。可再加 `&object=实例ID` 直接查看该设施。去掉这些查询参数打开，可恢复浏览器上次主动保存的布置。预览通过 HTTP 加载资源。固定预览的浏览器验收、观看尺度和设备性能应沿对应交付证据判断。

交付目录若包含 `data/rooms/<名称>/save.json`，可用 `?delivery=<名称>` 打开其中一份布局。它与默认房间使用相同的目录校验和游戏加载入口。

## 核对收到的目录

正式交付目录的文件集合是 `transfer-manifest.json` 加上其 `files` 中逐项登记的文件。刚接收时在包根目录运行 `node verify.mjs`。若交付回执给出了清单 SHA-256，可运行 `node verify.mjs . 回执中的SHA256` 一并核对版本。检查会报告缺失、额外及字节不符的文件。

保留这份验证通过的原包。后续命令在它的独立工作副本中执行。安装和重建会在工作副本产生 `source/prototype/node_modules/`、`source/prototype/public/company-build-info.json` 和 `source/prototype/dist-company/`。构建身份由 `build-company-id.mjs` 生成，Vite 将它复制进查看器。

## 使用制作工具

在交付包根目录执行一次 `npm ci --prefix source/prototype`，再运行布局批处理、素材生产或 `edit.mjs`。制作端使用 `source/prototype/package-lock.json` 固定的依赖。只打开上面的预览时，运行 `node serve.mjs` 即可。

落地分隔有两份可直接修改的输入。单间把直播桌与会客沙发分开，出租屋在工作间设置通透屏风。在交付包根目录可运行以下命令。

```text
node source/scripts/company-platform/batch.mjs source/scripts/company-platform/batch-inputs/screen-partition-rooms.json my-screen-rooms
node edit.mjs validate my-screen-rooms/screen-partition-rental/save.json
```

在输入的 `furniture` 中，`id` 标识该房间内的实例，`resource` 选用外观和版本，`transform` 规定房间局部位置和朝向。四款屏风共用固定展开的落地规格。调整位置后重新生成到新目录，检查结果会指出受阻的门口或使用点。制作第五个同规格候选的步骤见 `source/assets-source/company-screen-partition-v1/README.md`。

## 把自己的台灯或屏风加入正式房间

从包内 `source` 目录运行。复制下列示例配方到自己的 `assets-source/company-名称/`，保留所选的新设计，在 `designs` 里写入资源 ID、版本及部件参数。也可直接用示例验证全过程。

```text
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-desk-lamp-v1/examples/a-frame-reading-v1.json
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-screen-partition-v1/examples/acoustic-narrow-tiles-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-desk-lamp-v1/examples/a-frame-reading-v1.json
node scripts/company-platform/batch.mjs assets-source/company-screen-partition-v1/examples/published-room.json ../my-reading-studio
node scripts/company-platform/build-library.mjs --check
```

发布命令使用原生产器重新导出，检查实际 GLB、安装规格和来源，把可编辑配方按内容摘要留存，并登记资源及目录。同版内容发生变化时请升版，再显式选用新版。对于独立试样，生成器的 `--output` 仍可单独使用。

在批次的设施 `resource` 或 `replace-resource` 操作里引用 `desk-lamp-a-frame@1`、`screen-partition-acoustic-narrow-tiles@2` 对应的 ID 和整数版本。运行批处理后，在 `source/prototype` 依次运行 `node scripts/build-company-id.mjs` 和 `node node_modules/vite/bin/vite.js build --config vite.company.config.js`，再用新构建和该批次房间生成交付包。

## 批量生成公司

完整公司也可从同一个批次生成。到 `source` 目录执行：

```text
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/whole-company-styles-v1.json ../my-companies
```

示例包含暖木单工位民房和两层冷色制作公司。每项的 `input.id` 标识独立公司，`styleRecipe` 选择饰面与兼容设施，`operations` 保存该公司单独指定的调整，`stationLooks` 可指定工位搭配。每个结果目录包含输入、布局、完整存档和带摘要的检查报告。项目失败可按报告中的实例与字段修正配置，再在原命令末尾添加 `--only cool-studios` 单独重试。要保留旧版并发布一份修改成功的公司，请选用新的输出目录。

## 导入新的桌面摆件

在独立包的副本里工作。以下前三步的命令从 `source` 目录运行。先在 `source/prototype` 用 `npm ci` 安装锁定依赖。

1. 在 `assets-source/company-sourced-ornaments-v1` 复制一份现有 JSON 配方，填写新摆件的 ID、显示名称、版本及源文件。输入可为本地 GLB 或带 GLB 条目的 ZIP。把新来源文件放入 `assets-source/company-*` 目录，按配方记录来源、使用条件及 SHA-256。书组与小盆栽引用包内 Kenney Furniture Kit 的两个不同条目，便于对照。外部模型的原始坐标系、单位、摆放角度和统一缩放由配方表达。支持范围及原模型的限制见本系列 README。
2. 运行 `node scripts/company-platform/publish-tabletop-ornaments.mjs --publish 配方一.json 配方二.json`。一次可传一份或多份，新版会同时导出、登记并校验；失败可按给出的原因修订输入后重试。原版本有不同字节时请建立新版本。用 `--check` 替换 `--publish` 可从来源重做并核对现有发布。此入口会自行更新集合与运行目录。
3. 从 `source/prototype` 运行 `node scripts/build-company-id.mjs`，再运行 `npx vite build --config vite.company.config.js`。通过宿主的 `replace-resource` 操作可在桌上原位换款。若开始时桌上是杯子，它属于另一功能规格，可参照 `scripts/company-platform/batch-inputs/lounge-ornaments.json` 显式移除原物、安装摆件。每个新实例需要房间内唯一的 ID、真实父设施、承载面 `attachment.surfaceId` 和局部位置。
4. 回到包根目录，执行 `node edit.mjs apply 输入存档 操作数组.json 新结果目录`，再执行 `node edit.mjs validate 新结果目录/save.json`。执行 `node source/scripts/company-platform/package-company.mjs source/prototype/dist-company 新构建ID 新结果目录/save.json 新交付目录 --source source` 可交给下一位制作者；进入新交付目录后执行 `node serve.mjs` 即可观看并验证保存重开。

## 制作新版圆几并布置休息区

在交付包副本中，先到 `source/prototype` 按锁文件执行 `npm ci`。以下制作步骤从 `source` 目录执行。编辑与重建的新文件保存在这份副本中，原交付包可继续使用。

1. `assets-source/company-sourced-side-table-v1` 保存 Poly Haven 原模、许可、贴图与适配配方。将 `recipe.json` 和 `registration.json` 复制成新文件。新配方可调整 `fit.tabletopDiameterMetres`。新登记文件填写独立的整数版本、可辨识的名称，并将 `sourceParameters` 指向新配方的源目录相对路径。此入口支持这份原模型的尺寸系列。
2. 以 `node scripts/company-platform/adapt-sourced-side-table.mjs --recipe 新配方路径 --output 模型路径` 导出。模型路径遵循 `prototype/public/company-assets/sourced-side-table-v1/<id>/v<版本>/model.glb`。同一命令加 `--check` 可验证精确复产。原宿主功能保持底部居中、50 厘米桌高和 30 × 22 厘米的摆放面。
3. 运行 `node scripts/company-platform/describe-sourced-table.mjs 新登记文件 --write`。将输出的相对 `resource.json` 路径追加到该系列 `collection.json` 的 `resources` 数组。运行 `node scripts/company-platform/build-library.mjs` 和同一命令加 `--check`。包内其他已登记版本须保留。
4. 两种布局的制作输入位于 `scripts/company-platform/batch-inputs/lounge-rooms.json`。执行 `node scripts/company-platform/test-lounge-rooms.mjs 新批次输出目录` 可重做初始两间房。要在其中一间换款，创建操作数组，例如 `[{"type":"replace-resource","id":"concept-lounge-studio/ground/lounge/cup-table","resource":{"id":"side-table-carved-round","version":2}}]`。回到包根目录执行 `node edit.mjs apply 输入房间的save.json 操作文件.json 新结果目录`，然后执行 `node edit.mjs validate 新结果目录/save.json`。
5. 从 `source/prototype` 执行 `node scripts/build-company-id.mjs` 与 `npx vite build --config vite.company.config.js`。从包根目录执行 `node source/scripts/company-platform/package-company.mjs source/prototype/dist-company 新构建ID 新结果目录/save.json 新交付目录 --source source`。如需在同一个预览里提供另一个已验证批次房间，追加 `--room 房间名 批次房间目录`。接收方可直接在新交付目录执行 `node serve.mjs`。

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
