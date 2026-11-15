# 1188 工作台编辑与换体长帧：定向归因

固定构建 `1188b09aca6f`；原固定文件未改。执行入口 `scripts/qa-workbench-cost-profile.cjs`，由 `scripts/run-fixed-check.cjs experiments/m2-appearance-workbench-v14/dist scripts/qa-workbench-cost-profile.cjs` 启动并自动关闭临时服务。两项使用分别新建的 Chrome 进程和临时用户目录，1600×1000，无截图、无录制。浏览器和服务均已关闭。

## 结论与直接证据

主要长帧发生在提交后的第一次绘制，并在 `WebGLProgram.onFirstUse → gl.getProgramInfoLog` 同步等待。不是法线计算、角色动作预备或 GPU 纹理提交调用耗时能够单独解释。此结论有真实 CPU 调用栈；尚未定位每个具体 material/program cache key。

| 操作 | await 命令 | 首次绘制 | getProgramInfoLog 采样自耗时 | 其中主颜色 / 阴影 |
|---|---:|---:|---:|---:|
| 女体首次嘴宽 −.04 | 180.2 ms | 372.8 ms | 336.324 ms | 247.963 / 88.361 ms |
| 同实例嘴宽 +.04 | 20.9 ms | 24.1 ms | 0 个采样 | — |
| 新浏览器女→男 | 500.9 ms | 764.8 ms | 677.740 ms | 560.088 / 117.652 ms |

首次嘴宽：命令2532.7→2712.9，compileAsync2615.5→2712.8（97.3ms等待，其同步调用仅2.9ms），render2717.1→3089.9。长任务374ms。compileAsync已返回仍有主颜色和阴影同步阻塞。

换体：命令2407.8→2908.7，末准备阶段长任务111ms，render2909.4→3674.2（长任务766ms）；rAF879.7ms跨越邻近准备/绘制阶段。换体没有compileAsync。`createMotion`调用树在本次整个采样窗口累计68.733ms，确是可见准备成本，但不能解释提交后764.8ms。

历史无CPU profiler记录也一致：`evidence/face-geometry-cost-5ddb5b403a20` 女/男set已于3480.1/2848.2ms完成，随后rAF327.6/315.5ms；`evidence/workbench-space-ui-1188b09aca6f` 已观测男体之后出现849.3ms帧。新记录用于归因，不替代原验收数据。

## 已区分的成本

1. **实际主画面与shadow程序首次使用同步**：分析脚本保留原minified栈。shadow是固定bundle4200行 `MT.render → y → renderBufferDirect`，源码即WebGLShadowMap；主颜色是4224行 `Ro → li → Po`。不能把两者都称阴影问题，也不能据此假定全为GPU执行。
2. **几何重复准备**：九个Face primitive各clone geometry；Three的clone先深拷贝原attributes和全部morph，随后应用代码替换多份属性。重复拷贝可避免，但不是本次最大阻塞。
3. **morph纹理打包**：WebGLMorphtargets按geometry对象缓存。共享CPU属性不共享这个缓存；POSITION+NORMAL导致女体约3.68MB/geometry、九件约33.14MB（男约31.97MB）。此处CPU采样inclusive在整次cold/warm窗口为24.138/29.714ms，包含相关下层调用，不可与单次render机械相加。
4. **实际GL提交**：两次编辑共18次texSubImage3D、66,286,080B，CPU调用总约1.8ms；76次bufferData约0.4ms。换体texSubImage2D共383次约32.9ms、最大8.1ms；3D约0.5ms。不能称实际GPU上传只有这些耗时，但提交同步本身不足以解释主要长帧。
5. **校验/法线**：首prepare遍历与一致性检查两个匿名函数各约15.6/15.4ms采样自耗时；正常重算函数约5.4ms自耗时。首次相对warm多准备成本是真实的，优化必须保留SHA/primitive/morph等身份校验，不能直接删除。

## 最小下一步建议（尚未实施）

优先修验证边界而不是先改几何算法：针对同一个first edit和一次换体，记录实际draw material UUID/name、program cacheKey、主/阴影pass及首次使用，然后证明预热覆盖的是实际会画的程序。现face预热仅克隆Face+material的staging scene，compileAsync等待每material的currentProgram；标准WebGL的shadow程序不会由该compile分支预热。主颜色仍阻塞的具体variant未知（可能准备与实际draw key不一致或其他variant未等待），必须比对key，不先认定透明双面就是原因。

正确候选应在原事务提交前准备真实变体并等待；若仍需首draw资源初始化，需安排明确可取消、状态可恢复的离屏预备阶段，保持旧人物可用，并实测是否只是把同一长任务挪到更早。不可通过关闭checkShaderErrors隐藏同步点：后续uniform/attribute查询或首次draw仍可能等待，也丢失错误诊断。

只clone实际indices涉及位移/法线邻域的primitive，是有依据的次级独立优化。条件：以所有支持组合的affected union判定；其余保持原geometry；验证应比较实际索引引用的所有表达/法线、保护区、实例隔离及reset，而非悄悄放宽原全buffer门。减少几件geometry不等于已经解决首次程序阻塞。

动作预备68.7ms可另记，暂不改groundLift采样、舞轨或角色控制器。源bytes/不可变clip缓存或切片准备只有独立测量证明需要后才考虑。

## 测量限制与复跑

- OS/驱动shader cache未清空或假定冷；“新Chrome进程”不等于真正设备冷启动。
- CDP 1ms采样、renderer/GL wrappers与LongTask observer均有开销；数据不能直接当无干预性能达标。
- 不包含精确GPU timer query；getProgramInfoLog归因的是CPU可见同步等待，未分解驱动编译/链接内部时间。
- 每场景仅一次，warm一项；不能给分布、跨设备或手机性能结论。开发机不代表目标普通电脑。
- 没有修改运行时或固定构建；没有继续裙/舞/模型试验。
- 原始cpuprofile/JSON不变。`python evidence/workbench-cost-profile-1188-v1/analyze-profile.py` 可离线重算调用栈分类、采样排名和SHA；`analysis.json`保存输入哈希。`executed-script.cjs`是本次实际执行副本。

## 后续身份复核更正

已执行一次最小程序身份记录，见 `../workbench-program-identity-1188-v1/RESULT.md`。实际5个主颜色program均在compile阶段link、completion返回true，first draw仍同对象infoLog阻塞，未发生主program重新link。故上文“主variant未知”已由该次证据收敛为首次使用初始化/同步边界；阴影两个MeshDepthMaterial确在draw才link。不要继续把主颜色问题归为cacheKey不匹配。
