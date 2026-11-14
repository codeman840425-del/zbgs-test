# M1C 源握持姿态与独立配置

当前改动消除了代表样本里的约 9 mm 掌部穿柄，并将拇指从麦头附近降到食指一侧。形状对照来自 ca72 固定构建上的临时诊断覆盖；**生产加载路径已在固定 0df63cf2bdea 完成短回归，完整正常速度直播录像另验，不宣称 M1C 全通过。**

## 根因与制作方法

原挂点使用 middle 向量×0.72 加固定 12 mm 掌法向，不读取掌面厚度；统一平面屈指让拇指朝上。五个小偏移候选都失败，详情见 `M1C-GRIP-EXPERIMENT-ca72ada827d2.md`。本次从原 VRM 真实皮肤、骨层级、逆绑定和权重生成源握姿，未改身体网格/权重，不逐帧优化。

`scripts/m1c/fit-source-grip.py` 对每个确切基模：

1. 以 rightHand、Middle/Index/Little 的实际 rest 骨位置建立掌部坐标，选择实际掌部皮肤截面。
2. 用圆截面支持值 `max(N + sqrt(radius² - deltaF²))` 将 13 mm 握柄放到掌面外侧，保留 0.5 mm 余量；没有沿用旧 12 mm 偏移。
3. 拟合四指屈曲及拇指独立对掌/外展旋转，约束实际皮肤不得进入有限握柄圆柱，同时要求指腹靠近表面；拇指指腹高度对准真实食指近节高度+3 mm，避免任意去麦头处找接触。
4. 最多 100 次最小二乘迭代、每体型最多 40 秒；本次各约 1 秒内完成。女性收敛，男性达到迭代上限，保留状态，不称普适最优。

VRM0 的 ThumbProximal/Intermediate 对应 three-vrm normalized 的 ThumbMetacarpal/Proximal，导出时显式转换。normalized 指四元数依安装版本的 humanoid 转换公式生成。

## 保留与重建

- `assets-source/m1c-grip/{female,male}/grip.json`：参数、边界、实际 SHA、normalized/raw 指姿态、手局部挂点及离线残余。
- 同目录 `skin-reference.json`：原始顶点 ID、hand-local 离线位置及手骨树权重，供实际 VRM 对照。
- 同目录 `posed-hand.obj`：原手皮肤的姿态诊断提取；不是新造替换手。
- `before-thumb-height/`：拇指尚伸到麦头的前一候选，保留失败依据。
- `scripts/m1c/publish-grip-profiles.py` 只发布运行所需配置到 `prototype/public/assets/m1c/grips/`。数据没有随机种子/当前时间，发布字节可重复。原源素材许可继承已有 foundation 来源记录。

```powershell
python scripts/m1c/fit-source-grip.py --seconds 40
python scripts/m1c/publish-grip-profiles.py
```

## 真实 VRM 诊断结果

`output/playwright/m1c-grip/ca72ada827d2-source-pose-thumb-height/` 保存男女站/坐/走，原握姿与源拟合姿态的相同动作时刻前侧近图、原始报告。每动作 0.5 秒取 11 个样本。旧 baseline 最大穿入女 9.273 mm/男 9.222 mm；新候选全部样本 0 个顶点深入超过 1 mm，±2 mm 近圆柱面顶点各 63 个。实际前侧图确认四指围柄、拇指降低，未通过移开整件麦克风造成悬浮来伪装。

离线→actual 最大手局部误差原报女 15.922 mm/男 16.791 mm，已定位到顶点 3581/3396：手骨树总权重只有 0.55，剩余来自前臂；离线 T 姿前臂与实际持麦屈臂不同，不能要求该腕部混权点在 hand-local 不变。手骨树权重>0.99999 的点最大误差为 **1.253e−7/1.285e−7 米**，证明实际指姿转换与真实 LBS 在该范围一致。接触检测仍包含全部 731 个选中手/腕顶点，没有为变零而删掉腕部。

## 产品接口

`createLivePresentation({vrm, root, bodyType, avatarSha256})` 新增确切身份。加载 mic 时读取独立 grip manifest，按 avatar SHA 匹配，并验证配置 byteLength/SHA256、身份、麦克风 ID 和四元数规范。配置给 normalized finger rotations 与真实 rawHand 局部挂点；通用人物控制器没有按男女增加分支，运行时不解最优化问题。

原 latest-request token/AbortController 继续覆盖配置加载。卸下时按原权重平滑退出，未持麦不覆盖源动画手指。`getState().fit.gripProfile` 公开实际 id/hash/身份；`verified:false` 保留。仅原女性/男性两 SHA 有配置，局部脸型/腰臀变体没有继承验收，mic 明确拒绝，眼镜不受影响。

握持装备版本由 **avatar SHA + microphone GLB SHA + grip profile SHA/fitVersion** 共同确定，不能只记录麦克风 GLB。profile 记录 `compatibleAccessorySha256`，运行加载时与实际附件 manifest 核对，麦克风几何换版后不能静默沿用旧握姿。

迁移缺口：ca72 的旧 save-contract/catalog 尚不含 grip profile 版本；它的“保存附件”证据不能证明新握持姿态可完整恢复。新 catalog/存档适配由集成层独立更新与验证，本次不改主场景 avatar profile ID 或存档系统。

`scripts/m1c/qa-grip-profile.cjs` 已在固定 0df63cf2bdea 实际通过以下 8 项产品路径短测，没有注入指姿或替换模块：

- F/M 两例：实际 stand/sit/walk 各 10 个采样、共各 30 样本，0 个顶点深入握柄超过 1 mm，±2 mm 近表面点各至少 63 个。实际加载状态记录正确 avatar/mic/profile SHA 三元组。
- 快速 on/off/on 最终为 on；完全卸下 requested=false、附件节点为 0。
- profile HTTP 503、profile hash错误、mic HTTP 503：requested=false、loaded=false、status=error、无 mic 节点；随后眼镜加载成功。
- profile 加载中取消：Promise 返回 cancelled，状态 off，无 mic 节点，眼镜仍可用。
- 两个局部变体均因缺精确身份配置拒绝 mic，requested=false/status=error；眼镜仍为 on。

原始产品证据 `output/playwright/m1c-grip-product/0df63cf2bdea/report.json`；精简归档 `evidence/grip-0df63cf2bdea/`。运行器完成后关闭全部浏览器和临时服务。此次约十余秒检查不能替代全动作/装卸过渡的正常速度视觉录屏。

拟合工具锁在 `scripts/m1c/requirements-grip.txt`：NumPy 2.4.2、SciPy 1.18.1；当前 Python 环境已实际使用这两个版本。运行时只读取生成 JSON，不安装这些 Python 依赖，也不运行拟合。

## 限制

圆柱顶点探针不是所有皮肤三角连续碰撞。掌部 near 点计数仍为 0，当前观感更接近指握，后续要看完整正常速度动作与握柄余量；不能仅凭零穿入声明精美自然。麦克风正面仍遮挡人物右眼一部分；左右手互相接近和所有组合未覆盖。ca72 图片是诊断覆盖、0df 短回归是实际产品路径，归档分开标识。
