# MPFB原作者02鼻形样例可视审查

已实际查看最终4张头部图。`Human.001`相对`Human`的鼻形差异清楚，正面鼻翼、鼻尖变宽，侧面鼻尖更突出、更饱满。两个图组使用相同局部坐标取景、技术材质、灯光和曝光。

| 原样例对象 | 作者输入 | 正面观察 | 侧面观察 |
|---|---|---|---|
| Human，reference | 默认宏观target stack | 鼻翼及鼻尖较窄 | 鼻尖投影较小，鼻部轮廓较紧凑 |
| Human.001，original-targets | nose-volume-incr=1.0，nose-scale-horiz-incr=.5 | 鼻翼、鼻尖较宽，鼻端体积更明显 | 鼻尖向前延伸更明显，鼻头轮廓更饱满 |

两者的头顶、颌部、耳和眼眶整体轮廓看起来保持一致，鼻部阴影随形状改变。这是本次静态画面的观察。原create-readback已另记录459个实际变化顶点、最大位移5.486342mm和target索引并集外位移0，最大位移没有改称鼻宽差。

原样例只有基模与形态keys，材质槽为空，rig为零，独立眼球/皮肤/发型/衣物未加载。因此图中眼眶空洞和灰色光头属于当前组件状态。中性灰技术材质及统一平滑着色仅加在独立渲染副本，人物源几何、target权重和原文件保持原样。当前证据适用于学习原作者已制作nose target的效果，二次元成品观感、当前游戏基模适配与动作均待其他工作。

原始输入为 `assets-source/mpfb-author-study-v1/generated/mpfb-original-sample-02.blend`，SHA256 `e7b78852f94678b3a3878f6998a2caef85652cc6dd091954877c2f27dbf4a0e6`。渲染前后SHA相同。两个对象原X=-1/X=1的展示平移，在副本中都置于局部原点，以便同镜头比较，未对局部顶点增添形变。`render-readback.json`逐项核对原create-readback的对象名、shape key名和值、mask后可见顶点及面数。

最终图使用Blender4.5.9、build8bf95cbd38d1，Cycles CPU、4线程、16 samples、800×800、相同正交尺度。原.blend未保存覆盖，独立展示项目为 `independent-render-copy.blend`。精确相机、材质、坐标边界、工具与脚本身份见render-readback及execution。

首轮曝光过亮且侧面裁到鼻尖，原图、脚本、回执及副本已保存在`attempt-1-framing-exposure/`。最终统一采用-2.5档曝光，并依据两者共同头部边界计算侧面取景，未按对象单独调视角或材料。首轮15.77秒，最终15.05秒，最终递归进程树采样RSS峰值786,968,576字节。渲染期间GUI/GPU均未启动，已结束全部worker。

最终实际查看图片为 `reference-front.png`、`original-nose-targets-front.png`、`reference-side.png`、`original-nose-targets-side.png`。本包只提供头部局部画面，没有全身裸体用户展示。`visual-review.json`及`package-files.json`列精确输入、图片SHA和文件清单。
