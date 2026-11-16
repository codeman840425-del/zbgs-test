# 公司场景移交包

固定viewer构建为{{BUILD_ID}}，源码摘要为{{SOURCE_DIGEST}}。transfer-manifest.json记录完整逐文件SHA、保存依赖、实际GLB身份和可编辑生产源。data/save.json保存全部楼层，data/layout.json保留完整可编辑布局。viewer为固定运行文件，source保留与其输入身份一致的公司源码及独立制作入口。

## 打开固定预览

安装Node后在本目录执行以下命令，再用普通浏览器打开打印的HTTP地址。

```text
node serve.mjs
```

不要通过file协议双击HTML。预览使用HTTP加载GLB和JSON，导入data/save.json可恢复交付的全部楼层。固定预览的浏览器验收、观看尺度和设备性能应沿对应交付证据判断。

## 脱离原项目继续编辑

```text
node edit.mjs validate data/save.json
node edit.mjs apply data/save.json OPS.json NEW_RESULT_DIRECTORY
```

OPS.json使用现有prepareCompanyChange操作。新目录包含完整layout.json与带依赖pin的save.json，可在预览里继续导入。该入口使用固定preview声明的完整catalog及templates，包括保存依赖的历史版本。原有source/scripts/company-platform/company.mjs、batch.mjs及其输入也保留，可在source目录执行。

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
