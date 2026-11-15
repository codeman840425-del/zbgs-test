# abdb 稳定增量独立只读审查

对象：`abdb18defd26`，当前共享源。未修改实现，未新增浏览器或重跑已过链。

## 身份与测试对应

按固定包 build-info 的全部输入路径和 build-id 算法重新读取源码/资源，得到精确摘要 `abdb18defd26c224b28419827a0d3d9d90c1b0442c26a66bd0fd91af391fc876`，与固定包相同。

material-recipes、cloth-material、equipment、m1-equipment、foundation-avatar、male equipment.json 与 recipe JSON 共 7 项，当前主区与 `assets-source/m1b/shorts/material-recipe-candidate-v1` 已测副本**逐字节相同**，候选 manifest 的各 SHA 也匹配。两个 Node 测试确实导入候选副本，不能直接说它们动态测试主区；本次字节核对建立了对应关系。真实浏览器 `qa-material-recipe-fixed.cjs` 调用实际 avatar API，没有注入旧 shader，实际 abdb 身份 gate 和恢复证据见现有 `evidence/material-recipe-abdb18defd26`。

两派生 forearm 文件逐个核 SHA、内部 bodySHA、固定 dist 字节，均匹配本体配置。没有把 female profile 换标签替代派生身份；同源生成及49b实际前臂改善/掌指仍失败的证据不变。

## 实现审查

- recipe 通过 bytes/SHA、body/garment/style/fit、primitive材质名与实现版本校验。只使用编译内 allowlist，不下载可执行模块。Three 限187；实际 cloth 源 SHA 与声明一致。
- 替换先创建全部 clone 后统一交换；第二 primitive 构造失败释放已创建 clone，原数组不动。失败保留旧有效材质，requested清空、status/error记录；null恢复与dispose取消旧请求。独立版本号同时处理忽略Abort的迟到返回，没有发现可重新挂载已销毁装备的新增路径。
- 装备destroy先让recipe恢复原材质/销毁clone，再按原材质集合释放原贴图/材质/几何及skeleton，避免clone共享贴图提前dispose。m1-equipment、foundation-avatar只有API透传，默认不自动选择recipe。短裤隐藏后保留选择，长裤为独立装备实例。
- cloth clone保留原map、alphaTest、透明及side；修改fragment RGB与蒙皮法线色阶，没有改原纹理、UV、权重或几何。shader编译发生于首次render，异步编译/驱动失败不由recipe.select的构造catch覆盖；当前锁定shader实际abdb浏览器无编译报错，此限制不等于跨驱动通过。
- `canStartGreeting` 同时被 live.playGreeting 与主controller.greetingReady使用，卸麦后 holdWeight>.001仍拒绝ready，消除了旧只看requested的条件分歧。主controller保留停稳、坐稳、无其他gesture条件。现有 abdb 男女×站坐4条report均观察边界ready=false/false，随后真实任务completed，0pageerror。
- foundationProfile仍structuredClone，各派生独立URL/bodySHA/forearmSHA；loader在VRM实例创建前校验profile文件及body归属，错误不会先挂出半角色。原加载/销毁catch未被本次透传改动削弱。

结论：**本有界增量未发现需阻止保留abdb候选的新增逻辑错误。** 这不是统一M1通过；裙掌指接触、材质用户选择、普通设备性能、真实后台及recipe持久化仍按原状态保留。

## 非阻断测试缺口

`qa-material-recipe-fixed.cjs` 的自动frameGate检查camera.mode==='room'，不检查位置/target逐帧相等。现有abdb归档summary确实另算distinctCameraStates=1，故本次同镜头结论有数据支持；以后脚本应把实际外参相等纳入自动gate，并记录只读原生输入事件，不能仅凭room名称认定锁定。

Node错误测试主要覆盖从原材质加载失败、clear及构造原子性；没有实际GPU故障恢复或多recipe产品路径证明。当前只一个allowlist recipe，无需为本轮扩平台，但未来新增实现不能继承这次GPU/材质观感结论。
