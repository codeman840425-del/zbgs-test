# 男女无发基础与有限五官几何：源核查

2026-11-15；仅静态源码/资产与轻量 CPU 解码。未改产品、未运行 Blender/浏览器，未制作参数样件。当前可从现有源实施，无需另选模型；不能据此宣称无发观感或捏脸已通过。

## 已证：头皮确实存在，隐藏范围必须正确

`result.json` 固定核对女 VRM SHA `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`、男 `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。两者位于 `prototype/public/assets/foundation/base-{female,male}-roundtrip.vrm`。

- 顶/后脑皮肤主要属于 Body_SKIN，面部/耳区属于 Face_SKIN。HairBack 是 Body.baked 内独立 `_HAIR` primitive（女394三角、男408），不能隐藏整个 Body。
- 排除头发后，实际头部皮肤女1692、男1742三角；顶、后、左右耳区各9/9射线命中。耳区探针不是解剖分割或像素级覆盖证明。
- 仅诊断图连通性使用 ≤10μm 欧氏接缝合并，男女均仅4个边界：颈部裁切口、左右眼孔、口孔；未发现额外头顶/后脑/耳区开口或非流形边。合并没有写回资产，不等于生产网格本身完全焊接。初始坐标舍入造成的细缝已用距离合并排除，非源缺陷。
- 已实际查看 `skin-only-overview.png` 的正/背/侧/顶静态图：两者有颅顶、后脑及耳形。图为源皮肤三角 CPU 平色图，故意不含眼/口插片；不是游戏画面，也未验证贴图 alpha、法线、阴影、动态接缝。

`prototype/src/m1-equipment.js` 已按 `_HAIR` 分类并暴露 `getAssetProfile().hair`。可复用角色实例级 primitive 可见性；本轮未证明已有无发默认入口。保留完整 Body/Face 及骨架，不能用删除头发骨层级代替可见性配置。

## 已证：可编辑源与特征结构

| 对象 | 可复用源/脚本 | 关键边界 |
|---|---|---|
| 女 | `assets-source/foundation/base-female-editable.blend`；`scripts/m1-variants/build-variants.py`、`audit.py`、`scripts/rebuild-foundation.py --from-blend` | Face 源2054顶点、56非Basis形态；原 jaw 小改流程可复用，不代表所有五官有现成mask |
| 男 | `assets-source/foundation-male/base-male-candidate-editable.blend`；`scripts/m2-male-face-v1/{build,audit,source-inspection,build-fit}.py` | Face2056顶点、54非Basis形态；现有独立male jaw已复生成，不能复用女性顶点ID或高度阈值 |

源 blend 本轮实际 SHA：女 `bcfd5d2c99d7f9e53ca0a6b4fb7f42f1ce740a87b86777c276c1fa1094f520c7`；男 `c076d81ce83baad19c356053d9dba5af47ec8f88476d9153e8e0922ae7662751`。它们是从许可已归档的 VRoid/VRM 重建的编辑源，不是找回原 `.vroid`。沿原 source/license 记录使用，沿现有 Blender 4.5.9 / VRM Addon 4.10.5 导出。

两者已有 FaceBrow、FaceMouth、EyeIris、EyeHighlight、EyeWhite、Face_SKIN、FaceEyelash、FaceEyeline、EyeExtra 材质区域；鼻在 Face_SKIN，无独立已验鼻mask。眉是实几何（各110引用顶点），不是颜色开关。

`feature-bindings.json` 实际读取正权重：虹膜/高光各左右61顶点分别跟随 `J_Adj_L/R_FaceEye`；眼白74、EyeExtra50、眼线260、睫毛150、眉110及 Face_SKIN 均仅 Head。FaceMouth 女387/男384顶点也仅 Head。本轮没有把 FaceMouth 的内部组件自动判成牙齿/舌头，需源组件与形态核对后联动，不能仅凭材质名猜测。

## 最小参数生产方法（待实施，不是已支持能力）

| 有限参数 | 必须共同处理的几何/约束 |
|---|---|
| 眉高、眉距 | 左右眉片与局部支撑皮肤，保留眉表情语义、羽化过渡 |
| 眼高、眼距 | 眼眶开口、眼睑/眼线/睫毛、眼白、虹膜/高光/Extra整体协同；左右 FaceEye 注视轴心/rest位置同步，更新受影响inverse bind并验注视 |
| 有限眼形 | 受限轮廓变换；闭眼、单眼、极限注视必须检查，不能以静态睁眼合格代替 |
| 鼻高、鼻宽、突出 | 每性别单独标定 Face_SKIN landmark/mask，保护眼/唇边界与头颈接缝 |
| 嘴高、嘴宽 | 唇、口腔内组件及相关 MTH/HA 表情协同；先确认牙/舌组件；重算麦克风嘴部目标与相关精确身份适配 |

现有 jaw 给所有shape叠同一Basis位移，适合它已验证的小幅局部改动。缩放嘴宽/眼形不能机械保持旧表情位移：应对每一实际shape施加同一有界变形，重算 `F(Basis + delta) - F(Basis)`，再验证闭合与语义。已有56/54表情不可直接改名为固定容貌参数。眼距涉及眼骨rest例外，不能同时声称“所有骨/rest完全不变”。

所有数值范围须由各源端点试样确定，目前无已验安全±区间。输出继续用 sourceSHA + mask/landmark版本 + 参数向量 + 工具版本、编辑blend、VRM、每shape审计和新资产身份；不用新UI平台。Body/绑定逐字不变才有服装数值复用依据，仍需精确compatibility/fit记录；眼镜/麦克风锚点不能因身体不变自动继承。参考 `docs/AVATAR-CONTRACT.md`、`docs/MALE-VARIANT-MECHANISM-REUSE.md`、`evidence/m2-male-face-v1-independent/`。

## 具体切入点

1. 同一游戏加载器先提供男女实例级“无发基础”配置，检查正/侧/后/顶和眨眼/注视；只隐藏hair primitive，保留源与回滚身份。
2. prototype负责的单一嘴宽有限样件可复用现有源导出/审计；先建立男女独立特征mask和形态一致变换，不批量生成。眼距随后必须包含Eye pivot/bind联动，不宜当作纯顶点平移。
3. 用现有 `scripts/qa-m1-variant-faces.cjs` 的实际skin/morph取样与头局部比较模式验证；其女性身份/相机常量需按男性适配。保存加载、卸载重载、表情、注视与装备实测，源通过不等于游戏通过。

复算：现有 `analysis/mediapipe-reference/.venv/Scripts/python.exe` 顺序运行本目录 `audit.py`、`plot.py`、`feature-bindings.py`。使用 NumPy / Matplotlib Agg；本轮未安装依赖。`manifest.json` 记录当前证据与源/脚本哈希。没有修改原VRM、blend、runtime或prototype负责的样件。
