# 外观分项请求顺序独立回归

**结论：此前 reset→black 竞态已修复。** 使用当前实际产品模块执行相同同tick两次调用，男女最终均为 black；反向 brown→reset 均为 original。此前实际失败返回 original 的记录保存在 `before-observed.json`，不以新代码模拟旧结果。之前未保存完整旧未压缩源码，记录明确此限制；旧固定 f76 构建上下文不能冒充本次CPU执行对象。

本次9项检查全部通过，具体结果和产品源码SHA见 `report.json`；完整测试时源码只读快照在 `source-tested/`。测试前后hash再次一致，没有测试中途源码变更。

```powershell
node evidence/appearance-async-order-v1/check.mjs
```

检查覆盖：男女reset与发色顺序、male拒绝female发型且不发网络请求、延迟male资源→reset→black时旧加载保持隐藏、相同id复用缓存、缓存切回/销毁一次、加载中销毁后不挂接已完成网格。

男性登记实际检查：catalog仅把 `male-sidepart-v1` 登记到原male62b44 SHA，manifest同身份；资源实际SHA为 `fb5fd49352b7bab0e6d2c0ec3f6e565f0004062e4a8975f1afcd93fb24dd48fd`，原材质精确 `M00_000_HairBack_00_HAIR`。未继承女体，未自动扩男jaw。loadReplacement按entry清单URL、entry.id、清单compatible SHA和资源hash验证，随后克隆该角色实际同名材质。两个cache Map以style id为键，且位于每实例工厂内。

测试边界：没有浏览器/GPU/纹理解码。测试使用真实appearance/facial模块、真实catalog/manifest及资源字节与JSON；GLTFLoader.parseAsync被明确替换为单mesh轻量fixture，仅用于加载顺序、挂接、材质克隆和销毁计数，不冒充真实GLB解析或渲染已通过。真实GLB自身单mesh/head-local/编辑重导在各发型源包另有证据。没有修改产品源码或扩大动作/衣服任务。
