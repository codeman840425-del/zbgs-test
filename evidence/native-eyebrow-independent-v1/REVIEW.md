# 原生眉色与虹膜组合独审

本次固定男7586、original/green虹膜与original/brown眉色，在实际CPU范围内未发现新增阻断。源独审、公共核心5组及实际character-appearance调用链8组分别有独立结果；不是WebGL/视觉、任意人物或任意颜色通过。未修改生产文件、Studio、公共资源或4196。

源结果见SOURCE-REVIEW.md和source-result.json：原生2a6b导出保139个accessor、骨架/绑定/表达与材质参数，只有眉PNG及thumbnail变化，另meta.name/version变化。目标7586原眉与来源a18一致。原生棕眉保整图alpha及全部透明区RGBA；14266个可见像素RGB改变。HAIR图片与参数未变，不能将眉色通过当发色通过。

公共核心core-v2已核多颜色缓存、独立所有权、源PNG逐像素、rollback及迟到销毁。runtime-v3进一步实际执行上层caller：眉先提交，随后向虹膜材质update注入一次异常，两部件map/shade与选色回到原值；干净重试得到两张原生PNG精确像素。prepare不发布，非法请求保留原合法prepared，坏第二PNG保旧，两actor纹理/bitmap隔离并仅释放自身一次。销毁时迟到bitmap关闭，同材质第二owner拒绝；新reset使等待中的棕眉及已准备的旧组合失效，迟到或过期commit不能覆盖最新原色。

真实旧evidence/native-iris-room-v2/combined-recipe.json（SHA ed9ed69079781903a19a73c1ecde6d4f909b5b7ed98094e99bc9f4750648d523）实际validate/apply/capture：v8绿眼+原生长发迁移v9、眉original，装备与hairFit身份保持；v8追加brown拒绝且不改状态；合法v9棕眉可用，再次应用同一原v8文件清回眉original并保绿眼。此路径加载真实VRM/PNG/原生hair和几何模块；无附件及outfit提交用小型CPU事务夹具，不称装备WebGL穿戴通过。

runtime-v1在前6组通过后因测试将现场IBM的-0与已保存JSON的0视作不同而失败，原failure与脚本保留。修正比较仅接受数值正负零等价，其余键与值递归exact，差异路径逐项保存。runtime-v2七组通过；runtime-v3加迟到/过期选择组成为八组。core-v1错误预估texture数量和最早全extensions要求失败也保留，均不是生产修复。

重现：`node evidence/native-eyebrow-independent-v1/runtime-check.mjs <新的输出目录>`。运行时10文件SHA保存在runtime-v3/result.json，封包时再次核一致；公共核心SHA仍5dc94c4。source结果不改写。实际游戏仍需root固定构建核正常光照、眉眼一起显示/复位、旧配方冷恢复及首帧；CPU Canvas/Pillow夹具不替代这些检查。
