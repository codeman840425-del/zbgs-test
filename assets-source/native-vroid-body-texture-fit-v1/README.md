# 原生Body纹理覆盖：实现与CPU检查

范围：仅843ac恢复基体、已封原top/shorts/shoes及明确新ID的改袖top。**模块已实现；工厂胶水、浏览器PNG解码、GPU边界/阴影、视觉与保存恢复尚未验证。** 未调用原生工具/编辑器或改主profile/runtime胶水。

`prototype/src/body-texture-coverage.js`导出：

```js
const helper = await createBodyTextureCoverage({
  body,                 // 当前actor实际唯一Body primitive；保含surface/outline材质
  avatarSha256,         // 必须843acca…，来自实际已核avatar
  entries,              // 去重的实际equipment entry对象，不是字符串或旧78912清单
  descriptor: {url, sha256}, // 指向本包manifest；未配置返回null
});
const prepared = helper.prepareEquipmentSet(selectedIds);
if (!prepared.isCurrent()) throw Error('stale');
prepared.commit();
prepared.dispose();
// actor释放：helper.dispose()；仅释放自己拥有的新纹理/bitmap。
```

manifest SHA `003e98086ed67b6fcd5c57e0b3b13e9c4a4beff412b3b74683e7cefc049c8fb2`。`covered.url`是相对此manifest的`native-tops-body.png`，SHA `dc375769e28d015bc70c3cef6be1dec3794b5b2430a9bf173d60584105f68a8c`。它逐字节复制原生Body图，不是新绘制/处理PNG。843ac原完整皮肤PNG为5bf136…，全4194304像素RGB与此图严格相同；`pixel-readback.json`保存原图与改袖原生图逐字节等价证明。许可仍为原内部样件边界，未扩大商业/玩家导出授权。

## 有限准入与状态

清单要求三原装备的新ID `native-unmasked-843ac-{top,shorts,shoes}-v1`、各精确GLB SHA、slot和843ac兼容SHA。改袖规则是明确ID `native-unmasked-843ac-sleeve56-top-v1`、GLB SHA `75c113d68a7eab1e9f09178b4ddf5c03a9f9d237e0a66d79b0984f45bd5538b7`，optional仅表示初始化可不提供它，**不表示本包授予改袖绑定/fit准入**。只有调用者实际提供该新avatar的匹配entry，prepare才接受其ID；旧78912兼容entry、未提供ID、未知ID/slot、重复ID、同时两件top均拒绝。不存在任意mask组合或新衣服自动适配。

选中合法top→masked；没有top（例如仅鞋）→最初借用的完整皮肤map。Body材质对象、alphaTest=.5、transparent=false、color/shadeColorFactor均保持；body接触几何不变。原top与改袖top相同PNG不重复fetch或按肤色复制贴图。肤色变化前后都只乘原材质颜色，本模块不写颜色。source与shade虽然源texture索引相同，但GLTFLoader可能因KHR_texture_transform产生不同Texture包装；模块保持实际别名关系，各原包装各克隆一个，所有新包装复用本实例自己的同一bitmap，卸装恢复各原引用。

## 事务、暂停、拥有关系

- 构造先fetch/pin清单与PNG，验证actual material/UV/sampler/alpha并完成解码和真实MToon克隆`update(0)`预检；任何失败都不改live材质。若父actor在await期间取消，调用者拿到helper后须立即dispose，不发布它。
- prepare不改live，较新的prepare使旧prepared失效；检查包括当前map没有被其它owner覆盖。commit只同步写map/shadeMap、needsUpdate和真实MToon `update(0)`，无await/网络/合成，不依赖dt>0。skinTone在prepare后发生的颜色改变也不会被提交覆盖。prepare.dispose不释放该actor缓存的纹理。
- 同一Body材质不得同时拥有两个实例；双actor拥有各自TextureSource/Texture/bitmap，不共享可变纹理。旧source纹理永不由helper.dispose；销毁先恢复原map，再dispose新纹理、close自己创建的bitmap，幂等释放所有pending。意外live update异常会恢复先前map引用并抛错；cleanup错误留在getInfo。
- 初始化只有一种masked图片，已全预载，主工厂的同步base/dressed切换无需首次网络等待。调用方将helper纳入M1整体isCurrent/prepare/commit/dispose；整体commit前必须检查所有参与者。unexpected commit故障的跨participant恢复仍是主工厂责任，不能只因为局部回滚就宣称整套事务已测。
- 不改shadow shader；标准Three depth/distance消费同一map/alphaTest。当前暂停仍渲染，update(0)已同步MToon，但GPU纹理首次上传、outline及真实shadow边界必须由root实际QA。若调用者关闭shadow.autoUpdate，需请求一次shadow刷新。本包不推进动画、不强制全局render。

## 实际CPU检查和未实现胶水

`check.mjs`使用真实Three r187与MToon3.5.5材料对象，12组针对性检查全部通过：初始/prepare无改动、共享/不同map包装、肤色乘色保留、暂停首次commit的uniform、双实例隔离、最新prepared、未知/旧SHA/optional规则、HTTP/SHA/解码/尺寸失败、外部材质写入、dispose与异常commit恢复。fetch与ImageBitmap解码是CPU替身；PNG本身实际读SHA/IHDR，Python独立实际Pillow解码核像素。不能称浏览器/阴影测试通过。

首次检查保存在`cpu-check.json`，当时使用项目既有`THREE.Source`兼容别名，仅有r187改名警告。已改为官方`THREE.TextureSource`并重跑，最终`cpu-check-final.json`对应当前模块SHA `f42f612b0a2f70cbb6913b0712b7656d018b8290462c7c48811e7c9b7436eaae`，无该警告。素材生成首个guard曾误把base显式texCoord0与shade省略texCoord视为不同；未写任何输出，修为比较有效texCoord/同index/同transform后生成，未因此重导或编辑原生源。

root负责的胶水仍未实施：createM1Equipment调用/事务生命周期、profile descriptor、完整基础皮肤保原MToon与保原发型策略、未知原生配色/fit能力限制。不得把现foundation灰色debug材质视作skin恢复或把当前原生无发未准入变成卸衣阻塞。不要同时给此Body启用1514等未经准入的近似indices coverage。

重建（新目录无产物时）及CPU检查：

```powershell
python assets-source/native-vroid-body-texture-fit-v1/build.py
node assets-source/native-vroid-body-texture-fit-v1/check.mjs cpu-check-final.json
```

脚本拒覆盖现有输出。无新包安装，无GLB/VRM再次输出。本包尚无public URL，集成时按实际发布位置提供descriptor及清单SHA。
