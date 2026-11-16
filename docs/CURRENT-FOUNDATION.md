# 当前角色工程：恢复入口

2026-11-16，F:/gamemake，feat/m1-foundation-room。先读AGENTS、CAPABILITIES（唯一状态清单）、FOUNDATION-MILESTONES。旧恢复页已归档history/CURRENT-FOUNDATION-before-full-m2-2026-11-16.md。

## 最新授权

用户完整长目标原文research/M2-FULL-USER-GOAL-2026-11-16.txt，SHA256 7465fc179ef93759e5ea20e86af97680f12b275c4d0cd76232fcc0ae6f8ccd58。明确扩大M2，取代有限A/B/仅目录/只平底/不做长发等旧排除。目标为agent可持续自定义生产，不是当前人物远景辨识度或逐件审美选型。全部功能映射在CAP末节，缺失仍M2；最终用户验收前不宣布完成。

M3随机抽取/规模化内容未开工，但稳定角色ID、确定性多记录/批处理、游戏消费/关闭恢复已纳入M2。Phaser+Three+VRM保留，女裙与30秒舞封板，普通电脑暂缺实测设备。不得把这些边界变成停止其他工作的理由。

## 固定入口与已完成成果

- 4196外观工作台仍fe5c528d9437/source937df9f；准确目录/回滚查delivery/appearance-workbench.json。未被本轮装备候选替换。
- 4195/77e46是M1用户限定接受基础；4174证据。A组合与B男jaw独立短发fit技术成果保留，无需重做。v6/历史配方语义不变。
- A证据/evidence/m2-character-presets-a-v1；B/evidence/m2-male-jaw-hair-runtime-v1。5d与937df prototype相同；126产物新检出逐字一致；9a9bce源/证据备份及51f回执远端已核。具体参数/兼容限度只见CAP，原始源缺失不是原工程恢复。

## 当前正在实施

1. 原生产索引已增到8流程：male-jaw-source/mouth/hair-fit接入。e42源集成cacbc0d；独立QA发现hair check间接写范围漏报，修复9283集成6432d8a。8回读、原负例/13新负例/2写范围负例通过，不执行导出。见evidence/production-m2-source-index-root-v1及independent-review-v1。索引只是入口，不是M2完成。
2. 最终装备集合已在b819接入现有加载器和M1套装，0506393补旧equip与新equipSet竞态。real male loader、失败/取消/释放CPU通过。b819独立构建02a14a4b2a07，evidence/m2-equipment-set-room-02a-v1真实房间裤裙/长短裤/基础模式与1倍速移动检查通过，但这是旧候选，不包含后加coverage和竞态修复，不重标。
3. 多mask覆盖集合及prepare/commit已提交1f5172f并核实远端。43b91f8补实际v6导入/坏资源保原测试；独立构建84b0c3f350cb在临时4207。原男女六次换装、基础覆盖恢复、配方往返通过；4轮第二女角色create/render/dispose回86几何41纹理；男女完整1倍速动作链各25状态门通过，42.54/40.89秒、固定镜头无变化。evidence/m2-equipment-coverage-{fixed-build,room-84b-v1,lifecycle-84b-v1,chain-84b-v1}。连续视觉仍待独立观看；真实仍仅女top mask，多mask叠衣只有合成测试。6组失败清理CPU证据继续有效，不重调M1动作。
4. 男性外搭第一结构e6faee0已集成39d620d，源与静图失败归档。新显式派工outer_panels（gpt-6.1-sol/high，复杂几何/蒙皮）在experiments/m2-outer-panels-v2，独立裁片第一版静态无交叉且可重复导出，但root看三图发现肩带悬浮、袖窿阶梯与硬板轮廓；已要求保留并按实际肩/躯干截面修正。尚未游戏接入，不把零交叉当服装通过。未动封板裙舞。
5. single_equipment_contract（显式gpt-6.1-sol/high）6962修复旧equip绕过最终集合，已集成5b13b6e；13非法组合均拒绝保原，18观察及原竞态/释放门通过。8385be7增加配置组合（旧10 looks/v6资源顺序不变）、按实际下装选择接触面，并修actor基础模式失败导致外观/材质提前改变。独立只读审查55623集成34c5af2保留实际clone失败前后证据。独立构建9bfd1b1c77db在4207，真实浏览器clone失败保原/重试、男女6次换装/v6往返/坏资源保原和1×短走通过，evidence/m2-configured-looks-{fixed-build,room-9bf-v1}；完整动作录像仍84b，不重标。新外搭实物尚未接入；onePiece房间接触仍未支持。

## 派工纪律与桌面钩子

用户要求每次派工指定适合难度的模型和思考深度，已写AGENTS；后续spawn必须显式model/reasoning_effort/fork_turns=none和DISPATCH_CONFIG难度理由。旧在途不伪造历史配置，followup无改配置能力，未知配置不得假称已匹配。不能把GPT桌面内Codex与CLI混为一谈。

scripts/agent-policy为用户要求的PreToolUse入口校验。用户安装并截图开启；初次本桌面真实probe却未拦截，只回HOOK_DID_NOT_BLOCK无文件操作。已发现初版Windows启动引号错误并修复，修正版在两种Windows外壳实跑deny、8反例通过，已装入用户.codex/hooks.json，需桌面重新信任后实际补测。未宣称工具强制已生效。audit只记调用ID/工具/模型/深度/判定，不记任务正文。CLI features/版本只说明CLI，不能代表当前桌面。官方特殊路径可能跳过hook；不得绕信任或修改宿主二进制。

## 恢复与资源

一次只占用一个GPU/录屏/重Blender/编码窗口。outer_panels已产最新贴肩截面源/静图，root已看正侧图；准备归档，游戏接入待精确提交和author-export准入。root浏览器短测已结束。临时4207提供9bf固定检查候选，公开4196不变；只关闭自己创建的临时服务，勿杀用户其他服务。最新工作包P0–P6见阶段计划；勿恢复旧等待审美、有限M2结束或先做M3建议。
